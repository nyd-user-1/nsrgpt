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
