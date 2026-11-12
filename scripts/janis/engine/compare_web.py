"""Brief 77 step 15 (structure): the pages JANIS's engine made on the box against JANIS Web's own saved state for the same
page (lane C saved 754 of them with saveState.xml: lake/_work/janis/book/<label>/<NNNNN>.{xml,json}). Per page: the series
refs in drawing order, and per series the legend text, colour, mark and stroke; the axis ranges; the chart title.
Writes lake/janis/engine/compare/web-structure.json (counts and every difference).

  python3 compare_web.py /data/janis/book
"""
import json, os, sys, xml.etree.ElementTree as ET

import boto3

B = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")


def state(xml_text):
    root = ET.fromstring(xml_text)
    plot = root.find(".//plot")
    t = plot.find("settings/strings/title")
    series = []
    for d in plot.findall("data"):
        layer = d.find("layer")
        series.append({"ref": d.get("refs"), "title": d.findtext("title") or "",
                       "color": layer.findtext("color") if layer is not None else None,
                       "mark": layer.findtext("mark") if layer is not None else None,
                       "stroke": layer.findtext("stroke") if layer is not None else None,
                       "xerr": layer.findtext("showXErrors") if layer is not None else None,
                       "yerr": layer.findtext("showYErrors") if layer is not None else None})
    return {"title": t.get("manualText") if t is not None else None,
            "xrange": [plot.find("xrange").get("min"), plot.find("xrange").get("max")],
            "yrange": [plot.find("yrange").get("min"), plot.find("yrange").get("max")],
            "xscale": plot.findtext("xscale"), "yscale": plot.findtext("yscale"), "series": series}


def main():
    bookdir = sys.argv[1]
    ours = {}
    for d in os.listdir(bookdir):
        for f in os.listdir(os.path.join(bookdir, d)):
            if f.endswith(".jns"):
                label, _, rest = f[5:-4].partition("-")
                dt, _, rest = rest.partition("-")
                mat, _, reac = rest.rpartition("-")
                ours[(label, mat, reac)] = os.path.join(bookdir, d, f)
    pages, missing, same_order, diffs = 0, [], 0, []
    counts = {"pages": 0, "series_web": 0, "series_ours": 0, "order_equal": 0, "title_equal": 0, "xrange_equal": 0,
              "yrange_equal": 0, "series_props_equal": 0, "series_compared": 0, "errorbar_only_diffs": 0}
    pg = s3.get_paginator("list_objects_v2")
    for page in pg.paginate(Bucket=B, Prefix="lake/_work/janis/book/"):
        for o in page.get("Contents", []):
            k = o["Key"]
            if not k.endswith(".xml"):
                continue
            meta = json.loads(s3.get_object(Bucket=B, Key=k[:-4] + ".json")["Body"].read())
            web = state(s3.get_object(Bucket=B, Key=k)["Body"].read())
            key = (meta["book"], meta["mat"], meta["reac"])
            counts["pages"] += 1
            if key not in ours:
                missing.append(key)
                continue
            mine = state(open(ours[key], "rb").read())
            counts["series_web"] += len(web["series"])
            counts["series_ours"] += len(mine["series"])
            d = {"page": list(key)}
            wr, mr = [s["ref"] for s in web["series"]], [s["ref"] for s in mine["series"]]
            if wr == mr:
                counts["order_equal"] += 1
            else:
                d["order"] = {"web_only": [r for r in wr if r not in mr], "ours_only": [r for r in mr if r not in wr],
                              "same_set": sorted(wr) == sorted(mr)}
            for f in ("title", "xrange", "yrange"):
                if web[f] == mine[f]:
                    counts[f + "_equal"] += 1
                else:
                    d[f] = {"web": web[f], "ours": mine[f]}
            mm = {s["ref"]: s for s in mine["series"]}
            props = []
            for s in web["series"]:
                m = mm.get(s["ref"])
                if not m:
                    continue
                counts["series_compared"] += 1
                pd = {f: (s[f], m[f]) for f in ("title", "color", "mark", "stroke") if s[f] != m[f]}
                if not pd:
                    counts["series_props_equal"] += 1
                else:
                    props.append({"ref": s["ref"], **{f: {"web": a, "ours": b} for f, (a, b) in pd.items()}})
            if props:
                d["series"] = props
            if len(d) > 1:
                diffs.append(d)
    out = {"counts": counts, "missing_in_ours": [list(m) for m in missing], "differences": diffs}
    s3.put_object(Bucket=B, Key="lake/janis/engine/compare/web-structure.json", Body=json.dumps(out, indent=1).encode())
    print(json.dumps({"counts": counts, "missing": len(missing), "pages_with_differences": len(diffs)}))


if __name__ == "__main__":
    main()
