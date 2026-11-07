"""The search service's data (2026-11-07): the 277,068 NSR-CPT vectors as one float16 matrix,
L2-normalized, and each row's paper (key number, title, year, DOI) in the same order.

Inputs, from the New account's lake (s3://nsr-lake-613473203863):
  <emb dir>   the parquet parts of lake/nsr-database/2026-10-15/nsr/public.nsr_embeddings_nsr/1/
  <meta.csv>  Athena: SELECT e.key_number, n.title, n.pub_year, n.doi FROM nsr_embeddings_nsr e
              LEFT JOIN nsr_parquet n ON n.key_number = e.key_number

  python3 services/nsr-search/build_artifacts.py <emb dir> <meta.csv> <out dir>
Writes vectors.f16.npy and meta.json.gz; copy both to s3://nsr-lake-613473203863/work/search/v1/
and to the dataset NYSgpt/nsr-search-artifacts.
"""
import csv, glob, gzip, json, os, sys

import numpy as np
import pyarrow.parquet as pq

emb_dir, meta_csv, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)

keys, chunks = [], []
for path in sorted(glob.glob(os.path.join(emb_dir, "*.parquet"))):
    f = pq.ParquetFile(path)
    for g in range(f.num_row_groups):
        t = f.read_row_group(g, columns=["key_number", "embedding"])
        ks = t.column("key_number").to_pylist()
        es = t.column("embedding").to_pylist()
        m = np.empty((len(es), 1024), dtype=np.float32)
        for i, e in enumerate(es):
            m[i] = np.array(e.strip("[]").split(","), dtype=np.float32)
        m /= np.linalg.norm(m, axis=1, keepdims=True)
        keys.extend(ks)
        chunks.append(m.astype(np.float16))
vectors = np.concatenate(chunks)
np.save(os.path.join(out, "vectors.f16.npy"), vectors)

meta = {}
with open(meta_csv, newline="") as fh:
    for row in csv.DictReader(fh):
        y = row.get("pub_year") or ""
        meta[row["key_number"]] = (row.get("title") or "", int(y) if y.isdigit() else None, row.get("doi") or None)
cols = {"key_number": keys, "title": [], "year": [], "doi": []}
for k in keys:
    t, y, d = meta.get(k, ("", None, None))
    cols["title"].append(t); cols["year"].append(y); cols["doi"].append(d)
with gzip.open(os.path.join(out, "meta.json.gz"), "wt") as fh:
    json.dump(cols, fh)
print(f"{vectors.shape[0]} vectors {vectors.shape[1]}d, {sum(1 for t in cols['title'] if t)} with titles")
