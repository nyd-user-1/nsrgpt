"""ICRP Publication 107 as Parquet tables (brief 48, Part B). Runs on the parse box (/opt/parse/bin/python).
Reads raw/icrp/2026-11-09/: the corrected ICRP-07.NDX (corrigenda-2022/) and the CD's RAD, BET, ACK and NSF (cd/), in
the layouts of the CD's USERGUIDE.pdf, Tables 1-6. Writes lake/icrp107/2008/<table>/ and Athena nsr.icrp107_<table>:
  nuclides         one row per NDX record (1,252)
  daughters        one row per NDX progeny field: parent, daughter (stable ones carry pointer 0, SF 9999), branching, mode
  radiations       one row per RAD record: nuclide, radiation code and type, yield per transformation, energy MeV
  beta_spectra     one row per BET grid point: nuclide, energy MeV, beta particles per MeV per transformation
  auger_ck         one row per ACK line: nuclide, yield per transformation, electron energy eV, atomic transition
  neutron_spectra  one row per NSF bin: nuclide, SF branching fraction, lower and upper energy MeV, neutrons per
                   transformation in the bin
Then the counts check and manifest.json.
  /opt/parse/bin/python parse.py"""
import json
import os
import re
import sys
from collections import defaultdict

import pyarrow as pa

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "box"))
import lake  # noqa: E402
from lake import D, I, S, B  # noqa: E402

RAW = "raw/icrp/2026-11-09"
OUT = "lake/icrp107/2008"
LOCAL = "/data/icrp"
WORK = "/data/icrp/out"
DDL = os.path.join(HERE, "ddl")

SYMBOLS = ("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr "
           "Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt "
           "Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn").split()
Z_OF = {s: i + 1 for i, s in enumerate(SYMBOLS)}
# Half-life units as the NDX writes them; a year is 365.2422 days, the conversion ICRP 107 uses.
UNIT_S = {"ls": 1e-6, "us": 1e-6, "ms": 1e-3, "s": 1.0, "m": 60.0, "h": 3600.0, "d": 86400.0, "y": 365.2422 * 86400.0}
MODE_TOKENS = re.compile(r"B-|B\+|EC|IT|SF|A")


def nuclide_parts(name):
    """'Tc-99m' -> ('Tc', 43, 99, 'm'); 'SF' or a blank -> (None, None, None, None)."""
    m = re.fullmatch(r"([A-Z][a-z]?)-(\d+)([a-z]?)", name)
    if not m:
        return None, None, None, None
    return m.group(1), Z_OF[m.group(1)], int(m.group(2)), m.group(3)


def mode_of(parent, modes, daughter):
    """The decay mode a progeny field implies, from the change in Z and A; EC and B+ as the parent lists them."""
    if daughter == "SF":
        return "SF"
    _, pz, pa_, _ = parent
    _, dz, da, _ = nuclide_parts(daughter)
    d = (dz - pz, da - pa_)
    if d == (-2, -4):
        return "A"
    if d == (1, 0):
        return "B-"
    if d == (-1, 0):
        have = [t for t in ("EC", "B+") if t in modes]
        return "/".join(have) if have else "EC"
    if d == (0, 0):
        return "IT"
    if d == (1, -1):
        return "B-N"
    return f"dZ{d[0]:+d} dA{d[1]:+d}"


def num(s, cast=float):
    s = s.strip()
    return cast(s) if s else None


def parse_ndx(path):
    """format(a7,a8,a2,a8,3i7,i6,1x,3(a7,i6,e11.0,1x),a7,i6,e11.0,f7.0,2f8.0,3i4,i5,i4,e11.0,e10.0,e9.0), from the
    file's own first line. Returns (header, nuclides, daughters)."""
    lines = open(path, encoding="latin-1").read().splitlines()
    header, nuclides, daughters = lines[0].strip(), [], []
    for rec, ln in enumerate(lines[1:], start=1):
        if not ln.strip():
            continue
        if len(ln) != 226:
            raise ValueError(f"NDX line {rec}: {len(ln)} characters")
        name = ln[0:7].strip()
        el, z, a, iso = nuclide_parts(name)
        hl, unit, modes = float(ln[7:15]), ln[15:17].strip(), ln[17:25].strip()
        row = {
            "record": rec, "nuclide": name, "element": el, "z": z, "a": a, "isomer": iso,
            "half_life": hl, "half_life_unit": unit, "half_life_s": hl * UNIT_S[unit], "decay_modes": modes,
            "rad_record": num(ln[25:32], int), "bet_record": num(ln[32:39], int),
            "ack_record": num(ln[39:46], int), "nsf_record": num(ln[46:52], int),
            "e_alpha_mev": num(ln[152:159]), "e_electron_mev": num(ln[159:167]), "e_photon_mev": num(ln[167:175]),
            "n_photons_lt_10kev": num(ln[175:179], int), "n_photons_ge_10kev": num(ln[179:183], int),
            "n_betas": num(ln[183:187], int), "n_mono_electrons": num(ln[187:192], int), "n_alphas": num(ln[192:196], int),
            "atomic_mass_u": num(ln[196:207]), "air_kerma_rate_const": num(ln[207:217]), "air_kerma_coef": num(ln[217:226]),
        }
        nuclides.append(row)
        parent = (el, z, a, iso)
        for slot in range(4):
            o = 53 + slot * 25
            d, ptr, br = ln[o:o + 7].strip(), num(ln[o + 7:o + 13], int), num(ln[o + 13:o + 24])
            if not d:
                continue
            _, dz, da, diso = nuclide_parts(d)
            daughters.append({
                "parent": name, "parent_z": z, "parent_a": a, "parent_isomer": iso, "slot": slot + 1,
                "daughter": d, "daughter_z": dz, "daughter_a": da, "daughter_isomer": diso,
                "daughter_record": ptr, "daughter_stable": ptr == 0, "branching_fraction": br,
                "mode": mode_of(parent, MODE_TOKENS.findall(modes), d),
            })
    return header, nuclides, daughters


# Table 3 of the user guide.
TYPE_NAME = {"G": "Gamma rays", "PG": "Prompt gamma rays (spontaneous fission)", "DG": "Delayed gamma rays "
             "(spontaneous fission)", "X": "X rays", "AQ": "Annihilation photons", "B+": "Beta-plus particles",
             "B-": "Beta-minus particles", "BD": "Delayed beta particles (spontaneous fission)",
             "IE": "Internal conversion electrons", "AE": "Auger electrons", "A": "Alpha particles",
             "AR": "Alpha recoil nuclei", "FF": "Fission fragments", "N": "Neutrons"}


def blocks(path):
    """The CD's spectral files: a header line per nuclide (it starts with the name; its last field is the number of
    data lines), then its data lines. Yields (header line number, name, header fields, declared count, data lines)."""
    lines = open(path, encoding="latin-1").read().splitlines()
    i = 0
    while i < len(lines):
        h = lines[i]
        if not h.strip(" \t\x1a"):  # \x1a: a DOS end-of-file byte
            i += 1
            continue
        if not h[0].isalpha():
            raise ValueError(f"{path} line {i + 1}: expected a nuclide header, got {h[:40]!r}")
        n = int(h.split()[-1])
        yield i + 1, h[0:7].strip(), h, n, lines[i + 1:i + 1 + n]
        i += 1 + n


NUCLIDES = pa.schema([("record", I), ("nuclide", S), ("element", S), ("z", I), ("a", I), ("isomer", S),
                      ("half_life", D), ("half_life_unit", S), ("half_life_s", D), ("decay_modes", S),
                      ("rad_record", I), ("bet_record", I), ("ack_record", I), ("nsf_record", I),
                      ("e_alpha_mev", D), ("e_electron_mev", D), ("e_photon_mev", D),
                      ("n_photons_lt_10kev", I), ("n_photons_ge_10kev", I), ("n_betas", I), ("n_mono_electrons", I),
                      ("n_alphas", I), ("atomic_mass_u", D), ("air_kerma_rate_const", D), ("air_kerma_coef", D)])
DAUGHTERS = pa.schema([("parent", S), ("parent_z", I), ("parent_a", I), ("parent_isomer", S), ("slot", I),
                       ("daughter", S), ("daughter_z", I), ("daughter_a", I), ("daughter_isomer", S),
                       ("daughter_record", I), ("daughter_stable", B), ("branching_fraction", D), ("mode", S)])
RADIATIONS = pa.schema([("nuclide", S), ("seq", I), ("code", I), ("type", S), ("type_name", S),
                        ("yield_per_transformation", D), ("energy_mev", D), ("is_photon", B)])
BETA = pa.schema([("nuclide", S), ("seq", I), ("energy_mev", D), ("intensity_per_mev", D)])
AUGER = pa.schema([("nuclide", S), ("seq", I), ("yield_per_transformation", D), ("energy_ev", D), ("transition", S)])
NEUTRON = pa.schema([("nuclide", S), ("seq", I), ("sf_branching_fraction", D), ("energy_low_mev", D),
                     ("energy_high_mev", D), ("yield_per_transformation", D)])


def main():
    raw = json.loads(lake.s3.get_object(Bucket=lake.BUCKET, Key=f"{RAW}/manifest.json")["Body"].read())
    sha = {f["key"]: f["sha256"] for f in raw["files"]}
    keys = {"NDX": f"{RAW}/corrigenda-2022/ICRP-07.NDX"} | {x: f"{RAW}/cd/ICRP-07.{x}" for x in ("RAD", "BET", "ACK", "NSF")}
    path = {x: lake.download(k, os.path.join(LOCAL, k)) for x, k in keys.items()}

    header, nuclides, daughters = parse_ndx(path["NDX"])
    by = {n["nuclide"]: n for n in nuclides}
    t = {k: lake.Table(WORK, k, s) for k, s in (("nuclides", NUCLIDES), ("daughters", DAUGHTERS),
         ("radiations", RADIATIONS), ("beta_spectra", BETA), ("auger_ck", AUGER), ("neutron_spectra", NEUTRON))}
    for n in nuclides:
        t["nuclides"].add(n)
    for d in daughters:
        t["daughters"].add(d)

    seen = {x: {} for x in ("RAD", "BET", "ACK", "NSF")}  # nuclide -> header line number
    counted = defaultdict(lambda: defaultdict(int))  # nuclide -> NDX count column -> RAD rows
    for line, nm, _, n, data in blocks(path["RAD"]):
        seen["RAD"][nm] = line
        for seq, d in enumerate(data, 1):
            code, y, e, jc = d.split()
            code, y, e = int(code), float(y), float(e)
            t["radiations"].append([nm, seq, code, jc, TYPE_NAME.get(jc), y, e, code <= 3])
            col = ("n_photons_lt_10kev" if e < 0.01 else "n_photons_ge_10kev") if code <= 3 else \
                {4: "n_betas", 5: "n_betas", 6: "n_mono_electrons", 7: "n_mono_electrons", 8: "n_alphas"}.get(code)
            if col:
                counted[nm][col] += 1
        if len(data) != n:
            raise ValueError(f"RAD {nm}: {len(data)} lines, header says {n}")
    for line, nm, _, n, data in blocks(path["BET"]):
        seen["BET"][nm] = line
        for seq, d in enumerate(data, 1):
            e, y = d[0:7], d[7:17]  # F7.0, E10.0: the 10 MeV points fill the energy field
            t["beta_spectra"].append([nm, seq, float(e), float(y)])
    for line, nm, _, n, data in blocks(path["ACK"]):
        seen["ACK"][nm] = line
        for seq, d in enumerate(data, 1):
            p = d.split()
            t["auger_ck"].append([nm, seq, float(p[0]), float(p[1]), " ".join(p[2:])])
    for line, nm, h, n, data in blocks(path["NSF"]):
        seen["NSF"][nm] = line
        bf = float(h.replace("\x00", " ").split()[-2])  # the headers pad with NUL bytes
        for seq, d in enumerate(data, 1):
            lo, hi, y = d.split()
            t["neutron_spectra"].append([nm, seq, bf, float(lo), float(hi), float(y)])

    # Counts check: 1,252 nuclides; every nuclide in RAD, BET, ACK, NSF is in the NDX and sits at the line the NDX
    # points to; RAD rows per nuclide equal the NDX's five counts.
    names = set(by)
    ptr = {"RAD": "rad_record", "BET": "bet_record", "ACK": "ack_record", "NSF": "nsf_record"}
    files = {}
    for x, col in ptr.items():
        s = seen[x]
        files[x] = {
            "nuclides": len(s), "not_in_ndx": sorted(set(s) - names),
            "ndx_pointer_mismatch": sorted(nm for nm in names & set(s) if by[nm][col] != s[nm]),
            "ndx_points_but_absent": sorted(nm for nm in names if by[nm][col] and nm not in s),
        }
    off = {}
    for col in ("n_photons_lt_10kev", "n_photons_ge_10kev", "n_betas", "n_mono_electrons", "n_alphas"):
        bad = sorted(nm for nm in names if (by[nm][col] or 0) != counted[nm][col])
        off[col] = {"nuclides_off": len(bad), "examples": [[nm, by[nm][col], counted[nm][col]] for nm in bad[:8]]}
    check = {"ndx_nuclides": len(nuclides), "ndx_expected": 1252, "ndx_header": header, "daughters_rows": len(daughters),
             "files": files, "rad_rows_against_ndx_counts": off}

    tables, scanned = {}, 0
    for name, tab in t.items():
        info = tab.close()
        lake.sync(tab.dir, f"{OUT}/{name}/")
        count, s = lake.register(f"icrp107_{name}", tab.schema, f"s3://{lake.BUCKET}/{OUT}/{name}/", DDL)
        scanned += s
        tables[name] = {**info, "athena": f"nsr.icrp107_{name}", "athena_count": count}
    lake.sync(DDL, "lake/_work/parse/icrp107/ddl/")
    manifest = {
        "source": "ICRP Publication 107 (2008): the 2021 corrected NDX and the CD's RAD, BET, ACK and NSF",
        "prefix": OUT, "built": lake.now(),
        "how": "scripts/parse/icrp107/parse.py in github.com/nyd-user-1/nsrgpt, on the parse box",
        "inputs": [{"key": k, "sha256": sha.get(k)} for k in keys.values()],
        "formats": "raw/icrp/2026-11-09/cd/USERGUIDE.pdf, Tables 1-6",
        "half_life_s": "half_life x unit; a year is 365.2422 days (ICRP 107)",
        "tables": tables, "check": check,
        "spend": {"athena_bytes_scanned": scanned, "note": "parse box m7i-flex.large; its run time and cost go in the brief's report"},
    }
    lake.put_json(f"{OUT}/manifest.json", manifest)
    print(json.dumps({k: {"rows": v["rows"], "athena": v["athena_count"], "bytes": v["bytes"]} for k, v in tables.items()}))
    print(json.dumps({k: v for k, v in check.items() if k != "ndx_header"})[:3000])


if __name__ == "__main__":
    main()
