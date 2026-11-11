# 63 — /nsrcpt rewritten for v2 and the reranker: Brendan's copy, one chart, a three-tab rail (2026-11-10, 20:30 ET)

You're `worker-1`. Written by `lead-agent` (Fable). Brendan edited the live page in the browser's inspector and
sent screenshots; this brief carries every change he made plus his instructions. Report to `lead-agent` by
SendMessage, Efficiency Voice, one line at the end with the box URL. No questions.

## Rules
1. Mac rules: no local tsc; type-check and lint on the dev box (`scripts/iaea/box/ssm.sh`, i-0ec4775a5cd68d41b).
   CI Typecheck has been red since 05:27 ET (commit 05d6b49 onward) and every push mails Brendan a failure; before
   you push, run tsc on the box against main and fix whatever is red (it is in the TypeScript commits since 9e8df11:
   lib/data-dictionary.ts, worker-2's pages, the counts wiring), so your one push goes green.
2. `~/Code/nsrgpt` on main, shared: pull `--rebase --autostash`, commit with explicit paths. Push once, at the end.
3. Files: `components/nsrcpt/Announcing.tsx` (and whatever it imports under components/nsrcpt), `lib/header-titles.ts`
   for the title. Nothing else.
4. The app speaks in the first person singular; plain language; no caption that restates a tile; no "—" dashes in
   copy (plain commas or full stops). The name is **NSRcpt** everywhere on the page and in the header title (not
   NSR-CPT); the legend word "Mine" becomes "NSRcpt".

## The page, top to bottom (Brendan's copy verbatim where quoted, typos fixed)
1. **Eyebrow:** `NSRCPT · V2 · 10 NOVEMBER 2026`. **Hero:** one line only, "Retrieval trained exclusively on nuclear
   physics." (no big NSR-CPT h1, no paragraph, no stat tiles: Brendan removed them).
2. **Section, chart:** h2 "A needle in a nuclear haystack", sub "Find the right record right away." No By Topic / By
   Record buttons here (they move down, item 3). One chart, for v2: grouped horizontal bars, R@10 by record type on
   the cross-source benchmark (brief 61's Result table, n 10,000): rows endf_nsr "ENDF material to its papers",
   ensdf_nsr "ENSDF dataset to its papers", reaction "Reaction in words to EXFOR", ensdf/nuclide "Nuclide to its
   records", ex_nsr "EXFOR dataset to its paper", all "All"; three bars a row: Stock bge-m3 (0.014, 0.166, 0.558,
   0.972, 0.917, 0.636), NSRcpt v1 (0.019, 0.138, 0.677, 0.993, 0.970, 0.673), NSRcpt v2 (0.802, 0.563, 0.980,
   1.000, 0.969, 0.870). Order the rows by v2's gain, largest first, so the chart opens on 0.019 → 0.802. Legend:
   NSRcpt v2 (the house blue), NSRcpt v1 (the lighter blue), Stock bge-m3 (the baseline gold). Values at the bar
   ends, three decimals. Delete the second chart ("A fast reader", the before/after bars) and its section.
3. **The tab rail:** the By Topic / By Record pill control, now three pills, **Model · Search · Benchmarks**, placed
   where "BETTER MODEL?" began; it toggles the three sections below (one shown at a time, Model first, the URL hash
   `#model` `#search` `#benchmarks` so a tab is linkable; a 200 ms fade).
4. **Model tab:** eyebrow "Better model?", h2 "Better approach". Copy (his, voice fixed): "Every record in NSR
   carries a keyword abstract: an indexer at the National Nuclear Data Center describing that specific paper in the
   canonical vocabulary of nuclear physics. Alongside them sit EXFOR's experiment records, each already linked by hand
   to the paper that reported it, and ENSDF's datasets and ENDF's materials, each citing its sources. Between them,
   hundreds of thousands of real questions with known right answers formed the basis of my experiment and training
   designs." Foot line: "v1: 152K pairs built, 39K trained. v2: 46K cross-source pairs built, 32K trained, from v1's
   weights. One pass each. No synthetic queries." Cards at right: "Compute" / "Supplied by AWS through AWS Startup";
   "Eval" / "Evals, benchmarks and training data by NYSgpt".
5. **Search tab:** eyebrow "Better search?", h2 "Better results". Copy (his): "NSRgpt used to search with a
   general-purpose model that had never seen a nuclear physics paper. It now searches with one trained on this
   corpus, and the gain is largest exactly where the corpus is hardest: papers with no abstract, where the model has a
   title and nothing else, went up 262%. Papers from before 1970 went up 307%. v2 adds the records themselves: an
   ENDF material now finds the papers it cites 42 times as often." Tiles: "+262%" / "Papers with no abstract";
   "+307%" / "Papers from before 1970"; "42×" / "ENDF material to its papers". Beneath, the reranker as a second
   chart in this tab, h3 "The reranker", sub "Reads the top fifty and reorders them": horizontal bars of relative
   lift, from the NSR-CPT report (reranking stock bge-m3's top 50): Recall@1 +125% (0.080 → 0.180), nDCG@10 +76%
   (0.121 → 0.213), Recall@10 +41% (0.171 → 0.241), on topic queries; and Recall@1 +6% (0.871 → 0.927) on record
   queries. Bars in the house blue, the before/after pair in the hover title and in small text after the percent.
6. **Benchmarks tab:** eyebrow "Better benchmarks?", h2 "Better overall". Copy (his): "A headline average can hide a
   model that got much better at easy questions and worse at hard ones. So the benchmark was cut sixteen ways before
   the numbers were produced, and the bar was set in advance: beat the stock model in every segment, on both metrics,
   by at least 10% on the blended keyword family. It cleared that bar by nearly twenty times, and it cleared it
   everywhere; the weakest segment still improved by 65%. The reranker was gated the same way and passed in all eight
   of its segments. v2 was gated on a frozen cross-source benchmark of 10,000 queries and on v1's paper benchmark:
   it had to win the first and hold the second within a point. It did both." Tiles: "16 / 16" / "Benchmarks cleared";
   "20×" / "The bar, cleared"; "0.673 → 0.870" / "Cross-source recall, v1 to v2".
7. **Try it:** as it is ("Describe what you are looking for the way you would to a colleague." Search NSR → · Ask
   NSRgpt). Then the model cards foot as it is (nsr-encoder-v2 Served, the rest Coming soon).

## Done means
Both themes checked on the box; tsc and lint green on the box; one push; the box URL in one line to lead-agent.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/63-nsrcpt-v2-page.md and do it; one line to lead-agent when it is on the box.`
