"""Brief 61, Part C: R@1, R@10, MRR and nDCG@10 for base bge-m3, nsr-encoder v1 and v2 on the frozen cross-source
benchmark (by pair type) and on nsr-eval-v1 (KW and EX families). Every model embeds the same texts the same way:
sentence-transformers with CLS pooling, normalized, 256 tokens, fp16; exact dot-product search on the GPU.
  python v2_eval.py <inputs: lake/models/nsr-encoder-v2 copy> <v1 dir> <v2 dir> <out dir>
"""
import json
import math
import os
import sys
import time

import pyarrow.parquet as pq
import torch
from sentence_transformers import SentenceTransformer

IN, V1, V2, OUT = sys.argv[1:5]
os.makedirs(OUT, exist_ok=True)
MODELS = {"bge-m3": "BAAI/bge-m3", "v1": V1, "v2": V2}
MAXLEN, K = 256, 100


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


corpora = {n: pq.read_table(f"{IN}/corpus/{n}.parquet", columns=["id", "text"]).to_pydict() for n in ("papers", "exfor", "records")}
index = {n: {i: j for j, i in enumerate(c["id"])} for n, c in corpora.items()}
bench = [json.loads(l) for l in open(f"{IN}/bench/queries.jsonl")]
v1q = [json.loads(l) for l in open(f"{IN}/nsr-eval-v1/queries.jsonl")]
qrels = {}
for line in open(f"{IN}/nsr-eval-v1/qrels.tsv"):
    parts = line.strip().split("\t")
    if len(parts) >= 2:
        qrels.setdefault(parts[0], set()).add(parts[1])
tasks = []  # (task, group, corpus, query text, relevant positions)
dropped = {}
for r in bench:
    rel = [index[r["corpus"]][i] for i in r["relevant"] if i in index[r["corpus"]]]
    if rel:
        tasks.append(("cross-source", r["type"], r["corpus"], r["query"], rel))
    else:
        dropped[r["type"]] = dropped.get(r["type"], 0) + 1
for r in v1q:
    rel = [index["papers"][k] for k in qrels.get(r["qid"], ()) if k in index["papers"]]
    if rel:
        tasks.append(("nsr-eval-v1", r["family"], "papers", r["text"], rel))
    else:
        dropped["nsr-eval-v1:" + r["family"]] = dropped.get("nsr-eval-v1:" + r["family"], 0) + 1
log("tasks", len(tasks), "dropped (no relevant document in the corpus)", dropped)


def metrics(ranks, n_rel):
    """ranks: positions (0-based) of relevant documents within the top K."""
    first = min(ranks) if ranks else None
    dcg = sum(1 / math.log2(p + 2) for p in ranks if p < 10)
    idcg = sum(1 / math.log2(p + 2) for p in range(min(n_rel, 10)))
    return {"r1": 1.0 if first == 0 else 0.0, "r10": 1.0 if first is not None and first < 10 else 0.0,
            "mrr": 1 / (first + 1) if first is not None else 0.0, "ndcg10": dcg / idcg if idcg else 0.0}


results, timing = {}, {}
for name, path in MODELS.items():
    t0 = time.time()
    m = SentenceTransformer(path, device="cuda")
    m.max_seq_length = MAXLEN
    m.half()
    emb = {}
    for cname, c in corpora.items():
        t = time.time()
        emb[cname] = m.encode(c["text"], batch_size=256, normalize_embeddings=True, convert_to_tensor=True,
                              show_progress_bar=False)
        log(name, cname, len(c["text"]), f"{time.time() - t:.0f}s")
        if name == "v2" and cname == "papers":  # kept for serving (Part D): the search Lambda's vectors, in corpus order
            import numpy as np
            np.save(f"{OUT}/v2-papers.f16.npy", emb[cname].cpu().numpy().astype(np.float16))
            json.dump(c["id"], open(f"{OUT}/v2-papers.ids.json", "w"))
    qe = m.encode([t[3] for t in tasks], batch_size=256, normalize_embeddings=True, convert_to_tensor=True,
                  show_progress_bar=False)
    acc = {}
    for start in range(0, len(tasks), 512):
        chunk = list(range(start, min(start + 512, len(tasks))))
        for cname in corpora:
            idx = [i for i in chunk if tasks[i][2] == cname]
            if not idx:
                continue
            top = torch.topk(qe[idx] @ emb[cname].T, K, dim=1).indices.cpu().tolist()
            for i, row in zip(idx, top):
                task, group, _, _, rel = tasks[i]
                rs = set(rel)
                ranks = [p for p, d in enumerate(row) if d in rs]
                mt = metrics(ranks, len(rel))
                for key in ((task, group), (task, "all")):
                    a = acc.setdefault(key, {"n": 0, "r1": 0.0, "r10": 0.0, "mrr": 0.0, "ndcg10": 0.0})
                    a["n"] += 1
                    for k2 in ("r1", "r10", "mrr", "ndcg10"):
                        a[k2] += mt[k2]
    results[name] = {f"{t}|{g}": {"n": a["n"], **{k2: round(a[k2] / a["n"], 4) for k2 in ("r1", "r10", "mrr", "ndcg10")}}
                     for (t, g), a in sorted(acc.items())}
    timing[name] = round(time.time() - t0)
    log(name, json.dumps(results[name]))
    del m, emb, qe
    torch.cuda.empty_cache()

json.dump({"results": results, "seconds_per_model": timing, "dropped": dropped, "max_tokens": MAXLEN,
           "models": {k: str(v) for k, v in MODELS.items()}}, open(f"{OUT}/results.json", "w"), indent=1)
keys = sorted({k for r in results.values() for k in r})
lines = ["| Task | Group | n | " + " | ".join(f"{m} R@10 / MRR" for m in MODELS) + " |",
         "| --- | --- | ---: | " + " | ".join("---" for _ in MODELS) + " |"]
for k in keys:
    t, g = k.split("|")
    n = next(r[k]["n"] for r in results.values() if k in r)
    lines.append(f"| {t} | {g} | {n:,} | " + " | ".join(
        f"{results[m][k]['r10']:.3f} / {results[m][k]['mrr']:.3f}" if k in results[m] else "—" for m in MODELS) + " |")
open(f"{OUT}/results.md", "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
