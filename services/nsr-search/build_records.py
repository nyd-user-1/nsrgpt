"""The search service's records (2026-11-07), packed flat so the Lambda (3,008 MB) holds them as two
byte strings instead of millions of objects:

  records.jsonl.gz  one JSON card per record (id, key_number, pub_year, reference, authors, title, doi,
                    exfor_keys, keywords, nuclides, reactions, subjects, topics, reference_type,
                    citation_count, venue, is_open_access, open_access_pdf_url)
  search.txt.gz     the same records' lowercase search text, one line each: title, a tab, then keywords,
                    authors, reference, nuclides and reactions
  vec_index.npy     for each row of vectors.f16.npy, the record line it belongs to

Inputs: the gzipped JSON lines of an Athena UNLOAD of the nsr view (those columns), and meta.json.gz
from build_artifacts.py for the vectors' key order.

  python3 services/nsr-search/build_records.py <unload dir> <meta.json.gz> <out dir>
Copy the three files to s3://nsr-lake-613473203863/work/search/v1/.
"""
import glob, gzip, json, os, sys

import numpy as np

src, meta_path, out = sys.argv[1:4]
COLS = ["id", "key_number", "pub_year", "reference", "authors", "title", "doi", "exfor_keys", "keywords", "nuclides", "reactions",
        "subjects", "topics", "reference_type", "citation_count", "venue", "is_open_access", "open_access_pdf_url"]
clean = lambda s: (s or "").replace("\n", " ").replace("\t", " ")
row_of = {}
with gzip.open(os.path.join(out, "records.jsonl.gz"), "wt") as rec, gzip.open(os.path.join(out, "search.txt.gz"), "wt") as txt:
    n = 0
    for path in sorted(glob.glob(os.path.join(src, "*.gz"))):
        with gzip.open(path, "rt") as fh:
            for line in fh:
                r = json.loads(line)
                card = {c: r.get(c) for c in COLS}
                rec.write(json.dumps(card, separators=(",", ":")) + "\n")
                rest = " ".join([clean(card["keywords"]), clean(card["authors"]), clean(card["reference"]),
                                 " ".join(card["nuclides"] or []), " ".join(card["reactions"] or [])])
                txt.write((clean(card["title"]) + "\t" + rest).lower() + "\n")
                row_of[card["key_number"]] = n
                n += 1
with gzip.open(meta_path, "rt") as fh:
    vec_keys = json.load(fh)["key_number"]
np.save(os.path.join(out, "vec_index.npy"), np.array([row_of.get(k, -1) for k in vec_keys], dtype=np.int32))
print(f"{n} records, {sum(1 for k in vec_keys if k in row_of)} of {len(vec_keys)} vectors matched")
