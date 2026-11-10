# 61 — nsr-encoder v2: one encoder across NSR, EXFOR, ENSDF, ENDF and ICRP, trained on the lake's own joins (2026-11-11, 05:10 ET)

You're `worker-1`. Written by `lead-agent` (Fable); Brendan asked at 05:00 ET for the next model worth fine-tuning.
Report to `lead-agent` by SendMessage only, in Efficiency Voice, one line per part, one report at the end. No
questions mid-job; decide and record.

## Why this model
The nsr-encoder (`/nsrcpt`, bge-m3 fine-tuned on NSR, 277,068 references) searches papers. The lake now holds the
joins no one else has in one place: every EXFOR subentry cites its NSR key (the entry's REFERENCE and `nsr` fields in
`lake/exfor/`), every ENSDF dataset its references (`nsr.ensdf_references`, `ensdf_refs`, keyed to NSR), every ENDF
material its MF1/451 documentation and the papers it names, ICRP 107 its nuclides. Trained on those pairs, one
encoder puts a query like "Lu-176 thermal capture cross section" beside the EXFOR subentry, the ENDF section, the
ENSDF dataset and the paper. Measured the NSR-CPT way: pre-registered held-out pairs, R@10, nothing rounded up.

## Rules
1. Mac rules: nothing trains or embeds on the Mac. Training on a GPU box in the New account if it allows one
   (try `g5.xlarge`, then `g4dn.xlarge`; worker-3 found the account refuses non-Free-Tier types for CPU, so a GPU may
   be refused too). If refused: the Old account (profile `default`, 638175140432) with the same create.sh pattern,
   or SageMaker Training in whichever account allows it (the `aws-ai-ml` skill's recipe). Say which in the first
   report. Spend cap $15; name the price before launching.
2. `~/Code/nsrgpt` on main, shared: pull with `--rebase --autostash`, commit with explicit paths, push right after.
   You own `scripts/models/**` (new), `lake/models/**`, `raw/huggingface/**`, and the search Lambda's encoder
   switch only if Part D says so.
3. Copy the recipe, then adapt (EV rule 17): the NSR-CPT lanes are the model (`~/Code/nsr/docs/NSR-CPT-REPORT.md`,
   `docs/prompts/LANE-TRIPLETS.md`, `LANE-TRAIN.md`, `LANE-EVAL.md`): the triplet builder, the training script,
   the frozen benchmark. Start from the nsr-encoder weights mirrored at `raw/huggingface/2026-11-10/NYSgpt/nsr-encoder/`
   (bge-m3, 0.6B), not from base bge-m3.

## Part A: the pairs (Athena and DuckDB on a CPU box; no GPU)
1. Positive pairs, (query text, document text), each side a plain-language rendering the app already makes:
   - EXFOR subentry ↔ NSR paper: the subentry's title line (target, reaction, quantity, author, year, institute,
     energy span) ↔ the paper's title and keyword abstract. Count them.
   - ENSDF dataset ↔ NSR paper: the dataset's DSID rendering ("60Co · Adopted levels, gammas", or the decay
     dataset's parent and mode) ↔ the cited paper.
   - ENDF material ↔ NSR paper where MF1/451's text names a reference the NSR key index resolves (the lake's
     `endfb_records` MF1 lines; resolve by author and year against `nsr`; keep only unambiguous matches).
   - Nuclide ↔ its records: the nuclide name and symbol forms ("Ac-225", "225Ac", "actinium-225") ↔ its ENSDF
     summary line, its ICRP 107 line, its ENDF material line, its EXFOR target line.
   - Reaction ↔ EXFOR: the reaction in words ("uranium-235 neutron-induced fission cross section") ↔ the subentry
     title; the EXFOR dictionary (`lake/exfor/dictionary/`) gives the words.
2. Hard negatives the NSR-CPT way: same nuclide, different reaction; same reaction, different nuclide; same author,
   different year. Write `lake/models/nsr-encoder-v2/pairs/` with a manifest: counts per pair type, the rendering
   rules, the date cut.
3. The benchmark, frozen before training: 10,000 held-out pairs stratified by type, written to
   `lake/models/nsr-encoder-v2/bench/` with a manifest; the NSR-CPT benchmark `nsr-eval-v1` kept beside it so v2
   is measured on v1's task too. Report the counts.

## Part B: train
One pass, the NSR-CPT hyperparameters (its report records them), from the nsr-encoder weights, on the pairs; the
run's config, log and timings into `lake/models/nsr-encoder-v2/run-<date>/`. Report minutes and dollars.

## Part C: measure
R@10 and MRR on the frozen benchmark, by pair type, for: bge-m3 base, nsr-encoder v1, v2. And on `nsr-eval-v1`
(the paper task) for v1 and v2, so a loss there is seen. A table in `docs/briefs/61-nsr-encoder-v2-cross-source.md`
under "Result", every number as measured. If v2 loses on the paper task by more than a point, say so and do not
serve it.

## Part D: serve, if it wins
If v2 beats v1 on the cross-source benchmark and holds on the paper task: upload to `raw/huggingface/…/nsr-encoder-v2/`
and to Hugging Face under NYSgpt (private; Brendan decides), embed the five record types the search Lambda indexes
(the way `scripts/parse/search/` builds `search_docs_structure`'s vectors, on the GPU box), and switch the search
Lambda's encoder behind a flag so v1 is one env change away. Report the latencies and one query per record type.
If it does not win: report the numbers, serve nothing, keep the pairs and benchmark (they are the asset).

## Done means
Pairs and benchmark in the lake with manifests; the run recorded; the Result table in this file; served or not with
the reason; the GPU box terminated; spend in the report; one final report to `lead-agent`.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/61-nsr-encoder-v2-cross-source.md and do it; report to lead-agent after each part.`

## Result (2026-11-10, worker-1)

v2 wins on the cross-source benchmark and holds on the paper task, so it is served behind a switch (Part D below).

| Task | Group | n | bge-m3 R@10 / MRR | nsr-encoder v1 R@10 / MRR | nsr-encoder v2 R@10 / MRR |
| --- | --- | ---: | --- | --- | --- |
| cross-source | all | 10,000 | 0.636 / 0.530 | 0.673 / 0.585 | 0.870 / 0.763 |
| cross-source | endf_nsr | 364 | 0.014 / 0.007 | 0.019 / 0.009 | 0.802 / 0.512 |
| cross-source | ensdf_nsr | 2,500 | 0.166 / 0.087 | 0.138 / 0.063 | 0.563 / 0.330 |
| cross-source | ex_nsr | 3,136 | 0.917 / 0.820 | 0.970 / 0.919 | 0.969 / 0.891 |
| cross-source | nuclide | 2,000 | 0.972 / 0.876 | 0.993 / 0.922 | 1.000 / 0.996 |
| cross-source | reaction | 2,000 | 0.558 / 0.378 | 0.677 / 0.481 | 0.980 / 0.918 |
| nsr-eval-v1 | EX | 4,997 | 0.969 / 0.916 | 0.980 / 0.947 | 0.983 / 0.949 |
| nsr-eval-v1 | KW | 4,998 | 0.183 / 0.119 | 0.512 / 0.350 | 0.511 / 0.344 |
| nsr-eval-v1 | all | 9,995 | 0.576 / 0.517 | 0.746 / 0.648 | 0.747 / 0.646 |

Every model embedded the same texts the same way (sentence-transformers, CLS pooling, normalized, 256 tokens, fp16) and
was searched exactly over the whole corpus: papers 277,068 (nsr-eval-v1's frozen corpus), EXFOR datasets 190,430,
record lines 10,110. No benchmark query lost its relevant documents to the corpus. Measured on the box, not rounded.

- **The gain** is where v1 had no signal: an ENDF material line finds the papers its MF1/451 cites (R@10 0.019 → 0.802),
  an ENSDF dataset its DSREF papers (0.138 → 0.563), a reaction in words its EXFOR datasets (0.677 → 0.980).
- **The paper task holds:** nsr-eval-v1 overall R@10 0.746 → 0.747, MRR 0.648 → 0.646. The largest loss is KW MRR,
  0.350 → 0.344 (0.6 point), inside the one-point bar. EXFOR → paper keeps its R@10 (0.970 → 0.969) but its MRR drops
  0.919 → 0.891.
- v1's numbers here differ from the NSR-CPT report's (KW R@10 0.487 there, 0.512 here) because this measure embeds every
  model at 256 tokens with sentence-transformers rather than the report's TEI rig. All three columns are measured alike.

The run: `lake/models/nsr-encoder-v2/run-20261110-1052/` (config.json, train.log, eval/, model/).
- One pass from the nsr-encoder (v1) weights, FlagEmbedding m3, NSR-CPT's flags: group 8, query 128, passage 256, lr
  1e-5, temperature 0.02, CLS, normalized, bf16, warmup 10 %. Two changes, both forced by the instance: batch 8 with
  gradient checkpointing (24 GB A10G; NSR-CPT ran 16 on a 48 GB L40S), and 24,000 of Part A's 46,000 pairs, the same
  share of every type, plus 7,998 of v1's clean triplets replayed (31,998 rows, 3,999 steps). Loss 1.22 → 0.53.
- us-east-1 had no g6e capacity in any zone, on-demand or Spot; the New account's GPU quota is 0. The box: g5.2xlarge
  (A10G), Old account, $1.212 an hour. Training 4,979 s (83 min); the whole box 117 min ≈ $2.36.
- The lake refuses the Old account's role across accounts (the bucket policy statements alone were not enough), so the
  box read its inputs by presigned links and wrote to s3://nsr-embed-v2; the serve box copies the run into the lake.
