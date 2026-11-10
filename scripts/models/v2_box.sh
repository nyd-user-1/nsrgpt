#!/bin/bash
# Brief 61, Parts B and C on one GPU box (Old account, us-east-1, g6e.xlarge, 44b's PyTorch DLAMI), copied from
# ~/Code/nsr/scripts/train-nsr/train.sh (its three environment facts kept: /opt/pytorch's python, the nvidia lib path,
# transformers < 5). Trains nsr-encoder v2 from the nsr-encoder (v1) weights, one pass, NSR-CPT's hyperparameters, on
# Part A's pairs plus 8,000 of v1's clean triplets; then measures base bge-m3, v1 and v2 on the frozen benchmark and on
# nsr-eval-v1 (v2_eval.py). The lake refuses this account's role across accounts, so the inputs come by presigned links
# (presign.mjs, signed by the New account) and everything lands in s3://nsr-embed-v2/models/nsr-encoder-v2/run-<RUN_ID>/,
# copied into lake/models/nsr-encoder-v2/run-<RUN_ID>/ afterwards from the New account.
set -euo pipefail
: "${RUN_ID:?}"
LAKE=s3://nsr-lake-613473203863
RIG=s3://nsr-embed-v2
RUN=$RIG/models/nsr-encoder-v2/run-$RUN_ID
PY=/opt/pytorch/bin/python3
SP=/opt/pytorch/lib/python3.12/site-packages
export LD_LIBRARY_PATH="$(find "$SP/nvidia" -maxdepth 2 -type d -name lib | tr '\n' ':')"
L2=""
T_START=$(date +%s)
stamp() { echo "$1 $(( $(date +%s) - T_START ))" >> /opt/train/timings.txt; }
mkdir -p /opt/train /opt/v1 /opt/v2in && cd /opt/train
echo "phase seconds_since_start" > timings.txt

# 1. Install (train.sh's lines: base FlagEmbedding, transformers < 5)
$PY -m pip install -U FlagEmbedding pyarrow 2>&1 | tail -5
# transformers < 5 pulls huggingface_hub < 1, which the newest datasets (5.x) and sentence-transformers no longer accept
# (ImportError: BucketNotFoundError, 2026-11-10): pin the four together, then fail here, not after the downloads.
$PY -m pip install "transformers>=4.44.2,<5" "huggingface_hub<1.0" "datasets>=2.19,<4" "sentence-transformers>=3,<5" 2>&1 | tail -3
$PY -c "import FlagEmbedding.finetune.embedder.encoder_only.m3, datasets, sentence_transformers, transformers, huggingface_hub; print('[v2] versions', transformers.__version__, datasets.__version__, sentence_transformers.__version__, huggingface_hub.__version__)"
stamp installed

# 2. Inputs: v1's weights, Part A's pairs, corpora and benchmark, v1's clean triplets and nsr-eval-v1
aws s3 cp $RIG/v2/links-$RUN_ID.json /opt/train/links.json --only-show-errors
$PY - <<'PY'
import json, os, urllib.request
for path, url in json.load(open("/opt/train/links.json")).items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    urllib.request.urlretrieve(url, path)
print("[v2] fetched", len(json.load(open("/opt/train/links.json"))), "objects")
PY
aws s3 cp $RIG/train/full-clean-0702/train.jsonl /opt/train/v1-clean.jsonl --only-show-errors
aws s3 cp --recursive $RIG/eval/nsr-eval-v1/ /opt/v2in/nsr-eval-v1/ --only-show-errors
stamp inputs
$PY - <<'PY'
import json, os, random
rnd = random.Random(61)
lines = open("/opt/train/v1-clean.jsonl").read().splitlines()
pick = rnd.sample(lines, 8000)
def doc(d):  # nsr-eval-v1's corpus text: title, two newlines, abstract, 2,000 characters
    return (d.get("title") or "").strip() + "\n\n" + (d.get("abstract") or "")
out = []
for l in pick:
    r = json.loads(l)
    negs = [doc(n) for n in r["negatives"]][:7]
    if len(negs) < 4:
        continue
    while len(negs) < 7:
        negs.append(negs[len(negs) % len(negs)])
    out.append({"query": r["query"], "pos": [doc(r["positive"])[:2000]], "neg": [n[:2000] for n in negs]})
new = open("/opt/v2in/train/train.jsonl").read().splitlines()
types = [json.loads(t)["type"] for t in open("/opt/v2in/train/types.jsonl")]
n_new = int(os.environ.get("N_NEW") or len(new))
if n_new < len(new):  # a time budget: the same share of every pair type
    keep = []
    for t in sorted(set(types)):
        idx = [i for i, x in enumerate(types) if x == t]
        keep += rnd.sample(idx, round(len(idx) * n_new / len(new)))
    new = [new[i] for i in sorted(keep)]
print("[v2] new pairs used", len(new), dict(sorted({t: types.count(t) for t in set(types)}.items())))
rows = new + [json.dumps(o) for o in out]
rnd.shuffle(rows)
open("/opt/train/train.jsonl", "w").write("\n".join(rows) + "\n")
print("[v2] train rows", len(rows), "of which v1 replay", len(out))
PY
N_PAIRS=$(wc -l < /opt/train/train.jsonl)
stamp data_ready

# 3. Train: NSR-CPT's flags (scripts/train-nsr/train.sh), from v1's weights instead of BAAI/bge-m3
OUT=/opt/train/out
BATCH=${BATCH:-16}
STEPS=$(( (N_PAIRS + BATCH - 1) / BATCH ))
WARMUP=$(( STEPS / 10 ))
cat > /opt/train/config.json <<J
{"run_id": "$RUN_ID", "base": "NYSgpt/nsr-encoder (v1), raw/huggingface/2026-11-10/NYSgpt/nsr-encoder/",
 "module": "FlagEmbedding.finetune.embedder.encoder_only.m3", "train_rows": $N_PAIRS, "epochs": 1, "batch": $BATCH,
 "train_group_size": 8, "query_max_len": 128, "passage_max_len": 256, "learning_rate": 1e-5, "temperature": 0.02,
 "warmup_steps": $WARMUP, "pooling": "cls", "normalize": true, "precision": "bf16", "unified_finetuning": false,
 "instance": "${TYPE:-g6e.xlarge}, Old account us-east-1", "price_per_hour": ${PRICE:-1.861}}
J
T0=$(date +%s)
CKPT_FLAG=${CKPT_FLAG:-}
while true; do
STEPS=$(( (N_PAIRS + BATCH - 1) / BATCH ))
WARMUP=$(( STEPS / 10 ))
rm -rf $OUT
set +e
$PY -m FlagEmbedding.finetune.embedder.encoder_only.m3 $CKPT_FLAG \
  --model_name_or_path /opt/v1 --cache_dir /opt/train/hf-cache \
  --train_data /opt/train/train.jsonl --cache_path /opt/train/data-cache \
  --train_group_size 8 --query_max_len 128 --passage_max_len 256 --pad_to_multiple_of 8 \
  --knowledge_distillation False --unified_finetuning False --use_self_distill False \
  --output_dir $OUT --learning_rate 1e-5 --bf16 --num_train_epochs 1 \
  --per_device_train_batch_size $BATCH --dataloader_drop_last True --warmup_steps $WARMUP \
  --logging_steps 20 --save_steps 999999 --temperature 0.02 --sentence_pooling_method cls --normalize_embeddings True \
  2>&1 | tee /opt/train/train.log
EXIT=${PIPESTATUS[0]}
set -e
[ "$EXIT" -eq 0 ] && break
# train.sh's OOM ladder: halve the batch (gradient checkpointing stays as set)
if grep -qiE "out of memory|OutOfMemoryError" /opt/train/train.log && [ "$BATCH" -gt 2 ]; then
  BATCH=$((BATCH / 2)); echo "[v2] OOM: batch now $BATCH"; continue
fi
break
done
sed -i "s/\"batch\": [0-9]*/\"batch\": $BATCH, \"gradient_checkpointing\": \"${CKPT_FLAG:+on}\", \"warmup_steps_final\": $WARMUP, \"n_new\": \"${N_NEW:-all}\"/" /opt/train/config.json
T1=$(date +%s)
echo "{\"train_seconds\": $((T1 - T0)), \"exit\": $EXIT}" > /opt/train/train-time.json
stamp trained
aws s3 cp /opt/train/train.log $RUN/train.log $L2 --only-show-errors
aws s3 cp /opt/train/config.json $RUN/config.json $L2 --only-show-errors
aws s3 cp /opt/train/train-time.json $RUN/train-time.json $L2 --only-show-errors
[ "$EXIT" -eq 0 ] || { echo "[v2] training failed"; exit "$EXIT"; }

# 4. Sentence-transformers files for the checkpoint (train.sh's note: without them it silently mean-pools)
cp /opt/v1/modules.json /opt/v1/sentence_bert_config.json $OUT/
mkdir -p $OUT/1_Pooling && cp /opt/v1/1_Pooling/config.json $OUT/1_Pooling/
aws s3 cp --recursive $OUT $RUN/model/ $L2 --only-show-errors --exclude 'checkpoint-*'
stamp uploaded_model

# 5. Measure (Part C)
cp /opt/v2in/scripts/v2_eval.py /opt/train/v2_eval.py
$PY /opt/train/v2_eval.py /opt/v2in /opt/v1 $OUT /opt/train/eval 2>&1 | tee /opt/train/eval.log
stamp evaluated
aws s3 cp --recursive /opt/train/eval $RUN/eval/ $L2 --only-show-errors
aws s3 cp /opt/train/eval.log $RUN/eval.log $L2 --only-show-errors
aws s3 cp /opt/train/timings.txt $RUN/timings.txt $L2 --only-show-errors
echo "[v2] done"
