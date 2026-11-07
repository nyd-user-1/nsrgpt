"""One-time: the NSR-CPT encoder (NYSgpt/nsr-encoder-bge-m3) to ONNX, quantized to int8, uploaded to
s3://nsr-lake-613473203863/work/search/v1/encoder/ with its tokenizer. The Space runs it on first start
when the encoder isn't in S3 yet. Logs how close the int8 model lands to the original on a few queries."""
import os

import boto3
import numpy as np
from huggingface_hub import snapshot_download
from onnxruntime.quantization import QuantType, quantize_dynamic
from transformers import AutoModel, AutoTokenizer

from core import BUCKET, PREFIX


def export(work: str = "/tmp/export") -> None:
    src = snapshot_download("NYSgpt/nsr-encoder-bge-m3", token=os.environ.get("HF_TOKEN"), local_dir=f"{work}/src")
    import onnxruntime as ort
    import torch
    tok = AutoTokenizer.from_pretrained(src)
    ref = AutoModel.from_pretrained(src).eval()
    onnx_dir = f"{work}/onnx"
    os.makedirs(onnx_dir, exist_ok=True)
    d = tok("neutron capture", return_tensors="pt")

    class Encoder(torch.nn.Module):
        # Named arguments only: newer transformers reject the model's inputs passed by position.
        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, input_ids, attention_mask):
            return self.m(input_ids=input_ids, attention_mask=attention_mask, return_dict=False)[0]

    # Over 2 GB, so the weights go to an external data file beside model.onnx.
    with torch.no_grad():
        torch.onnx.export(Encoder(ref), (d["input_ids"], d["attention_mask"]), f"{onnx_dir}/model.onnx", dynamo=False, opset_version=17,
                          input_names=["input_ids", "attention_mask"], output_names=["last_hidden_state"],
                          dynamic_axes={"input_ids": {0: "b", 1: "s"}, "attention_mask": {0: "b", 1: "s"}, "last_hidden_state": {0: "b", 1: "s"}})
    q8 = f"{work}/model_int8.onnx"
    quantize_dynamic(f"{onnx_dir}/model.onnx", q8, weight_type=QuantType.QInt8)

    # How close int8 lands to the original (cosine of the CLS vectors).
    sess = ort.InferenceSession(q8, providers=["CPUExecutionProvider"])
    for q in ["neutron capture cross section of 197Au", "B(E2) of the first 2+ state in 120Sn", "half-life of 60Co"]:
        t = tok(q, return_tensors="np", truncation=True, max_length=128)
        with torch.no_grad():
            a = ref(**{k: torch.tensor(v) for k, v in t.items()}).last_hidden_state[0, 0].numpy()
        b = sess.run(["last_hidden_state"], {k: v.astype(np.int64) for k, v in t.items() if k in {i.name for i in sess.get_inputs()}})[0][0, 0]
        print(f"int8 vs original, cos {np.dot(a, b) / np.linalg.norm(a) / np.linalg.norm(b):.4f}: {q}", flush=True)

    s3 = boto3.client("s3", region_name="us-east-2")
    s3.upload_file(q8, BUCKET, PREFIX + "encoder/model.onnx")
    s3.upload_file(f"{src}/tokenizer.json", BUCKET, PREFIX + "encoder/tokenizer.json")
    print("encoder uploaded to S3", flush=True)
