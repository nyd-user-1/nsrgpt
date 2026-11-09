"""ICRP Publication 107 as Parquet tables (brief 48, Part B). Runs on the parse box (/opt/parse/bin/python, pyreadr).
Reads raw/icrp/2026-11-09/: the corrected ICRP-07.NDX (corrigenda-2022/) and, until the CD's own RAD and BET arrive,
RadData 1.0.2's R copies of them. Writes lake/icrp107/2008/<table>/ and Athena nsr.icrp107_<table>:
  nuclides      one row per NDX record (1,252)
  daughters     one row per NDX progeny field: parent, daughter (stable ones carry pointer 0, SF 9999), branching, mode
  radiations    one row per RAD record: nuclide, radiation code and type, yield per transformation, energy MeV
  beta_spectra  one row per BET grid point: nuclide, energy MeV, beta particles per MeV per transformation
auger_ck (ACK) and neutron_spectra (NSF) wait for the CD's files. Then the counts check and manifest.json.
  /opt/parse/bin/python parse.py"""
import json
import os
import re
import sys
import tarfile

import pyarrow as pa
import pyreadr

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


def raddata(tar, name):
    with tarfile.open(tar) as t:
        t.extract(f"RadData/data/{name}.rda", os.path.join(LOCAL, "rd"), filter="data")
    return list(pyreadr.read_r(os.path.join(LOCAL, "rd", "RadData", "data", f"{name}.rda")).values())[0]


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
                        ("yield_per_transformation", D), ("energy_mev", D), ("is_photon", B), ("source", S)])
BETA = pa.schema([("nuclide", S), ("seq", I), ("energy_mev", D), ("intensity_per_mev", D), ("source", S)])
RD_SOURCE = "RadData 1.0.2 (R copy of ICRP-07.{})"


def main():
    raw = json.loads(lake.s3.get_object(Bucket=lake.BUCKET, Key=f"{RAW}/manifest.json")["Body"].read())
    sha = {f["key"]: f["sha256"] for f in raw["files"]}
    ndx_key = f"{RAW}/corrigenda-2022/ICRP-07.NDX"
    tar_key = f"{RAW}/raddata/RadData_1.0.2.tar.gz"
    ndx = lake.download(ndx_key, os.path.join(LOCAL, ndx_key))
    tar = lake.download(tar_key, os.path.join(LOCAL, tar_key))

    header, nuclides, daughters = parse_ndx(ndx)
    names = {n["nuclide"] for n in nuclides}
    t = {k: lake.Table(WORK, k, s) for k, s in
         (("nuclides", NUCLIDES), ("daughters", DAUGHTERS), ("radiations", RADIATIONS), ("beta_spectra", BETA))}
    for n in nuclides:
        t["nuclides"].add(n)
    for d in daughters:
        t["daughters"].add(d)

    codes = raddata(tar, "rad_codes")
    type_name = dict(zip(codes["code_AN"], codes["description"]))
    rad = raddata(tar, "ICRP_07.RAD")
    rad["seq"] = rad.groupby("RN", sort=False).cumcount() + 1
    src = RD_SOURCE.format("RAD")
    for r in rad.itertuples(index=False):
        t["radiations"].append([r.RN, int(r.seq), int(r.code_num), r.code_AN, type_name.get(r.code_AN), float(r.prob),
                                float(r.E_MeV), bool(r.is_photon), src])
    bet = raddata(tar, "ICRP_07.BET")
    bet["seq"] = bet.groupby("RN", sort=False).cumcount() + 1
    src = RD_SOURCE.format("BET")
    for r in bet.itertuples(index=False):
        t["beta_spectra"].append([r.RN, int(r.seq), float(r.E_MeV), float(r.A), src])

    # Counts check: NDX size, RAD and BET nuclides all in the NDX, RAD rows per nuclide against the NDX's counts.
    by = {n["nuclide"]: n for n in nuclides}
    rad_names, bet_names = set(rad["RN"]), set(bet["RN"])
    photon = rad["code_num"].isin([1, 2, 3])
    groups = {
        "n_photons_lt_10kev": rad[photon & (rad["E_MeV"] < 0.01)],
        "n_photons_ge_10kev": rad[photon & (rad["E_MeV"] >= 0.01)],
        "n_betas": rad[rad["code_num"].isin([4, 5])],
        "n_mono_electrons": rad[rad["code_num"].isin([6, 7])],
        "n_alphas": rad[rad["code_num"] == 8],
    }
    mismatch = {}
    for col, g in groups.items():
        have = g.groupby("RN").size().to_dict()
        bad = sorted(n for n in names if (by[n][col] or 0) != have.get(n, 0))
        mismatch[col] = {"nuclides_off": len(bad), "examples": [[n, by[n][col], have.get(n, 0)] for n in bad[:8]]}
    check = {
        "ndx_nuclides": len(nuclides), "ndx_expected": 1252, "ndx_header": header,
        "daughters_rows": len(daughters),
        "rad_nuclides": len(rad_names), "rad_not_in_ndx": sorted(rad_names - names),
        "ndx_with_rad_record_but_no_rad_rows": sorted(n for n in names if by[n]["rad_record"] and n not in rad_names),
        "bet_nuclides": len(bet_names), "bet_not_in_ndx": sorted(bet_names - names),
        "ndx_with_bet_record_but_no_bet_rows": sorted(n for n in names if by[n]["bet_record"] and n not in bet_names),
        "bet_rows_but_no_ndx_bet_record": sorted(n for n in bet_names & names if not by[n]["bet_record"]),
        "rad_rows_against_ndx_counts": mismatch,
    }

    tables, scanned = {}, 0
    for name, tab in t.items():
        info = tab.close()
        lake.sync(tab.dir, f"{OUT}/{name}/")
        count, s = lake.register(f"icrp107_{name}", tab.schema, f"s3://{lake.BUCKET}/{OUT}/{name}/", DDL)
        scanned += s
        tables[name] = {**info, "athena": f"nsr.icrp107_{name}", "athena_count": count}
    lake.sync(DDL, "lake/_work/parse/icrp107/ddl/")
    manifest = {
        "source": "ICRP Publication 107 (2008), the 2021 corrected NDX", "prefix": OUT, "built": lake.now(),
        "how": "scripts/parse/icrp107/parse.py in github.com/nyd-user-1/nsrgpt, on the parse box",
        "inputs": [{"key": ndx_key, "sha256": sha.get(ndx_key)},
                   {"key": tar_key, "sha256": sha.get(tar_key), "note": "RAD and BET from RadData's R copies until the "
                    "CD's ICRP-07.RAD and ICRP-07.BET are held; ACK and NSF not held, so no auger_ck or neutron_spectra"}],
        "half_life_s": "half_life x unit; a year is 365.2422 days (ICRP 107)",
        "tables": tables, "check": check,
        "spend": {"athena_bytes_scanned": scanned, "note": "parse box m7i-flex.large (Free Tier), under an hour"},
    }
    lake.put_json(f"{OUT}/manifest.json", manifest)
    print(json.dumps({k: {"rows": v["rows"], "athena": v["athena_count"], "bytes": v["bytes"]} for k, v in tables.items()}))
    print(json.dumps({k: v for k, v in check.items() if k != "ndx_header"})[:3000])


if __name__ == "__main__":
    main()
