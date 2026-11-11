"""CINDA (brief 65, Part A): the held CINDA backup to Parquet. Runs on the parse box only (/opt/parse/bin/python).

  /opt/parse/bin/python parse.py [--snapshot 2024-04-26]

Input: raw/iaea/2026-11-07/exfor-master/cinda/000-cinda-main/import-<snapshot>/CINDA-<snapshot>.zip, the full CINDA
database as five area files (cinda1..4.c2k, cinda9.c2k) with a listing each (cinda<n>.c2k.lst: per-target block and
line counts; its first line carries the file's own line and block totals).

The format (fixed columns, 0-based [start:end), read from the data: the held archive has no format manual; its
"manual-*" folders are the hand-entered part of CINDA, per 000-cinda-main/readme.txt):
  ##---Block#<id> Targ=… Reac=… Quan=<new>:<old> …     opens a block; the data lines follow, blank lines between blocks
  [0:4] Z  [4:7] A (or a material code: WTR, D2O, BNZ…)  [8:23] reaction  [23:26] quantity (EXFOR dictionary 45 code)
  [27] area  [27:34] laboratory (EXFOR dictionary 3 code, area digit first)  [34:39] serial (the EXFOR entry on lines
  imported from EXFOR)  [40:43] line number in the block  [43] a one-digit code (6 on data-file lines: EXFOR or an
  evaluated library; not defined in the held files)  [44] work type  [45:47] reader code (X4 = imported from EXFOR,
  N4 = from NSR)  [47:54] energy min  [54:61] energy max (eV, "8.82+07" or "9.53e5"; or a word: NDG, Cold, Spon, Maxw…)
  [61] reference type (J journal, R report, C conference, P progress report, A abstract, B book, T thesis, S, W,
  4 = EXFOR file, 3 = evaluated library)  [63:84] reference (code,volume,page)  [84:90] publication date YYYYMM
  [90:126] first author and comment  [128:136] date entered YYYYMMDD  [136:139] old CINDA quantity  [139:] extensions
  (;#REAC=…;#PROD=…;#NSR=<key>;#LAB=…)
Work-type letters are not defined in the held files either: E, T, D, R and C are read as expt, theo, eval, revw and
comp (D is the type of the evaluated-library lines, quantity EVL); M is kept as coded.

Output (lake/cinda/<snapshot>/): lines/ (nsr.cinda_lines, sorted by target_za, block_id, line_no in row groups of
10,000 so a target reads only its row groups), dict_quantities/, dict_labs/, dict_types/ (nsr.cinda_dict_*),
manifest.json. Checks: each file's lines and blocks against its own header and listing; every nsr_key against
nsr.nsr_parquet, every exfor_entry against nsr.exfor_j4_entries."""
import argparse
import collections
import glob
import json
import os
import re
import subprocess
import sys
import time
import zipfile

import boto3
import pyarrow as pa
import pyarrow.dataset as ds
import pyarrow.fs as pafs
import pyarrow.parquet as pq

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lake  # noqa: E402

RAW = "raw/iaea/2026-11-07/exfor-master/cinda/000-cinda-main"
WORK = "/data/cinda"
DDL = "/opt/parse/ddl"
S, D, I, L, B = lake.S, lake.D, lake.I, lake.L, lake.B

ELEMENTS = ("NN H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb "
            "Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta "
            "W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt "
            "Ds Rg Cn Nh Fl Mc Lv Ts Og").split()
WORK_TYPES = {"E": "expt", "T": "theo", "D": "eval", "R": "revw", "C": "comp", "M": "M"}
ORIGIN = {"X4": "exfor", "N4": "nsr"}

LINES = pa.schema([
    ("block_id", L), ("line_no", I), ("area", I), ("target_z", I), ("target_a", S), ("target_za", I), ("target", S),
    ("target_full", S), ("reaction", S), ("quantity", S), ("quantity_word", S), ("old_quantity", S),
    ("e_min_ev", D), ("e_max_ev", D), ("energy_text", S), ("lab", S), ("lab_name", S), ("work_type", S),
    ("work_type_code", S), ("reader", S), ("origin", S), ("doc_code", S), ("serial", S), ("ref_type", S),
    ("ref_code", S), ("ref_volume", S), ("ref_page", S), ("reference_text", S), ("year", I), ("pub_date", S),
    ("author", S), ("comment", S), ("nsr_key", S), ("nsr_resolved", B), ("exfor_entry", S), ("exfor_subentry", S),
    ("exfor_resolved", B), ("ext_reaction", S), ("ext_product", S), ("ext_lab", S), ("date_entered", S),
    ("source_file", S)])
DICT_Q = pa.schema([("code", S), ("word", S), ("web_quantity", S), ("lines", L)])
DICT_LAB = pa.schema([("code", S), ("name", S), ("country", S), ("lines", L)])
DICT_T = pa.schema([("code", S), ("word", S), ("lines", L)])

NAME = re.compile(r"[A-Z][A-Za-z'`\- ]*[a-z][A-Za-z'`\-]*")
NUM = re.compile(r"^([+-]?(?:\d+\.?\d*|\.\d+))([+-]\d+)$")


def energy(s):
    """'8.82+07' -> 8.82e7, '9.53e5' -> 9.53e5, '-.8-01' -> -0.08; a word (NDG, Cold…) -> (None, word)."""
    s = s.strip()
    if not s:
        return None, ""
    m = NUM.match(s)
    try:
        if m:
            return float(f"{m.group(1)}e{m.group(2)}"), ""
        return float(s), ""
    except ValueError:
        return None, s


def author_comment(c):
    """'Brown+ NDG.' -> ('Brown', 'NDG.'); 'De Carvalho.' -> ('De Carvalho', ''); 'Kachan+ R:25MG(P,G)' -> ('Kachan',
    'R:25MG(P,G)'); '.190pt' -> ('', '190pt'). The author ends at the first + (et al.) or full stop; a "name" has a capital,
    a small letter and no digits; anything else is all comment."""
    c = c.strip()
    m = re.match(r"^([^+.]{1,26}?)([+.])(.*)$", c)
    if m and NAME.fullmatch(m.group(1).strip()):
        rest = m.group(3).lstrip(".") if m.group(2) == "+" else m.group(3)
        return m.group(1).strip(), rest.strip()
    m = re.match(r"^(.{1,26}?) R:(.*)$", c)
    if m and NAME.fullmatch(m.group(1).strip()):
        return m.group(1).strip(), ("R:" + m.group(2)).strip()
    if NAME.fullmatch(c):
        return c, ""
    return "", c.lstrip(".").strip()


def symbol(z, a):
    el = ELEMENTS[z] if 0 <= z < len(ELEMENTS) else str(z)
    return f"{el}-{a}", f"{z}-{el.upper()}-{a}"


def key_set(table, column):
    """Every value of one column of a Glue table, read from its Parquet with the box's role."""
    loc = boto3.client("glue", region_name=lake.REGION).get_table(DatabaseName="nsr", Name=table)["Table"][
        "StorageDescriptor"]["Location"]
    path = loc.replace("s3://", "").rstrip("/")
    d = ds.dataset(path, filesystem=pafs.S3FileSystem(region=lake.REGION), format="parquet")
    return {v for v in d.to_table(columns=[column]).column(column).to_pylist() if v}


def dictionary(sql):
    """Every row of an Athena query (lake.rows stops at the first 1,000), keyed on the first column."""
    qid, _ = lake.query(sql)
    out = {}
    for page in lake.athena.get_paginator("get_query_results").paginate(QueryExecutionId=qid):
        for r in page["ResultSet"]["Rows"]:
            v = [c.get("VarCharValue") for c in r["Data"]]
            out.setdefault(v[0], v[1:])
    out.pop("code", None)  # the header row
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", default="2024-04-26")
    a = ap.parse_args()
    t0 = time.time()
    snap = a.snapshot
    src = f"{RAW}/import-{snap}/CINDA-{snap}.zip"
    os.makedirs(WORK, exist_ok=True)
    z = lake.download(src, f"{WORK}/CINDA-{snap}.zip")
    zipfile.ZipFile(z).extractall(f"{WORK}/c2k")

    quants = dictionary("SELECT code, shorthelp, webquantity FROM exfor_dict045")
    labs = dictionary("SELECT code, shorthelp, countrycode FROM exfor_dict003")
    print("dictionaries", len(quants), len(labs), flush=True)
    nsr_keys = key_set("nsr_parquet", "key_number")
    x4_entries = key_set("exfor_j4_entries", "entry")
    print("keys", len(nsr_keys), len(x4_entries), flush=True)

    rows, files, blocks_seen, rejects = [], [], set(), []
    for path in sorted(glob.glob(f"{WORK}/c2k/*.c2k")):
        name = os.path.basename(path)
        head = open(path, encoding="latin-1").readline().split()
        declared = int(head[-1]) if head and head[-1].isdigit() else None
        lst = open(path + ".lst", encoding="latin-1").readline().split() if os.path.exists(path + ".lst") else []
        lst_lines, lst_blocks = (int(lst[-2]), int(lst[-1])) if len(lst) >= 2 and lst[-1].isdigit() else (None, None)
        n_lines, file_blocks, block = 0, set(), None
        for raw in open(path, encoding="latin-1"):
            line = raw.rstrip("\r\n")
            if line.startswith("##---Block#"):
                block = int(re.match(r"##---Block#(\d+)", line).group(1))
                file_blocks.add(block)
                continue
            if not line.strip() or line.startswith("CINDA "):
                continue
            n_lines += 1
            if len(line) < 61 or block is None:
                rejects.append({"file": name, "line": line[:160], "why": "short line" if block else "outside a block"})
                continue
            line = line.ljust(140)
            try:
                zz = int(line[0:4])
            except ValueError:
                rejects.append({"file": name, "line": line[:160], "why": "Z not a number"})
                continue
            aa = line[4:7].strip()
            za = zz * 1000 + int(aa) if aa.isdigit() else zz * 1000
            tgt, full = symbol(zz, int(aa) if aa.isdigit() else aa)
            emin, etext1 = energy(line[47:54])
            emax, etext2 = energy(line[54:61])
            ref_type, ref = line[61], line[63:84].strip()
            parts = ref.split(",")
            ext = {}
            for part in line[139:].split(";#")[1:]:
                k, _, v = part.partition("=")
                ext[k.strip()] = v.strip()
            reader = line[45:47].strip()
            serial = line[34:39].strip()
            entry = sub = None
            m = re.match(r"EXFOR\s*([0-9A-Z]\d{4})\.?(\d{3})?", ref) if ref_type == "4" else None
            if m:
                entry, sub = m.group(1), (m.group(1) + m.group(2) if m.group(2) else None)
            elif reader == "X4" and re.fullmatch(r"[0-9A-Z]\d{4}", serial):
                entry = serial
            if entry == "00000":  # a placeholder on 79 lines, not an entry
                entry = sub = None
            nsr = ext.get("NSR") or None
            author, comment = author_comment(line[90:126])
            q = line[23:26].strip()
            lab = line[27:34].strip()
            wt = line[44].strip()
            yr = line[84:88].strip()
            de = line[128:136].strip()
            rows.append({
                "block_id": block, "line_no": int(line[40:43]) if line[40:43].strip().isdigit() else None,
                "area": int(line[27]) if line[27].isdigit() else None, "target_z": zz, "target_a": aa, "target_za": za,
                "target": tgt, "target_full": full, "reaction": line[8:23].strip(), "quantity": q,
                "quantity_word": (quants.get(q) or [""])[0] or "", "old_quantity": line[136:139].strip(),
                "e_min_ev": emin, "e_max_ev": emax, "energy_text": " ".join(x for x in (etext1, etext2) if x),
                "lab": lab, "lab_name": (labs.get(lab) or [""])[0] or "", "work_type": WORK_TYPES.get(wt, wt),
                "work_type_code": wt, "reader": reader, "origin": ORIGIN.get(reader, "cinda"), "doc_code": line[43],
                "serial": serial, "ref_type": ref_type, "ref_code": parts[0] if parts else "",
                "ref_volume": parts[1] if len(parts) > 2 else "", "ref_page": parts[-1] if len(parts) > 1 else "",
                "reference_text": f"{ref_type},{ref}" if ref else ref_type, "year": int(yr) if yr.isdigit() else None,
                "pub_date": line[84:90].strip(), "author": author, "comment": comment, "nsr_key": nsr,
                "nsr_resolved": bool(nsr and nsr in nsr_keys), "exfor_entry": entry, "exfor_subentry": sub,
                "exfor_resolved": bool(entry and entry in x4_entries), "ext_reaction": ext.get("REAC"),
                "ext_product": ext.get("PROD"), "ext_lab": ext.get("LAB"),
                "date_entered": f"{de[0:4]}-{de[4:6]}-{de[6:8]}" if len(de) == 8 and de.isdigit() else de,
                "source_file": name})
        blocks_seen |= file_blocks
        files.append({"file": name, "lines": n_lines, "blocks": len(file_blocks), "header_lines": declared,
                      "listing_lines": lst_lines, "listing_blocks": lst_blocks,
                      "lines_match": n_lines == declared == (lst_lines if lst_lines is not None else declared),
                      "blocks_match": lst_blocks is None or len(file_blocks) == lst_blocks})
        print(files[-1], flush=True)

    rows.sort(key=lambda r: (r["target_za"], r["block_id"], r["line_no"] or 0))
    out = f"{WORK}/out"
    t = lake.Table(out, "lines", LINES, row_group=10_000)
    for r in rows:
        t.add(r)
    stats = {"lines": t.close()}

    cq = collections.Counter(r["quantity"] for r in rows)
    tq = lake.Table(out, "dict_quantities", DICT_Q)
    for code in sorted(set(quants) | set(cq)):
        tq.add({"code": code, "word": (quants.get(code) or [""])[0] or "", "web_quantity": (quants.get(code) or ["", ""])[1] or "",
                "lines": cq.get(code, 0)})
    stats["dict_quantities"] = tq.close()
    cl = collections.Counter(r["lab"] for r in rows)
    tl = lake.Table(out, "dict_labs", DICT_LAB)
    for code in sorted(cl):
        v = labs.get(code) or ["", ""]
        tl.add({"code": code, "name": v[0] or "", "country": v[1] or (code[1:4] if len(code) >= 4 else ""), "lines": cl[code]})
    stats["dict_labs"] = tl.close()
    ct = collections.Counter(r["work_type_code"] for r in rows)
    tt = lake.Table(out, "dict_types", DICT_T)
    for code in sorted(ct):
        tt.add({"code": code, "word": WORK_TYPES.get(code, code), "lines": ct[code]})
    stats["dict_types"] = tt.close()

    prefix = f"lake/cinda/{snap}"
    counts, scanned = {}, 0
    for name, schema in (("lines", LINES), ("dict_quantities", DICT_Q), ("dict_labs", DICT_LAB), ("dict_types", DICT_T)):
        lake.sync(f"{out}/{name}", f"{prefix}/{name}/")
        n, s = lake.register(f"cinda_{name}", schema, f"s3://{lake.BUCKET}/{prefix}/{name}/", DDL)
        counts[f"cinda_{name}"], scanned = n, scanned + s

    with_nsr = [r for r in rows if r["nsr_key"]]
    with_x4 = [r for r in rows if r["exfor_entry"]]
    unresolved_pre2010 = [r for r in rows if (r["year"] or 0) < 2010 and not r["nsr_resolved"] and not r["exfor_resolved"]]
    evl = collections.Counter(r["work_type_code"] for r in rows if r["quantity"] == "EVL")
    manifest = {
        "table": "nsr.cinda_lines", "snapshot": snap, "built": lake.now(), "source": f"s3://{lake.BUCKET}/{src}",
        "snapshot_choice": ("the newest complete snapshot: 000-cinda-main/import-2024-04-26/CINDA-2024-04-26.zip holds "
                            "all five area files (cinda1-4, cinda9) with their listings; the dated cinda-YYYY-MM-DD "
                            "folders end in 2009, the backup-* folders in 2013, and the import-* folders run to 2024-04-26"),
        "format_source": ("read from the data (column layout in scripts/parse/cinda/parse.py): the held archive has no "
                          "format manual; the manual-2006-06-22 and manual-2010-03-02 folders are the hand-entered part "
                          "of CINDA (000-cinda-main/readme.txt). Quantity names: EXFOR dictionary 45 "
                          "(nsr.exfor_dict045); laboratory names: EXFOR dictionary 3 (nsr.exfor_dict003); work-type "
                          "letters E, T, D, R, C read as expt, theo, eval, revw, comp, M kept as coded"),
        "format_notes": {"work_type_on_EVL_lines": dict(evl), "reader_X4": "lines imported from EXFOR (readme.txt)",
                         "area_9": "lines imported from NSR (each carries ;#NSR=<key>)"},
        "files": files, "blocks": len(blocks_seen), "rows": len(rows), "athena_counts": counts,
        "rejects": {"count": len(rejects), "first": rejects[:20]},
        "matches": {
            "nsr_key": {"lines": len(with_nsr), "matched": sum(r["nsr_resolved"] for r in with_nsr),
                        "unmatched": sum(not r["nsr_resolved"] for r in with_nsr), "against": "nsr.nsr_parquet.key_number",
                        "keys_checked": len({r['nsr_key'] for r in with_nsr})},
            "exfor_entry": {"lines": len(with_x4), "matched": sum(r["exfor_resolved"] for r in with_x4),
                            "unmatched": sum(not r["exfor_resolved"] for r in with_x4),
                            "against": "nsr.exfor_j4_entries.entry (J4 2026-10-28)",
                            "entries_checked": len({r['exfor_entry'] for r in with_x4})},
            "pre_2010_unresolved": {"lines": len(unresolved_pre2010),
                                    "blocks": len({r["block_id"] for r in unresolved_pre2010}),
                                    "note": "lines published before 2010 that neither an NSR key nor an EXFOR entry resolves"}},
        "by_origin": dict(collections.Counter(r["origin"] for r in rows)),
        "by_work_type": dict(ct), "tables": stats, "athena_scanned_bytes": scanned, "seconds": round(time.time() - t0)}
    lake.put_json(f"{prefix}/manifest.json", manifest)
    subprocess.run([lake.AWS, "s3", "sync", DDL, f"s3://{lake.BUCKET}/lake/_work/parse/cinda/ddl/", "--exclude", "*",
                    "--include", "cinda_*", "--only-show-errors", "--region", lake.REGION], check=True)
    print(json.dumps({k: manifest[k] for k in ("files", "blocks", "rows", "athena_counts", "rejects", "matches",
                                              "by_origin", "by_work_type", "seconds")}, indent=1))


if __name__ == "__main__":
    main()
