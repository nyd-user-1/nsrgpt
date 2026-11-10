"""Brief 62 Part B.4 (files): the IAEA records files the lake lacks that the Wayback Machine holds, on the ingest box.
  nohup /opt/ingest/venv/bin/python -I records_wayback.py > /data/records_wayback.log 2>&1 &
For every file in nsr.iaea_record_files that is not held, under 1 GB, with a capture in the held Wayback index
(raw/iaea-records/2026-11-08/_index/cdx.json), fetches the capture's raw bytes (the id_ form), one request a second,
keeps it only when its md5 equals the record's, and writes it to raw/iaea/2026-11-11/records/<id>/<name>. The run's
result goes into raw/iaea/2026-11-11/records/wayback.json; a rerun (PAUSE=5 for a slower pace) asks again only for the files
that failed."""
import hashlib
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lake  # noqa: E402
import pyarrow.parquet as pq  # noqa: E402

LOCAL = "/data/rec"
RAW = "raw/iaea/2026-11-11/records"


def main():
    t0 = time.time()
    lake.download("raw/iaea-records/2026-11-08/_index/cdx.json", f"{LOCAL}/cdx.json")
    cdx = json.load(open(f"{LOCAL}/cdx.json"))
    files = pq.read_table(f"{LOCAL}/out/files/part-00000.parquet").to_pylist()
    todo = [f for f in files if not f["held"] and f["size"] < 1 << 30 and cdx.get(f"{f['id']}/{f['name']}")]
    got, bad, failed = [], [], []
    try:  # a rerun keeps what the last run kept or rejected and asks again only for the files that failed
        prev = json.loads(lake.s3.get_object(Bucket=lake.BUCKET, Key=f"{RAW}/wayback.json")["Body"].read())
        got, bad = prev["files"], prev["md5_mismatch"]
        done = {g["file"] for g in got} | {b["file"] for b in bad}
        todo = [f for f in todo if f"{f['id']}/{f['name']}" not in done]
    except lake.s3.exceptions.NoSuchKey:
        pass
    pause = float(os.environ.get("PAUSE", "1"))  # seconds between requests; Wayback refused connections at 1
    for f in todo:
        caps = sorted(cdx[f"{f['id']}/{f['name']}"], key=lambda c: c["timestamp"], reverse=True)
        ok = False
        for c in caps[:3]:
            url = f"https://web.archive.org/web/{c['timestamp']}id_/{c['original']}"
            try:
                body = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "NSRgpt-ingest/1.0"}),
                                              timeout=300).read()
            except Exception as e:  # noqa: BLE001
                failed.append({"file": f"{f['id']}/{f['name']}", "url": url, "error": f"{type(e).__name__}: {e}"[:200]})
                time.sleep(pause)
                continue
            time.sleep(pause)
            if f["md5"] and hashlib.md5(body).hexdigest() != f["md5"]:
                bad.append({"file": f"{f['id']}/{f['name']}", "url": url, "bytes": len(body)})
                continue
            key = f"{RAW}/{f['id']}/{f['name']}"
            lake.s3.put_object(Bucket=lake.BUCKET, Key=key, Body=body)
            got.append({"file": f"{f['id']}/{f['name']}", "key": key, "bytes": len(body), "md5": f["md5"],
                        "wayback": url, "class": f["class"]})
            ok = True
            break
        print(f"{len(got)} kept, {len(bad)} md5 mismatches, {len(failed)} failed of {len(todo)}", flush=True)
        if not ok and not any(b["file"] == f"{f['id']}/{f['name']}" for b in bad + failed):
            failed.append({"file": f"{f['id']}/{f['name']}", "error": "no capture answered"})
    out = {"candidates": len(todo), "kept": len(got), "bytes": sum(g["bytes"] for g in got), "md5_mismatch": bad,
           "failed": failed, "files": got, "minutes": round((time.time() - t0) / 60, 1)}
    lake.put_json(f"{RAW}/wayback.json", out)
    print({k: v for k, v in out.items() if k != "files"}, flush=True)


if __name__ == "__main__":
    main()
