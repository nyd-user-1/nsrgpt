"""JANIS Web's own tabulated values (its Tabler, "original values") for book pages, the reference for brief 74's B1.
Runs on a box (python3 with boto3), never on the Mac; one request a second.

  janis_tabler.py "ENDF/B-VIII.0|U235|18" "JEFF-3.3|Fe56|102" ...

Per page: the home page first (its session cookie, brief 72 trap 7b); /janisweb/renderer?root=~N~<lib>~SIG~<nuc>~MT<mt>
redirects to /janisweb/renderer/<id>; /janisweb/renderer/<id>/toogleProducer.json with producerId
janis-render-T-<root>~xs opens the Tabler and names its viewer (t0); /janisweb/renderer/<id>/tabler/<viewer>?pg=<n> is
an HTML table of 500 rows a page (incident energy in eV, cross section in barns, 7 significant digits). Every page is
kept at lake/_work/parse/endfb/recon/janis/pages/<slug>/p<n>.html, the values at lake/_work/parse/endfb/recon/janis/<slug>.json.
"""
import http.cookiejar
import json
import re
import sys
import time
import urllib.parse
import urllib.request

import boto3

SITE = "https://www.oecd-nea.org"
UA = "Mozilla/5.0 (NSRgpt research; one request a second)"
B, REGION, OUT = "nsr-lake-613473203863", "us-east-2", "lake/_work/parse/endfb/recon/janis"
s3 = boto3.client("s3", region_name=REGION)
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
last = [0.0]
ROW = re.compile(r"<tr><td>([^<]*)</td><td>([^<]*)</td></tr>")


def get(path, params=None):
    wait = 1.0 - (time.time() - last[0])
    if wait > 0:
        time.sleep(wait)
    url = SITE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    for attempt in range(4):
        try:
            last[0] = time.time()
            with op.open(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90) as r:
                return r.geturl(), r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print("retry", url, e, flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"failed {url}")


def page(lib, nuc, mt):
    root = f"~N~{lib}~SIG~{nuc}~MT{mt}"
    slug = f"{lib.replace('/', '_')}__{nuc}__MT{mt}"
    final, _ = get("/janisweb/renderer", {"root": root})
    rid = final.rstrip("/").rsplit("/", 1)[-1]
    if not rid.isdigit():
        raise RuntimeError(f"no renderer id for {root}: {final}")
    _, js = get(f"/janisweb/renderer/{rid}/toogleProducer.json",
                {"rendererId": rid, "show": "true", "producerId": f"janis-render-T-{root}~xs", "width": 800, "height": 600})
    card = json.loads(js)
    vk = card["viewerKey"]
    e, x, n_pages, pg = [], [], 1, 1
    while pg <= n_pages:
        _, html = get(f"/janisweb/renderer/{rid}/tabler/{vk}", {"pg": pg} if pg > 1 else None)
        s3.put_object(Bucket=B, Key=f"{OUT}/pages/{slug}/p{pg}.html", Body=html.encode())
        n_pages = max([n_pages] + [int(p) for p in re.findall(r"pg=(\d+)", html)])
        for a, b in ROW.findall(html):
            try:
                e.append(float(a))
                x.append(float(b))
            except ValueError:
                pass
        pg += 1
    doc = {"library": lib, "nuclide": nuc, "mt": mt, "root": root, "renderer": rid, "viewer": vk,
           "card": card.get("viewerCardWeb"), "pages": n_pages, "rows": len(e), "energy_ev": e, "xs_barn": x,
           "fetched": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "source": f"{SITE}/janisweb/renderer?root={root}"}
    if not e:
        raise RuntimeError(f"no rows for {root}")
    s3.put_object(Bucket=B, Key=f"{OUT}/{slug}.json", Body=json.dumps(doc).encode(), ContentType="application/json")
    print(json.dumps({"page": root, "pages": n_pages, "rows": len(e)}), flush=True)


if __name__ == "__main__":
    get("/janisweb/")
    for c in sys.argv[1:]:
        lib, nuc, mt = c.split("|")
        try:
            page(lib, nuc, int(mt))
        except Exception as ex:  # noqa: BLE001
            print(json.dumps({"page": c, "error": str(ex)}), flush=True)
