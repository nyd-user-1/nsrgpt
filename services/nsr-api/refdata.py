# nsr-api routes for brief 62's reference tables (worker-4). Each table is small and loads into structure.py's DuckDB on
# first use, as icrp.py's do. The Lambda reads their prefixes through inline policy nsr-api-refdata
# (scripts/ingest/api-policy.sh).
#   GET /stopping?projectile=p&target=Mo&emin=0.1&emax=10   measured stopping powers (nsr.stopping_powers, IAEA): the
#                    points, energies also in MeV/u, emin and emax in MeV/u; their references. projectile: p, d, t, a
#                    (alpha), he3, or a symbol with &a= its mass number (O&a=16). Without target: the targets measured
#                    for the projectile, with counts
#   GET /ripl/levels?name=Co-60      RIPL-4's discrete levels and their gammas (nsr.ripl_levels, ripl_gammas,
#                    ripl_level_nuclides)
#   GET /ripl/masses?name=Co-60      AME2020 mass excess (nsr.ripl_masses_ame2020); name=Co: every isotope of the element
#   GET /betashape?name=Sb-131&mode=bm&level=0   BetaShape beta spectra (nsr.iaea_betashape_spectra, the Live Chart
#                    API's bin_beta): one spectrum per mode (bm beta-minus, bp beta-plus), parent level (keV) and
#                    daughter, bins in keV
#   GET /benchmarks?benchmark=hmf001&library=jendl5   CoNDERC's OpenMC criticality runs (nsr.conderc_openmc) grouped by
#                    benchmark and case
import re

import duckdb

import structure as S

LAKE = f"s3://{S.BUCKET}/lake"
SRC = {"stopping_powers": f"{LAKE}/stopping/2026-11-11/powers/*", "stopping_refs": f"{LAKE}/stopping/2026-11-11/refs/*",
       "ripl_levels": f"{LAKE}/ripl/ripl-4-2026-05/levels/*", "ripl_gammas": f"{LAKE}/ripl/ripl-4-2026-05/gammas/*",
       "ripl_nuclides": f"{LAKE}/ripl/ripl-4-2026-05/level_nuclides/*",
       "ripl_masses": f"{LAKE}/ripl/ripl-4-2026-05/masses_ame2020/*",
       "betashape": f"{LAKE}/iaea-betashape/2026-11-11/spectra/*", "conderc": f"{LAKE}/conderc/2026-11-11/openmc/*"}
_loaded = set()
LIGHT = {"p": ("H", 1), "d": ("H", 2), "t": ("H", 3), "a": ("He", 4), "alpha": ("He", 4), "he3": ("He", 3),
         "h": ("He", 3)}
MAX_POINTS = 20000


def table(t):
    if t not in _loaded:
        sql = f"SELECT * FROM read_parquet('{SRC[t]}')"
        if t == "stopping_powers":  # every energy also in MeV per nucleon
            sql = (f"SELECT *, CASE lower(trim(energy_unit)) WHEN 'mev/u' THEN energy WHEN 'kev/u' THEN energy / 1000 "
                   f"WHEN 'mev' THEN energy / ion_isotope WHEN 'kev' THEN energy / 1000 / ion_isotope END AS energy_mev_u "
                   f"FROM read_parquet('{SRC[t]}')")
        S.con().execute(f"CREATE OR REPLACE TABLE ref_{t} AS {sql}")
        _loaded.add(t)
    return f"ref_{t}"


def nuclide(name):
    """Co-60, co60, 60Co -> (symbol, A); None when it isn't one."""
    s = re.sub(r"[\s_-]", "", name or "")
    m = re.fullmatch(r"([A-Za-z]{1,2})(\d{1,3})", s) or re.fullmatch(r"(\d{1,3})([A-Za-z]{1,2})", s)
    if not m:
        return None
    sym, a = (m.group(1), m.group(2)) if m.group(1).isalpha() else (m.group(2), m.group(1))
    return sym[0].upper() + sym[1:].lower(), int(a)


def num(q, k):
    v = q.get(k)
    if v in (None, ""):
        return None
    return float(v)


def stopping(q):
    p = (q.get("projectile") or "").strip()
    if not p:
        return 400, {"error": "projectile is required: p, d, t, a, he3, or a symbol with &a= (O&a=16)"}
    sym, a = LIGHT.get(p.lower(), (p[0].upper() + p[1:].lower(), None))
    if q.get("a"):
        a = int(float(q["a"]))
    pw = table("stopping_powers")
    where, params = ["projectile_name = ?"], [sym]
    if a is not None:
        where.append("round(ion_isotope) = ?"); params.append(a)
    if not q.get("target"):
        rows = S.records(f"SELECT target_name, count(*) AS points, min(energy_mev_u) AS emin_mev_u, "
                         f"max(energy_mev_u) AS emax_mev_u FROM {pw} WHERE {' AND '.join(where)} "
                         f"GROUP BY target_name ORDER BY points DESC", params)
        return 200, {"projectile": sym, "a": a, "targets": rows}
    where.append("lower(target_name) = lower(?)"); params.append(q["target"].strip())
    for k, op in (("emin", ">="), ("emax", "<=")):
        if num(q, k) is not None:
            where.append(f"energy_mev_u {op} ?"); params.append(num(q, k))
    pts = S.records(f"SELECT energy_mev_u, energy, energy_unit, stopping_power_converted, stopping_power, stopping_unit, "
                    f"percentage_error, phase, ion_isotope, ref_id, publication_year AS year FROM {pw} "
                    f"WHERE {' AND '.join(where)} ORDER BY energy_mev_u LIMIT {MAX_POINTS + 1}", params)
    refs = S.records(f"SELECT * FROM {table('stopping_refs')} WHERE ref_id IN "
                     f"(SELECT DISTINCT ref_id FROM {pw} WHERE {' AND '.join(where)}) ORDER BY year, ref_id", params)
    return 200, {"projectile": sym, "a": a, "target": q["target"], "points": pts[:MAX_POINTS],
                 "truncated": len(pts) > MAX_POINTS, "refs": refs,
                 "units": {"energy_mev_u": "MeV per nucleon", "stopping_power_converted": "MeV/(mg/cm2)"},
                 "source": "IAEA electronic stopping power database (www-nds.iaea.org/stopping)"}


def ripl_levels(q):
    n = nuclide(q.get("name"))
    if not n:
        return 400, {"error": "name is a nuclide: Co-60, co60, 60Co"}
    symb = f"{n[1]}{n[0]}"
    head = S.records(f"SELECT * FROM {table('ripl_nuclides')} WHERE lower(symb) = lower(?)", [symb])
    if not head:
        return 404, {"error": f"{n[0]}-{n[1]} is not in RIPL-4's levels"}
    levels = S.records(f"SELECT * EXCLUDE (z, a, symb) FROM {table('ripl_levels')} WHERE lower(symb) = lower(?) "
                       f"ORDER BY level", [symb])
    gammas = S.records(f"SELECT level, final_level, e_gamma_mev, p_gamma, p_electromagnetic, icc FROM "
                       f"{table('ripl_gammas')} WHERE z = ? AND a = ? ORDER BY level, final_level",
                       [head[0]["z"], head[0]["a"]])
    return 200, {"nuclide": head[0], "levels": levels, "gammas": gammas,
                 "units": {"energy": "MeV", "half_life": "s", "parity": "+1, -1, 0 unknown"},
                 "source": "RIPL-4 (IAEA, May 2026), levels segment"}


def ripl_masses(q):
    name = (q.get("name") or "").strip()
    t = table("ripl_masses")
    n = nuclide(name)
    if n:
        rows = S.records(f"SELECT * FROM {t} WHERE lower(symbol) = lower(?) AND a = ?", [n[0], n[1]])
    elif re.fullmatch(r"[A-Za-z]{1,2}", name):
        rows = S.records(f"SELECT * FROM {t} WHERE lower(symbol) = lower(?) ORDER BY a", [name])
    else:
        return 400, {"error": "name is a nuclide (Co-60) or an element (Co)"}
    if not rows:
        return 404, {"error": f"{name} is not in AME2020"}
    return 200, {"masses": rows, "units": {"mass_excess": "MeV"},
                 "flag": "2 measured, 1 recommended (AME2020)", "source": "AME2020 in RIPL-4's masses segment"}


def betashape(q):
    n = nuclide(q.get("name"))
    if not n:
        return 400, {"error": "name is a nuclide: Sb-131, 131sb"}
    where, params = ["nuclide = ?"], [f"{n[1]}{n[0].lower()}"]
    mode = (q.get("mode") or "").lower().replace("b-", "bm").replace("b+", "bp")
    if mode:
        if mode not in ("bm", "bp"):
            return 400, {"error": "mode is bm (beta-minus) or bp (beta-plus)"}
        where.append("rad_type = ?"); params.append(mode)
    if num(q, "level") is not None:
        where.append("abs(p_energy - ?) < 0.5"); params.append(num(q, "level"))
    rows = S.records(f"SELECT rad_type, p_energy, d_z, d_n, d_symbol, bin_en, dn_de, unc_dn_de, dn_de_nu, unc_dn_de_nu "
                     f"FROM {table('betashape')} WHERE {' AND '.join(where)} ORDER BY rad_type, p_energy, d_n, bin_en",
                     params)
    if not rows:
        return 404, {"error": f"no BetaShape spectrum for {n[0]}-{n[1]} with those filters"}
    spectra = {}
    for r in rows:
        k = (r["rad_type"], r["p_energy"], r["d_z"], r["d_n"])
        s = spectra.setdefault(k, {"mode": r["rad_type"], "parent_level_kev": r["p_energy"],
                                   "daughter": f"{r['d_z'] + r['d_n']}{r['d_symbol']}", "e_kev": [], "dn_de": [],
                                   "unc_dn_de": [], "dn_de_nu": [], "unc_dn_de_nu": []})
        for c in ("dn_de", "unc_dn_de", "dn_de_nu", "unc_dn_de_nu"):
            s[c].append(r[c])
        s["e_kev"].append(r["bin_en"])
    return 200, {"nuclide": f"{n[0]}-{n[1]}", "spectra": list(spectra.values()),
                 "units": {"e": "keV", "dn_de": "per keV per decay"},
                 "source": "IAEA Live Chart of Nuclides API, bin_beta (computed with BetaShape)"}


def benchmarks(q):
    where, params = [], []
    for k in ("benchmark", "library"):
        if q.get(k):
            where.append(f"{k} = ?"); params.append(q[k])
    w = ("WHERE " + " AND ".join(where)) if where else ""
    rows = S.records(f"SELECT * EXCLUDE (stdout_key) FROM {table('conderc')} {w} ORDER BY benchmark, \"case\", library",
                     params)
    out = {}
    for r in rows:
        b = out.setdefault((r["benchmark"], r["case"]), {"benchmark": r["benchmark"], "case": r["case"], "runs": []})
        b["runs"].append({k: v for k, v in r.items() if k not in ("benchmark", "case")})
    return 200, {"benchmarks": list(out.values()), "libraries": sorted({r["library"] for r in rows if r["library"]}),
                 "note": "OpenMC k-eff from each run's output; the benchmarks' experimental k-eff are not in the source",
                 "source": "IAEA CoNDERC, OpenMC inputs of criticality benchmarks (2022)"}


def route(path, q):
    q = q or {}
    p = path.rstrip("/")
    try:
        if p == "/stopping":
            return stopping(q)
        if p == "/ripl/levels":
            return ripl_levels(q)
        if p == "/ripl/masses":
            return ripl_masses(q)
        if p == "/betashape":
            return betashape(q)
        if p == "/benchmarks":
            return benchmarks(q)
        return 404, {"error": "routes: /stopping, /ripl/levels, /ripl/masses, /betashape, /benchmarks"}
    except (ValueError, duckdb.Error) as e:
        return 400, {"error": str(e)[:500]}
