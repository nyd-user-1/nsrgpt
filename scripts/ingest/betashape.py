"""Brief 62 Part B.6: BetaShape beta spectra from the IAEA Live Chart API, on the ingest box.
  nohup /opt/ingest/venv/bin/python -I betashape.py > /data/betashape.log 2>&1 &
The API (nds.iaea.org/relnsd/v1/data, open to a plain client) serves the spectra one nuclide at a time
(fields=bin_beta&nuclides=<nuclide>&rad_types=bm|bp; nuclides=all falls back to ground states), so every nuclide whose
ground state decays by beta-minus, beta-plus or electron capture in the held ground-state table
(raw/iaea-livechart/2026-11-06/raw/ground_states.csv) is asked, one request a second. Each answer goes to
raw/iaea/2026-11-11/livechart/bin_beta/<nuclide>_<bm|bp>.csv; all rows to nsr.iaea_betashape_spectra
(lake/iaea-betashape/2026-11-11/): rad_type, parent (z, n, symbol, level energy), daughter, bin energy (keV), dN/dE and
its uncertainty, the neutrino's, extraction date. Manifest raw/iaea/2026-11-11/livechart/manifest.json."""
import csv
import datetime
import io
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lake  # noqa: E402
import pyarrow as pa  # noqa: E402
import pyarrow.parquet as pq  # noqa: E402

API = "https://nds.iaea.org/relnsd/v1/data"
GS = "raw/iaea-livechart/2026-11-06/raw/ground_states.csv"
RAW = "raw/iaea/2026-11-11/livechart"
LAKE = "lake/iaea-betashape/2026-11-11"
LOCAL = "/data/betashape"
S, D, I = pa.string(), pa.float64(), pa.int32()
SCHEMA = pa.schema([("rad_type", S), ("nuclide", S), ("p_z", I), ("p_n", I), ("p_symbol", S), ("p_energy", D),
                    ("d_z", I), ("d_n", I), ("d_symbol", S), ("bin_en", D), ("dn_de", D), ("unc_dn_de", D),
                    ("dn_de_nu", D), ("unc_dn_de_nu", D), ("extraction_date", S)])


def num(s, kind=float):
    try:
        return kind(float(s)) if s not in (None, "") else None
    except ValueError:
        return None


def main():
    t0 = time.time()
    os.makedirs(LOCAL, exist_ok=True)
    gs = list(csv.DictReader(io.StringIO(lake.s3.get_object(Bucket=lake.BUCKET, Key=GS)["Body"].read().decode("latin-1"))))
    want = []
    for r in gs:
        modes = {(r.get(f"decay_{k}") or "").upper() for k in (1, 2, 3)}
        a = int(r["z"]) + int(r["n"])
        nuc = f"{a}{r['symbol'].lower()}"
        if any(m.startswith("B-") for m in modes):
            want.append((nuc, "bm"))
        if any(m.startswith("B+") or m.startswith("EC") for m in modes):
            want.append((nuc, "bp"))
    rows, asked, empty, failed = [], 0, 0, []
    for nuc, rt in want:
        url = f"{API}?fields=bin_beta&nuclides={nuc}&rad_types={rt}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "NSRgpt-ingest/1.0"})
            body = urllib.request.urlopen(req, timeout=60).read()
        except Exception as e:  # noqa: BLE001
            failed.append(f"{nuc} {rt}: {type(e).__name__}")
            time.sleep(1)
            continue
        asked += 1
        text = body.decode("latin-1")
        got = [x for x in csv.DictReader(io.StringIO(text)) if x.get("bin_en") not in (None, "")]
        if not got:
            empty += 1
        else:
            lake.s3.put_object(Bucket=lake.BUCKET, Key=f"{RAW}/bin_beta/{nuc}_{rt}.csv", Body=body, ContentType="text/csv")
            for x in got:
                rows.append([rt, nuc, num(x["p_z"], int), num(x["p_n"], int), x["p_symbol"], num(x["p_energy"]),
                             num(x["d_z"], int), num(x["d_n"], int), x["d_symbol"], num(x["bin_en"]), num(x["dn_de"]),
                             num(x["unc_dn_de"]), num(x["dn_de_nu"]), num(x["unc_dn_de_nu"]), x.get("extraction_date")])
        if asked % 100 == 0:
            print(f"{asked}/{len(want)} asked, {empty} empty, {len(rows)} rows, {time.time() - t0:.0f}s", flush=True)
        time.sleep(1)
    t = pa.Table.from_arrays([pa.array([r[i] for r in rows], type=f.type) for i, f in enumerate(SCHEMA)], schema=SCHEMA)
    os.makedirs(f"{LOCAL}/out", exist_ok=True)
    pq.write_table(t, f"{LOCAL}/out/part-00000.parquet", compression="snappy")
    lake.sync(f"{LOCAL}/out", f"{LAKE}/spectra/")
    count, _ = lake.register("iaea_betashape_spectra", SCHEMA, f"s3://{lake.BUCKET}/{LAKE}/spectra/", "/opt/ingest/ddl")
    for f in os.listdir("/opt/ingest/ddl"):
        lake.s3.upload_file(f"/opt/ingest/ddl/{f}", lake.BUCKET, f"lake/_work/ingest/ddl/{f}")
    out = {"source": "IAEA Live Chart of Nuclides API, fields=bin_beta (spectra computed with BetaShape)",
           "api": API, "built_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "terms": "IAEA Terms of Use (https://www.iaea.org/about/terms-of-use)",
           "nuclide_list": f"{GS} (decay_1..3 starting B-, B+ or EC)", "requests": len(want), "answered": asked,
           "empty": empty, "failed": failed[:50], "failed_count": len(failed), "rows": t.num_rows,
           "parents": len({(r[0], r[1]) for r in rows}), "table": {"name": "nsr.iaea_betashape_spectra",
                                                                   "athena_count": count, "location": f"{LAKE}/spectra/"},
           "minutes": round((time.time() - t0) / 60, 1)}
    lake.put_json(f"{RAW}/manifest.json", out)
    print(out, flush=True)


if __name__ == "__main__":
    main()
