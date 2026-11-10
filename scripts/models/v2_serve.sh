#!/bin/bash
# Brief 61, Part D (only if v2 wins): on an Old-account box, nsr-encoder v2 to the search Lambda's format and to Hugging
# Face. The int8 ONNX export is services/nsr-search/export.py's; vec_index is build_records.py's (v1's records.jsonl.gz
# order); the vectors are the ones v2_eval.py kept. Outputs go to the lake by presigned PUT links (presign.mjs put), to
# s3://nsr-lake-613473203863/work/search/v2/, beside v1's work/search/v1/; the Lambda picks one with SEARCH_PREFIX.
set -euo pipefail
: "${RUN_ID:?}"
RIG=s3://nsr-embed-v2
RUN=$RIG/models/nsr-encoder-v2/run-$RUN_ID
PY=/opt/pytorch/bin/python3
SP=/opt/pytorch/lib/python3.12/site-packages
export LD_LIBRARY_PATH="$(find "$SP/nvidia" -maxdepth 2 -type d -name lib | tr '\n' ':')"
mkdir -p /opt/serve && cd /opt/serve
$PY -m pip install "transformers>=4.44.2,<5" "huggingface_hub<1.0" onnx onnxruntime 2>&1 | tail -2
aws s3 cp --recursive $RUN/model/ /opt/serve/model/ --only-show-errors
aws s3 cp $RUN/eval/v2-papers.f16.npy /opt/serve/ --only-show-errors
aws s3 cp $RUN/eval/v2-papers.ids.json /opt/serve/ --only-show-errors
aws s3 cp $RUN/eval/results.json /opt/serve/ --only-show-errors
aws s3 cp $RIG/v2/serve-links-$RUN_ID.json /opt/serve/links.json --only-show-errors
export HF_TOKEN=$(aws ssm get-parameter --name /nsr/hf/token --with-decryption --query Parameter.Value --output text)
$PY - <<'PY'
import gzip, json, os, time, urllib.request
import numpy as np, torch
from onnxruntime.quantization import QuantType, quantize_dynamic
import onnxruntime as ort
from transformers import AutoModel, AutoTokenizer

links = json.load(open("/opt/serve/links.json"))
urllib.request.urlretrieve(links["get"]["records.jsonl.gz"], "/opt/serve/records.jsonl.gz")
row_of = {}
with gzip.open("/opt/serve/records.jsonl.gz", "rt") as fh:
    for n, line in enumerate(fh):
        row_of[json.loads(line)["key_number"]] = n
ids = json.load(open("/opt/serve/v2-papers.ids.json"))
vi = np.array([row_of.get(k, -1) for k in ids], dtype=np.int32)
np.save("/opt/serve/vec_index.npy", vi)
print(f"[serve] {len(row_of)} records, {int((vi >= 0).sum())} of {len(ids)} vectors matched", flush=True)

src = "/opt/serve/model"
tok = AutoTokenizer.from_pretrained(src)
ref = AutoModel.from_pretrained(src).eval()
class Encoder(torch.nn.Module):  # export.py's
    def __init__(self, m):
        super().__init__()
        self.m = m
    def forward(self, input_ids, attention_mask):
        return self.m(input_ids=input_ids, attention_mask=attention_mask, return_dict=False)[0]
os.makedirs("/opt/serve/onnx", exist_ok=True)
d = tok("neutron capture", return_tensors="pt")
with torch.no_grad():
    torch.onnx.export(Encoder(ref), (d["input_ids"], d["attention_mask"]), "/opt/serve/onnx/model.onnx", dynamo=False, opset_version=17,
                      input_names=["input_ids", "attention_mask"], output_names=["last_hidden_state"],
                      dynamic_axes={"input_ids": {0: "b", 1: "s"}, "attention_mask": {0: "b", 1: "s"}, "last_hidden_state": {0: "b", 1: "s"}})
quantize_dynamic("/opt/serve/onnx/model.onnx", "/opt/serve/model_int8.onnx", weight_type=QuantType.QInt8)
sess = ort.InferenceSession("/opt/serve/model_int8.onnx", providers=["CPUExecutionProvider"])
for q in ["neutron capture cross section of 197Au", "Lu-176 thermal capture cross section", "half-life of 60Co"]:
    t = tok(q, return_tensors="np", truncation=True, max_length=128)
    with torch.no_grad():
        a = ref(**{k: torch.tensor(v) for k, v in t.items()}).last_hidden_state[0, 0].numpy()
    b = sess.run(["last_hidden_state"], {k: v.astype(np.int64) for k, v in t.items() if k in {i.name for i in sess.get_inputs()}})[0][0, 0]
    print(f"[serve] int8 vs original, cos {np.dot(a, b) / np.linalg.norm(a) / np.linalg.norm(b):.4f}: {q}", flush=True)

def put(path, url):
    req = urllib.request.Request(url, data=open(path, "rb"), method="PUT", headers={"Content-Length": str(os.path.getsize(path))})
    urllib.request.urlopen(req).read()
for name, path in (("vectors.f16.npy", "/opt/serve/v2-papers.f16.npy"), ("vec_index.npy", "/opt/serve/vec_index.npy"),
                   ("encoder/model.onnx", "/opt/serve/model_int8.onnx"), ("encoder/tokenizer.json", f"{src}/tokenizer.json")):
    t0 = time.time()
    put(path, links["put"][name])
    print(f"[serve] put {name} {os.path.getsize(path):,} bytes {time.time() - t0:.0f}s", flush=True)

res = json.load(open("/opt/serve/results.json"))["results"]
rows = "\n".join(f"| {k.replace('|', ' | ')} | {res['v2'][k]['n']:,} | " + " | ".join(
    f"{res[m][k]['r10']:.3f} / {res[m][k]['mrr']:.3f}" for m in ("bge-m3", "v1", "v2")) + " |" for k in sorted(res["v2"]))
open(f"{src}/README.md", "w").write(f"""---
license: mit
base_model: NYSgpt/nsr-encoder-bge-m3
tags: [sentence-transformers, nuclear-data, retrieval]
---
# nsr-encoder-v2

One encoder across NSR, EXFOR, ENSDF, ENDF and ICRP 107: nsr-encoder (bge-m3 fine-tuned on NSR) trained one more pass
on the joins of the NSRgpt data lake (EXFOR entry to paper, ENSDF dataset to paper, ENDF material to paper, nuclide
names to their records, reactions in words to EXFOR datasets) plus a replay of nsr-encoder's own training triplets.
CLS pooling, normalized, 1,024 dimensions.

R@10 / MRR on the frozen benchmark (lake/models/nsr-encoder-v2/bench/) and on nsr-eval-v1:

| Task | Group | n | bge-m3 | nsr-encoder | nsr-encoder-v2 |
| --- | --- | ---: | --- | --- | --- |
{rows}
""")
from huggingface_hub import HfApi
api = HfApi(token=os.environ["HF_TOKEN"])
api.create_repo("NYSgpt/nsr-encoder-v2", private=True, exist_ok=True)
api.upload_folder(repo_id="NYSgpt/nsr-encoder-v2", folder_path=src, ignore_patterns=["checkpoint-*", "*.pt"])
print("[serve] uploaded to Hugging Face NYSgpt/nsr-encoder-v2 (private)", flush=True)
PY
echo "[serve] done"
