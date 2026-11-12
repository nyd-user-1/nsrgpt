"""Brief 77 step 9 check: the pages JANIS's book generator made on the box against JANIS Web's own book rails (crawled
page by page from oecd-nea.org/janisweb/book by brief 69's lanes into the old index files, public/elpis/book-<p>.json
`j` fields, kept at lake/janis/engine/compare/web-rails/book-<p>.json). Per book: pages in both, only in the engine's book,
only in JANIS Web's, nuclides likewise, and whether the shared pages come in the same order.
Writes lake/janis/engine/compare/rails.json.

  python3 compare_rails.py /data/janis/export     # <letter>/items.tsv per book
"""
import json, os, sys

import boto3

sys.path.insert(0, "/opt/engine")
from pages import nuclide_of  # noqa: E402

B = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")


def main():
    root = sys.argv[1]
    out = {}
    for p in "ngpdtha":
        items = os.path.join(root, p, "items.tsv")
        if not os.path.exists(items):
            continue
        ours = []
        for line in open(items):
            mat, reac = line.rstrip("\n").split("\t")
            ours.append((nuclide_of(mat), int(reac.replace("MT", ""))))
        web_idx = json.loads(s3.get_object(Bucket=B, Key=f"lake/janis/engine/compare/web-rails/book-{p}.json")["Body"].read())
        web = []
        for n in web_idx["nuclides"]:
            for mt in (n.get("j") or "").split():
                web.append((n["l"], int(mt)))
        so, sw = set(ours), set(web)
        shared_o = [x for x in ours if x in sw]
        shared_w = [x for x in web if x in so]
        out[p] = {
            "engine_pages": len(ours), "web_pages": len(web), "both": len(so & sw),
            "engine_only": sorted(so - sw), "web_only": sorted(sw - so),
            "engine_nuclides": len({n for n, _ in ours}), "web_nuclides": len({n for n, _ in web}),
            "same_order": shared_o == shared_w,
        }
        print(p, {k: (v if not isinstance(v, list) else len(v)) for k, v in out[p].items()})
    s3.put_object(Bucket=B, Key="lake/janis/engine/compare/rails.json", Body=json.dumps(out, indent=1).encode())


if __name__ == "__main__":
    main()
