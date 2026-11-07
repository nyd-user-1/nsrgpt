"""NSR paper search (2026-11-07): the NSR-CPT encoder (ONNX, int8) over the 277,068 NSR-CPT vectors,
a keyword match over all 303,568 records, and the two fused (hybrid). Runs on AWS Lambda
(lambda_function.py), which caps memory at 3,008 MB here, so the records stay as two flat byte strings
and the vectors as one float32 matrix. Data in s3://nsr-lake-613473203863/work/search/v1/:
vectors.f16.npy (build_artifacts.py); records.jsonl.gz, search.txt.gz, vec_index.npy (build_records.py);
encoder/ (export.py).
"""
import gzip, json, os, re, time

import boto3
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

BUCKET = "nsr-lake-613473203863"
PREFIX = "work/search/v1/"
FILES = ["vectors.f16.npy", "vec_index.npy", "records.jsonl.gz", "search.txt.gz", "encoder/model.onnx", "encoder/tokenizer.json"]
RRF_K = 60


def fetch(dest: str, s3=None) -> None:
    """Copies the search data from S3 to dest, skipping files already there."""
    s3 = s3 or boto3.client("s3", region_name="us-east-2")
    for f in FILES:
        path = os.path.join(dest, f)
        if not os.path.exists(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            s3.download_file(BUCKET, PREFIX + f, path)


def _lines(path: str):
    """A gzipped text file as one byte string, with each line's start offset."""
    with gzip.open(path, "rb") as fh:
        blob = fh.read()
    starts = np.concatenate(([0], np.flatnonzero(np.frombuffer(blob, dtype=np.uint8) == 10) + 1)).astype(np.int64)
    return blob, starts


class NsrSearch:
    def __init__(self, art: str):
        t0 = time.time()
        self.tok = Tokenizer.from_file(os.path.join(art, "encoder/tokenizer.json"))
        self.tok.enable_truncation(max_length=128)  # queries were 128 tokens in training
        so = ort.SessionOptions()
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        so.intra_op_num_threads = os.cpu_count() or 1
        self.sess = ort.InferenceSession(os.path.join(art, "encoder/model.onnx"), so, providers=["CPUExecutionProvider"])
        self.inputs = {i.name for i in self.sess.get_inputs()}
        self.rec, self.rec_at = _lines(os.path.join(art, "records.jsonl.gz"))
        self.txt, self.txt_at = _lines(os.path.join(art, "search.txt.gz"))
        self.n = len(self.rec_at) - 1
        self.vec_index = np.load(os.path.join(art, "vec_index.npy"))
        self.vec_of = np.full(self.n, -1, dtype=np.int32)  # record line → vector row
        ok = self.vec_index >= 0
        self.vec_of[self.vec_index[ok]] = np.flatnonzero(ok)
        # float32 for BLAS speed, filled a block at a time from the float16 file (no second full copy).
        f16 = np.load(os.path.join(art, "vectors.f16.npy"), mmap_mode="r")
        self.vecs = np.empty(f16.shape, dtype=np.float32)
        for s in range(0, len(f16), 32768):
            self.vecs[s:s + 32768] = f16[s:s + 32768]
        del f16
        self.keys = None  # key number → record line, built on first #KEY or similar call
        self.load_s = round(time.time() - t0, 2)

    def record(self, i: int) -> dict:
        return json.loads(self.rec[self.rec_at[i]:self.rec_at[i + 1]])

    def line(self, i: int) -> bytes:
        return self.txt[self.txt_at[i]:self.txt_at[i + 1]]

    def row_of(self, key: str):
        if self.keys is None:
            self.keys = {self.record(i)["key_number"]: i for i in range(self.n)}
        return self.keys.get(key.strip().upper())

    def embed(self, q: str) -> np.ndarray:
        enc = self.tok.encode(q)
        ids = np.array([enc.ids], dtype=np.int64)
        feed = {"input_ids": ids, "attention_mask": np.array([enc.attention_mask], dtype=np.int64)}
        if "token_type_ids" in self.inputs:
            feed["token_type_ids"] = np.zeros_like(ids)
        h = self.sess.run(["last_hidden_state"], feed)[0][0, 0].astype(np.float32)  # the CLS token, as bge-m3 pools
        return h / np.linalg.norm(h)

    def nearest(self, v: np.ndarray, k: int, skip: int = -1):
        scores = self.vecs @ v
        top = np.argpartition(-scores, k + 1)[: k + 1]
        top = [t for t in top[np.argsort(-scores[top])] if t != skip][:k]
        return [(int(self.vec_index[t]), float(scores[t])) for t in top]

    def semantic(self, q: str, k: int):
        return self.nearest(self.embed(q), k)

    def keyword(self, q: str, k: int):
        toks = [t.encode() for t in re.split(r"\s+", q.lower()) if t]
        if not toks:
            return []
        lead = max(toks, key=len)  # the longest word finds the candidates; the rest must be on the same line
        lines = set()
        for m in re.finditer(re.escape(lead), self.txt):
            lines.add(int(np.searchsorted(self.txt_at, m.start(), side="right") - 1))
            if len(lines) > 20000:
                break
        hits = []
        for i in lines:
            ln = self.line(i)
            if all(t in ln for t in toks):
                title = ln[: ln.find(b"\t")]
                hits.append((i, sum(ln.count(t) for t in toks) + 3 * sum(t in title for t in toks)))
        hits.sort(key=lambda h: -h[1])
        return hits[:k]

    def similar(self, key: str, k: int = 6) -> dict:
        """The papers nearest one paper, from its stored vector (no encoder call)."""
        i = self.row_of(key)
        v = int(self.vec_of[i]) if i is not None else -1
        if v < 0:
            return {"results": []}
        rows = self.nearest(self.vecs[v], max(1, min(int(k), 50)), skip=v)
        return {"results": [self.card(i, s) for i, s in rows]}

    def card(self, i: int, similarity):
        r = self.record(i)
        r["year"] = r["pub_year"]
        r["similarity"] = None if similarity is None else round(similarity, 4)
        return r

    def search(self, q: str, k: int = 8, mode: str = "semantic") -> dict:
        t0 = time.time()
        k = max(1, min(int(k), 100))
        q = q.strip()
        if q.startswith("#"):  # #KEY: one record by key number
            i = self.row_of(q[1:])
            rows = [] if i is None else [(i, None)]
        elif mode == "keyword":
            rows = [(i, None) for i, _ in self.keyword(q, k)]
        elif mode == "hybrid":
            sem = self.semantic(q, 100)
            kw = self.keyword(q, 100)
            fused, sim = {}, {i: s for i, s in sem}
            for rank, (i, _) in enumerate(sem):
                fused[i] = fused.get(i, 0) + 1 / (RRF_K + rank + 1)
            for rank, (i, _) in enumerate(kw):
                fused[i] = fused.get(i, 0) + 1 / (RRF_K + rank + 1)
            rows = [(i, sim.get(i)) for i in sorted(fused, key=lambda i: -fused[i])[:k]]
        else:
            rows = self.semantic(q, k)
        results = [self.card(i, s) for i, s in rows]
        return {"results": results, "count": len(results), "mode": mode, "ms": {"total": round((time.time() - t0) * 1000)}}
