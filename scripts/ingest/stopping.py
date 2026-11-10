"""Brief 62 Part B.1: the IAEA electronic stopping power database (www-nds.iaea.org/stopping), on the ingest box.
  /opt/ingest/venv/bin/python -I stopping.py
1. Fetches the site's two downloads, StoppingPower.zip (every measured value, one CSV) and StoppingPower_refs.zip (the
   references), and its versions and description pages, one request a second, into raw/iaea/2026-11-11/stopping/;
   compares the zip with the copy held since 2026-11-07 (raw/iaea/2026-11-07/stopping/download/tuples).
2. Parses both CSVs to Parquet under lake/stopping/2026-11-11/ (powers/, refs/), every column kept as the site gives it,
   and registers nsr.stopping_powers and nsr.stopping_refs (scripts/parse/box/lake.py's register).
3. Writes raw/iaea/2026-11-11/stopping/manifest.json: each file's URL, bytes and sha256, the held copy's verdict, the
   tables' counts, the terms."""
import datetime
import hashlib
import io
import os
import sys
import time
import urllib.request
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lake  # noqa: E402  (scripts/parse/box/lake.py, copied beside this file on the box)
import pyarrow as pa  # noqa: E402
import pyarrow.csv as pacsv  # noqa: E402
import pyarrow.parquet as pq  # noqa: E402

RAW = "raw/iaea/2026-11-11/stopping"
HELD = "raw/iaea/2026-11-07/stopping/download/tuples"
LAKE = "lake/stopping/2026-11-11"
LOCAL = "/data/stopping"
UA = "NSRgpt-ingest/1.0"
SRC = {"StoppingPower.zip": "https://www-nds.iaea.org/stopping/download/tuples",
       "StoppingPower_refs.zip": "https://www-nds.iaea.org/stopping/download/refs",
       "versions.html": "https://www-nds.iaea.org/stopping/versions",
       "description.html": "https://www-nds.iaea.org/stopping/description"}
TERMS = ("IAEA Terms of Use (https://www.iaea.org/about/terms-of-use), linked from every page of the database; the site "
         "asks users to cite the database (its home page links doi 10.1016/j.nimb.2024.165336)")
S, D, I = pa.string(), pa.float64(), pa.int32()
POWERS = pa.schema([("projectile_name", S), ("ion_isotope", D), ("target_name", S), ("phase", S), ("energy", D),
                    ("energy_unit", S), ("stopping_power", D), ("stopping_unit", S), ("percentage_error", S),
                    ("target_mass_atom_ratio", D), ("dataset_last_modification", S), ("publication_year", I),
                    ("ref_id", S), ("citation_reference", S), ("doi", S), ("comments", S), ("facility", S),
                    ("technique", S), ("stopping_power_converted", D), ("stopping_unit_converted", S)])
REFS = pa.schema([("ref_id", S), ("doi", S), ("authors", S), ("citation_reference", S), ("year", I)])


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch(name, url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        body = r.read()
        ctype = r.headers.get("Content-Type", "")
    if "text/html" in ctype and name.endswith(".zip"):
        raise SystemExit(f"{url} answered HTML, not a zip (a challenge page?)")
    os.makedirs(LOCAL, exist_ok=True)
    with open(f"{LOCAL}/{name}", "wb") as f:
        f.write(body)
    lake.s3.put_object(Bucket=lake.BUCKET, Key=f"{RAW}/{name}", Body=body, ContentType=ctype or "application/octet-stream")
    time.sleep(1)
    return {"key": f"{RAW}/{name}", "url": url, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(),
            "content_type": ctype}


def table(zpath, schema):
    z = zipfile.ZipFile(zpath)
    name = z.infolist()[0].filename
    t = pacsv.read_csv(io.BytesIO(z.read(name)), read_options=pacsv.ReadOptions(encoding="utf8"), parse_options=pacsv.ParseOptions(newlines_in_values=True),
                       convert_options=pacsv.ConvertOptions(column_types=dict(zip(schema.names, schema.types)),
                                                            include_columns=schema.names, strings_can_be_null=True))
    return name, t.select(schema.names).cast(schema)


def main():
    t0 = time.time()
    files = [fetch(n, u) for n, u in SRC.items()]
    held = lake.s3.get_object(Bucket=lake.BUCKET, Key=HELD)["Body"].read()
    same = hashlib.sha256(held).hexdigest() == files[0]["sha256"]
    out = {"source": "IAEA Nuclear Data Section, Electronic Stopping Power of Matter for Ions",
           "site": "https://www-nds.iaea.org/stopping/", "fetched_at": now(), "terms": TERMS,
           "held_2026_11_07": {"key": HELD, "bytes": len(held), "same_bytes_as_today": same},
           "files": files, "tables": {}}
    for zname, schema, tname, folder in (("StoppingPower.zip", POWERS, "stopping_powers", "powers"),
                                         ("StoppingPower_refs.zip", REFS, "stopping_refs", "refs")):
        member, t = table(f"{LOCAL}/{zname}", schema)
        os.makedirs(f"{LOCAL}/{folder}", exist_ok=True)
        pq.write_table(t, f"{LOCAL}/{folder}/part-00000.parquet", compression="snappy")
        lake.sync(f"{LOCAL}/{folder}", f"{LAKE}/{folder}/")
        count, scanned = lake.register(tname, schema, f"s3://{lake.BUCKET}/{LAKE}/{folder}/", "/opt/ingest/ddl")
        info = {"member": member, "rows": t.num_rows, "athena_count": count, "location": f"{LAKE}/{folder}/"}
        if tname == "stopping_powers":
            info.update(projectiles=len(set(t.column("projectile_name").to_pylist())),
                        targets=len(set(t.column("target_name").to_pylist())),
                        references=len(set(t.column("ref_id").to_pylist())),
                        energy_units=sorted({u for u in t.column("energy_unit").to_pylist() if u}),
                        converted_units=sorted({u for u in t.column("stopping_unit_converted").to_pylist() if u}),
                        years=[min(y for y in t.column("publication_year").to_pylist() if y),
                               max(y for y in t.column("publication_year").to_pylist() if y)])
        out["tables"][f"nsr.{tname}"] = info
    for f in os.listdir("/opt/ingest/ddl"):
        lake.s3.upload_file(f"/opt/ingest/ddl/{f}", lake.BUCKET, f"lake/_work/ingest/ddl/{f}")
    out["seconds"] = round(time.time() - t0, 1)
    lake.put_json(f"{RAW}/manifest.json", out)
    print(out)


if __name__ == "__main__":
    main()
