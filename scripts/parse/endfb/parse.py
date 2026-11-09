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
MF1/451, MF3, MF8 and MF33 are parsed with endf-parserpy 0.18.0 (IAEA; held at raw/pypi/2026-11-07/endf-parserpy/). An
MF1/451 or MF3 section it rejects is read by the fixed-column reader below; an MF8 or MF33 section it rejects is listed
in the manifest with its MAT and MT. Either way it is counted.
"""
import collections
import io
import json
import logging
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
MF_MODE = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--mf=")), None)  # "8,33": part B tables only
WORK = f"/data/endfb/{RELEASE}"
OUT = f"{WORK}/mf/out" if MF_MODE else f"{WORK}/out"
PREFIX = f"lake/endfb/{RELEASE}"
HERE = os.path.dirname(os.path.abspath(__file__))
BOX = "nsr-parse-2, m7i-flex.large, about $0.096 an hour on-demand (Free plan credits); 400 GB gp3, about $0.044 an hour"

# A sublibrary archive's token (IAEA <lib>_<token>.sublib.zip, NEA JEFF33-<token>.tgz) -> ENDF/B's folder word.
NSUB_WORDS = {"n": "neutrons", "tsl": "thermal_scatt", "decay": "decay", "nfpy": "nfy", "sfpy": "sfy", "g": "gammas",
              "p": "protons", "d": "deuterons", "t": "tritons", "he3": "helium3s", "he4": "alphas", "a": "alphas",
              "photo": "photoat", "e": "electrons", "ard": "atomic_relax"}


def sub_word(key):
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
    elif n.endswith((".tgz", ".tar.gz")):
        with tarfile.open(fileobj=f, mode="r:gz") as t:  # the local file: members read in order, each seekable
            for m in t:
                if m.isfile() and not m.name.lower().endswith(SKIP_EXT):
                    yield m.name, m.size, lines_of(t.extractfile(m))


ARCHIVES = []  # per archive: key, bytes, sublibrary, files read, duplicates skipped


def archive_files():
    """(file_name, sublibrary, lines) for every ENDF file in every archive of the release, in the order given."""
    for key in KEYS:
        arch = key.rsplit("/", 1)[-1]
        src = lake.download(key, f"{WORK}/src/{arch}")
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
    try:  # keep part B's section when part A is rerun
        old = json.loads(lake.s3.get_object(Bucket=lake.BUCKET, Key=f"{PREFIX}/manifest.json")["Body"].read())
        if "mf8_mf33" in old:
            manifest["mf8_mf33"] = old["mf8_mf33"]
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
    one folder up (JEFF-3.3). (key, [MAT, ...]) or (None, None)."""
    if not key.endswith(".sublib.zip"):
        return None, None
    lst = key[:-4] + ".lst"
    head, _, name = lst.rpartition("/")
    for k in (lst, f"{head.rpartition('/')[0]}/{name}"):
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
    return mf == 33 or (mf == 8 and mt in (454, 457, 459))


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


def main_mf():
    """Part B: re-read the release's archives, keep MF8 MT454/457/459 and MF33 sections from the same files and runs of
    lines that endfb_sections holds, parse each with endf-parserpy, write five tables."""
    t0 = time.time()
    tables = {t: lake.Table(OUT, t, MF_SCHEMAS[t]) for t in MF_SCHEMAS}
    seen = collections.Counter()      # sections met, by table group
    parsed = collections.Counter()    # sections parsed
    rejected = []                     # sections endf-parserpy rejected: file, MAT, MF, MT, error
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
            group = "fy" if mf == 8 and mt in FY_MTS else "decay" if mf == 8 else "cov"
            seen[group] += 1
            try:
                d = PARSER.parse([TPID] + body + [send] + tail(mat), include=((mf, mt),))[mf][mt]
            except Exception as e:  # noqa: BLE001
                rejected.append({"file": path, "mat": mat, "mf": mf, "mt": mt, "error": f"{type(e).__name__}: {str(e)[:200]}"})
                return
            base = {"release": RELEASE, "sublibrary": sub, "file_name": path, "mat": mat}
            try:
                if group == "fy":
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
            if mf == 8 and not wanted(mf, mt):
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
             "tables": {f"endfb_{t}": {"location": f"s3://{lake.BUCKET}/{PREFIX}/{t}/", "partition": {"release": RELEASE},
                                       **st} for t, st in stats.items()}}
    with open(f"{WORK}/mf8_mf33.local.json", "w") as f:
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
    with open(f"{WORK}/mf8_mf33.local.json") as f:
        local = json.load(f)
    ddl_dir = f"{HERE}/ddl"
    scanned = queries = 0
    for t, schema in MF_SCHEMAS.items():
        name = f"endfb_{t}"
        n, s = lake.register(name, schema, f"s3://{lake.BUCKET}/lake/endfb/", ddl_dir, partitions={"release": "string"},
                             partition_locations={(("release", RELEASE),): f"s3://{lake.BUCKET}/{PREFIX}/{t}/"},
                             drop=False, where=f"WHERE release = '{RELEASE}'")
        local["tables"][name]["athena_count"] = n
        scanned += s
        queries += 1
        lake.s3.upload_file(f"{ddl_dir}/{name}.sql", lake.BUCKET, f"lake/_work/parse/endfb/ddl/{name}.sql")
    (r,), s = lake.rows(f"SELECT count_if(mf = 8 AND mt IN (454, 459)), count_if(mf = 8 AND mt = 457), "
                        f"count_if(mf = 33) FROM endfb_sections WHERE release = '{RELEASE}'")
    scanned += s
    queries += 1
    in_sections = dict(zip(("fy", "decay", "cov"), (int(x) for x in r)))
    by_group = collections.Counter(("fy" if x["mf"] == 8 and x["mt"] in FY_MTS else "decay" if x["mf"] == 8 else "cov")
                                   for x in local["rejected"])
    check = {g: {"endfb_sections": in_sections[g], "sections_seen": local["sections_seen"].get(g, 0),
                 "parsed": local["sections_parsed"].get(g, 0), "rejected": by_group.get(g, 0),
                 "match": in_sections[g] == local["sections_parsed"].get(g, 0)} for g in in_sections}
    explained = []
    for g, c in check.items():
        if c["endfb_sections"] != c["sections_seen"]:
            explained.append(f"{g}: endfb_sections holds {c['endfb_sections']:,} sections, this pass met {c['sections_seen']:,}.")
        if c["rejected"]:
            ex = [x for x in local["rejected"] if ("fy" if x["mf"] == 8 and x["mt"] in FY_MTS else
                                                   "decay" if x["mf"] == 8 else "cov") == g][:5]
            explained.append(f"{g}: endf-parserpy rejected {c['rejected']:,} sections (listed under rejected, each with its "
                             f"file, MAT and MT; their lines are in endfb_records), e.g. "
                             + "; ".join(f"{x['file'].rsplit('/', 1)[-1]} MAT {x['mat']} MT {x['mt']}: "
                                         f"{x['error'].split(':', 1)[0]}" for x in ex) + ".")
    local["counts_check"] = {"tables_vs_sections": check,
                             "tables": {"decay rows = MT457 sections parsed":
                                        local["tables"]["endfb_decay"]["athena_count"] == check["decay"]["parsed"]},
                             "explained": explained}
    local["spend"] = {"athena_queries": queries, "athena_bytes_scanned": scanned,
                      "athena_usd": round(max(scanned, queries * 10_485_760) / 1e12 * 5, 4), "box": BOX}
    key = f"{PREFIX}/manifest.json"
    try:
        manifest = json.loads(lake.s3.get_object(Bucket=lake.BUCKET, Key=key)["Body"].read())
    except Exception:  # noqa: BLE001
        manifest = {"dataset": "endfb", "release": RELEASE}
    manifest["mf8_mf33"] = local
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
