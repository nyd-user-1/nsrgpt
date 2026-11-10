"""Brief 57, Part D: the medical-isotope production routes, each a pair (or a chain of pairs and a decay) the sweep compared,
with the production number per route from every evaluation, from the IAEA recommended curve where the IAEA holds one, and
from the EXFOR data, and the spread between them. Runs on the sweep box after sweep.py has written its tables:
  cd /opt/sweep && HOME=/root venv/bin/python -I medical.py
Sources: evaluated curves from nsr-api /endf/xs (ENDF/B-VIII.1 and VIII.0 neutrons from the POINT 293.6 K releases), and for
JEFF-3.3, JENDL-5, TENDL-2023 and CENDL-3.2 neutron capture and fission from nsr-jobs broaden jobs (PREPRO linear, recent,
sigma1 at 293.6 K: File 2 reconstructed, since their MF3 alone lacks the resonances the thermal value and the resonance
integral rest on; the job ids are in lake/_work/sweep/jobs.tsv); MF33 from /endf/cov; EXFOR from the lake's points and
search index; fission yields from nsr.endfb_fy (MT 459, cumulative, the thermal energy); half-lives from ICRP 107; the IAEA
recommended cross sections from the lake's mirror of www-nds.iaea.org/medical/ (raw/iaea/2026-11-07/medical/).
Irradiations, each named in the table with its assumptions:
- reactor: a 293.6 K Maxwellian (kT = 0.0253 eV) below the cadmium cut at 0.5 eV plus a 1/E epithermal flux above it, the
  thermal flux 1e13 n/cm2/s and the thermal-to-epithermal (per unit lethargy) ratio 40; the production per gram of the
  target isotope per hour. sigma_th = the Maxwellian flux average below 0.5 eV; RI = integral of sigma/E from 0.5 eV to
  20 MeV. Threshold reactions (n,p) instead use a U-235 Watt fission spectrum (a = 0.988 MeV, b = 2.249 /MeV) at 1e13.
- cyclotron: the thick-target yield Y = (N_A / M) * integral of sigma(E) / (S(E)/rho) dE from E_out to E_in, the mass
  stopping power from the Bethe formula with ICRU 37 mean excitation energies (no shell or density corrections; Bragg
  additivity for water), a target of the pure isotope (O-18 as H2 18O water); the physical yield in MBq/uAh
  (production rate * lambda * 1 h) and the saturation activity in MBq/uA. The lake holds no SRIM or PSTAR table.
- photon: a flat photon spectrum from the reaction's threshold to the bremsstrahlung end point (30 and 40 MeV), the simplest
  honest shape, named as such; the yield is the flux-averaged cross section (reactions per target atom per photon/cm2).
The data-derived yield: the EXFOR points over the irradiation's energies divided by the reference curve (the IAEA
recommended curve where held, else the evaluation nearest the data), each dataset's weighted mean log ratio, the datasets
combined by inverse variance; that ratio times the reference's yield. The data's spread: the standard deviation of the
datasets' ratios. Each evaluation's uncertainty: its MF33 relative sd weighted by the yield integrand (groups taken as
fully correlated, an upper bound). Verdict: "evaluations disagree beyond the data's spread" when (max - min) / mean of the
evaluations' yields exceeds the data's spread, else "evaluations agree within the data".
"""
import io
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
import zipfile

import boto3
import duckdb
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reactions import ELEMENTS  # noqa: E402

BUCKET = "nsr-lake-613473203863"
B = f"s3://{BUCKET}"
PREFIX = "lake/sweep/2026-11-10"
API = "https://daw1qggkn69lv.cloudfront.net"
MED = "raw/iaea/2026-11-07/medical"
WORK = "/data/sweep/medical"
RELEASES = ["B-VIII.1", "B-VIII.0", "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2"]
NA = 6.02214076e23
KT = 0.0253
PHI_TH, EPI_RATIO = 1e13, 40.0
CD_CUT, RI_TOP = 0.5, 2e7
s3 = boto3.client("s3", region_name="us-east-2")

# ICRU 37 mean excitation energies (eV) and the projectiles' masses (MeV)
I_EV = {"H": 19.2, "O": 95.0, "Ni": 311.0, "Zn": 330.0, "Ga": 334.0, "Y": 379.0, "Mo": 424.0, "Ra": 826.0, "Th": 847.0}
I_WATER = 75.0
MASS = {"P": 938.272, "D": 1875.613, "A": 3727.379, "HE3": 2808.391}
CHARGE = {"P": 1, "D": 1, "A": 2, "HE3": 2}
SUB = {"N": "neutrons", "P": "protons", "D": "deuterons", "A": "alphas", "G": "gammas"}

# route, product, target, projectile, process (EXFOR), mt, irradiation, chain, extra
ROUTES = [
    dict(route="mo99-u235-nf", product="Mo-99", target="U-235", proj="N", process="F", mt=18, irr="fission",
         fy="42099", chain="U-235(n,f) with the cumulative fission yield of Mo-99 (MT 459, thermal)"),
    dict(route="mo99-mo98-ng", product="Mo-99", target="Mo-98", proj="N", process="G", mt=102, irr="reactor"),
    dict(route="mo99-mo100-gn", product="Mo-99", target="Mo-100", proj="G", process="N", mt=4, irr="photon",
         iaea="mog99mot", exfor_product=["42-MO-99", ""]),
    dict(route="tc99m-mo100-p2n", product="Tc-99m", target="Mo-100", proj="P", process="2N", mt=16, irr="cyclotron",
         window=(24e6, 10e6), iaea="mop99tct", exfor_product=["43-TC-99-M"], total_only=True),
    dict(route="lu177-lu176-ng", product="Lu-177", target="Lu-176", proj="N", process="G", mt=102, irr="reactor",
         exfor_product=["71-LU-177", "71-LU-177-G", ""], note="MT 102 includes the 160.4 d isomer Lu-177m"),
    dict(route="lu177-yb176-ng", product="Lu-177", target="Yb-176", proj="N", process="G", mt=102, irr="reactor",
         chain="Yb-176(n,g)Yb-177, Yb-177 (1.911 h) beta- to Lu-177", via="Yb-177"),
    dict(route="ac225-ra226-p2n", product="Ac-225", target="Ra-226", proj="P", process="2N", mt=16, irr="cyclotron",
         window=(20e6, 10e6), iaea="rap25act"),
    dict(route="ac225-ra226-gn", product="Ac-225", target="Ra-226", proj="G", process="N", mt=4, irr="photon",
         chain="Ra-226(g,n)Ra-225, Ra-225 (14.9 d) beta- to Ac-225", via="Ra-225"),
    dict(route="ac225-th232-px", product="Ac-225", target="Th-232", proj="P", process="X", mt=None, irr="cyclotron",
         window=(200e6, 50e6), iaea="thp25act", exfor_product=["89-AC-225"],
         note="(p,x) residual production is MT 5 with MF6 yields in TENDL; not parsed, so not held as a cross section"),
    dict(route="ac227-ra226-ng", product="Ac-227 / Ra-223", target="Ra-226", proj="N", process="G", mt=102,
         irr="reactor", chain="Ra-226(n,g)Ra-227, Ra-227 (42.2 min) beta- to Ac-227 (21.77 y), to Th-227, alpha to Ra-223",
         via="Ra-227"),
    dict(route="cu67-zn68-gp", product="Cu-67", target="Zn-68", proj="G", process="P", mt=103, irr="photon"),
    dict(route="cu67-zn70-pa", product="Cu-67", target="Zn-70", proj="P", process="A", mt=107, irr="cyclotron",
         window=(30e6, 10e6), iaea="zn067cut"),
    dict(route="cu67-zn68-p2p", product="Cu-67", target="Zn-68", proj="P", process="2P", mt=111, irr="cyclotron",
         window=(70e6, 30e6), iaea="zn867cut"),
    dict(route="ga68-zn68-pn", product="Ga-68", target="Zn-68", proj="P", process="N", mt=4, irr="cyclotron",
         window=(14e6, 4e6)),
    dict(route="ge68-ga69-p2n", product="Ge-68", target="Ga-69", proj="P", process="2N", mt=16, irr="cyclotron",
         window=(30e6, 15e6), iaea="ga9p8get"),
    dict(route="i131-te130-ng", product="I-131", target="Te-130", proj="N", process="G", mt=102, irr="reactor",
         chain="Te-130(n,g)Te-131 (25 min) and Te-131m (33.25 h), beta- to I-131", via="Te-131"),
    dict(route="i131-u235-nf", product="I-131", target="U-235", proj="N", process="F", mt=18, irr="fission", fy="53131",
         chain="U-235(n,f) with the cumulative fission yield of I-131 (MT 459, thermal)"),
    dict(route="y90-y89-ng", product="Y-90", target="Y-89", proj="N", process="G", mt=102, irr="reactor"),
    dict(route="y90-sr90-generator", product="Y-90", target="U-235", proj="N", process="F", mt=18, irr="fission",
         fy="38090", chain="U-235(n,f) with the cumulative yield of Sr-90 (28.79 y), the Sr-90/Y-90 generator's parent"),
    dict(route="sm153-sm152-ng", product="Sm-153", target="Sm-152", proj="N", process="G", mt=102, irr="reactor"),
    dict(route="re188-w186-2ng", product="Re-188", target="W-186", proj="N", process="G", mt=102, irr="double",
         chain="W-186(n,g)W-187 (23.72 h), W-187(n,g)W-188 (69.78 d), beta- to Re-188 (the W-188/Re-188 generator)",
         second="W-187", via="W-187"),
    dict(route="sr89-sr88-ng", product="Sr-89", target="Sr-88", proj="N", process="G", mt=102, irr="reactor"),
    dict(route="sr89-y89-np", product="Sr-89", target="Y-89", proj="N", process="P", mt=103, irr="fast"),
    dict(route="cu64-ni64-pn", product="Cu-64", target="Ni-64", proj="P", process="N", mt=4, irr="cyclotron",
         window=(12e6, 4e6), iaea="nip64cut"),
    dict(route="zr89-y89-pn", product="Zr-89", target="Y-89", proj="P", process="N", mt=4, irr="cyclotron",
         window=(14e6, 5e6), iaea="y9p89zrt", exfor_product=["40-ZR-89", "40-ZR-89-G", ""]),
    dict(route="f18-o18-pn", product="F-18", target="O-18", proj="P", process="N", mt=4, irr="cyclotron",
         window=(18e6, 3e6), iaea="o8p18ft", water=True),
    dict(route="pb212-generator", product="Pb-212", target=None, proj=None, process=None, mt=None, irr="generator",
         parent="Ra-224", grandparent="Th-228", chain="Th-228 (1.912 y) to Ra-224 (3.632 d), alpha to Rn-220 and on to Pb-212"),
    dict(route="tc99m-generator", product="Tc-99m", target=None, proj=None, process=None, mt=None, irr="generator",
         parent="Mo-99", chain="Mo-99 (65.94 h) beta- to Tc-99m (87.6% of decays)"),
]


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "nsr-sweep/1.0"}), timeout=120) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(2 * (i + 1))
    print("GET failed", url, err, flush=True)
    return None


def za_of(name):
    sym, a = name.split("-")
    return ELEMENTS.index(sym) * 1000 + int(a.rstrip("m"))


def exfor_sym(name):
    sym, a = name.split("-")
    return f"{ELEMENTS.index(sym)}-{sym.upper()}-{a}"


# ── curves ───────────────────────────────────────────────────────────────────────────────────────────────────────────
JOBS = {}


def load_jobs():
    body = s3.get_object(Bucket=BUCKET, Key="lake/_work/sweep/jobs.tsv")["Body"].read().decode()
    for line in body.splitlines():
        rel, name, mt, jid = line.split("\t")[:4]
        JOBS[(rel, name, int(mt))] = jid


def curve(rel, r, name=None, mt=None):
    """(energy eV array, xs b array, served-from text) or (None, None, why)."""
    name, mt, sub = name or r["target"], mt or r["mt"], SUB[r["proj"]]
    if sub == "neutrons" and rel not in ("B-VIII.1", "B-VIII.0") and r["irr"] not in ("fast",):
        jid = JOBS.get((rel, name, mt))
        if not jid:
            return None, None, "no broaden job"
        st = get(f"{API}/jobs/{jid}")
        if not st or st.get("status") != "done":
            return None, None, f"job {jid} {st.get('status') if st else 'unreachable'}: {(st or {}).get('error') or ''}"[:200]
        j = get(f"{API}/jobs/{jid}/result?temp_k=293.6")
        if not j or not j.get("energy_ev"):
            return None, None, f"job {jid} has no 293.6 K series"
        return np.array(j["energy_ev"]), np.array(j["xs_barn"]), f"nsr-jobs {jid}: {j.get('method')}"
    qs = {"name": name, "mt": mt, "release": rel, "sub": sub}
    if sub == "neutrons":
        qs["temp"] = "293.6K"
    j = get(f"{API}/endf/xs?" + urllib.parse.urlencode(qs))
    s = (j or {}).get("series") or [{}]
    s = s[0]
    if not s.get("energy_ev"):
        return None, None, s.get("note") or "not held"
    return np.array(s["energy_ev"], float), np.array(s["xs_barn"], float), f"{s.get('release_served') or rel} MF3"


def cov_groups(rel, r, name=None, mt=None):
    j = get(f"{API}/endf/cov?" + urllib.parse.urlencode({"name": name or r["target"], "mt": mt or r["mt"],
                                                          "release": rel, "sub": SUB[r["proj"]]}))
    g = ((j or {}).get("series") or [{}])[0].get("groups") or []
    return [(x["e_lo_ev"], x["e_hi_ev"], x["rel_sd"]) for x in g]


def interp(e, x, y):
    out = np.interp(e, x, y, left=0.0, right=np.nan)
    return np.where(np.isnan(out), y[-1] if len(y) else np.nan, out)


def sd_weighted(groups, e, w):
    """The MF33 relative sd averaged with weights w over energies e (groups fully correlated)."""
    if not groups or not np.sum(w) > 0:
        return None
    sd = np.zeros_like(e)
    for lo, hi, s in groups:
        sd = np.where((e >= lo) & (e < hi), s, sd)
    return float(np.sum(sd * w) / np.sum(w))


# ── stopping power ───────────────────────────────────────────────────────────────────────────────────────────────────
def bethe(e_mev, proj, z, a, i_ev):
    """Mass stopping power (MeV cm2/g) of an element (Z, A g/mol) for a projectile of kinetic energy e_mev."""
    m, zz = MASS[proj], CHARGE[proj]
    g = 1 + e_mev / m
    b2 = 1 - 1 / (g * g)
    arg = 2 * 0.51099895e6 * b2 * g * g / i_ev
    return 0.307075 * zz * zz * (z / a) / b2 * (np.log(np.maximum(arg, 1.0001)) - b2)


def stopping(e_mev, r):
    if r.get("water"):  # H2 18O: Bragg additivity by mass fraction
        mh, mo = 2 * 1.008, 18.0
        return (mh * bethe(e_mev, r["proj"], 1, 1.008, I_EV["H"]) + mo * bethe(e_mev, r["proj"], 8, 18.0, I_EV["O"])) / (mh + mo)
    sym = r["target"].split("-")[0]
    return bethe(e_mev, r["proj"], ELEMENTS.index(sym), float(r["target"].split("-")[1]), I_EV[sym])


def molar(r):
    return (2 * 1.008 + 18.0) if r.get("water") else float(r["target"].split("-")[1])


# ── yields ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def maxwell_avg(x, y):
    e = np.geomspace(1e-5, CD_CUT, 4000)
    phi = e * np.exp(-e / KT)
    s = interp(e, x, y)
    return float(np.trapezoid(s * phi, e) / np.trapezoid(phi, e)), e, s * phi


def res_integral(x, y):
    e = np.unique(np.concatenate([np.geomspace(CD_CUT, RI_TOP, 20000), x[(x >= CD_CUT) & (x <= RI_TOP)]]))
    s = interp(e, x, y)
    return float(np.trapezoid(s / e, e)), e, s / e


def watt_avg(x, y):
    e = np.linspace(1e4, 2e7, 20000)
    em = e / 1e6
    chi = np.exp(-em / 0.988) * np.sinh(np.sqrt(2.249 * em))
    s = interp(e, x, y)
    return float(np.trapezoid(s * chi, e) / np.trapezoid(chi, e)), e, s * chi


def half_life_s(con, name):
    v = con.execute("SELECT half_life_s FROM icrp WHERE nuclide = ?", [name]).fetchone()
    return v[0] if v else None


def yield_of(r, x, y, lam, groups, end=None):
    """(value, unit, MF33 rel sd, detail) for one curve."""
    irr = r["irr"]
    if irr in ("reactor", "fission", "double"):
        sth, e1, w1 = maxwell_avg(x, y)
        ri, e2, w2 = res_integral(x, y)
        rate = sth * 1e-24 * PHI_TH + ri * 1e-24 * PHI_TH / EPI_RATIO
        sd = None
        if groups:
            a = sd_weighted(groups, e1, w1)
            b = sd_weighted(groups, e2, w2)
            parts = [(a, sth * PHI_TH), (b, ri * PHI_TH / EPI_RATIO)]
            tot = sum(p[1] for p in parts if p[0] is not None)
            sd = sum(p[0] * p[1] for p in parts if p[0] is not None) / tot if tot else None
        det = {"sigma_th_b": sth, "sigma_2200_b": float(interp(np.array([KT]), x, y)[0]), "ri_b": ri,
               "rate_per_atom_s": rate}
        return rate, "reactions per target atom per s", sd, det
    if irr == "fast":
        s, e, w = watt_avg(x, y)
        return s * 1e-24 * PHI_TH, "reactions per target atom per s", sd_weighted(groups, e, w), {"sigma_watt_b": s}
    if irr == "photon":
        thr = float(x[np.argmax(y > 0)]) if np.any(y > 0) else None
        if thr is None or thr >= end:
            return None, None, None, {"threshold_ev": thr}
        e = np.linspace(thr, end, 4000)
        s = interp(e, x, y)
        avg = float(np.trapezoid(s, e) / (end - thr))
        return avg, "flux-averaged sigma (b)", sd_weighted(groups, e, s), {"threshold_ev": thr, "end_point_ev": end}
    if irr == "cyclotron":
        ein, eout = r["window"]
        e = np.linspace(eout, ein, 4000)
        s = interp(e, x, y)
        sp = stopping(e / 1e6, r)  # MeV cm2/g
        per_ion = NA / molar(r) * float(np.trapezoid(s * 1e-24 / sp, e / 1e6))  # reactions per incident ion
        rate = per_ion * 1e-6 / 1.602176634e-19  # per s per uA
        phys = rate * lam * 3600 / 1e6 if lam else None  # MBq/uAh
        return phys, "MBq/uAh (physical yield)", sd_weighted(groups, e, s / sp), {
            "reactions_per_ion": per_ion, "saturation_mbq_per_ua": rate / 1e6, "e_in_ev": ein, "e_out_ev": eout}
    return None, None, None, {}


# ── EXFOR ────────────────────────────────────────────────────────────────────────────────────────────────────────────
def exfor_points(con, r, lo, hi, thermal=False):
    za = za_of(r["target"])
    prods = r.get("exfor_product")
    q = ["s.target_za = ?", "s.projectile = ?", "s.process = ?", "p.units = 'B'", "p.xs_b > 0", "p.e_ev BETWEEN ? AND ?",
         "coalesce(s.target_state, '') = ''"]
    params = [za, r["proj"], r["process"], lo, hi]
    if thermal:
        q.append("s.quantity IN (',SIG', ',SIG,,MXW')")
    else:
        q.append("s.quantity IN (',SIG', 'CUM,SIG', '(CUM),SIG')")
    if prods is not None:
        q.append("coalesce(s.product, '') IN (" + ",".join("?" for _ in prods) + ")")
        params += prods
    else:
        q.append("NOT regexp_matches(coalesce(s.product, ''), '^[0-9]+-[A-Z]+-[0-9]+-')")
    return con.execute(f"""SELECT p.dataset, s.first_author, s.year, s.quantity, p.e_ev, p.xs_b, p.dxs_b
                           FROM pts p JOIN si s USING (dataset) WHERE {' AND '.join(q)} ORDER BY p.dataset, p.e_ev""",
                       params).fetchall()


def ratio_stats(points, x, y, transform=None):
    """Per dataset weighted mean log ratio to the curve (x, y); datasets combined by inverse variance."""
    by = {}
    for ds, au, yr, qty, e, xs, dxs in points:
        ref = float(transform(e, qty) if transform else interp(np.array([e]), x, y)[0])
        if not ref > 0:
            continue
        rel = max(dxs / xs if dxs and dxs > 0 else 0.10, 0.01)
        by.setdefault(ds, []).append((math.log(xs / ref), rel))
    per = []
    for ds, v in by.items():
        w = np.array([1 / s ** 2 for _, s in v])
        lr = np.array([a for a, _ in v])
        m = float(np.sum(w * lr) / np.sum(w))
        se = max(math.sqrt(1 / np.sum(w)), float(np.median([s for _, s in v])))
        per.append((ds, len(v), m, se))
    if not per:
        return None
    w = np.array([1 / p[3] ** 2 for p in per])
    m = np.array([p[2] for p in per])
    mean = float(np.sum(w * m) / np.sum(w))
    se = math.sqrt(1 / np.sum(w))
    if len(per) > 1:
        chi2 = float(np.sum(w * (m - mean) ** 2))
        se *= max(1.0, math.sqrt(chi2 / (len(per) - 1)))
    spread = float(np.std(np.exp(m), ddof=1)) if len(per) > 1 else per[0][3]
    return {"ratio": math.exp(mean), "log_ratio": mean, "se": se, "spread": spread, "n_datasets": len(per),
            "n_points": sum(p[1] for p in per), "datasets": [{"dataset": p[0], "n": p[1], "ratio": math.exp(p[2]),
                                                            "se": p[3]} for p in per]}


# ── IAEA recommended ─────────────────────────────────────────────────────────────────────────────────────────────────
def iaea_curve(code):
    try:
        body = s3.get_object(Bucket=BUCKET, Key=f"{MED}/{code}t.zip")["Body"].read()
    except Exception as e:  # noqa: BLE001
        return None, f"not in the mirror ({str(e)[:80]})"
    s3.put_object(Bucket=BUCKET, Key=f"{PREFIX}/iaea-medical/{code}t.zip", Body=body)
    rows = []
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        names = z.namelist()
        for n in names:
            for line in z.read(n).decode("latin-1").splitlines():
                t = line.replace(",", " ").split()
                try:
                    v = [float(a) for a in t[:3]]
                except ValueError:
                    continue
                if len(v) >= 2 and v[0] > 0 and v[1] >= 0:
                    rows.append((v[0] * 1e6, v[1] * 1e-3, v[2] * 1e-3 if len(v) > 2 else None))
    rows = sorted(set(rows))
    return (rows, f"{MED}/{code}t.zip: {', '.join(names)}") if rows else (None, f"no table read from {names}")


def main():
    t0 = time.time()
    os.makedirs(WORK, exist_ok=True)
    load_jobs()
    cr = boto3.Session().get_credentials().get_frozen_credentials()
    con = duckdb.connect(config={"memory_limit": "3GB", "threads": 2, "extension_directory": "/opt/duckdb_ext",
                                 "temp_directory": "/data/sweep/tmp-med"})
    con.execute("LOAD httpfs")
    con.execute(f"CREATE SECRET lake (TYPE s3, KEY_ID '{cr.access_key}', SECRET '{cr.secret_key}', SESSION_TOKEN '{cr.token}', "
                "REGION 'us-east-2')")
    zs = sorted({za_of(r["target"]) // 1000 for r in ROUTES if r["target"]})
    con.execute(f"""CREATE TABLE si AS SELECT dataset, target_za, target_state, upper(projectile) projectile,
                    upper(process) process, product, quantity, sf6, first_author, year
                    FROM read_parquet('{B}/lake/serve/exfor/2026-10-28/search_index/*')""")
    con.execute("CREATE TABLE pts AS SELECT dataset, e_ev, xs_b, dxs_b, units, sf6 FROM read_parquet(["
                + ",".join(f"'{B}/lake/serve/exfor/2026-10-28/points/target_z={z}/points.parquet'" for z in zs) + "])")
    con.execute(f"CREATE TABLE icrp AS SELECT nuclide, half_life_s FROM read_parquet('{B}/lake/icrp107/2008/nuclides/*')")
    fy = {}
    for rel in RELEASES:
        try:
            for zafp, y, u, e in con.execute(f"""SELECT f.zafp, f.yield, f.yield_unc, f.energy_ev
                    FROM read_parquet('{B}/lake/endfb/{rel}/fy/*.parquet') f
                    JOIN read_parquet('{B}/lake/endfb/{rel}/materials/*.parquet') m
                      ON m.mat = f.mat AND m.file_name = f.file_name AND m.sublibrary = f.sublibrary
                    WHERE f.mt = 459 AND round(m.za) = 92235 AND f.fps = 0 AND f.zafp IN (42099, 53131, 38090)
                    QUALIFY row_number() OVER (PARTITION BY f.zafp ORDER BY abs(f.energy_ev - 0.0253)) = 1""").fetchall():
                fy[(rel, str(int(zafp)))] = (y, u, e)
        except duckdb.Error as e:
            print("fy", rel, str(e)[:120])
    routes, points, recommended = [], [], []
    for r in ROUTES:
        print("==", r["route"], flush=True)
        out = {"route": r["route"], "product": r["product"], "target": r["target"], "projectile": r["proj"],
               "process": r["process"], "mt": r["mt"], "irradiation": r["irr"], "chain": r.get("chain"),
               "note": r.get("note"), "sublibrary": SUB.get(r["proj"]) if r["proj"] else None}
        lam_name = r["product"].split(" / ")[0]
        hl = half_life_s(con, lam_name)
        out["product_half_life_s"] = hl
        lam = math.log(2) / hl if hl else None
        if r["irr"] == "generator":
            ph = half_life_s(con, r["parent"])
            gp = half_life_s(con, r["grandparent"]) if r.get("grandparent") else None
            out.update(assumptions="decay only: no cross section", verdict="decay only (generator)",
                       verdict_detail=f"parent {r['parent']} half-life {ph} s (ICRP 107)"
                       + (f"; {r['grandparent']} {gp} s" if gp else ""), parent_half_life_s=ph, iaea="not applicable")
            routes.append(out)
            continue
        assume = {"reactor": f"293.6 K Maxwellian below {CD_CUT} eV + 1/E above, thermal flux {PHI_TH:g} n/cm2/s, "
                             f"thermal:epithermal {EPI_RATIO:g}; per gram of the target isotope per hour",
                  "fission": f"as reactor, times the cumulative fission yield; per gram of U-235 per hour",
                  "double": f"as reactor for each capture; W-188 atoms per gram W-186 after 168 h (Bateman, no burn-up)",
                  "fast": f"U-235 Watt fission spectrum (a 0.988 MeV, b 2.249/MeV), {PHI_TH:g} n/cm2/s",
                  "photon": "flat photon spectrum from threshold to 30 MeV (and 40 MeV), the simplest honest shape",
                  "cyclotron": (f"thick target of the pure isotope{' as H2 18O water' if r.get('water') else ''}, "
                                f"{r.get('window', (0, 0))[0] / 1e6:g} to {r.get('window', (0, 0))[1] / 1e6:g} MeV, "
                                "Bethe stopping power with ICRU 37 I values, no shell or density corrections")}[r["irr"]]
        out["assumptions"] = assume
        ends = [30e6, 40e6] if r["irr"] == "photon" else [None]
        evals, curves = {}, {}
        if r["mt"]:
            for rel in RELEASES:
                x, y, src = curve(rel, r)
                if x is None:
                    evals[rel] = {"held": False, "note": src}
                    continue
                groups = cov_groups(rel, r)
                curves[rel] = (x, y)
                rec = {"held": True, "source": src, "mf33": bool(groups)}
                for end in ends:
                    v, unit, sd, det = yield_of(r, x, y, lam, groups, end)
                    if r["irr"] == "fission":
                        f = fy.get((rel, r["fy"]))
                        det["fission_yield"] = f[0] if f else None
                        det["fission_yield_unc"] = f[1] if f else None
                        if f and v is not None:
                            v = v * f[0]
                            unit = "atoms of the product per U-235 atom per s"
                            fsd = (f[1] / f[0]) if f[0] and f[1] else 0
                            sd = math.sqrt((sd or 0) ** 2 + fsd ** 2) if sd is not None or fsd else None
                        elif not f:
                            v = None
                            det["note"] = "no MT 459 yield for U-235 in this release"
                    if r["irr"] == "double":
                        x2, y2, src2 = curve(rel, r, name=r["second"])
                        if x2 is not None:
                            v2, _, _, det2 = yield_of(r, x2, y2, lam, [])
                            l187 = math.log(2) / (half_life_s(con, "W-187") or 85392)
                            l188 = math.log(2) / (half_life_s(con, "W-188") or 6.029e6)
                            n186 = NA / 186.0
                            t = np.linspace(0, 168 * 3600, 20001)
                            dt = t[1] - t[0]
                            n187 = n188 = 0.0
                            for _ in t[1:]:
                                n187 += (n186 * v - (l187 + v2) * n187) * dt
                                n188 += (v2 * n187 - l188 * n188) * dt
                            det.update(second_capture=det2, w188_atoms_per_g_168h=n188)
                            v = n188
                            unit = "W-188 atoms per g W-186 after 168 h"
                        else:
                            det["second_capture"] = src2
                            v = None
                    elif r["irr"] in ("reactor", "fission", "fast") and v is not None:
                        det["atoms_per_g_per_h"] = v * NA / molar(r) * 3600 * (1 if r["irr"] != "fission" else 1)
                        v = det["atoms_per_g_per_h"]
                        unit = "atoms per g of target per h"
                    key = rel if end in (None, 30e6) else f"{rel}@40MeV"
                    evals[key] = {**rec, "yield": v, "unit": unit, "rel_sd_mf33": sd, "detail": det}
                lo, hi = (x.min(), x.max())
                sel = x if len(x) <= 600 else np.unique(np.concatenate([x[::max(1, len(x) // 600)], x[-1:]]))
                yy = interp(sel, x, y)
                win = (r.get("window") or (None, None))
                for e_, s_ in zip(sel, yy):
                    if r["irr"] in ("cyclotron",) and not (win[1] * 0.5 <= e_ <= win[0] * 1.5):
                        continue
                    if r["irr"] == "photon" and not (e_ <= 45e6):
                        continue
                    points.append((r["route"], rel, None, float(e_), float(s_), None))
        # IAEA
        iaea = None
        if r.get("iaea"):
            rows, why = iaea_curve(r["iaea"])
            out["iaea_source"] = why
            if rows:
                ix = np.array([a for a, _, _ in rows])
                iy = np.array([b for _, b, _ in rows])
                curves["IAEA"] = (ix, iy)
                v, unit, sd, det = yield_of(r, ix, iy, lam, [], ends[0])
                iaea = {"yield": v, "unit": unit, "detail": det}
                for a, b, c in rows:
                    recommended.append((r["route"], a, b, c))
                    points.append((r["route"], "IAEA", None, a, b, c))
        out["iaea"] = "held" if iaea else ("not held by the IAEA medical pages" if not r.get("iaea") else "not reached")
        out["iaea_yield"] = iaea["yield"] if iaea else None
        # EXFOR, against the reference curve
        if r["irr"] == "cyclotron":
            lo, hi = r["window"][1], r["window"][0]
        elif r["irr"] == "photon":
            lo, hi = 1e6, 30e6
        elif r["irr"] == "fast":
            lo, hi = 1e6, 2e7
        else:
            lo, hi = 0.02, 0.03
        pts = exfor_points(con, r, lo, hi, thermal=r["irr"] in ("reactor", "fission", "double"))
        ri_pts = []
        if r["irr"] in ("reactor", "double", "fission"):
            ri_pts = con.execute("""SELECT p.dataset, s.first_author, s.year, s.quantity, p.e_ev, p.xs_b, p.dxs_b
                                    FROM pts p JOIN si s USING (dataset) WHERE s.target_za = ? AND s.projectile = 'N'
                                    AND s.process = ? AND s.sf6 = 'RI' AND p.units = 'B' AND p.xs_b > 0""",
                                 [za_of(r["target"]), r["process"]]).fetchall()
        for p in pts:
            points.append((r["route"], "EXFOR", p[0], p[4], p[5], p[6]))
        held = {k: v for k, v in evals.items() if v.get("yield") is not None and "@" not in k}
        ref = "IAEA" if "IAEA" in curves else None
        stats = {}
        for name, (x, y) in curves.items():
            if r["irr"] in ("reactor", "double", "fission"):
                st = ratio_stats(pts, x, y, transform=lambda e, qty, x=x, y=y: (
                    maxwell_avg_at(x, y, e) if qty == ",SIG,,MXW" else float(interp(np.array([e]), x, y)[0])))
            else:
                st = ratio_stats(pts, x, y)
            if st:
                stats[name] = st
        if ri_pts:
            for name, (x, y) in curves.items():
                ri, _, _ = res_integral(x, y)
                st = ratio_stats(ri_pts, None, None, transform=lambda e, qty, ri=ri: ri)
                if st and name in stats:
                    stats[name]["ri"] = {"ratio": st["ratio"], "n_datasets": st["n_datasets"], "spread": st["spread"]}
        if not ref and stats:
            cands = [k for k in stats if k in held]
            ref = min(cands, key=lambda k: abs(stats[k]["log_ratio"])) if cands else None
        out["reference"] = ref
        ref_yield = (iaea or {}).get("yield") if ref == "IAEA" else (held.get(ref) or {}).get("yield")
        if ref and ref in stats and ref_yield is not None:
            st = stats[ref]
            out.update(data_yield=ref_yield * st["ratio"], data_ratio_to_reference=st["ratio"],
                       data_se_pct=100 * st["se"], data_spread_pct=100 * st["spread"], n_datasets=st["n_datasets"],
                       n_points=st["n_points"])
        else:
            out.update(n_datasets=len({p[0] for p in pts}), n_points=len(pts))
        ys = {k: v["yield"] for k, v in held.items() if not r.get("total_only")}
        for rel in RELEASES:
            out[f"yield_{rel.lower().replace('-', '_').replace('.', '_')}"] = (evals.get(rel) or {}).get("yield")
            out[f"sd_{rel.lower().replace('-', '_').replace('.', '_')}"] = (evals.get(rel) or {}).get("rel_sd_mf33")
        out["yield_unit"] = next((v["unit"] for v in held.values()), (iaea or {}).get("unit"))
        if len(ys) >= 2:
            vals = list(ys.values())
            out["eval_spread_pct"] = 100 * (max(vals) - min(vals)) / (sum(vals) / len(vals))
        else:
            out["eval_spread_pct"] = None
        ds = out.get("data_spread_pct")
        if r.get("total_only"):
            out["verdict"] = "evaluations hold the total (p,2n), both states: not comparable to Tc-99m"
            out["verdict_detail"] = "data against the IAEA recommended curve only"
        elif out["eval_spread_pct"] is None:
            out["verdict"] = "fewer than two evaluations hold this reaction"
            out["verdict_detail"] = ", ".join(f"{k}: {v.get('note')}" for k, v in evals.items() if not v.get("held"))[:400]
        elif ds is None:
            out["verdict"] = "no EXFOR data over the irradiation's energies"
            out["verdict_detail"] = f"evaluations spread {out['eval_spread_pct']:.1f}%"
        else:
            bad = out["eval_spread_pct"] > ds
            out["verdict"] = ("evaluations disagree beyond the data's spread" if bad
                              else "evaluations agree within the data")
            out["verdict_detail"] = (f"evaluations spread {out['eval_spread_pct']:.1f}% (max - min over mean of "
                                     f"{len(ys)}); data spread {ds:.1f}% over {out['n_datasets']} datasets; "
                                     + "; ".join(f"{k} {v / out['data_yield']:.3f} of the data's yield"
                                                 for k, v in ys.items() if out.get("data_yield")))
        out["detail"] = json.dumps({"evaluations": evals, "iaea": iaea, "data": stats, "reference": ref}, default=float)
        routes.append(out)
        print(json.dumps({k: out.get(k) for k in ("route", "eval_spread_pct", "data_spread_pct", "verdict")}), flush=True)
    write(routes, points, recommended, t0)


def maxwell_avg_at(x, y, kt):
    """The Maxwellian-averaged cross section at kT in EXFOR's MXW convention (2/sqrt(pi) times the flux average)."""
    e = np.geomspace(max(kt / 1000, 1e-5), kt * 30, 3000)
    phi = e * np.exp(-e / kt)
    return float(2 / math.sqrt(math.pi) * np.trapezoid(interp(e, x, y) * phi, e) / np.trapezoid(phi, e))


def write(routes, points, recommended, t0):
    import pyarrow as pa
    import pyarrow.parquet as pq
    cols = sorted({k for r in routes for k in r})
    first = ["route", "product", "target", "projectile", "process", "mt", "sublibrary", "irradiation", "chain",
             "assumptions", "yield_unit", "eval_spread_pct", "data_spread_pct", "data_se_pct", "data_yield", "verdict",
             "verdict_detail"]
    cols = first + [c for c in cols if c not in first]
    types = {}
    for c in cols:
        vs = [r.get(c) for r in routes if r.get(c) is not None]
        types[c] = pa.float64() if vs and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in vs) and c != "mt" \
            else (pa.int64() if c == "mt" else pa.string())
    tbl = pa.table({c: pa.array([(float(r[c]) if types[c] == pa.float64() and r.get(c) is not None else
                                  (str(r[c]) if types[c] == pa.string() and r.get(c) is not None else r.get(c)))
                                 for r in routes], type=types[c]) for c in cols})
    out = {}
    for name, t in (("medical_routes", tbl),
                    ("medical_points", pa.table({"route": [p[0] for p in points], "source": [p[1] for p in points],
                                                 "dataset": [p[2] for p in points], "e_ev": [p[3] for p in points],
                                                 "xs_b": [p[4] for p in points], "dxs_b": [p[5] for p in points]})),
                    ("medical_recommended", pa.table({"route": [p[0] for p in recommended],
                                                      "e_ev": [p[1] for p in recommended],
                                                      "xs_b": [p[2] for p in recommended],
                                                      "dxs_b": [p[3] for p in recommended]}))):
        path = f"{WORK}/{name}.parquet"
        pq.write_table(t, path, compression="snappy")
        s3.upload_file(path, BUCKET, f"{PREFIX}/{name}/part-0.parquet")
        out[name] = {"rows": t.num_rows, "bytes": os.path.getsize(path), "schema": [(f.name, str(f.type)) for f in t.schema]}
    st = {"seconds": round(time.time() - t0), "tables": out}
    s3.put_object(Bucket=BUCKET, Key="lake/_work/sweep/medical-state.json", Body=json.dumps(st, indent=1).encode())
    print(json.dumps(st, indent=1))


if __name__ == "__main__":
    main()
