"""Brief 73 (A1): what the Wayback Machine holds of IAEA's TENDL folders, and the pull list for wbget.py.

For each year, the CDX rows from cdx.py (lake/_work/fill/a73/cdx/tendl-<year>.txt, status 200 only, one capture per
URL) are split into per-material files (TENDL-<year>/<sub>/<file>) and folder listings. The expected file list of a
folder is IAEA's own listing page as the Wayback Machine last captured it (every capture of the folder is read and the
union of its file links kept, since IAEA's listings changed little and an older capture may list a file a later one
drops). Writes lake/_work/fill/a73/tendl/plan.json (per year and folder: expected, held in Wayback, missing names,
bytes) and lake/_work/fill/a73/tendl/pull-<year>.json ({"files": [...]}, wbget.py's input), keys under
lake/_raw/iaea/public/download-endf/TENDL-<year>/<sub>/ so fill.sh's <prefix>/*#<token> words read them.

  python tendl_plan.py 2019 2017 …
  python tendl_plan.py --no-listing 2012 2014   # the pull lists from the CDX rows alone (listings checked on a later run)
"""
import json
import re
import sys
import time
import urllib.request

import boto3

B = "nsr-lake-613473203863"
W = "lake/_work/fill/a73"
RAW = "lake/_raw/iaea/public/download-endf"
UA = "Mozilla/5.0 (X11; Linux x86_64) nsrgpt-archive-fetch"
s3 = boto3.client("s3", region_name="us-east-2")
HREF = re.compile(r'href="([^"?/][^"/]*\.(?:zip|tgz|gz|tar|dat|endf|txt|lst))"', re.I)


def get(url):
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120) as r:
                return r.read().decode("latin-1")
        except Exception as e:  # noqa: BLE001
            print("  retry", attempt + 1, url[-90:], str(e)[:60], flush=True)
            time.sleep(10 * (attempt + 1))
    return None


def all_captures(url):
    """Every 200 capture timestamp of one URL (the folder listing)."""
    q = f"http://web.archive.org/cdx/search/cdx?url={url}&fl=timestamp&filter=statuscode:200"
    body = get(q) or ""
    return [t for t in body.split() if t.isdigit()]


def main():
    plan = {}
    try:
        plan = json.loads(s3.get_object(Bucket=B, Key=f"{W}/tendl/plan.json")["Body"].read())
    except Exception:  # noqa: BLE001
        pass
    nolist = "--no-listing" in sys.argv
    for year in [a for a in sys.argv[1:] if not a.startswith("--")]:
        rows = s3.get_object(Bucket=B, Key=f"{W}/cdx/tendl-{year}.txt")["Body"].read().decode().splitlines()
        files, listings = {}, {}
        for ln in rows:
            p = ln.split(" ")
            url, ts, length = p[0], p[1], p[2]
            m = re.match(rf"https?://www-nds\.iaea\.org(?::80)?/public/download-endf/TENDL-{year}/(.+)$", url)
            if not m:
                continue
            rest = m.group(1)
            parts = rest.split("/")
            if len(parts) == 2 and parts[1] == "":
                listings[parts[0]] = url
            elif len(parts) == 2 and HREF.match(f'href="{parts[1]}"'):
                files.setdefault(parts[0], {})[parts[1]] = (url, ts, int(length) if length.lstrip("-").isdigit() else 0)
        out, pull = {}, []
        for sub in sorted(set(files) | set(listings)):
            expected = set()
            lurl = listings.get(sub) or f"https://www-nds.iaea.org/public/download-endf/TENDL-{year}/{sub}/"
            for ts in ([] if nolist else all_captures(lurl.split("://", 1)[1])[-4:]):
                page = get(f"https://web.archive.org/web/{ts}id_/{lurl}")
                if page:
                    expected |= set(HREF.findall(page))
                time.sleep(1)
            if nolist:
                expected = set((plan.get(year, {}).get(sub) or {}).get("listed", []))
            held = files.get(sub, {})
            missing = sorted(expected - set(held))
            out[sub] = {"listed": sorted(expected) if not nolist else (plan.get(year, {}).get(sub) or {}).get("listed", []),
                        "expected": len(expected), "wayback": len(held), "wayback_listed": len(set(held) & expected),
                        "missing": missing[:400], "missing_count": len(missing),
                        "bytes": sum(v[2] for v in held.values())}
            for name, (url, ts, _) in sorted(held.items()):
                pull.append({"url": f"https://web.archive.org/web/{ts}id_/{url}", "key": f"{RAW}/TENDL-{year}/{sub}/{name}",
                             "original": url, "snapshot": ts})
            print(year, sub, out[sub]["expected"], out[sub]["wayback"], out[sub]["missing_count"], round(out[sub]["bytes"] / 1e9, 2), "GB", flush=True)
        plan[year] = out
        s3.put_object(Bucket=B, Key=f"{W}/tendl/pull-{year}.json", Body=json.dumps({"files": pull}).encode())
        s3.put_object(Bucket=B, Key=f"{W}/tendl/plan.json", Body=json.dumps(plan, indent=1).encode())


if __name__ == "__main__":
    main()
