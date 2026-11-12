"""Brief 77 step 15: JANIS Web's own Tabler for series on its book pages (computed series open only inside their page),
the reference for the engine's computed series. Per page: JANIS Web's home (its session cookie), the book page
(/janisweb/book/<label>/<mat>/MT<mt>, which redirects to its renderer), then per series toogleProducer.json with
producerId janis-render-T-<series ref> (the Tabler's viewer) and <renderer>/tabler/<viewer>/csv (the whole table).
An uncached book page takes JANIS 25 to 100 s and Cloudflare answers 504 at 60 s; the page is asked again after 30 s.
One request a second. Writes <out>/<slug>.csv per series and <out>/index.tsv.

  python3 web_tabler.py <out dir> <spec file: "<label>|<mat>|<mt>|<series ref>" a line>
"""
import http.cookiejar, json, os, re, sys, time, urllib.parse, urllib.request

SITE = "https://www.oecd-nea.org"
UA = "Mozilla/5.0 (NSRgpt research; one request a second)"
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
last = [0.0]


def get(path, params=None, tries=6):
    url = SITE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    for k in range(tries):
        wait = 1.0 - (time.time() - last[0])
        if wait > 0:
            time.sleep(wait)
        last[0] = time.time()
        try:
            with op.open(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120) as r:
                return r.geturl(), r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            if k == tries - 1:
                raise
            time.sleep(30 if "50" in str(e) or "timed out" in str(e) else 5)


def main():
    out, spec = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    get("/janisweb/")
    rows, renderer = [], {}
    for i, line in enumerate(l.strip() for l in open(spec) if l.strip()):
        label, mat, mt, ref = line.split("|", 3)
        try:
            key = (label, mat, mt)
            if key not in renderer:
                url, _ = get(f"/janisweb/book/{label}/{mat}/MT{mt}")
                renderer[key] = re.search(r"/renderer/(\d+)", url).group(1)
            rid = renderer[key]
            _, js = get(f"/janisweb/renderer/{rid}/toogleProducer.json",
                        {"rendererId": rid, "show": "true", "producerId": f"janis-render-T-{ref}", "width": 900, "height": 600})
            viewer = re.search(r'"(t\d+)"', js).group(1)
            _, csv = get(f"/janisweb/renderer/{rid}/tabler/{viewer}/csv")
            open(os.path.join(out, f"{i}.csv"), "w").write(csv)
            rows.append(f"{i}\t{line}\tok")
        except Exception as e:  # noqa: BLE001
            rows.append(f"{i}\t{line}\terror {e}")
        print(rows[-1], flush=True)
    open(os.path.join(out, "index.tsv"), "w").write("\n".join(rows) + "\n")


if __name__ == "__main__":
    main()
