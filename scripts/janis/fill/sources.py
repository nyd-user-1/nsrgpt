"""Brief 70: lake/_raw/<release>/SOURCE.md for every release added tonight (and the catalogued Nubase texts): where the
files came from, the route that fetched them, the date, each file's key, bytes and checksum (the S3 ETag, MD5 for
single-part uploads; SHA-256 where the fetcher recorded one), and the licence line.

  python sources.py [<release>…]      # default: every release progress.py lists, plus the Nubase files
"""
import json
import sys
import time

import boto3

BUCKET = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")

ROUTES = [
    ("raw/iaea/2026-11-07/", "2026-11-07",
     "IAEA Nuclear Data Section, https://www-nds.iaea.org/public/download-endf/, mirrored on 2026-11-07 by the walled-site "
     "mirror (briefs 11 and 14: real Chrome under Xvfb on Webshare residential lines, since the host answers plain "
     "clients with a Cloudflare challenge). Not refetched tonight."),
    ("lake/_raw/iaea/", "2026-11-11",
     "IAEA Nuclear Data Section, https://www-nds.iaea.org/public/download-endf/, fetched on 2026-11-11 by browser box "
     "nsr-fill-wb (scripts/iaea/box/mirror.py: real Chrome under Xvfb, one Webshare line, one stream, at most two "
     "requests a second; the host refuses plain, Lambda and EC2 clients with a Cloudflare challenge)."),
    ("lake/_raw/GEFY-", "2026-11-11",
     "K.-H. Schmidt and B. Jurado's GEF site, https://www.khschmidts-nuclear-web.eu/GEFY.html (GEFY_data/), fetched on "
     "2026-11-11 from fill box nsr-fill-1 over plain HTTPS with a browser user agent, one file at a time "
     "(scripts/janis/fill/direct.py)."),
    ("lake/_raw/Nubase-", "2026-11-11",
     "Atomic Mass Data Center tables as mirrored by IAEA, https://www-nds.iaea.org/amdc/, fetched on 2026-11-11 "
     "(nubase2016.txt over plain HTTPS from nsr-fill-1; the others through browser box nsr-fill-wb)."),
]
PUBLISHER = {"JEFF": "OECD Nuclear Energy Agency (JEFF project)", "JEF": "OECD Nuclear Energy Agency (JEF project)",
             "JENDL": "Japan Atomic Energy Agency", "CENDL": "China Nuclear Data Center", "BROND": "IPPE Obninsk",
             "RUSFOND": "IPPE Obninsk", "TENDL": "PSI and NRG (TALYS group)", "IRDF": "IAEA Nuclear Data Section",
             "FENDL": "IAEA Nuclear Data Section", "IAEA": "IAEA Nuclear Data Section", "PADF": "JAEA and IAEA",
             "EAF": "UKAEA (EASY project), distributed by IAEA", "B-VI": "US CSEWG (NNDC)", "GEFY": "K.-H. Schmidt and B. Jurado (GEF)",
             "Nubase": "Atomic Mass Data Center (AMDC)"}


def publisher(rel):
    return next((v for k, v in PUBLISHER.items() if rel.startswith(k)), "the library's evaluating body")


def head(key):
    try:
        h = s3.head_object(Bucket=BUCKET, Key=key)
        return h["ContentLength"], h["ETag"].strip('"'), h.get("Metadata", {}).get("source-url"), h["LastModified"].strftime("%Y-%m-%d")
    except Exception:  # noqa: BLE001
        return None, None, None, None


def sha_index():
    """SHA-256 recorded by the fetchers (mirror.py results, direct.py results), by key."""
    out = {}
    keys = ["lake/_raw/_work/direct-results.jsonl"]
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix="lake/_raw/iaea/_work/box/"):
        keys += [o["Key"] for o in page.get("Contents", []) if o["Key"].endswith("results.jsonl")]
    for k in keys:
        try:
            for ln in s3.get_object(Bucket=BUCKET, Key=k)["Body"].read().decode().splitlines():
                r = json.loads(ln)
                if r.get("sha256"):
                    out[r["key"]] = r["sha256"]
        except Exception:  # noqa: BLE001
            pass
    return out


def write(rel, keys, shas, note=""):
    rows, total, routes = [], 0, set()
    for k in keys:
        k = k.split("#")[0]
        n, etag, url, day = head(k)
        total += n or 0
        for pre, _, text in ROUTES:
            if k.startswith(pre):
                routes.add(text)
        rows.append(f"| `{k}` | {n if n is not None else 'missing'} | {shas.get(k, '')} | {etag or ''} | {url or ''} |")
    body = "\n".join([
        f"# {rel}", "",
        f"Held for brief 70 (elpis-fill, {time.strftime('%Y-%m-%d')}): a library JANIS Web lists that the lake lacked.",
        "", "## Source and route", "", *[f"- {t}" for t in sorted(routes)], "",
        f"## Licence", "",
        f"A public distribution by {publisher(rel)}, free for scientific use; no registration or login was needed. "
        "Cite the library's own reference when using it.", "",
        note, "",
        f"## Files ({len(rows)}, {total:,} bytes)", "",
        "| key | bytes | SHA-256 | S3 ETag | source URL |", "| --- | --- | --- | --- | --- |", *rows, ""])
    s3.put_object(Bucket=BUCKET, Key=f"lake/_raw/{rel}/SOURCE.md", Body=body.encode(), ContentType="text/markdown")
    return len(rows), total


def main():
    shas = sha_index()
    prog = json.loads(s3.get_object(Bucket=BUCKET, Key="lake/_raw/PROGRESS.json")["Body"].read())
    want = sys.argv[1:] or [r["release"] for r in prog["releases"]]
    for rel in want:
        m = json.loads(s3.get_object(Bucket=BUCKET, Key=f"lake/endfb/{rel}/manifest.json")["Body"].read())
        keys = [a["key"] for a in (m.get("source") or {}).get("archives", [])]
        print(rel, *write(rel, keys, shas), flush=True)
    if not sys.argv[1:]:
        for y, f in [("2016", "nubase2016.txt"), ("2012", "nubtab12.asc"), ("2003", "nubtab03.asc"), ("1997", "nubtab97.asc")]:
            if head(f"lake/_raw/Nubase-{y}/{f}")[0]:
                print(f"Nubase-{y}", *write(f"Nubase-{y}", [f"lake/_raw/Nubase-{y}/{f}"], shas,
                                            "Held as the AMDC text table, catalogued and not parsed into tables (brief 70)."))


if __name__ == "__main__":
    main()
