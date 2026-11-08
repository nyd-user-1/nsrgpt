# Index pass (brief 20, step 1): every record nds.iaea.org/records lists, through real Chrome on one proxy line.
# Reads  GET /api/records?size=100&page=N&sort=newest (following links.next), then GET /api/records/{id} for any record
#        whose list entry lacks files.entries.
# Writes raw/iaea-records/2026-11-08/_index/pages/NNNN.json (each list page as served),
#        raw/iaea-records/2026-11-08/_index/records.jsonl (one record per line, the API's JSON),
#        raw/iaea-records/2026-11-08/_work/index/status.json and log.txt.
#   xvfb-run -a /opt/pw/bin/python index.py <line>[,<line>...]
import json, sys, time
from rec import *

LOG, OUT = [], f"{W}/index"


def log(m):
    LOG.append(f"{time.strftime('%H:%M:%S')} {m}")
    print(LOG[-1], flush=True)


def status(**kw):
    put_json(f"{OUT}/status.json", dict(kw, metered=metered(), at=time.strftime("%H:%M:%S")))
    put(f"{OUT}/log.txt", "\n".join(LOG).encode(), "text/plain")


def get_api(br, url):
    for attempt in range(5):
        r = br.get(url)
        if r.get("status") == 200 and "body" in r:
            return json.loads(r["body"])
        log(f"http {r.get('status')} on {url}: {(r.get('body') or b'')[:200]!r}")
        time.sleep(10 * (attempt + 1))
        if r.get("status") in (403, 503):
            br.rewarm()
    raise IOError(f"gave up on {url}")


br = Browser([int(x) for x in sys.argv[1].split(",")], log=log)
url = "https://nds.iaea.org/api/records?size=100&page=1&sort=newest"
recs, order, n, total = {}, [], 0, None
while url:
    d = get_api(br, url)
    n += 1
    put(f"{P}/_index/pages/{n:04d}.json", json.dumps(d, ensure_ascii=False).encode(), "application/json")
    total = d["hits"]["total"]
    if n == 1:
        log(f"hits.total {total}")
        if total > 10000:
            raise SystemExit("over 10,000 records: the API's page window needs splitting by date")
    for h in d["hits"]["hits"]:
        if h["id"] not in recs:
            order.append(h["id"])
        recs[h["id"]] = h
    url = (d.get("links") or {}).get("next")
    if n % 5 == 0:
        status(pages=n, records=len(recs), total=total)
log(f"{n} pages, {len(recs)} records of {total}")

# a list entry without files.entries (files enabled, count > 0): take the record itself
thin = [i for i in order if (recs[i].get("files") or {}).get("enabled") and (recs[i]["files"].get("count") or 0) > 0
        and not recs[i]["files"].get("entries")]
log(f"{len(thin)} records lack files.entries in the list; reading them one by one")
for k, i in enumerate(thin, 1):
    recs[i] = get_api(br, f"https://nds.iaea.org/api/records/{i}")
    if k % 50 == 0:
        status(pages=n, records=len(recs), total=total, full_reads=k, of=len(thin))
put_lines(f"{P}/_index/records.jsonl", [recs[i] for i in order])
status(pages=n, records=len(recs), total=total, full_reads=len(thin), done=True, line=br.line)
br.close()
