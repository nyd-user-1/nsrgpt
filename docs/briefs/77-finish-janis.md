# Brief 77: Finish JANIS (supersedes the open parts of briefs 72–75)

## Goal
Elpis matches JANIS Web. The method is no longer to rebuild JANIS's logic: JANIS itself is the engine. JANIS runs on a box against its own data, exports every book page, and Elpis serves those exports. What matters is that every formula, computation and rule is JANIS's own.

## Who you report to
Only `new-lead-agent`, by SendMessage. Never address Brendan, never ask him anything; he has closed this window until it is done. Message the lead only for: a blocker you cannot pass after trying every route below, a spend forecast above the cap, or the final report. No progress updates.

## Done means (all of it, then one message)
Every step below complete, type check and lint clean on the dev box, **deployed to production**, and the production pages checked by reading their responses. Then send the lead exactly one message beginning `BRIEF 77 DONE` with: production URL, commit, per-step closure line, spend. Production deploy is authorized by Brendan as the last step of this brief (the one exception to "no builds"). If the GitHub Actions deploy is still blocked (billing; see `docs/HANDOFF-2026-11-11.md`, Deploy state), deploy from the dev box with the same commands the workflow runs; nsr-api and any Lambda are deployed the way their READMEs say. If production cannot be deployed by any route, that is a blocker for the lead, not a reason to stop early.

## Budget
$5 total for this brief, expected well under $3. EC2 boxes are the default (as many as needed, cheapest that does the job, terminated when done). Record spend in the report. A forecast over $5: stop and message the lead.

## Read first, in this order
1. `docs/briefs/72-elpis-match-janis.md` (rules 8a–8i and traps still apply, except where this brief says otherwise).
2. `docs/briefs/73`, `74`, `75` and their `## Report` sections, `scripts/janis/README.md`, `scripts/recon/README.md`, `git log --since="2026-11-11 19:00"`.
3. State left by the three closed windows: eight stopped boxes (`nsr-a73-1`, `nsr-a73-p1`…`p5`, `nsr-recon-5`, `nsr-janis-1`; profile `nysgpt-new`, us-east-2) hold unfinished parse and crawl work. Lane A's report may be incomplete: establish from the lake what is parsed. Use or terminate each box; none is left stopped at the end. The dev box `i-0ec4775a5cd68d41b` stays.

## What is already true (verify by count, do not redo)
- NEA GitLab `janis/data`: all 72 JANIS packages are in `lake/_raw/janis-data/` (117 GB). A `.jpk` is a zip, `nsub/mat/mf/mt`, numeric lines nibble-packed; decoder `scripts/recon/jpk.py`. Neutron MF3 in the packages is NEA's NJOY-processed data (reconr, broadr 293.6 K).
- JANIS's own curves are served for 53 releases as `<release>-janis` (`/endf/xs?janis=1`); Elpis's book asks for them. Checked equal to JANIS's Tabler.
- JANIS draws MT18 (and possibly other MTs) from MF10 where MF3 has none.
- JANIS tree: 25,691 element pages cached, `lake/janis/current/` republished. 754 web book pages saved with `saveState.xml`.

## Sources to fetch (step 1)
- JANIS downloads: https://www.oecd-nea.org/jcms/pl_39963/janis-downloads (janis-4.0.zip, janis-4.0_manual_rev1.pdf, groups.zip; the DVD ISO only if the packages prove insufficient).
- JANIS Books: https://www.oecd-nea.org/jcms/pl_44624/janis-books (the "7-Zip archive with a JNS file per page", 858 KiB; the seven September 2020 PDFs; the notes on that page state the plotting rules).
- TRANS checker: https://www.oecd-nea.org/jcms/pl_40305/janis-trans-checker (`janis-trans-checker.zip`, 4.54 MiB, `java -jar janis-trans-checker.jar`).
- `README_janis.md` in `janis/data` says which JANIS build the packages are validated against ("JANIS 4.1+ generic distribution") and how to Load them; get that build (it may be in the GitLab `janis` group or its package registry).
- oecd-nea.org may refuse plain clients (403): try a box, a browser box (`scripts/janis/fill/userdata-browser.sh`), Wayback, in that order.
Keep everything under `lake/_raw/janis-software/`. NEA's program and its files are run as tools and read for their rules; none of NEA's code or binaries is committed to this repository.

## Steps, in order, each to completion before the next
1. Fetch the sources above.
2. Read the manual and the program: how JANIS loads the packages, the JNS format, how a page's series are chosen and ordered, the colour/symbol/line sequence, axis and title rules, the '*' operations (MT5 residual production, summation over ground and metastable, MF10), and whether it has a batch or command-line export. Write what you find, as rules with their source (manual page, class name), to `docs/analysis/janis-engine.md`.
3. One box: Java 8, JANIS, all 72 packages loaded the way `README_janis.md` says.
4. JANIS opens each book page's JNS and exports it. If JANIS has no batch export, drive its own classes from a small harness on the box so the numbers and choices are produced by JANIS's code, not by ours.
5. The export for a page: every series in JANIS's order (evaluated and EXFOR), its legend text, line or symbol style and colour, its values exactly as JANIS computes them, the axes (scale, range, labels), the chart title, the bottom-sheet node rows in order, the rail position.
6. One export file per page in the lake (`lake/elpis/pages/<book>/<nuclide>/<mt>.json` or similar), a manifest with counts per book, and a served route or CDN path the page reads.
7. Elpis's book pages read those exports directly, in all seven books. Presentation keeps our design system and page frame (brief 72 rule 2); content, order, values, scales and symbols are the export's.
8. Retire from the Elpis book what the export replaces: my own curve selection, MT5 production computation, row logic, the Reconstruct button, dashed background spans, the "sets not drawn" list, row and home counts JANIS lacks (brief 72 5c, 5o). The existing T and I boxes in the sheet stay as they are.
9. The book index and rails are rebuilt from JANIS's output: every page JANIS has exists, `mts_missing` is 0 in all seven books, same nuclides and MTs in the same order.
10. JANIS's engine and rules run on every library we hold. Pages the 2020 JNS archive lacks but JANIS Web lists today (the crawl tree and book index say which) are generated by JANIS on the box from the current packages with the same page template. Libraries JANIS has no package for (ENDF/B-VIII.1, TENDL-2023, others in `RELEASES`) are processed the way NEA processes them (NJOY reconr/broadr with the settings recorded in `scripts/recon/README.md`), loaded into JANIS, and exported by the same engine; they show under the ELPIS side of the JANIS/ELPIS switch (brief 72 5p). Proof of method: for libraries both hold, the export equals JANIS's line for line.
11. Elpis browse and search read JANIS's own database index from the packages (H2; NEA's `java/h2csv` converts it): same tree, same fields, same results as JANIS, every search field working, result rows plottable.
12. `/elpis/checker` runs JANIS's checker program (the jar, on a box or Lambda behind `POST /exfor/check`), so the output is JANIS's.
13. (Dropped by Brendan: table and EXFOR information stay in the sheet as built.)
14. One window, this order. You may use subagents only if Brendan's CLAUDE.md allows it: it does not, so do the work yourself.
15. Verify before reporting: for 10 pages per book (70), the production page's series, order and values against the export and against JANIS's Tabler numbers where held (`scripts/recon/janis_tabler.py`); zero differences, or each difference fixed. Then deploy, check production, and send `BRIEF 77 DONE`.

## Working rules
- Nothing heavy on the Mac: no python3, AWS CLI one call at a time; type check and lint on the dev box (`scripts/devbox/check-files.sh` through `scripts/iaea/box/ssm.sh`).
- Shared tree: `git pull --rebase --autostash origin main`, then `git commit -- <paths>`; push as work lands.
- A step that returns nothing is an error. Every count is checked against its expected count.
- No button, note, floor or rule JANIS lacks. Compute in advance, never on click.
- Keep a `## State` section at the foot of this file current after every step (what is done with counts, what is running where, the exact next action, spend so far), committed and pushed, so a successor window can resume from the file alone. Do this before your context runs low, not after.
- Elpis pages have no page transition between them and an empty loading fallback (`app/(site)/elpis/loading.tsx`); do not reintroduce either.

## State
Updated 2026-11-12 05:40 UTC by the brief 77 window (session fucking-finish-janis).

**Done**
- Step 1: 43 files in `lake/_raw/janis-software/` (manifest.json there; 0 failures): janis-4.0.zip, manual rev1, groups.zip, books-2020-09-JNS.7z (6,766 JNS), the seven 2020 PDFs, janis-trans-checker.zip, and **JANIS 4.1** itself (Java Web Start, `janis/webstart/janis.jnlp`, 22 jars; `Janis.jar` built 2023-07-24), NEA's four pages, janis/data's README_janis.md. Script `scripts/janis/engine/fetch.sh`. The DVD ISO is not fetched (not needed so far).
- Step 2 (reading, write-up pending in `docs/analysis/janis-engine.md`): JANIS 4.1 contains NEA's own book generator, `org.nea.janis.book.BarnBook` (`main`: `<connection> XML,JNS <threads> OFFICIAL <n|p|d|t|h|a|g>`), with `BarnBookOptionsOfficial` (14 libraries, colours, MT list), `BarnBookMainThread` (which items exist: MF3 / MF10 / MF6 MT5 rules, MT4 as Sum(MT50-91), EXFOR search and filters) and `PlotterThread` (series order, EXFOR marks and colours, legend, axes). `BarnBookXMLPersistence` writes the XML pages and navigation JANIS Web serves. CLI also has `-render <jns> t0 csv`, `-table <refs>`, `-search`, `-barnbookpage`. Importer `org.nea.janis.format.tools.Import` (`LOCAL:label=…|root=<DataPack>|url=jdbc:h2:…|user=janis|password=janis`, formats ENDF, EXFOR, INTER, BOXER, GENDF, NUBASE). The packages carry no H2 index; JANIS's importer builds it (BROND-2.2 in 6.5 s).
- Box: `nsr-a73-1` (i-08dea9c7ac5fca99a, m7i-flex.large, 200 GB) reused as the JANIS box: Java 8, Xvfb, CFR; JANIS jars in `/opt/janis`; decompiled source for reading in `/data/janis-src` and `lake/_work/janis/engine/janis-src.tgz` (lake only, never the repo). Lane A's scratch on it (TENDL-2017/2019 parts B–F, `/data/endfb`) deleted: brief 77 serves Elpis from JANIS's exports.

**Running**
- `nsr-a73-1`: `bash /opt/engine/import.sh BOOK` (log `/data/janis/import-BOOK.out`, done markers `/data/janis/done/`): the 14 book libraries + EXFOR 2025-06-28 into base `BOOK` (`/data/janis/database/BOOK.h2.db`, DataPack `/data/janis/DataPack/<pkg>-<ver>/{jpk,inter,boxer}`), labels from `scripts/janis/engine/libs.tsv`. ~12 MB/s; about 30 minutes.

**Next**
1. When BOOK is done: run `BarnBook` OFFICIAL for each of the seven books (XML,JNS) with the Q-value table off (web pages do not show it; it needs Nubase 2020), then the export harness (Tabler CSV per series via `TablerState.setUseXValuesFromData(true)`), then compare page lists with JANIS Web's 7,292.
2. `import.sh REST` for the other 57 packages (per brief step 3 and steps 10–11).
3. Stopped boxes not yet handled: `nsr-a73-p1`…`p5`, `nsr-recon-5`, `nsr-janis-1` (terminate after recording what they held; lake state is the record).

**Spend so far:** nsr-a73-1 m7i-flex.large from 05:10 UTC (~$0.10/h). No Lambda.
