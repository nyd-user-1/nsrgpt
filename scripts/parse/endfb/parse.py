"""ENDF library release (ENDF-6 text, every sublibrary) -> Parquet tables in the lake, registered in Athena (briefs 15, 43).

  /opt/parse/bin/python parse.py <release, e.g. B-VIII.1> <s3 key> [<s3 key>…] [--no-upload] [--register-only]
  /opt/parse/bin/python parse.py <release> <s3 key> [<s3 key>…] --mf=8,33     MF8 (454, 457, 459) and MF33 only

ENDF/B archives are read through services/nsr-count's own endf_lines() (nested archives opened, PDFs and web files
skipped, latin-1, the same line split), and the sublibrary is the file's folder as nsr-count names it, so material,
section and point counts compare one to one. A sublibrary archive (IAEA's <lib>_<token>.sublib.zip, NEA's
JEFF33-<token>.tgz) is read line by line, since one IAEA zip holds a single tape of many GB; its sublibrary is ENDF/B's
word for the token (n -> neutrons, tsl -> thermal_scatt, ...) and its file names start with the archive's name. Several
archives make one release. All tables are partitioned by release; each release's files sit at
lake/endfb/<release>/<table>/ and are added as an explicit partition.
  materials  one row per file + MAT with an MF1/MT451 section: header fields, dates, authors, description text
  sections   one row per section (a run of lines with one MAT, MF, MT); MF3 rows also carry ZA, AWR, QM, QI, LR, NR, NP
  xs_points  every (E, xs) pair of every MF3 section, with its interpolation region and law
  records    every line of every file, MAT, MF and MT read from columns 67-75 (null where a line has none)
--mf=8,33 (brief 43, part B) writes, from the same files and the same sections:
  fy           MF8 MT454 (independent) and MT459 (cumulative) yields: one row per product per incident energy
  decay        MF8 MT457, one row per material: half-life, stability, spin, parity, mean decay energies
  decay_modes  MT457's decay modes: RTYP, RFS, Q, BR with uncertainties
  decay_lines  MT457's spectra: one row per discrete line, a continuum row per spectrum with one (its TAB1 and
               covariance as JSON), a row for a discrete-spectrum covariance; each row repeats its spectrum's FD, ERAV, FC
  cov          MF33 in long form: LB=5 and 6 as (row bin, column bin, value); LB=0-4, 8, 9 as (energy, value) pairs with
               col_energy_ev null (pair_set 2 holds LB=3/4's second array); NC sub-subsections as JSON in params
--mf=2,32 (brief 56) writes, from the same files and sections, MF2 and MF32 MT151:
  res_ranges   one row per energy range per isotope (LRU 0 scattering radius only, 1 resolved: LRF 1-4 and 7, 2
               unresolved), header fields as columns, the rest (particle pairs, spin groups' channels) as JSON
  res_params   one row per resonance (LRF 7: every channel's width as JSON), or per (L, J[, energy]) of the unresolved
               averages (unresolved = true)
  res_cov      MF32 in long form: per range a header row, one "unc" row per parameter (its absolute standard
               deviation), the covariance (LCOMP 0, 1) or compact correlations (LCOMP 2, NDIGIT kept) as (row, column,
               value), long-range (LB, energies, value) and the unresolved relative covariance
MF1/451, MF3, MF8, MF33, MF2 and MF32 are parsed with endf-parserpy 0.18.0 (IAEA; held at raw/pypi/2026-11-07/endf-parserpy/). An
MF1/451 or MF3 section it rejects is read by the fixed-column reader below; an MF8 or MF33 section it rejects is listed
in the manifest with its MAT and MT. Either way it is counted.
"""
import collections
import io
import json
import logging
import math
import os
import re
import sys
import tarfile
import time
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "box"))
import lake  # noqa: E402
import nsr_count  # noqa: E402
from lake import S, D, I, B  # noqa: E402
import pyarrow as pa  # noqa: E402
import endf_parserpy  # noqa: E402
from endf_parserpy import EndfParserPy  # noqa: E402

logging.disable(logging.WARNING)  # endf-parserpy warns on every nonstandard constant field; rejections are counted instead

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
RELEASE, KEYS = ARGS[0], ARGS[1:]
KEY = KEYS[0]
UPLOAD = "--no-upload" not in sys.argv
ONLY = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")), None)  # test on one file path substring
MF_MODE = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--mf=")), None)  # "8,33" or "2,32"
RES_MODE = MF_MODE == "2,32"  # brief 56: MF2 and MF32, MT151 (resonance parameters and their covariances)
WORK = f"/data/endfb/{RELEASE}"
OUT = f"{WORK}/mf2/out" if RES_MODE else f"{WORK}/mf/out" if MF_MODE else f"{WORK}/out"
PREFIX = f"lake/endfb/{RELEASE}"
HERE = os.path.dirname(os.path.abspath(__file__))
BOX = ("nsr-parse-3, m7i-flex.large, about $0.096 an hour on-demand (Free plan credits); 400 GB gp3, about $0.044 an hour"
       if RES_MODE else
       "nsr-parse-2, m7i-flex.large, about $0.096 an hour on-demand (Free plan credits); 400 GB gp3, about $0.044 an hour")
MF_KEY = "mf2_mf32" if RES_MODE else "mf8_mf33"  # the manifest's section and the local summary's name

# A sublibrary archive's token (IAEA <lib>_<token>.sublib.zip, NEA JEFF33-<token>.tgz) -> ENDF/B's folder word.
NSUB_WORDS = {"n": "neutrons", "tsl": "thermal_scatt", "decay": "decay", "nfpy": "nfy", "sfpy": "sfy", "g": "gammas",
              "p": "protons", "d": "deuterons", "t": "tritons", "he3": "helium3s", "he4": "alphas", "a": "alphas",
              "photo": "photoat", "e": "electrons", "ard": "atomic_relax"}


def split_key(key):
    """Brief 70: a key may end in #<token> (`…/brond22n.dat#n`, `…/n/n_0125_1-H-1.zip#n`), naming the sublibrary of an
    archive or tape whose file name does not carry one. (S3 key, token or None)."""
    k, _, tok = key.partition("#")
    return k, (tok or None)


def sub_word(key):
    key, tok = split_key(key)
    if tok:
        return NSUB_WORDS.get(tok.lower(), tok)
    b = key.rsplit("/", 1)[-1]
    m = re.match(r".+_([a-z0-9]+)\.sublib\.zip$", b, re.I) or re.match(r"JEFF33-([a-z0-9]+)\.tgz$", b, re.I)
    return NSUB_WORDS.get(m.group(1).lower()) if m else None

SCHEMAS = {
    "materials": pa.schema([
        ("release", S), ("sublibrary", S), ("file_name", S), ("mat", I), ("za", D), ("zsymam", S), ("awr", D),
        ("lrp", I), ("lfi", I), ("nlib", I), ("nmod", I), ("elis", D), ("sta", D), ("lis", I), ("liso", I),
        ("nfor", I), ("awi", D), ("emax", D), ("lrel", I), ("nsub", I), ("nver", I), ("temp_k", D), ("ldrv", I),
        ("nwd", I), ("nxc", I), ("alab", S), ("edate", S), ("auth", S), ("ref", S), ("ddate", S), ("rdate", S),
        ("endate", S), ("hsub", S), ("description", S), ("section_count", I), ("line_count", I), ("parser", S)]),
    "sections": pa.schema([
        ("release", S), ("sublibrary", S), ("file_name", S), ("mat", I), ("mf", I), ("mt", I), ("line_count", I),
        ("first_line", I), ("za", D), ("awr", D), ("qm", D), ("qi", D), ("lr", I), ("nr", I), ("np", I),
        ("parser", S)]),
    "xs_points": pa.schema([
        ("release", S), ("sublibrary", S), ("file_name", S), ("mat", I), ("mt", I), ("point_seq", I),
        ("energy_ev", D), ("xs_barn", D), ("interpolation_region", I), ("interpolation", I)]),
    "records": pa.schema([
        ("release", S), ("sublibrary", S), ("file_name", S), ("line_no", I), ("mat", I), ("mf", I), ("mt", I),
        ("text", S)]),
}

MF_SCHEMAS = {
    "fy": pa.schema([
        ("release", S), ("sublibrary", S), ("file_name", S), ("mat", I), ("mt", I), ("energy_seq", I),
        ("energy_ev", D), ("interpolation", I), ("zafp", D), ("fps", D), ("yield", D), ("yield_unc", D)]),
    "decay": pa.schema([
        ("release", S), ("sublibrary", S), ("file_name", S), ("mat", I), ("za", D), ("awr", D), ("lis", I),
        ("liso", I), ("half_life_s", D), ("half_life_unc", D), ("stable", B), ("nsp", I), ("spin", D), ("parity", D),
        ("mean_light_ev", D), ("mean_light_unc", D), ("mean_em_ev", D), ("mean_em_unc", D), ("mean_heavy_ev", D),
        ("mean_heavy_unc", D), ("nc", I), ("mean_energies", S)]),
    "decay_modes": pa.schema([
        ("release", S), ("sublibrary", S), ("file_name", S), ("mat", I), ("mode_seq", I), ("rtyp", D), ("rfs", D),
        ("q_ev", D), ("q_unc", D), ("br", D), ("br_unc", D)]),
    "decay_lines": pa.schema([
        ("release", S), ("sublibrary", S), ("file_name", S), ("mat", I), ("spectrum_seq", I), ("styp", D),
        ("lcon", I), ("lcov", I), ("ner", I), ("fd", D), ("fd_unc", D), ("erav_ev", D), ("erav_unc", D), ("fc", D),
        ("fc_unc", D), ("continuum", B), ("line_seq", I), ("er_ev", D), ("er_unc", D), ("rtyp", D), ("type", D),
        ("ri", D), ("ri_unc", D), ("ris", D), ("ris_unc", D), ("ricc", D), ("ricc_unc", D), ("rick", D),
        ("rick_unc", D), ("ricl", D), ("ricl_unc", D), ("params", S)]),
    "cov": pa.schema([
        ("release", S), ("sublibrary", S), ("file_name", S), ("mat", I), ("mt", I), ("mtl", I), ("mat1", I),
        ("mt1", I), ("xmf1", D), ("xlfs1", D), ("block", S), ("ni_index", I), ("lb", I), ("lt", I), ("ls", I),
        ("pair_set", I), ("row_energy_ev", D), ("row_energy_hi_ev", D), ("col_energy_ev", D),
        ("col_energy_hi_ev", D), ("value", D), ("params", S)]),
}

REFERENCE = {  # Lambda nsr-count, 2026-11-07 (brief 15 and the lake page's ENDF/B releases table)
    "B-VIII.1": {"materials": 5135, "mf3_cross_sections": 32347, "mf3_points": 2587259},
    "B-VIII.0": {"materials": 4989, "mf3_cross_sections": 27849, "mf3_points": 2026737},
    "B-VII.1": {"materials": 4834, "mf3_cross_sections": 17280, "mf3_points": 1101659},
    "B-VII.0": {"materials": 4820, "mf3_cross_sections": 15269, "mf3_points": 1107315},
    "B-VI.8": {"materials": 2114, "mf3_cross_sections": 13388, "mf3_points": 1441831},
    "B-V": {"materials": 130},
    "B-IV": {"materials": 90},
    "B-III": {"materials": 135},
    "B-II": {"materials": 68},
    # Brief 43: one line per material in each sublibrary's .lst beside the IAEA zip (2026-11-09). JEFF-3.3's NEA archives
    # (alphas, deuterons, gammas, helium3s, protons) have no .lst; their reference is the files with an MF1/451 section.
    "CENDL-3.2": {"materials": 272, "materials_by_sublibrary": {"neutrons": 272}},
    "JEFF-3.3": {"materials_by_sublibrary": {"neutrons": 562, "thermal_scatt": 20, "decay": 3852, "nfy": 19, "sfy": 3}},
    "JENDL-5": {"materials": 8219, "materials_by_sublibrary": {
        "neutrons": 795, "gammas": 2684, "protons": 239, "thermal_scatt": 62, "deuterons": 9, "photoat": 100,
        "decay": 4071, "alphas": 18, "electrons": 100, "nfy": 31, "sfy": 10, "atomic_relax": 100}},
    "TENDL-2023": {"materials": 19901, "materials_by_sublibrary": {
        "neutrons": 2850, "gammas": 2825, "protons": 2855, "deuterons": 2850, "tritons": 2865, "helium3s": 2821,
        "alphas": 2835}},
}


def explain(parsed, mine, rerun, ref):
    """Plain sentences for each count that differs from the reference or from nsr-count rerun on the same archive."""
    out = []
    ro = parsed["records_only_files"]
    ho = [r for r in ro if r["mats_with_mf1_451"]]
    other = [r for r in ro if not r["mats_with_mf1_451"]]
    if mine["materials"] != rerun["materials"] or (ref.get("materials") is not None and mine["materials"] != ref["materials"]):
        r_m = f"{ref['materials']:,}" if ref.get("materials") is not None else "n/a"
        out.append(f"Materials {mine['materials']:,}; reference {r_m}; nsr-count rerun on the same "
                   f"archive {rerun['materials']:,}. nsr-count also counts the MF1/451 section of {len(ho)} header files "
                   f"(MF1/451 and nothing else), kept in records only: "
                   + ", ".join(r["file"].rsplit("/", 1)[-1] for r in ho[:12]) + ".")
    if other:
        out.append(f"{len(other)} files with no MF1/451 section have lines whose columns 67-75 read as MAT, MF and MT "
                   f"(LEAPR inputs, DOS tables and the like); they are in records only, not sections: "
                   + ", ".join(r["file"].rsplit("/", 1)[-1] for r in other[:12]) + ".")
    diffs = parsed["mf3_tally_differences"]
    if mine["mf3_cross_sections"] != rerun["mf3_cross_sections"] or diffs:
        extra = sum(d["nsr_count_way"] - d["sections"] for d in diffs)
        names = ", ".join(f"{d['file'].rsplit('/', 1)[-1]} ({d['nsr_count_way']} vs {d['sections']})" for d in diffs[:12])
        out.append(f"MF3 sections {mine['mf3_cross_sections']:,} against nsr-count's {rerun['mf3_cross_sections']:,}. "
                   f"nsr-count counts a new section at every change of MAT or MT among lines whose columns 67-75 read "
                   f"MF=3; the {len(diffs)} files where that tally differs from the sections here (nsr-count's vs these, "
                   f"net {extra:+,}): {names}.")
    if mine["mf3_points"] != rerun["mf3_points"]:
        out.append(f"MF3 points {mine['mf3_points']:,} parsed against nsr-count's {rerun['mf3_points']:,} (NP read from the "
                   f"TAB1 header); the TAB1 headers here sum to {parsed['mf3_points_by_tab1_header']:,}.")
    for k in ("mf3_cross_sections", "mf3_points"):
        if ref.get(k) is not None and rerun[k] != ref[k]:
            out.append(f"{k}: the reference {ref[k]:,} differs from nsr-count rerun today ({rerun[k]:,}) on the same archive.")
    return out


# ---------- fixed-column reader (fallback) ----------
def efloat(s):
    s = s.strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        pass
    t = s.replace("D", "E").replace("d", "e").replace(" ", "")
    for i in range(len(t) - 1, 0, -1):  # Fortran style 1.234567+5 -> 1.234567E+5
        if t[i] in "+-" and t[i - 1] not in "Ee":
            t = t[:i] + "E" + t[i:]
            break
    try:
        return float(t)
    except ValueError:
        return None


def eint(s):
    s = s.strip()
    if not s:
        return 0
    try:
        return int(s)
    except ValueError:
        f = efloat(s)
        return int(f) if f is not None else None


def fields6(line):
    line = line.ljust(66)
    return [line[i * 11:(i + 1) * 11] for i in range(6)]


def tab1_fallback(lines):
    """MF3 section lines (HEAD, TAB1) -> header and points."""
    h = fields6(lines[0])
    c = fields6(lines[1])
    nr, np_ = eint(c[4]), eint(c[5])
    i, ints = 2, []
    while len(ints) < 2 * nr and i < len(lines):
        ints += [eint(x) for x in fields6(lines[i])]
        i += 1
    ints = ints[:2 * nr]
    vals = []
    while len(vals) < 2 * np_ and i < len(lines):
        vals += [efloat(x) for x in fields6(lines[i])]
        i += 1
    vals = vals[:2 * np_]
    return {"ZA": efloat(h[0]), "AWR": efloat(h[1]), "QM": efloat(c[0]), "QI": efloat(c[1]), "LR": eint(c[3]),
            "NR": nr, "NP": np_, "NBT": ints[0::2], "INT": ints[1::2], "E": vals[0::2], "xs": vals[1::2]}


def mf1_fallback(lines):
    """MF1/MT451 section lines -> header (ENDF-6 layout where it fits; HEAD fields and text otherwise)."""
    f = [fields6(ln) for ln in lines[:4]] + [None] * 4
    d = {"ZA": efloat(f[0][0]), "AWR": efloat(f[0][1]), "LRP": eint(f[0][2]), "LFI": eint(f[0][3]),
         "NLIB": eint(f[0][4]), "NMOD": eint(f[0][5])}
    if len(lines) > 4 and f[1] and eint(f[1][5]) == 6:
        d.update(ELIS=efloat(f[1][0]), STA=efloat(f[1][1]), LIS=eint(f[1][2]), LISO=eint(f[1][3]), NFOR=6,
                 AWI=efloat(f[2][0]), EMAX=efloat(f[2][1]), LREL=eint(f[2][2]), NSUB=eint(f[2][4]),
                 NVER=eint(f[2][5]), TEMP=efloat(f[3][0]), LDRV=eint(f[3][2]), NWD=eint(f[3][4]), NXC=eint(f[3][5]))
        text = [ln[:66] for ln in lines[4:4 + (d["NWD"] or 0)]]
        if len(text) >= 2:
            t0, t1 = text[0].ljust(66), text[1].ljust(66)
            d.update(ZSYMAM=t0[0:11], ALAB=t0[11:22], EDATE=t0[22:32], AUTH=t0[33:66], REF=t1[1:22],
                     DDATE=t1[22:32], RDATE=t1[33:43], ENDATE=t1[55:63])
        d["HSUB"] = text[2:5]
        d["DESCRIPTION"] = text[5:]
    else:  # older layouts: keep every text line after the HEAD
        d["DESCRIPTION"] = [ln[:66] for ln in lines[1:]]
    return d


# ---------- endf-parserpy ----------
PARSER = EndfParserPy(array_type="list")
TPID = f"{'tape head for one section':66s}{1:4d}{0:2d}{0:3d}{0:5d}"  # endf-parserpy reads a whole tape: head first
ZERO = f"{0.0:11.4E}{0.0:11.4E}{0:11d}{0:11d}{0:11d}{0:11d}"


def tail(mat):
    """FEND, MEND and TEND after a section's SEND, so one section reads as a whole tape."""
    return [f"{ZERO}{mat:4d}{0:2d}{0:3d}{99999:5d}", f"{ZERO}{0:4d}{0:2d}{0:3d}{0:5d}", f"{ZERO}{-1:4d}{0:2d}{0:3d}{0:5d}"]


fallbacks = collections.Counter()
fallback_examples = []


def section_data(lines, mat, mf, mt, send, where):
    try:
        d = PARSER.parse([TPID] + lines + [send] + tail(mat), include=((mf, mt),))[mf][mt]
        if mf == 3:
            t = d["xstable"]
            d = {"ZA": d["ZA"], "AWR": d["AWR"], "QM": d["QM"], "QI": d["QI"], "LR": d["LR"],
                 "NR": len(t["NBT"]), "NP": len(t["E"]), "NBT": t["NBT"], "INT": t["INT"], "E": t["E"], "xs": t["xs"]}
        return d, "endf-parserpy"
    except Exception as e:  # noqa: BLE001
        fallbacks[mf] += 1
        if len(fallback_examples) < 20:
            fallback_examples.append({"where": where, "mf": mf, "mt": mt, "error": f"{type(e).__name__}: {str(e)[:200]}"})
        return (tab1_fallback(lines) if mf == 3 else mf1_fallback(lines)), "fallback"


def toint(s):
    s = s.strip()
    if s and (s.isdigit() or (s[0] == "-" and s[1:].isdigit())):
        return int(s)
    return None


def txt(v):
    if v is None:
        return None
    if isinstance(v, (list, tuple)):
        v = "\n".join(str(x).rstrip() for x in v)
    elif isinstance(v, dict):
        v = "\n".join(str(v[k]).rstrip() for k in sorted(v))
    v = str(v).rstrip()
    return v or None


def num(v, kind=float):
    try:
        return kind(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def source_for(key, path):
    """nsr-count's endf(): zip and tar.gz read from a file object, anything else as bytes."""
    k = key.lower()
    if k.endswith(".zip") or k.endswith((".tar.gz", ".tgz")):
        return open(path, "rb")
    return open(path, "rb").read()


SKIP_EXT = (".pdf", ".html", ".htm", ".png", ".jpg", ".md", ".py", ".json", ".xml")  # nsr-count's skip list


def lines_of(f):
    """A member's lines, decoded latin-1, without their line ends, read as a stream."""
    for raw in io.TextIOWrapper(f, encoding="latin-1", newline=None):
        yield raw[:-1] if raw.endswith("\n") else raw


def stream_files(name, f):
    """(path, size, lines) for every file in a zip or tar.gz, each member streamed (an IAEA sublibrary zip holds one
    tape of many GB). A nested archive is small and goes through nsr-count's endf_lines() in memory."""
    n = name.lower()
    if n.endswith(".zip"):
        z = zipfile.ZipFile(f)
        for info in z.infolist():
            zn = info.filename
            if zn.endswith("/") or zn.lower().endswith(SKIP_EXT):
                continue
            if zn.lower().endswith((".zip", ".tgz", ".tar.gz", ".tar", ".gz")):
                for p, ls in nsr_count.endf_lines(zn, z.read(info)):
                    yield f"{zn}/{p}", None, iter(ls)
                continue
            with z.open(info) as g:
                yield zn, info.file_size, lines_of(g)
    elif n.endswith((".tgz", ".tar.gz", ".tar")):
        with tarfile.open(fileobj=f, mode="r:gz" if n.endswith("gz") else "r:") as t:  # members read in order, each seekable
            for m in t:
                if m.isfile() and not m.name.lower().endswith(SKIP_EXT):
                    yield m.name, m.size, lines_of(t.extractfile(m))
    else:  # brief 70: a plain tape (BROND-2.2's brond22n.dat), read as one file
        yield name, None, lines_of(f)


ARCHIVES = []  # per archive: key, bytes, sublibrary, files read, duplicates skipped


def archive_files():
    """(file_name, sublibrary, lines) for every ENDF file in every archive of the release, in the order given."""
    for key in KEYS:
        s3key = split_key(key)[0]
        arch = s3key.rsplit("/", 1)[-1]
        src = lake.download(s3key, f"{WORK}/src/{arch}")
        word = sub_word(key)
        a = {"key": key, "bytes": os.path.getsize(src), "sublibrary": word, "files_read": 0, "duplicates_skipped": []}
        ARCHIVES.append(a)
        if word is None:  # ENDF/B: nsr-count's reader, folder as sublibrary
            for path, lines in nsr_count.endf_lines(arch, source_for(key, src)):
                a["files_read"] += 1
                yield path, (path.rsplit("/", 2)[-2] if path.count("/") >= 1 else "(root)"), lines
            continue
        seen = {}
        with open(src, "rb") as f:
            for path, size, lines in stream_files(arch, f):
                base = path.rsplit("/", 1)[-1]
                if size is not None and (base, size) in seen:  # NEA's JEFF33-a.tgz repeats some files under a/ and Ac/
                    a["duplicates_skipped"].append({"file": path, "same_name_and_size_as": seen[(base, size)]})
                    continue
                seen[(base, size)] = path
                a["files_read"] += 1
                yield f"{arch}/{path}", word, lines


def main():
    t0 = time.time()
    tables = {t: lake.Table(OUT, t, SCHEMAS[t], row_group=1_000_000 if t == "records" else 500_000)
              for t in SCHEMAS}
    files = 0
    mats_by_folder = collections.Counter()
    mf3_sections = mf3_points = 0
    nsr_points = 0  # NP read nsr-count's way (TAB1 header columns 56-66), to explain any difference
    mf3_differences = []  # files where nsr-count's MF3 tally (runs of lines reading MF=3) differs from the sections here
    records_only = []  # files kept in records only: no MF1/451 section, or MF1/451 and nothing else (header files)
    mf1_451_by_sub = collections.Counter()  # file + MAT pairs with an MF1/451 section, header files included
    for path, sub, lines in archive_files():
        if ONLY and ONLY not in path:
            continue
        files += 1
        per_mat = collections.defaultdict(lambda: [0, 0])  # mat -> [sections, lines]
        heads = {}  # mat -> (data, parser) for the first MF1/451 in this file
        cur, sec, first = None, [], 0
        rec = tables["records"]
        prev_n, n_mf3 = None, 0
        # Rows wait in f_sections and f_points until the file shows a material with MF1/451 and a second section;
        # from then on they go straight to the tables, so a large POINT file never sits in memory whole.
        f_sections, f_points = [], []
        f = {"mf3": 0, "points": 0, "nsr_points": 0, "holds": False}
        xs = tables["xs_points"]

        def close(terminator):
            mat, mf, mt = cur
            per_mat[mat][0] += 1
            if not f["holds"] and mat in heads and per_mat[mat][0] > 1:
                f["holds"] = True
                for r in f_sections:
                    tables["sections"].add(r)
                for t in f_points:
                    xs.append(t)
                f_sections.clear()
                f_points.clear()
            put_point = xs.append if f["holds"] else f_points.append
            row = {"release": RELEASE, "sublibrary": sub, "file_name": path, "mat": mat, "mf": mf, "mt": mt,
                   "line_count": n_lines, "first_line": first}
            send = terminator if terminator is not None and toint(terminator[72:75] if len(terminator) >= 75 else "") == 0 \
                else f"{0.0:11.4E}{0.0:11.4E}{0:11d}{0:11d}{0:11d}{0:11d}{mat:4d}{mf:2d}{0:3d}{99999:5d}"
            if mf == 1 and mt == 451 and mat not in heads:
                heads[mat] = section_data(sec, mat, 1, 451, send, f"{path} MAT {mat}")
            elif mf == 3:
                f["mf3"] += 1
                if len(sec) > 1 and sec[1][55:66].strip().lstrip("-").isdigit():
                    f["nsr_points"] += int(sec[1][55:66])
                d, how = section_data(sec, mat, 3, mt, send, f"{path} MAT {mat} MT {mt}")
                row.update(za=num(d["ZA"]), awr=num(d["AWR"]), qm=num(d["QM"]), qi=num(d["QI"]),
                           lr=num(d["LR"], int), nr=d["NR"], np=d["NP"], parser=how)
                nbt, law, region = d["NBT"] or [d["NP"]], d["INT"] or [None], 0
                for p, (e, x) in enumerate(zip(d["E"], d["xs"]), 1):
                    while region < len(nbt) - 1 and p > nbt[region]:
                        region += 1
                    put_point((RELEASE, sub, path, mat, mt, p, e, x, region + 1, law[region]))
                f["points"] += len(d["E"])
            (tables["sections"].add if f["holds"] else f_sections.append)(row)

        n_lines = 0
        for i, line in enumerate(lines, 1):
            mat = mf = mt = None
            if len(line) >= 75:
                mat, mf, mt = toint(line[66:70]), toint(line[70:72]), toint(line[72:75])
            rec.append((RELEASE, sub, path, i, mat, mf, mt, line))
            if not i % 20_000_000:
                print(f"{path}: {i:,} lines, {time.time() - t0:.0f}s", flush=True)
            if len(line) >= 75:  # nsr-count's MF3 tally, line for line
                sm = line[66:70].strip()
                if not sm.lstrip("-").isdigit() or int(sm) <= 0:
                    prev_n = None
                elif line[70:72].strip() == "3" and line[72:75].strip() not in ("", "0"):
                    c = (sm, line[72:75].strip())
                    n_mf3 += c != prev_n
                    prev_n = c
                else:
                    prev_n = None
            if mat is not None and mat > 0:
                per_mat[mat][1] += 1
            key = (mat, mf, mt) if (mat and mat > 0 and mf and mf > 0 and mt and mt > 0) else None
            if key != cur:
                if cur is not None:
                    close(line)
                cur, sec, first, n_lines = key, [], i, 0
            if cur is not None:
                n_lines += 1
                if (cur[1] == 1 and cur[2] == 451) or cur[1] == 3:
                    sec.append(line)
        if cur is not None:
            close(None)
        # A file holds ENDF data when at least one MAT has an MF1/451 section and more. Header files (MF1/451 only,
        # repeating a material held in its own file) and files with no MF1/451 (LEAPR inputs, DOS tables, READMEs)
        # stay in records only, with what their stray columns would have added listed in the manifest.
        holds = f["holds"]
        mf1_451_by_sub[sub] += len(heads)
        if n_mf3 != (f["mf3"] if holds else 0):
            mf3_differences.append({"file": path, "nsr_count_way": n_mf3, "sections": f["mf3"] if holds else 0})
        if not holds:
            if heads or f_sections:
                records_only.append({"file": path, "reason": "header only (MF1/451 and nothing else)" if heads
                                     else "no MF1/451 section", "mats_with_mf1_451": sorted(heads),
                                     "line_runs_read_as_sections": len(f_sections), "mf3_points": f["points"]})
            continue
        mf3_sections += f["mf3"]
        mf3_points += f["points"]
        nsr_points += f["nsr_points"]
        for mat, (d, how) in heads.items():
            mats_by_folder[sub] += 1
            tables["materials"].add({
                "release": RELEASE, "sublibrary": sub, "file_name": path, "mat": mat, "za": num(d.get("ZA")),
                "zsymam": txt(d.get("ZSYMAM")), "awr": num(d.get("AWR")), "lrp": num(d.get("LRP"), int),
                "lfi": num(d.get("LFI"), int), "nlib": num(d.get("NLIB"), int), "nmod": num(d.get("NMOD"), int),
                "elis": num(d.get("ELIS")), "sta": num(d.get("STA")), "lis": num(d.get("LIS"), int),
                "liso": num(d.get("LISO"), int), "nfor": num(d.get("NFOR"), int), "awi": num(d.get("AWI")),
                "emax": num(d.get("EMAX")), "lrel": num(d.get("LREL"), int), "nsub": num(d.get("NSUB"), int),
                "nver": num(d.get("NVER"), int), "temp_k": num(d.get("TEMP")), "ldrv": num(d.get("LDRV"), int),
                "nwd": num(d.get("NWD"), int), "nxc": num(d.get("NXC"), int), "alab": txt(d.get("ALAB")),
                "edate": txt(d.get("EDATE")), "auth": txt(d.get("AUTH")), "ref": txt(d.get("REF")),
                "ddate": txt(d.get("DDATE")), "rdate": txt(d.get("RDATE")), "endate": txt(d.get("ENDATE")),
                "hsub": txt(d.get("HSUB")), "description": txt(d.get("DESCRIPTION")),
                "section_count": per_mat[mat][0], "line_count": per_mat[mat][1], "parser": how})
        if files % 200 == 0:
            print(f"{files} files, {time.time() - t0:.0f}s", flush=True)

    stats = {t: tb.close() for t, tb in tables.items()}
    manifest = {
        "dataset": "endfb", "release": RELEASE, "built_at": lake.now(), "seconds": round(time.time() - t0),
        "source": {"key": KEY, "bytes": sum(a["bytes"] for a in ARCHIVES), "files_read": files, "archives": ARCHIVES},
        "parser": {"script": "scripts/parse/endfb/parse.py", "endf_parserpy": endf_parserpy.__version__
                   if hasattr(endf_parserpy, "__version__") else "0.18.0", "used_for": "MF1/MT451 and MF3 sections",
                   "fallback_sections": dict(fallbacks), "fallback_examples": fallback_examples,
                   "file_reader": "services/nsr-count endf_lines() (scripts/parse/box/nsr_count.py) for ENDF/B archives; "
                                  "stream_files() in parse.py, line by line, for sublibrary archives",
                   "pyarrow": pa.__version__},
        "parsed": {"materials": sum(mats_by_folder.values()), "materials_by_sublibrary": dict(mats_by_folder.most_common()),
                   "mf3_cross_sections": mf3_sections, "mf3_points": mf3_points,
                   "mf3_points_by_tab1_header": nsr_points, "records_only_files": records_only,
                   "mf3_tally_differences": mf3_differences,
                   "mf1_451_materials_by_sublibrary": dict(mf1_451_by_sub.most_common())},
        "tables": {f"endfb_{t}": {"location": f"s3://{lake.BUCKET}/{PREFIX}/{t}/", "partition": {"release": RELEASE},
                                  **st} for t, st in stats.items()},
    }
    with open(f"{WORK}/manifest.local.json", "w") as f:
        json.dump(manifest, f, indent=1)
    print(json.dumps(manifest["parsed"]), json.dumps({t: s["rows"] for t, s in stats.items()}), flush=True)
    if not UPLOAD or ONLY:
        return
    for t in tables:
        lake.sync(f"{OUT}/{t}", f"{PREFIX}/{t}/")
    print("uploaded", flush=True)


def register():
    """Create endfb_* if missing (release as the partition column), add this release's partition, COUNT(*) it, compare
    with the reference and with nsr-count rerun on the same archive, write lake/endfb/<release>/manifest.json."""
    with open(f"{WORK}/manifest.local.json") as f:
        manifest = json.load(f)
    ddl_dir = f"{HERE}/ddl"
    scanned = queries = 0
    for t, schema in SCHEMAS.items():
        name = f"endfb_{t}"
        loc = f"s3://{lake.BUCKET}/{PREFIX}/{t}/"
        n, s = lake.register(name, schema, f"s3://{lake.BUCKET}/lake/endfb/", ddl_dir,
                             partitions={"release": "string"}, partition_locations={(("release", RELEASE),): loc},
                             drop=False, where=f"WHERE release = '{RELEASE}'")
        manifest["tables"][name]["athena_count"] = n
        scanned += s
        queries += 1
        lake.s3.upload_file(f"{ddl_dir}/{name}.sql", lake.BUCKET, f"lake/_work/parse/endfb/ddl/{name}.sql")
    tb = manifest["tables"]
    (secs,), s = lake.rows(f"SELECT COUNT(*) FROM endfb_sections WHERE release = '{RELEASE}' AND mf = 3")[0][0], 0
    queries += 1
    ref = dict(REFERENCE.get(RELEASE, {}))
    mine = {"materials": tb["endfb_materials"]["athena_count"], "mf3_cross_sections": int(secs),
            "mf3_points": tb["endfb_xs_points"]["athena_count"]}
    if any(sub_word(k) for k in KEYS):
        manifest["counts_check"], q = sublibrary_check(manifest, mine, ref)
        queries += q
        if RELEASE == "JENDL-5":
            manifest["held_unparsed"] = jaea_updates()
    else:
        rerun = nsr_count.endf(KEY, RELEASE)
        manifest["counts_check"] = rerun_check(manifest, mine, ref, rerun)
    try:  # keep the other parts' sections when part A is rerun
        old = json.loads(lake.s3.get_object(Bucket=lake.BUCKET, Key=f"{PREFIX}/manifest.json")["Body"].read())
        for k in ("mf8_mf33", "mf2_mf32", "sections_by_mf"):
            if k in old:
                manifest[k] = old[k]
    except Exception:  # noqa: BLE001
        pass
    manifest["spend"] = {"athena_queries": queries, "athena_bytes_scanned": scanned,
                         "athena_usd": round(max(scanned, queries * 10_485_760) / 1e12 * 5, 4), "box": BOX}
    lake.put_json(f"{PREFIX}/manifest.json", manifest)
    print(json.dumps(manifest["counts_check"], indent=1), flush=True)


def rerun_check(manifest, mine, ref, rerun):
    """ENDF/B: the tables against the reference and against nsr-count rerun on the same archive."""
    return {
        "reference": ref,
        "nsr_count_rerun": {k: rerun[k] for k in ("materials", "mf3_cross_sections", "mf3_points", "files")},
        "nsr_count_rerun_by_sublibrary": rerun["materials_by_folder"],
        "tables": mine, "tables_by_sublibrary": manifest["parsed"]["materials_by_sublibrary"],
        "match_reference": {k: (mine[k] == ref[k]) if k in ref else None for k in mine},
        "match_rerun": {k: mine[k] == rerun[k] for k in mine},
        "match_rerun_by_sublibrary": manifest["parsed"]["materials_by_sublibrary"] == rerun["materials_by_folder"],
        "explained": explain(manifest["parsed"], mine, rerun, ref),
    }


def lst_mats(key):
    """MATs listed in the IAEA .lst for a sublibrary zip (one line "  n)  MAT  material ..." each): beside the zip, or
    one folder up (JEFF-3.3); brief 70: also beside any IAEA <lib>_<token>.zip or tape (cendl-2_n.lst, brond22n.dat.lst).
    (key, [MAT, ...]) or (None, None)."""
    key, tok = split_key(key)
    if key.endswith(".sublib.zip"):
        lst = key[:-4] + ".lst"
        head, _, name = lst.rpartition("/")
        tries = (lst, f"{head.rpartition('/')[0]}/{name}")
    elif tok and not re.search(r"/[a-z0-9]+_\d{4}_[^/]+\.zip$", key, re.I):  # not a per-material zip
        tries = (re.sub(r"\.(zip|tgz|tar\.gz)$", "", key) + ".lst", key + ".lst")
    else:
        return None, None
    for k in tries:
        try:
            body = lake.s3.get_object(Bucket=lake.BUCKET, Key=k)["Body"].read().decode("latin-1")
        except Exception:  # noqa: BLE001
            continue
        return k, [int(m.group(1)) for m in re.finditer(r"(?m)^\s*\d+\)\s+(\d+)\s", body)]
    return None, None


def sublibrary_check(manifest, mine, ref):
    """Brief 43: these libraries have no nsr-count reference. Each sublibrary's .lst is the reference (one line per
    material); without one (NEA's JEFF-3.3 archives) it is the files in the archive with an MF1/451 section."""
    rows, _ = lake.rows(f"SELECT sublibrary, array_join(array_agg(CAST(mat AS varchar)), ',') FROM endfb_materials "
                        f"WHERE release = '{RELEASE}' GROUP BY sublibrary")
    got = {r[0]: [int(x) for x in r[1].split(",")] for r in rows}
    by_sub, explained = {}, []
    for a in manifest["source"]["archives"]:
        w = a["sublibrary"]
        have = got.get(w, [])
        lk, lst = lst_mats(a["key"])
        if lst is not None:
            r = {"reference": len(lst), "reference_source": lk, "parsed": len(have)}
            miss, extra = sorted(set(lst) - set(have)), sorted(set(have) - set(lst))
            if miss or extra or len(lst) != len(have):
                explained.append(f"{w}: the .lst lists {len(lst):,} materials, the tables hold {len(have):,}. In the .lst "
                                 f"only: {', '.join(map(str, miss[:30])) or 'none'}; in the tables only: "
                                 f"{', '.join(map(str, extra[:30])) or 'none'}.")
        else:
            n451 = manifest["parsed"]["mf1_451_materials_by_sublibrary"].get(w, 0)
            dup = len(a["duplicates_skipped"])
            r = {"reference": n451 + dup, "reference_source": "files in the archive with an MF1/451 section",
                 "parsed": len(have), "duplicates_skipped": dup}
            if dup:
                explained.append(f"{w}: {dup} files in {a['key'].rsplit('/', 1)[-1]} repeat another file's name and size "
                                 f"under a second folder and were skipped, e.g. {a['duplicates_skipped'][0]['file']}.")
            if n451 != len(have):
                explained.append(f"{w}: {n451:,} files with an MF1/451 section, {len(have):,} materials in the tables; the "
                                 f"rest hold MF1/451 and nothing else (records only, listed under parsed.records_only_files).")
        by_sub[w] = r
    total = ref.get("materials", sum(r["reference"] for r in by_sub.values()))
    return {
        "reference": {"materials": total, "source": "the sublibraries' .lst files (IAEA), else files with MF1/451"},
        "reference_by_sublibrary": by_sub,
        "tables": mine, "tables_by_sublibrary": manifest["parsed"]["materials_by_sublibrary"],
        "match_reference": {"materials": mine["materials"] == total},
        "match_by_sublibrary": {w: r["reference"] == r["parsed"] for w, r in by_sub.items()},
        "explained": explained,
    }, 1


def jaea_updates():
    """JENDL-5 files JAEA published after the IAEA tapes, held in the lake and not parsed in brief 43."""
    out, token = [], None
    while True:
        kw = {"Bucket": lake.BUCKET, "Prefix": "raw/jaea/2026-11-07/ftpnd/"}
        if token:
            kw["ContinuationToken"] = token
        page = lake.s3.list_objects_v2(**kw)
        out += [{"key": o["Key"], "bytes": o["Size"]} for o in page.get("Contents", [])
                if re.search(r"jendl5.*\.(tar\.gz|tgz|zip)$", o["Key"], re.I)]
        token = page.get("NextContinuationToken")
        if not token:
            break
    return {"note": "JENDL-5 updates and per-sublibrary archives from JAEA, held in the lake; not parsed (brief 43). "
                    "The tables hold the IAEA tapes of JENDL-5 (August 2023).", "files": out}


# ---------- part B: MF8 (454, 457, 459) and MF33 (brief 43) ----------
FY_MTS = (454, 459)


def wanted(mf, mt):
    if RES_MODE:
        return mt == 151 and mf in (2, 32)
    return mf == 33 or (mf == 8 and mt in (454, 457, 459))


def group_of(mf, mt):
    """The section's table group: fy, decay, cov (--mf=8,33); res, rescov (--mf=2,32)."""
    if RES_MODE:
        return "res" if mf == 2 else "rescov"
    return "fy" if mf == 8 and mt in FY_MTS else "decay" if mf == 8 else "cov"


def as_list(v):
    """endf-parserpy's arrays as lists (a dict keyed by index when an array does not start at 1)."""
    if v is None:
        return []
    if isinstance(v, dict):
        return [v[k] for k in sorted(v)]
    return list(v)


def jdump(v):
    return json.dumps(v, default=str, separators=(",", ":"))


def fy_rows(t, base, d, mt):
    e = as_list(d.get("E"))
    interp = as_list(d.get("I"))  # I[k] for k = 1..LE: the law between E[k-1] and E[k]; E[0]'s field holds LE
    y, dy = ("YI", "DYI") if mt == 454 else ("YC", "DYC")
    zafp, fps, ys, dys = (as_list(d.get(k)) for k in ("ZAFP", "FPS", y, dy))
    n = 0
    for k, energy in enumerate(e):
        za = as_list(zafp[k]) if k < len(zafp) else []
        if not za:
            continue
        law = interp[k - 1] if 0 < k <= len(interp) else None
        t.extend({**base, "mt": mt, "energy_seq": k + 1, "energy_ev": energy, "interpolation": law, "zafp": za,
                  "fps": as_list(fps[k]), "yield": as_list(ys[k]), "yield_unc": as_list(dys[k])}, len(za))
        n += len(za)
    return n


def decay_rows(tables, base, d):
    stable = d.get("NST") == 1
    eb, deb = as_list(d.get("Ebar_x")), as_list(d.get("dEbar_x"))
    g = lambda a, i: a[i] if i < len(a) else None  # noqa: E731
    tables["decay"].add({**base, "za": num(d.get("ZA")), "awr": num(d.get("AWR")), "lis": num(d.get("LIS"), int),
                         "liso": num(d.get("LISO"), int), "half_life_s": None if stable else num(d.get("Thalf")),
                         "half_life_unc": None if stable else num(d.get("dThalf")), "stable": stable,
                         "nsp": num(d.get("NSP"), int), "spin": num(d.get("SPI")), "parity": num(d.get("PAR")),
                         "mean_light_ev": g(eb, 0), "mean_light_unc": g(deb, 0), "mean_em_ev": g(eb, 1),
                         "mean_em_unc": g(deb, 1), "mean_heavy_ev": g(eb, 2), "mean_heavy_unc": g(deb, 2),
                         "nc": num(d.get("NC"), int),
                         "mean_energies": jdump({"Ebar_x": eb, "dEbar_x": deb}) if len(eb) > 3 else None})
    rt = as_list(d.get("RTYP"))
    if rt:
        tables["decay_modes"].extend({**base, "mode_seq": list(range(1, len(rt) + 1)), "rtyp": rt,
                                      "rfs": as_list(d.get("RFS")), "q_ev": as_list(d.get("Q")),
                                      "q_unc": as_list(d.get("dQ")), "br": as_list(d.get("BR")),
                                      "br_unc": as_list(d.get("dBR"))}, len(rt))
    lines = tables["decay_lines"]
    n = 0
    for s_i, s in enumerate(as_list(d.get("spectrum")), 1):
        sb = {**base, "spectrum_seq": s_i, "styp": num(s.get("STYP")), "lcon": num(s.get("LCON"), int),
              "lcov": num(s.get("LCOV"), int), "ner": num(s.get("NER"), int), "fd": num(s.get("FD")),
              "fd_unc": num(s.get("dFD")), "erav_ev": num(s.get("ERAV")), "erav_unc": num(s.get("dERAV")),
              "fc": num(s.get("FC")), "fc_unc": num(s.get("dFC"))}
        start = n
        disc = s.get("discrete") or {}
        for i, e in enumerate(as_list(disc.get("energysec")), 1):
            lines.add({**sb, "continuum": False, "line_seq": i, "er_ev": num(e.get("ER")), "er_unc": num(e.get("dER")),
                       "rtyp": num(e.get("RTYP")), "type": num(e.get("TYPE")), "ri": num(e.get("RI")),
                       "ri_unc": num(e.get("dRI")), "ris": num(e.get("RIS")), "ris_unc": num(e.get("dRIS")),
                       "ricc": num(e.get("RICC")), "ricc_unc": num(e.get("dRICC")), "rick": num(e.get("RICK")),
                       "rick_unc": num(e.get("dRICK")), "ricl": num(e.get("RICL")), "ricl_unc": num(e.get("dRICL"))})
            n += 1
        if disc.get("cov") is not None:  # LCOV 2 or 3: covariance of the discrete intensities
            lines.add({**sb, "continuum": False, "params": jdump({"discrete_covariance": disc["cov"]})})
            n += 1
        cont = s.get("continuous")
        if cont is not None:  # LCON 1 or 2: the TAB1 RP(E) and, for LCOV 1 or 3, its covariance (E, F)
            lines.add({**sb, "continuum": True, "rtyp": num(cont.get("RTYP")), "params": jdump(cont)})
            n += 1
        if n == start:  # a spectrum with no line and no continuum keeps its FD, ERAV and FC
            lines.add({**sb, "continuum": False})
            n += 1
    return n


def cov_rows(t, base, d):
    """MF33 -> long rows. LB=5: E bins on both axes (LS=1 keeps the upper triangle as stored); LB=6: ER rows by EC
    columns; LB=0-4, 8, 9: (E, F) pairs, LB=3/4's second array as pair_set 2; NC sub-subsections as JSON."""
    mtl = num(d.get("MTL"), int)
    n = 0
    if mtl:  # MT is part of the lumped reaction MTL; no subsections
        t.add({**base, "mtl": mtl, "block": "lumped"})
        return 1
    for sub in as_list(d.get("subsection")):
        sb = {**base, "mtl": mtl, "mat1": num(sub.get("MAT1"), int), "mt1": num(sub.get("MT1"), int),
              "xmf1": num(sub.get("XMF1")), "xlfs1": num(sub.get("XLFS1"))}
        for m, nc in enumerate(as_list(sub.get("nc_subsection")), 1):
            t.add({**sb, "block": "NC", "ni_index": m, "params": jdump(nc)})
            n += 1
        for m, ni in enumerate(as_list(sub.get("ni_subsection")), 1):
            lb = num(ni.get("LB"), int)
            nb = {**sb, "block": "NI", "ni_index": m, "lb": lb, "lt": num(ni.get("LT"), int), "ls": num(ni.get("LS"), int)}
            if lb == 5:
                e, f, ls = as_list(ni.get("E")), as_list(ni.get("F")), ni.get("LS")
                rr, rh, cc, ch, vv = [], [], [], [], []
                for k, row in enumerate(f):
                    row = as_list(row)
                    c0, w = (k if ls == 1 else 0), len(row)
                    rr += [e[k]] * w
                    rh += [e[k + 1]] * w
                    cc += e[c0:c0 + w]
                    ch += e[c0 + 1:c0 + w + 1]
                    vv += row
                t.extend({**nb, "pair_set": 1, "row_energy_ev": rr, "row_energy_hi_ev": rh, "col_energy_ev": cc,
                          "col_energy_hi_ev": ch, "value": vv}, len(vv))
                n += len(vv)
            elif lb == 6:
                er, ec, f = as_list(ni.get("ER")), as_list(ni.get("EC")), as_list(ni.get("F"))
                rr, rh, cc, ch, vv = [], [], [], [], []
                for k, row in enumerate(f):
                    row = as_list(row)
                    w = len(row)
                    rr += [er[k]] * w
                    rh += [er[k + 1]] * w
                    cc += ec[:w]
                    ch += ec[1:w + 1]
                    vv += row
                t.extend({**nb, "pair_set": 1, "row_energy_ev": rr, "row_energy_hi_ev": rh, "col_energy_ev": cc,
                          "col_energy_hi_ev": ch, "value": vv}, len(vv))
                n += len(vv)
            else:  # LB 0-4 (Ek, Fk and El, Fl), 8 and 9 (E, F)
                for ps, (ek, fk) in enumerate((("Ek", "Fk"), ("El", "Fl")) if lb is not None and lb <= 4 else
                                              (("E", "F"),), 1):
                    es, fs = as_list(ni.get(ek)), as_list(ni.get(fk))
                    if es:
                        t.extend({**nb, "pair_set": ps, "row_energy_ev": es, "value": fs}, len(es))
                        n += len(es)
    return n


# ---------- part C: MF2 and MF32, MT151 (brief 56) ----------
# ENDF-102 chapters 2 and 32; ENDF-367 (SAMMY's guide, raw/manual/2026-11-10/ENDF-367.pdf) for the compact LCOMP=2 form.
RES_SCHEMAS = {
    "res_ranges": pa.schema([
        ("release", S), ("sublibrary", S), ("file_name", S), ("mat", I), ("za", D), ("awr", D), ("nis", I),
        ("isotope_index", I), ("zai", D), ("abn", D), ("lfw", I), ("ner", I), ("range_index", I), ("isotope_range", I),
        ("el_ev", D), ("eh_ev", D), ("lru", I), ("lrf", I), ("nro", I), ("naps", I), ("spi", D), ("ap", D), ("lad", I),
        ("nls", I), ("nlsc", I), ("lssf", I), ("ifg", I), ("krm", I), ("krl", I), ("npp", I), ("njs", I),
        ("scattering_radius_only", B), ("n_resonances", I), ("ap_table", S), ("params", S)]),
    "res_params": pa.schema([
        ("release", S), ("sublibrary", S), ("file_name", S), ("mat", I), ("isotope_index", I), ("range_index", I),
        ("lru", I), ("lrf", I), ("unresolved", B), ("group_index", I), ("res_index", I), ("l", I), ("j", D),
        ("er_ev", D), ("gt_ev", D), ("gn_ev", D), ("gg_ev", D), ("gf_ev", D), ("gfa_ev", D), ("gfb_ev", D),
        ("gx_ev", D), ("widths", S), ("es_ev", D), ("d_ev", D), ("amun", D), ("amux", D), ("amug", D), ("amuf", D),
        ("gn0_ev", D), ("params", S)]),
    "res_cov": pa.schema([
        ("release", S), ("sublibrary", S), ("file_name", S), ("mat", I), ("isotope_index", I), ("zai", D),
        ("range_index", I), ("el_ev", D), ("eh_ev", D), ("lru", I), ("lrf", I), ("lcomp", I), ("isr", I), ("dap", D),
        ("block", S), ("block_index", I), ("lb", I), ("row_param", I), ("col_param", I), ("row_name", S),
        ("col_name", S), ("l", I), ("j", D), ("row_er_ev", D), ("col_er_ev", D), ("row_value", D),
        ("row_energy_ev", D), ("col_energy_ev", D), ("value", D), ("ndigit", I), ("params", S)]),
}
# Range fields that have their own column (or become rows); everything else endf-parserpy returns goes into params.
RANGE_COLS = {"EL", "EH", "LRU", "LRF", "NRO", "NAPS", "SPI", "AP", "LAD", "NLS", "NLSC", "LSSF", "IFG", "KRM", "KRL",
              "NPP", "NJS", "AP_table", "l_group", "j_group"}
CHUNK = 50_000  # rows per extend for the covariance matrices, so a dense 10,000-parameter block never sits in memory whole


def squeeze(line):
    """A data line with every 11-column field rewritten by field() (2.00000+ 3 -> 2.00000E+03, 0.     + 0 -> 0.00000E+00),
    columns 67-80 untouched. For the pre-ENDF-6 tapes (B-II, B-III) whose floats endf-parserpy refuses."""
    d = line[:66].ljust(66)
    return "".join(field(f) for f in (d[i:i + 11] for i in range(0, 66, 11))) + line[66:]


IMPLICIT = re.compile(r"([+-]?(?:\d+\.?\d*|\.\d+))([+-]\d+)")


def field(f):
    """One 11-column field for squeeze(): blank stays blank; a float with an implicit exponent (2.00000+ 3, 0.     + 0)
    is rewritten in E notation; anything else loses its inner spaces."""
    t = f.replace(" ", "")
    if not t:
        return " " * 11
    m = IMPLICIT.fullmatch(t)
    if m:
        v = float(f"{m.group(1)}e{m.group(2)}")
        t = f"{v:.5E}" if v >= 0 else f"{v:.4E}"
    return t.rjust(11)


def fit(v, k):
    """A column of exactly k values: a list padded with None or cut, a scalar repeated."""
    if not isinstance(v, (list, tuple, dict)):
        return [v] * k
    v = as_list(v)
    return v[:k] + [None] * (k - len(v)) if len(v) != k else v


def at(a, i):
    a = as_list(a)
    return a[i] if 0 <= i < len(a) else None


def extend(t, cols, k):
    if k:
        t.extend({c: (fit(v, k) if isinstance(v, (list, tuple, dict)) else v) for c, v in cols.items()}, k)
    return k


def res_rows(tables, base, d):
    """MF2 MT151 -> one res_ranges row per energy range per isotope and one res_params row per resonance (resolved)
    or per (L, J[, energy]) of the unresolved averages."""
    rng_t, par_t = tables["res_ranges"], tables["res_params"]
    ridx = 0
    for i_i, iso in enumerate(as_list(d.get("isotope")), 1):
        lfw = num(iso.get("LFW"), int)
        for j_i, r in enumerate(as_list(iso.get("range")), 1):
            ridx += 1
            lru, lrf = num(r.get("LRU"), int), num(r.get("LRF"), int)
            pb = {**base, "isotope_index": i_i, "range_index": ridx, "lru": lru, "lrf": lrf}
            extra = {k: v for k, v in r.items() if k not in RANGE_COLS}
            n = 0
            if lru == 1 and lrf in (1, 2, 3):  # SLBW, MLBW, Reich-Moore
                meta = []
                for m_i, lg in enumerate(as_list(r.get("l_group")), 1):
                    meta.append({k: v for k, v in lg.items() if not isinstance(v, (list, dict))})
                    er = as_list(lg.get("ER"))
                    cols = {**pb, "unresolved": False, "group_index": m_i, "res_index": list(range(n + 1, n + len(er) + 1)),
                            "l": num(lg.get("L"), int), "j": lg.get("AJ"), "er_ev": er, "gn_ev": lg.get("GN"),
                            "gg_ev": lg.get("GG")}
                    if lrf == 3:
                        cols.update(gfa_ev=lg.get("GFA"), gfb_ev=lg.get("GFB"))
                    else:
                        cols.update(gt_ev=lg.get("GT"), gf_ev=lg.get("GF"))
                    n += extend(par_t, cols, len(er))
                extra["l_groups"] = meta
            elif lru == 1 and lrf == 4:  # Adler-Adler: one row per (L, J) level, its 12 parameters in params
                for m_i, lg in enumerate(as_list(r.get("l_group")), 1):
                    for jg in as_list(lg.get("j_group")):
                        det = as_list(jg.get("DET"))
                        for k in range(len(det)):
                            n += 1
                            par_t.add({**pb, "unresolved": False, "group_index": m_i, "res_index": n,
                                       "l": num(lg.get("L"), int), "j": num(jg.get("AJ")), "er_ev": num(det[k]),
                                       "params": jdump({f: at(jg.get(f), k) for f in (
                                           "DET", "DWT", "GRT", "GIT", "DEF", "DWF", "GRF", "GIF", "DEC", "DWC", "GRC",
                                           "GIC")})})
            elif lru == 1 and lrf == 7:  # R-matrix limited: every channel's width with its spin group's channels
                groups = []
                for s_i, sg in enumerate(as_list(r.get("j_group")), 1):
                    nch = num(sg.get("NCH"), int) or len(as_list(sg.get("PPI")))
                    ch = [[at(sg.get(f), c) for f in ("PPI", "L", "SCH", "BND", "APE", "APT")] for c in range(nch)]
                    groups.append({**{k: v for k, v in sg.items() if not isinstance(v, (list, dict))}, "channels": ch,
                                   **({"background": sg["background"]} if sg.get("background") else {}),
                                   **({"phase_shift": sg["phase_shift"]} if sg.get("phase_shift") else {})})
                    er, gam = as_list(sg.get("ER")), as_list(sg.get("GAM"))
                    for k in range(len(er)):
                        n += 1
                        par_t.add({**pb, "unresolved": False, "group_index": s_i, "res_index": n, "j": num(sg.get("AJ")),
                                   "er_ev": num(er[k]),
                                   "widths": jdump({"pj": sg.get("PJ"), "gam": [at(g, k) for g in gam],
                                                    "ch": [c[:3] for c in ch]})})
                extra["spin_groups"] = groups
            elif lru == 2:  # unresolved: the energy-dependent averages
                es = as_list(r.get("ES"))
                for p_i, lg in enumerate(as_list(r.get("l_group")), 1):
                    l = num(lg.get("L"), int)
                    if lfw == 0 and lrf == 1:  # case A: one row per J, energy-independent
                        aj = as_list(lg.get("AJ"))
                        n += extend(par_t, {**pb, "unresolved": True, "group_index": p_i, "l": l, "j": aj,
                                            "d_ev": lg.get("D"), "amun": lg.get("AMUN"), "gn0_ev": lg.get("GN0"),
                                            "gg_ev": lg.get("GG")}, len(aj))
                        continue
                    for jg in as_list(lg.get("j_group")):
                        if lrf == 1:  # case B: fission widths at the range's energies ES
                            gf = as_list(jg.get("GF"))
                            n += extend(par_t, {**pb, "unresolved": True, "group_index": p_i, "l": l,
                                                "j": num(jg.get("AJ")), "es_ev": es[:len(gf)], "gf_ev": gf,
                                                "d_ev": num(jg.get("D")), "amun": num(jg.get("AMUN")),
                                                "gn0_ev": num(jg.get("GN0")), "gg_ev": num(jg.get("GG")),
                                                "amuf": num(jg.get("MUF"))}, len(gf))
                        else:  # case C: every average energy-dependent
                            e = as_list(jg.get("ES"))
                            n += extend(par_t, {**pb, "unresolved": True, "group_index": p_i, "l": l,
                                                "j": num(jg.get("AJ")), "es_ev": e, "d_ev": jg.get("D"),
                                                "gx_ev": jg.get("GX"), "gn0_ev": jg.get("GN0"), "gg_ev": jg.get("GG"),
                                                "gf_ev": jg.get("GF"), "amux": num(jg.get("AMUX")),
                                                "amun": num(jg.get("AMUN")), "amug": num(jg.get("AMUG")),
                                                "amuf": num(jg.get("AMUF")),
                                                "params": jdump({"INT": jg.get("INT")})}, len(e))
                extra["l_groups"] = [{k: v for k, v in lg.items() if not isinstance(v, (list, dict))}
                                     for lg in as_list(r.get("l_group"))]
            rng_t.add({**base, "za": num(d.get("ZA")), "awr": num(d.get("AWR")), "nis": num(d.get("NIS"), int),
                       "isotope_index": i_i, "zai": num(iso.get("ZAI")), "abn": num(iso.get("ABN")), "lfw": lfw,
                       "ner": num(iso.get("NER"), int), "range_index": ridx, "isotope_range": j_i,
                       "el_ev": num(r.get("EL")), "eh_ev": num(r.get("EH")), "lru": lru, "lrf": lrf,
                       "nro": num(r.get("NRO"), int), "naps": num(r.get("NAPS"), int), "spi": num(r.get("SPI")),
                       "ap": num(r.get("AP")), "lad": num(r.get("LAD"), int), "nls": num(r.get("NLS"), int),
                       "nlsc": num(r.get("NLSC"), int), "lssf": num(r.get("LSSF"), int), "ifg": num(r.get("IFG"), int),
                       "krm": num(r.get("KRM"), int), "krl": num(r.get("KRL"), int), "npp": num(r.get("NPP"), int),
                       "njs": num(r.get("NJS"), int) if lrf == 7 else None, "scattering_radius_only": lru == 0,
                       "n_resonances": n, "ap_table": jdump(r["AP_table"]) if r.get("AP_table") is not None else None,
                       "params": jdump(extra) if extra else None})


def v_at(V, m, n, size):
    """V[m, n] (1-based, n >= m) of an upper-triangle LIST, whichever way the rows came back: a dict keyed by n, a row
    of all `size` columns, or a row starting at column m."""
    row = at(V, m - 1) if not isinstance(V, dict) else V.get(m)
    if isinstance(row, dict):
        return row.get(n)
    row = as_list(row)
    return at(row, n - 1) if len(row) == size else at(row, n - m)


def mat_rows(t, rb, block, bi, names, ers, vals, ls, js, V, size):
    """An upper-triangle covariance block as rows, CHUNK at a time; returns the count."""
    n = 0
    for m in range(1, size + 1):
        cols = list(range(m, size + 1))
        vv = [v_at(V, m, c, size) for c in cols]
        keep = [i for i, v in enumerate(vv) if v]  # zeros are not stored; the block's size is in its range row
        if not keep:
            continue
        cc = [cols[i] for i in keep]
        n += extend(t, {**rb, "block": block, "block_index": bi, "row_param": m, "col_param": cc,
                        "row_name": names[m - 1], "col_name": [names[c - 1] for c in cc], "l": ls[m - 1],
                        "j": js[m - 1], "row_er_ev": ers[m - 1], "col_er_ev": [ers[c - 1] for c in cc],
                        "row_value": vals[m - 1], "value": [vv[i] for i in keep]}, len(cc))
    return n


def unc_rows(t, rb, names, ers, vals, ls, js, sds, first=1):
    """One row per parameter: its value and its absolute standard deviation."""
    k = len(names)
    return extend(t, {**rb, "block": "unc", "row_param": list(range(first, first + k)), "col_param": list(range(first, first + k)),
                      "row_name": names, "col_name": names, "l": ls, "j": js, "row_er_ev": ers, "row_value": vals,
                      "value": sds}, k)


def sqrt_or_none(v):
    v = num(v)
    return math.sqrt(v) if v is not None and v >= 0 else None


def res_params_of(lrf, lg_or_range, per, mpar=None):
    """(names, ers, vals, ls, js) for the parameters of each resonance in a LIST, in ENDF-102's order: ER, GN, GG, GF
    (GX) for LRF 1 and 2; ER, GN, GG, GFA, GFB for LRF 3; the first `per` of them."""
    fields = ["ER", "GN", "GG", "GFA", "GFB"] if lrf == 3 else ["ER", "GN", "GG", "GF", "GX"]
    fields = fields[:per]
    er = as_list(lg_or_range.get("ER"))
    l, aj = lg_or_range.get("L"), as_list(lg_or_range.get("AJ"))
    names, ers, vals, ls, js = [], [], [], [], []
    for k in range(len(er)):
        for f in fields:
            names.append(f)
            ers.append(num(er[k]))
            vals.append(num(at(lg_or_range.get(f), k)))
            ls.append(num(l, int))
            js.append(num(at(aj, k)))
    return names, ers, vals, ls, js


def rml_params_of(j_groups, ndrop_er=False):
    """LRF 7: per spin group, per resonance: ER, then each channel's width GAM (ENDF-102 32.2.2.a.4, 32.4.1.3)."""
    names, ers, vals, ls, js = [], [], [], [], []
    for sg in j_groups:
        er, gam = as_list(sg.get("ER")), as_list(sg.get("GAM"))
        for k in range(len(er)):
            if not ndrop_er:
                names.append("ER"); ers.append(num(er[k])); vals.append(num(er[k])); ls.append(None); js.append(num(sg.get("AJ")))
            for c, g in enumerate(gam, 1):
                names.append(f"GAM{c}"); ers.append(num(er[k])); vals.append(num(at(g, k))); ls.append(None)
                js.append(num(sg.get("AJ")))
    return names, ers, vals, ls, js


def corr_rows(t, rb, names, ers, ndigit, ii, jj, kij):
    """The compact form's INTG records -> (row I, column J, correlation) for the non-zero K: K>0 maps to
    (K+0.5)*10^-NDIGIT, K<0 to (K-0.5)*10^-NDIGIT (ENDF-367 section 32.3, its FORTRAN), only J < I stored."""
    fac = 10.0 ** -ndigit
    rr, cc, vv = [], [], []
    n = 0
    for I, J, K in zip(as_list(ii), as_list(jj), as_list(kij)):
        I, jp = int(I), int(J) - 1
        for kv in as_list(K):
            jp += 1
            if jp >= I:
                break
            if kv:
                rr.append(I); cc.append(jp); vv.append((kv + 0.5) * fac if kv > 0 else (kv - 0.5) * fac)
        if len(rr) >= CHUNK:
            n += corr_flush(t, rb, names, ers, ndigit, rr, cc, vv)
            rr, cc, vv = [], [], []
    return n + corr_flush(t, rb, names, ers, ndigit, rr, cc, vv)


def corr_flush(t, rb, names, ers, ndigit, rr, cc, vv):
    nm = lambda i: names[i - 1] if 0 < i <= len(names) else None  # noqa: E731
    ev = lambda i: ers[i - 1] if 0 < i <= len(ers) else None  # noqa: E731
    return extend(t, {**rb, "block": "corr", "row_param": rr, "col_param": cc, "row_name": [nm(i) for i in rr],
                      "col_name": [nm(i) for i in cc], "row_er_ev": [ev(i) for i in rr], "col_er_ev": [ev(i) for i in cc],
                      "value": vv, "ndigit": ndigit}, len(rr))


def rescov_rows(t, base, d):
    """MF32 MT151 -> res_cov in long form. Per range: a "range" row (the header fields as JSON); "unc" rows, one per
    parameter, value = its absolute standard deviation (LCOMP 0 and 1 from the variances, 2 from the D fields, the
    unresolved range from its relative covariance); "cov" rows (LCOMP 0 per resonance, LCOMP 1 each short-range block's
    upper triangle, non-zero), "lr" rows (LCOMP 1 long-range: LB and energy pairs), "corr" rows (LCOMP 2: non-zero
    correlations with NDIGIT), "urr" rows (LRU 2 relative covariance), "ap" and "dap" rows (scattering radius)."""
    ridx = 0
    for i_i, iso in enumerate(as_list(d.get("isotope")), 1):
        for r in as_list(iso.get("range")):
            ridx += 1
            lru, lrf, lcomp = num(r.get("LRU"), int), num(r.get("LRF"), int), num(r.get("LCOMP"), int)
            dap = r.get("DAP")
            rb = {**base, "isotope_index": i_i, "zai": num(iso.get("ZAI")), "range_index": ridx,
                  "el_ev": num(r.get("EL")), "eh_ev": num(r.get("EH")), "lru": lru, "lrf": lrf, "lcomp": lcomp,
                  "isr": num(r.get("ISR"), int), "dap": num(dap) if not isinstance(dap, (list, dict)) else None}
            head = {k: v for k, v in r.items() if not isinstance(v, (list, dict))}
            if isinstance(dap, (list, dict)):
                t.add({**rb, "block": "dap", "params": jdump({"DAP": dap})})
            for m, ap in enumerate(as_list(r.get("AP_subsec")), 1):
                t.add({**rb, "block": "ap", "block_index": m, "lb": num(ap.get("LB"), int), "params": jdump(ap)})
            if lru == 1 and lcomp == 0:
                p0 = 0
                for lg in as_list(r.get("l_group")):
                    er, aj = as_list(lg.get("ER")), as_list(lg.get("AJ"))
                    for k in range(len(er)):
                        base_i = p0 * 5
                        p0 += 1
                        idx = {"ER": base_i + 1, "GN": base_i + 2, "GG": base_i + 3, "GF": base_i + 4, "J": base_i + 5}
                        names = ["ER", "GN", "GG", "GF"]
                        unc_rows(t, rb, names, [num(er[k])] * 4, [num(at(lg.get(f), k)) for f in names],
                                 [num(lg.get("L"), int)] * 4, [num(at(aj, k))] * 4,
                                 [sqrt_or_none(at(lg.get(v), k)) for v in ("DE2", "DN2", "DG2", "DF2")], first=base_i + 1)
                        for a, b, f in (("ER", "ER", "DE2"), ("GN", "GN", "DN2"), ("GN", "GG", "DNDG"), ("GG", "GG", "DG2"),
                                        ("GN", "GF", "DNDF"), ("GG", "GF", "DGDF"), ("GF", "GF", "DF2"), ("J", "GN", "DJDN"),
                                        ("J", "GG", "DJDG"), ("J", "GF", "DJDF"), ("J", "J", "DJ2")):
                            v = num(at(lg.get(f), k))
                            if v:
                                t.add({**rb, "block": "cov", "row_param": idx[a], "col_param": idx[b], "row_name": a,
                                       "col_name": b, "l": num(lg.get("L"), int), "j": num(at(aj, k)),
                                       "row_er_ev": num(er[k]), "col_er_ev": num(er[k]), "value": v})
            elif lru == 1 and lcomp == 1 and lrf != 7:
                first = 1
                for p, sr in enumerate(as_list(r.get("sr_subsec")), 1):
                    mpar = num(sr.get("MPAR"), int) or 1
                    if lrf == 4:
                        t.add({**rb, "block": "sr", "block_index": p, "params": jdump(sr)})
                        continue
                    names, ers, vals, ls, js = res_params_of(lrf, sr, mpar)
                    size = len(names)
                    V = sr.get("V")
                    unc_rows(t, rb, names, ers, vals, ls, js,
                             [sqrt_or_none(v_at(V, m, m, size)) for m in range(1, size + 1)], first=first)
                    mat_rows(t, {**rb, "params": jdump({"first_param": first, "mpar": mpar})}, "cov", p, names, ers,
                             vals, ls, js, V, size)
                    first += size
                for p, lr in enumerate(as_list(r.get("lr_subsec")), 1):
                    lb = num(lr.get("LB"), int)
                    pr = jdump({"IDP": lr.get("IDP")})
                    if lb == 5:
                        e = as_list(lr.get("E"))
                        ne = len(e)
                        for k in range(1, ne):
                            for kp in range(k, ne):
                                v = v_at(lr.get("F"), k, kp, ne - 1)
                                if v:
                                    t.add({**rb, "block": "lr", "block_index": p, "lb": lb, "row_energy_ev": num(e[k - 1]),
                                           "col_energy_ev": num(e[kp - 1]), "value": num(v), "params": pr})
                    else:
                        ek = as_list(lr.get("Ek"))
                        extend(t, {**rb, "block": "lr", "block_index": p, "lb": lb, "row_energy_ev": ek,
                                   "value": lr.get("Fk"), "params": pr}, len(ek))
            elif lru == 1 and lcomp == 1 and lrf == 7:
                for p, sr in enumerate(as_list(r.get("sr_subsec")), 1):
                    groups = as_list(sr.get("j_group"))
                    names, ers, vals, ls, js = rml_params_of(groups)
                    size = num(sr.get("NPARB"), int) or len(names)
                    note = None
                    if size != len(names):
                        note = f"NPARB {size} differs from the {len(names)} parameters listed; names are positions"
                        names, ers, vals = [f"P{i}" for i in range(1, size + 1)], [None] * size, [None] * size
                        ls, js = [None] * size, [None] * size
                    V = sr.get("V")
                    unc_rows(t, rb, names, ers, vals, ls, js,
                             [sqrt_or_none(v_at(V, m, m, size)) for m in range(1, size + 1)])
                    mat_rows(t, {**rb, "params": jdump({"note": note}) if note else None}, "cov", p, names, ers, vals,
                             ls, js, V, size)
            elif lru == 1 and lcomp == 2:
                nnn, ndigit = num(r.get("NNN"), int), num(r.get("NDIGIT"), int) or 2
                if lrf == 7:
                    groups = as_list(r.get("j_group"))
                    names, ers, vals, ls, js = rml_params_of(groups)
                    if nnn is not None and nnn != len(names):
                        alt = rml_params_of(groups, ndrop_er=True)
                        if len(alt[0]) == nnn:
                            names, ers, vals, ls, js = alt
                    sds, has_er = [], bool(names) and names[0] == "ER"
                    for sg in groups:  # DER and DGAM in the same order as the parameters
                        der, dgam = as_list(sg.get("DER")), as_list(sg.get("DGAM"))
                        for k in range(len(as_list(sg.get("ER")))):
                            if has_er:
                                sds.append(num(at(der, k)))
                            sds += [num(at(g, k)) for g in dgam]
                    sds = fit(sds, len(names))
                else:
                    nrsa = len(as_list(r.get("ER"))) or 1
                    per = (nnn // nrsa) if nnn else (4 if lrf != 3 else 5)
                    names, ers, vals, ls, js = res_params_of(lrf, r, per)
                    dfields = (["DER", "DGN", "DGG", "DGFA", "DGFB"] if lrf == 3 else ["DER", "DGN", "DGG", "DGF"])[:per]
                    sds = [num(at(r.get(f), k)) for k in range(len(as_list(r.get("ER")))) for f in dfields]
                head["n_params"] = len(names)
                unc_rows(t, {**rb, "ndigit": ndigit}, names, ers, vals, ls, js, sds)
                corr_rows(t, rb, names, ers, ndigit, r.get("II"), r.get("JJ"), r.get("KIJ"))
            elif lru == 2:
                mpar = num(r.get("MPAR"), int) or 1
                fields = ["D", "GN0", "GG", "GF", "GX"][:mpar]
                names, ers, vals, ls, js = [], [], [], [], []
                for lg in as_list(r.get("l_group")):
                    for k in range(len(as_list(lg.get("AJ")))):
                        for f in fields:
                            names.append(f); ers.append(None); vals.append(num(at(lg.get(f), k)))
                            ls.append(num(lg.get("L"), int)); js.append(num(at(lg.get("AJ"), k)))
                size = num(r.get("NPAR"), int) or len(names)
                names, ers, vals, ls, js = (fit(x, size) for x in (names, ers, vals, ls, js))
                RV = r.get("RV")
                rel = [sqrt_or_none(v_at(RV, m, m, size)) for m in range(1, size + 1)]
                unc_rows(t, rb, names, ers, vals, ls, js,
                         [x * abs(v) if x is not None and v is not None else None for x, v in zip(rel, vals)])
                mat_rows(t, rb, "urr", 1, names, ers, vals, ls, js, RV, size)
            t.add({**rb, "block": "range", "params": jdump(head)})


def main_mf():
    """Part B: re-read the release's archives, keep MF8 MT454/457/459 and MF33 sections from the same files and runs of
    lines that endfb_sections holds, parse each with endf-parserpy, write five tables. --mf=2,32 (brief 56) keeps MF2
    and MF32 MT151 the same way and writes res_ranges, res_params and res_cov."""
    t0 = time.time()
    schemas = RES_SCHEMAS if RES_MODE else MF_SCHEMAS
    # Small row groups for the resonance tables, so a route reading one MAT skips the rest by the row groups' MAT range.
    tables = {t: lake.Table(OUT, t, schemas[t], row_group=100_000 if RES_MODE else 500_000) for t in schemas}
    seen = collections.Counter()      # sections met, by table group
    parsed = collections.Counter()    # sections parsed
    rejected = []                     # sections endf-parserpy rejected: file, MAT, MF, MT, error
    normalized = []                   # --mf=2,32: sections parsed only once their fields' inner spaces were squeezed out
    other_mf8 = collections.Counter()  # MF8 sections outside 454/457/459 (radioactive production), counted only
    files = 0

    for path, sub, lines in archive_files():
        if ONLY and ONLY not in path:
            continue
        files += 1
        per_mat = collections.Counter()
        heads = set()
        st = {"holds": False, "pending": []}
        cur, sec, capture, prev_tag = None, [], False, None

        def handle(mat, mf, mt, body, send):
            group = group_of(mf, mt)
            seen[group] += 1
            try:
                d = PARSER.parse([TPID] + body + [send] + tail(mat), include=((mf, mt),))[mf][mt]
            except Exception as e:  # noqa: BLE001
                d = None
                if RES_MODE:  # the old tapes write 2.00000+ 3: squeeze each field's spaces out and try once more
                    try:
                        d = PARSER.parse([TPID] + [squeeze(x) for x in body] + [send] + tail(mat), include=((mf, mt),))[mf][mt]
                        normalized.append({"file": path, "mat": mat, "mf": mf, "mt": mt})
                    except Exception:  # noqa: BLE001
                        d = None
                if d is None:
                    rejected.append({"file": path, "mat": mat, "mf": mf, "mt": mt, "error": f"{type(e).__name__}: {str(e)[:200]}"})
                    return
            base = {"release": RELEASE, "sublibrary": sub, "file_name": path, "mat": mat}
            try:
                if group == "res":
                    res_rows(tables, base, d)
                elif group == "rescov":
                    rescov_rows(tables["res_cov"], base, d)
                elif group == "fy":
                    fy_rows(tables["fy"], base, d, mt)
                elif group == "decay":
                    decay_rows(tables, base, d)
                else:
                    cov_rows(tables["cov"], {**base, "mt": mt}, d)
                parsed[group] += 1
            except Exception as e:  # noqa: BLE001  a shape the row builders do not know
                rejected.append({"file": path, "mat": mat, "mf": mf, "mt": mt, "stage": "rows",
                                 "error": f"{type(e).__name__}: {str(e)[:200]}"})

        def close(terminator):
            mat, mf, mt = cur
            per_mat[mat] += 1
            if mf == 1 and mt == 451:
                heads.add(mat)
            if not st["holds"] and mat in heads and per_mat[mat] > 1:
                st["holds"] = True
                for p in st["pending"]:
                    handle(*p)
                st["pending"].clear()
            if mf == 8 and not RES_MODE and not wanted(mf, mt):
                if st["holds"]:
                    other_mf8[mt] += 1
                return
            if not capture:
                return
            send = terminator if terminator is not None and terminator[72:75].strip() == "0" and len(terminator) >= 75 \
                else f"{0.0:11.4E}{0.0:11.4E}{0:11d}{0:11d}{0:11d}{0:11d}{mat:4d}{mf:2d}{0:3d}{99999:5d}"
            (handle if st["holds"] else lambda *p: st["pending"].append(p))(mat, mf, mt, sec, send[:80])

        for line in lines:
            tag = line[66:75]
            if tag != prev_tag:  # most lines repeat the previous line's MAT, MF, MT: one slice and compare
                prev_tag = tag
                k = None
                if len(tag) == 9:
                    mat, mf, mt = toint(tag[0:4]), toint(tag[4:6]), toint(tag[6:9])
                    if mat and mat > 0 and mf and mf > 0 and mt and mt > 0:
                        k = (mat, mf, mt)
                if k != cur:
                    if cur is not None:
                        close(line)
                    cur, sec = k, []
                    capture = cur is not None and wanted(cur[1], cur[2])
            if capture:
                sec.append(line)
        if cur is not None:
            close(None)
        if files % 500 == 0:
            print(f"{files} files, {time.time() - t0:.0f}s", flush=True)

    stats = {t: tb.close() for t, tb in tables.items()}
    local = {"release": RELEASE, "built_at": lake.now(), "seconds": round(time.time() - t0),
             "source": {"keys": KEYS, "files_read": files, "archives": ARCHIVES},
             "sections_seen": dict(seen), "sections_parsed": dict(parsed), "sections_rejected": len(rejected),
             "rejected": rejected[:500], "mf8_other_mts": dict(sorted(other_mf8.items())),
             **({"normalized": len(normalized), "normalized_sections": normalized[:500]} if RES_MODE else {}),
             "tables": {f"endfb_{t}": {"location": f"s3://{lake.BUCKET}/{PREFIX}/{t}/", "partition": {"release": RELEASE},
                                       **st} for t, st in stats.items()}}
    with open(f"{WORK}/{MF_KEY}.local.json", "w") as f:
        json.dump(local, f, indent=1)
    print(json.dumps({k: local[k] for k in ("sections_seen", "sections_parsed", "sections_rejected", "seconds")}),
          json.dumps({t: s["rows"] for t, s in stats.items()}), flush=True)
    if not UPLOAD or ONLY:
        return
    for t in tables:
        lake.sync(f"{OUT}/{t}", f"{PREFIX}/{t}/")
    print("uploaded", flush=True)


def register_mf():
    """Register endfb_fy, endfb_decay, endfb_decay_modes, endfb_decay_lines and endfb_cov (release partition), count
    each, compare sections with endfb_sections, add mf8_mf33 to lake/endfb/<release>/manifest.json."""
    with open(f"{WORK}/{MF_KEY}.local.json") as f:
        local = json.load(f)
    ddl_dir = f"{HERE}/ddl"
    scanned = queries = 0
    for t, schema in (RES_SCHEMAS if RES_MODE else MF_SCHEMAS).items():
        name = f"endfb_{t}"
        n, s = lake.register(name, schema, f"s3://{lake.BUCKET}/lake/endfb/", ddl_dir, partitions={"release": "string"},
                             partition_locations={(("release", RELEASE),): f"s3://{lake.BUCKET}/{PREFIX}/{t}/"},
                             drop=False, where=f"WHERE release = '{RELEASE}'")
        local["tables"][name]["athena_count"] = n
        scanned += s
        queries += 1
        lake.s3.upload_file(f"{ddl_dir}/{name}.sql", lake.BUCKET, f"lake/_work/parse/endfb/ddl/{name}.sql")
    if RES_MODE:
        (r,), s = lake.rows(f"SELECT count_if(mf = 2 AND mt = 151), count_if(mf = 32 AND mt = 151) "
                            f"FROM endfb_sections WHERE release = '{RELEASE}'")
        in_sections = dict(zip(("res", "rescov"), (int(x) for x in r)))
    else:
        (r,), s = lake.rows(f"SELECT count_if(mf = 8 AND mt IN (454, 459)), count_if(mf = 8 AND mt = 457), "
                            f"count_if(mf = 33) FROM endfb_sections WHERE release = '{RELEASE}'")
        in_sections = dict(zip(("fy", "decay", "cov"), (int(x) for x in r)))
    scanned += s
    queries += 1
    by_group = collections.Counter(group_of(x["mf"], x["mt"]) for x in local["rejected"])
    check = {g: {"endfb_sections": in_sections[g], "sections_seen": local["sections_seen"].get(g, 0),
                 "parsed": local["sections_parsed"].get(g, 0), "rejected": by_group.get(g, 0),
                 "match": in_sections[g] == local["sections_parsed"].get(g, 0)} for g in in_sections}
    explained = []
    for g, c in check.items():
        if c["endfb_sections"] != c["sections_seen"]:
            explained.append(f"{g}: endfb_sections holds {c['endfb_sections']:,} sections, this pass met {c['sections_seen']:,}.")
        if c["rejected"]:
            ex = [x for x in local["rejected"] if group_of(x["mf"], x["mt"]) == g][:5]
            explained.append(f"{g}: endf-parserpy rejected {c['rejected']:,} sections (listed under rejected, each with its "
                             f"file, MAT and MT; their lines are in endfb_records), e.g. "
                             + "; ".join(f"{x['file'].rsplit('/', 1)[-1]} MAT {x['mat']} MT {x['mt']}: "
                                         f"{x['error'].split(':', 1)[0]}" for x in ex) + ".")
    if RES_MODE:
        (r,), s = lake.rows(f"SELECT count(DISTINCT file_name || '/' || CAST(mat AS varchar)) FROM endfb_res_ranges "
                            f"WHERE release = '{RELEASE}'")
        scanned += s
        queries += 1
        tables_check = {"materials in res_ranges = MF2 sections parsed": int(r[0]) == check["res"]["parsed"]}
    else:
        tables_check = {"decay rows = MT457 sections parsed":
                        local["tables"]["endfb_decay"]["athena_count"] == check["decay"]["parsed"]}
    local["counts_check"] = {"tables_vs_sections": check, "tables": tables_check, "explained": explained}
    local["spend"] = {"athena_queries": queries, "athena_bytes_scanned": scanned,
                      "athena_usd": round(max(scanned, queries * 10_485_760) / 1e12 * 5, 4), "box": BOX}
    key = f"{PREFIX}/manifest.json"
    try:
        manifest = json.loads(lake.s3.get_object(Bucket=lake.BUCKET, Key=key)["Body"].read())
    except Exception:  # noqa: BLE001
        manifest = {"dataset": "endfb", "release": RELEASE}
    manifest[MF_KEY] = local
    lake.put_json(key, manifest)
    print(json.dumps(local["counts_check"], indent=1), flush=True)


if __name__ == "__main__":
    if MF_MODE:
        if "--register-only" not in sys.argv:
            main_mf()
        if UPLOAD and not ONLY:
            register_mf()
    else:
        if "--register-only" not in sys.argv:
            main()
        if UPLOAD and not ONLY:
            register()
