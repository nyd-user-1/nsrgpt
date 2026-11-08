# The EXFOR dictionary (IAEA-NDS/exfor_dictionary, src/exfor_dictionary/latest.json) to Parquet (brief 16, step 3).
# One table per DICTION block, nsr.exfor_dict_<name> (name from the block's own title), plus exfor_dict_dictionaries
# (the list of blocks, DICTION 950's role). Columns: diction, code, then every field the block's codes carry.
#   dictionary.py build <latest.json> <source-key>    write, upload, register, manifest
import sys, os, re, json, glob, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pyarrow as pa
import pyarrow.parquet as pq
from common import *

FOLDER = "dictionary"
OUT = f"/data/out/{FOLDER}"
NUMERIC = {"latitude", "longitude", "unit_conversion_factor"}


def slug(name):
    name = re.sub(r"\(.*?\)", "", name).strip().lower()
    return re.sub(r"[^a-z0-9]+", "_", name).strip("_")


def numeric(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def build(path, key):
    src = json.load(open(path))
    shutil.rmtree(OUT, ignore_errors=True)
    tables = []
    defs = src["definitions"]
    blocks = src["dictionaries"]
    names = {}
    rows = {"diction": [], "description": [], "active": [], "table": [], "codes": []}
    for num, d in sorted(defs.items(), key=lambda kv: int(kv[0])):
        b = blocks.get(num)
        t = f"exfor_dict_{slug(b['diction_name'])}" if b else None
        names[num] = t
        rows["diction"].append(int(num)); rows["description"].append(d.get("description"))
        rows["active"].append(bool(d.get("active"))); rows["table"].append(f"nsr.{t}" if t else None)
        rows["codes"].append(len(b["codes"]) if b else 0)
    out = {"dictionaries": pa.table(rows)}
    for num, b in blocks.items():
        codes = b["codes"]
        fields = []
        for c in codes.values():
            for k in c:
                if k not in fields:
                    fields.append(k)
        cols = {"diction": [int(num)] * len(codes), "code": list(codes)}
        for f in fields:
            vals = [c.get(f) for c in codes.values()]
            if f in NUMERIC:
                cols[f] = pa.array([numeric(v) for v in vals], pa.float64())
            elif f == "active":
                cols[f] = pa.array([None if v is None else bool(v) for v in vals], pa.bool_())
            else:
                cols[f] = pa.array([None if v is None else str(v) for v in vals], pa.string())
        out[names[num].removeprefix("exfor_dict_")] = pa.table(cols)
    manifest = {"folder": f"lake/exfor/{FOLDER}/", "source": {"key": key, "bytes": size(key),
                "file": "src/exfor_dictionary/latest.json"},
                "tool": {"pyarrow": pa.__version__, "script": "scripts/parse/exfor/dictionary.py"}, "tables": []}
    for name, t in out.items():
        local = f"{OUT}/{name}"
        os.makedirs(local)
        pq.write_table(t, f"{local}/part-0.parquet", compression="snappy")
        b = put_dir(local, f"lake/exfor/{FOLDER}/{name}")
        athena = f"exfor_dict_{name}"
        register(athena, f"lake/exfor/{FOLDER}/{name}", t.schema, f"EXFOR dictionary {name}")
        _, r, _ = query(f'SELECT count(*) FROM "{athena}"')
        manifest["tables"].append({"name": name, "athena_table": f"nsr.{athena}", "rows": t.num_rows,
                                   "athena_rows": int(r[0][0]), "bytes": b,
                                   "columns": [{"name": f.name, "type": str(f.type)} for f in t.schema]})
        log("registered", athena, t.num_rows, r[0][0])
    manifest["rows_total"] = sum(t["rows"] for t in manifest["tables"])
    manifest["bytes_total"] = sum(t["bytes"] for t in manifest["tables"])
    manifest["built_at"] = now()
    manifest["spend"] = "S3 storage under 1 MB; Athena DDL free; count queries read Parquet footers only"
    put_json(f"lake/exfor/{FOLDER}/manifest.json", manifest)
    print(json.dumps([(t["name"], t["rows"], t["athena_rows"]) for t in manifest["tables"]]))


if __name__ == "__main__":
    cmd, *a = sys.argv[1:]
    if cmd == "build":
        build(a[0], a[1])
