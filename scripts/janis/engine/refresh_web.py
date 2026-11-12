"""Brief 77 step 15: JANIS Web's saved state fetched again, now, for the pages where lane C's copy differs from the
engine's page (lake/janis/engine/compare/web-structure.json), into lake/janis/engine/compare/web-fresh/<label>/<mat>-<reac>.xml,
then the same comparison as compare_web.py on those pages. Lane C's early copies were fetched while JANIS Web was still
computing pages. One request a second; an uncached page is asked again after 30 s.

  python3 refresh_web.py /data/janis/jns-all
"""
import http.cookiejar, json, os, sys, time, urllib.request

import boto3

sys.path.insert(0, "/opt/engine")
from compare_web import state  # noqa: E402

B = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
H = {"User-Agent": "Mozilla/5.0 (NSRgpt research; one request a second)"}
DT = {"neutrons": "N", "gammas": "G", "protons": "P", "deuterons": "D", "tritons": "T", "he3": "HE3", "alphas": "A"}
LETTER = {"neutrons": "n", "gammas": "g", "protons": "p", "deuterons": "d", "tritons": "t", "he3": "h", "alphas": "a"}


def get(u):
    for k in range(6):
        try:
            time.sleep(1)
            with op.open(urllib.request.Request("https://www.oecd-nea.org" + u, headers=H), timeout=120) as r:
                return r.geturl(), r.read().decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            time.sleep(30)
    return None, None


def main():
    jns = sys.argv[1]
    old = json.loads(s3.get_object(Bucket=B, Key="lake/janis/engine/compare/web-structure.json")["Body"].read())
    get("/janisweb/")
    out = {"pages": 0, "unreadable": 0, "order_equal": 0, "series_set_equal": 0, "props_equal": 0, "series": 0, "title_equal": 0, "differences": []}
    for d in old["differences"]:
        label, mat, reac = d["page"]
        url, _ = get(f"/janisweb/book/{label}/{mat}/{reac}")
        if not url:
            out["unreadable"] += 1
            continue
        _, x = get(url.split("oecd-nea.org")[1] + "/saveState.xml")
        web = state(x) if x else None
        if web is None:
            out["unreadable"] += 1
            continue
        s3.put_object(Bucket=B, Key=f"lake/janis/engine/compare/web-fresh/{label}/{mat}-{reac}.xml", Body=x.encode())
        mine = state(open(os.path.join(jns, LETTER[label], f"book-{label}-{DT[label]}-{mat}-{reac}.jns"), "rb").read())
        out["pages"] += 1
        wr, mr = [s["ref"] for s in web["series"]], [s["ref"] for s in mine["series"]]
        out["order_equal"] += wr == mr
        out["series_set_equal"] += sorted(wr) == sorted(mr)
        out["title_equal"] += web["title"] == mine["title"]
        mm = {s["ref"]: s for s in mine["series"]}
        bad = []
        for s in web["series"]:
            m = mm.get(s["ref"])
            if not m:
                continue
            out["series"] += 1
            if all(s[f] == m[f] for f in ("title", "color", "mark", "stroke")):
                out["props_equal"] += 1
            else:
                bad.append({"ref": s["ref"], **{f: [s[f], m[f]] for f in ("title", "color", "mark", "stroke") if s[f] != m[f]}})
        if wr != mr or bad:
            out["differences"].append({"page": d["page"], "web_only": [r for r in wr if r not in mr], "ours_only": [r for r in mr if r not in wr],
                                       "same_set": sorted(wr) == sorted(mr), "series": bad[:5]})
        print(label, mat, reac, wr == mr, len(bad), flush=True)
    s3.put_object(Bucket=B, Key="lake/janis/engine/compare/web-fresh.json", Body=json.dumps(out, indent=1).encode())
    print(json.dumps({k: v for k, v in out.items() if k != "differences"}), len(out["differences"]))


if __name__ == "__main__":
    main()
