"""ENDF/B release (ENDF-6 text, every sublibrary) -> Parquet tables in the lake, registered in Athena (brief 15).

  /opt/parse/bin/python parse.py <release, e.g. B-VIII.1> <s3 key of the archive> [--no-upload] [--register-only]

Files are read through services/nsr-count's own endf_lines() (nested archives opened, PDFs and web files skipped,
latin-1, the same line split), and the sublibrary is the file's folder as nsr-count names it, so material, section and
point counts compare one to one. All tables are partitioned by release; each release's files sit at
lake/endfb/<release>/<table>/ and are added as an explicit partition.
  materials  one row per file + MAT with an MF1/MT451 section: header fields, dates, authors, description text
  sections   one row per section (a run of lines with one MAT, MF, MT); MF3 rows also carry ZA, AWR, QM, QI, LR, NR, NP
  xs_points  every (E, xs) pair of every MF3 section, with its interpolation region and law
  records    every line of every file, MAT, MF and MT read from columns 67-75 (null where a line has none)
MF1/451 and MF3 are parsed with endf-parserpy 0.18.0 (IAEA; held at raw/pypi/2026-11-07/endf-parserpy/). A section it
rejects is read by the fixed-column reader below and counted in the manifest.
"""
import collections
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "box"))
import lake  # noqa: E402
import nsr_count  # noqa: E402
from lake import S, D, I  # noqa: E402
import pyarrow as pa  # noqa: E402
import endf_parserpy  # noqa: E402
from endf_parserpy import EndfParserPy  # noqa: E402

RELEASE, KEY = sys.argv[1], sys.argv[2]
UPLOAD = "--no-upload" not in sys.argv
ONLY = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")), None)  # test on one file path substring
WORK = f"/data/endfb/{RELEASE}"
OUT = f"{WORK}/out"
PREFIX = f"lake/endfb/{RELEASE}"
HERE = os.path.dirname(os.path.abspath(__file__))

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


def main():
    t0 = time.time()
    src = lake.download(KEY, f"{WORK}/src/{KEY.rsplit('/', 1)[-1]}")
    tables = {t: lake.Table(OUT, t, SCHEMAS[t], row_group=1_000_000 if t == "records" else 500_000)
              for t in SCHEMAS}
    files = 0
    mats_by_folder = collections.Counter()
    mf3_sections = mf3_points = 0
    nsr_points = 0  # NP read nsr-count's way (TAB1 header columns 56-66), to explain any difference
    mf3_differences = []  # files where nsr-count's MF3 tally (runs of lines reading MF=3) differs from the sections here
    records_only = []  # files kept in records only: no MF1/451 section, or MF1/451 and nothing else (header files)
    for path, lines in nsr_count.endf_lines(KEY.rsplit("/", 1)[-1], source_for(KEY, src)):
        if ONLY and ONLY not in path:
            continue
        files += 1
        sub = path.rsplit("/", 2)[-2] if path.count("/") >= 1 else "(root)"
        per_mat = collections.defaultdict(lambda: [0, 0])  # mat -> [sections, lines]
        heads = {}  # mat -> (data, parser) for the first MF1/451 in this file
        cur, sec, first = None, [], 0
        rec = tables["records"]
        prev_n, n_mf3 = None, 0
        f_sections, f_points = [], []  # this file's rows, kept only if the file holds a material
        f = {"mf3": 0, "points": 0, "nsr_points": 0}

        def close(terminator):
            mat, mf, mt = cur
            per_mat[mat][0] += 1
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
                    f_points.append((RELEASE, sub, path, mat, mt, p, e, x, region + 1, law[region]))
                f["points"] += len(d["E"])
            f_sections.append(row)

        n_lines = 0
        for i, line in enumerate(lines, 1):
            mat = mf = mt = None
            if len(line) >= 75:
                mat, mf, mt = toint(line[66:70]), toint(line[70:72]), toint(line[72:75])
            rec.append((RELEASE, sub, path, i, mat, mf, mt, line))
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
        holds = any(per_mat[m][0] > 1 for m in heads)
        if n_mf3 != (f["mf3"] if holds else 0):
            mf3_differences.append({"file": path, "nsr_count_way": n_mf3, "sections": f["mf3"] if holds else 0})
        if not holds:
            if heads or f_sections:
                records_only.append({"file": path, "reason": "header only (MF1/451 and nothing else)" if heads
                                     else "no MF1/451 section", "mats_with_mf1_451": sorted(heads),
                                     "line_runs_read_as_sections": len(f_sections), "mf3_points": f["points"]})
            continue
        for row in f_sections:
            tables["sections"].add(row)
        xs = tables["xs_points"]
        for row in f_points:
            xs.append(row)
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
        "source": {"key": KEY, "bytes": os.path.getsize(src), "files_read": files},
        "parser": {"script": "scripts/parse/endfb/parse.py", "endf_parserpy": endf_parserpy.__version__
                   if hasattr(endf_parserpy, "__version__") else "0.18.0", "used_for": "MF1/MT451 and MF3 sections",
                   "fallback_sections": dict(fallbacks), "fallback_examples": fallback_examples,
                   "file_reader": "services/nsr-count endf_lines() (scripts/parse/box/nsr_count.py)",
                   "pyarrow": pa.__version__},
        "parsed": {"materials": sum(mats_by_folder.values()), "materials_by_sublibrary": dict(mats_by_folder.most_common()),
                   "mf3_cross_sections": mf3_sections, "mf3_points": mf3_points,
                   "mf3_points_by_tab1_header": nsr_points, "records_only_files": records_only,
                   "mf3_tally_differences": mf3_differences},
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
    rerun = nsr_count.endf(KEY, RELEASE)
    ref = dict(REFERENCE.get(RELEASE, {}))
    mine = {"materials": tb["endfb_materials"]["athena_count"], "mf3_cross_sections": int(secs),
            "mf3_points": tb["endfb_xs_points"]["athena_count"]}
    manifest["counts_check"] = {
        "reference": ref,
        "nsr_count_rerun": {k: rerun[k] for k in ("materials", "mf3_cross_sections", "mf3_points", "files")},
        "nsr_count_rerun_by_sublibrary": rerun["materials_by_folder"],
        "tables": mine, "tables_by_sublibrary": manifest["parsed"]["materials_by_sublibrary"],
        "match_reference": {k: (mine[k] == ref[k]) if k in ref else None for k in mine},
        "match_rerun": {k: mine[k] == rerun[k] for k in mine},
        "match_rerun_by_sublibrary": manifest["parsed"]["materials_by_sublibrary"] == rerun["materials_by_folder"],
        "explained": explain(manifest["parsed"], mine, rerun, ref),
    }
    manifest["spend"] = {"athena_queries": queries, "athena_bytes_scanned": scanned,
                         "athena_usd": round(max(scanned, queries * 10_485_760) / 1e12 * 5, 4),
                         "box": "nsr-parse-1, m7i-flex.large (Free Tier hours); 100 GB gp3 of which 70 GB over the free "
                                "30 GB, about $0.008 an hour, shared across brief 15's datasets"}
    lake.put_json(f"{PREFIX}/manifest.json", manifest)
    print(json.dumps(manifest["counts_check"], indent=1), flush=True)


if __name__ == "__main__":
    if "--register-only" not in sys.argv:
        main()
    if UPLOAD and not ONLY:
        register()
