"""Brief 62 Part B.3: CoNDERC's OpenMC benchmark inputs and results (nds.iaea.org/conderc/openmc), on the ingest box.
  /opt/ingest/venv/bin/python -I conderc.py
nds.iaea.org answers a Cloudflare challenge to a plain client, so the collection's archive (nds.iaea.org/data/openmc/
openmc.zip, linked from the CoNDERC OpenMC page held since 2026-11-07 at raw/iaea/2026-11-07/conderc/openmc) comes from
the Wayback Machine's capture of 2026-03-01 (raw bytes, the id_ form). The zip and its 601 files go to
raw/iaea/2026-11-11/conderc/ (openmc.zip, openmc/...). Every OpenMC run's stdout gives its k-effective; its folder's
materials.xml the nuclides. Table nsr.conderc_openmc (lake/conderc/2026-11-11/openmc/): benchmark, case, library,
k_eff and its uncertainty (combined), the collision, track-length and absorption estimates, leakage fraction, the
nuclides, the run time and the stdout's key. Manifest raw/iaea/2026-11-11/conderc/manifest.json."""
import datetime
import hashlib
import os
import re
import subprocess
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lake  # noqa: E402
import pyarrow as pa  # noqa: E402
import pyarrow.parquet as pq  # noqa: E402

SNAP = "20260301150045"
ORIG = "https://nds.iaea.org/data/openmc/openmc.zip"
URL = f"https://web.archive.org/web/{SNAP}id_/{ORIG}"
RAW = "raw/iaea/2026-11-11/conderc"
LAKE = "lake/conderc/2026-11-11/openmc"
LOCAL = "/data/conderc"
LIBS = ("endfb80", "jendl5", "tendl2021")
S, D = pa.string(), pa.float64()
SCHEMA = pa.schema([("benchmark", S), ("case", S), ("library", S), ("k_eff", D), ("k_eff_unc", D),
                    ("k_collision", D), ("k_tracklength", D), ("k_absorption", D), ("leakage", D),
                    ("leakage_unc", D), ("nuclides", S), ("n_nuclides", pa.int32()), ("run_at", S), ("stdout_key", S)])
VAL = r"=\s*([0-9.Ee+-]+)\s*\+/-\s*([0-9.Ee+-]+)"


def main():
    t0 = time.time()
    os.makedirs(LOCAL, exist_ok=True)
    req = urllib.request.Request(URL, headers={"User-Agent": "NSRgpt-ingest/1.0"})
    body = urllib.request.urlopen(req, timeout=300).read()
    with open(f"{LOCAL}/openmc.zip", "wb") as f:
        f.write(body)
    lake.s3.put_object(Bucket=lake.BUCKET, Key=f"{RAW}/openmc.zip", Body=body, ContentType="application/zip")
    z = zipfile.ZipFile(f"{LOCAL}/openmc.zip")
    z.extractall(f"{LOCAL}/x")
    subprocess.run(["/snap/bin/aws", "s3", "sync", f"{LOCAL}/x/openmc", f"s3://{lake.BUCKET}/{RAW}/openmc/",
                    "--only-show-errors", "--region", lake.REGION], check=True)
    rows = []
    for info in z.infolist():
        name = info.filename
        if not name.endswith(".stdout"):
            continue
        parts = name.split("/")[1:-1]  # openmc/<benchmark>/[<case>/]<library>/[<config>/]<file>
        lib = next((p for p in parts if p in LIBS), None)
        i = parts.index(lib) if lib else len(parts)
        bench, case = parts[0], "/".join(parts[1:i] + parts[i + 1:]) or None
        text = z.read(name).decode("latin-1")
        est = {}
        for label, key in (("Combined k-effective", "k"), ("k-effective (Collision)", "kc"),
                           ("k-effective (Track-length)", "kt"), ("k-effective (Absorption)", "ka"),
                           ("Leakage Fraction", "lk")):
            m = re.search(re.escape(label) + r"\s*" + VAL, text)
            est[key] = (float(m.group(1)), float(m.group(2))) if m else (None, None)
        nucs = []
        mx = os.path.join(f"{LOCAL}/x", os.path.dirname(name), "materials.xml")
        if os.path.exists(mx):
            nucs = sorted({n.get("name") for n in ET.parse(mx).getroot().iter("nuclide") if n.get("name")})
        stamp = re.search(r"_(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})(\d{2})\.stdout$", name)
        rows.append([bench, case, lib, est["k"][0], est["k"][1], est["kc"][0], est["kt"][0], est["ka"][0], est["lk"][0],
                     est["lk"][1], " ".join(nucs) or None, len(nucs),
                     f"{stamp.group(1)}T{stamp.group(2)}:{stamp.group(3)}:{stamp.group(4)}" if stamp else None,
                     f"{RAW}/{name}"])
    t = pa.Table.from_arrays([pa.array([r[i] for r in rows], type=f.type) for i, f in enumerate(SCHEMA)], schema=SCHEMA)
    os.makedirs(f"{LOCAL}/out", exist_ok=True)
    pq.write_table(t, f"{LOCAL}/out/part-00000.parquet", compression="snappy")
    lake.sync(f"{LOCAL}/out", f"{LAKE}/")
    count, _ = lake.register("conderc_openmc", SCHEMA, f"s3://{lake.BUCKET}/{LAKE}/", "/opt/ingest/ddl")
    for f in os.listdir("/opt/ingest/ddl"):
        lake.s3.upload_file(f"/opt/ingest/ddl/{f}", lake.BUCKET, f"lake/_work/ingest/ddl/{f}")
    out = {"source": "IAEA CoNDERC, OpenMC inputs of criticality benchmarks (P. Romano, 2022)",
           "page": "https://nds.iaea.org/conderc/openmc (held: raw/iaea/2026-11-07/conderc/openmc)",
           "url": ORIG, "fetched_from": URL, "wayback_snapshot": SNAP,
           "fetched_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "files": len(z.infolist()),
           "unpacked_bytes": sum(i.file_size for i in z.infolist()),
           "terms": "IAEA Terms of Use (https://www.iaea.org/about/terms-of-use), linked from the CoNDERC pages",
           "why_wayback": "nds.iaea.org answered a Cloudflare challenge to a plain client on 2026-11-10",
           "table": {"name": "nsr.conderc_openmc", "rows": t.num_rows, "athena_count": count, "location": f"{LAKE}/",
                     "benchmarks": sorted({r[0] for r in rows}), "libraries": sorted({r[2] for r in rows if r[2]}),
                     "without_k_eff": sum(1 for r in rows if r[3] is None)},
           "not_in_the_zip": "the benchmarks' experimental k-eff (ICSBEP handbook values); the page links the reports",
           "seconds": round(time.time() - t0, 1)}
    lake.put_json(f"{RAW}/manifest.json", out)
    print(out)


if __name__ == "__main__":
    main()
