# Brief 72: Elpis matches JANIS

## 1. Objective
Elpis (`/elpis`) matches JANIS Web (https://www.oecd-nea.org/janisweb/) on every row and every chart, in all seven books: n, γ, p, d, t, h, α.

## 2. Rule
Content, computation, paths and navigation match JANIS one to one. Presentation matches by content and pattern: same chart type, axis scale and range, series, symbols per chart, and items in the same order in every rail and sheet. Built from our existing design system and page frame: no new components, no restyling. Where we hold more than JANIS, it appears only behind an approved affordance (5q).

## 3. Done means
Duplication phase completed and declared done first. Then the testing phase: a sampled side-by-side across all seven books against JANIS's pages and its Tabler numbers.

## 4. Built so far (unverified until the testing phase)
Books, browse, six searches, EXFOR sets, MT 5 production, the EXFOR TRANS checker. Briefs 67–71 describe this work; their claims of matching are not accepted until tested.

## 5. Gaps (duplication phase)
- 5a. Acquire the libraries JANIS draws that the lake lacks: TENDL-2009, 2010, 2011, 2012, 2013, 2014, 2015, 2017, 2019; GEFY-3.3, 4.2, 5.2; FENDL-3.1b; FENDL-2.1 MG; JEFF-3.0/A; IRDFF-1.0-640g; Nubase 2012; JENDL-4.0u's missing 306 materials. Parse, serve and mark each as brief 70 did.
- 5b. Resonance curves computed in advance and stored for every library, as JANIS shows them. Today only ENDF/B-VIII.1 and VIII.0 have them (NNDC POINT files).
- 5c. Remove the Reconstruct button and the dashed background lines.
- 5d. Computed series: where JANIS draws one (e.g. from MT 5, asterisked), we draw it; where it doesn't, we don't.
- 5e. Fill the 144 remaining ❌ MT rows, as JANIS does.
- 5f. Left rail tree in JANIS view: same nuclides and MTs, same order.
- 5g. Libraries drawn per page: same as JANIS.
- 5h. Chart type, series, symbols and markers: same as JANIS per chart.
- 5i. Axis scale and range: same as JANIS per page.
- 5j. Axis labels and chart title: same as JANIS.
- 5k. Bottom sheet: same items, same order as JANIS per page.
- 5l. Right rail: same items, same order as JANIS. Where this changes today's Elpis rail, add a toggle restoring the current Elpis view, in a section under the ELPIS/JANIS Δ section.
- 5m. Search: every JANIS field works, including the fields marked ❌ today; searches without a nuclide work; result rows can be plotted.
- 5n. Home, browse and checker: same content and layout as JANIS.
- 5o. JANIS view shows what JANIS shows, nothing more:
  - Threshold line and EXFOR sets JANIS doesn't draw (U-235 (n,f): 295 against JANIS's 228): ELPIS view only.
  - The sheet's list of sets not drawn: remove it. Any set we can't plot is a defect to fix, not a row to show.
  - Bottom sheet content: what JANIS shows. Our legend stays as is.
  - Browse row counts and home page counts: remove.
  - Temperature select: only if JANIS has one.
  - The rail's ❌/✅ marks stay in both views; they track completion.
- 5p. Approved affordances:
  - JANIS/ELPIS context switcher on the left rail title ("By nuclide").
  - Release select in the right rail: JANIS's release and all its conditions are the baseline (e.g. ENDF/B-VIII.0); choosing another release changes only the values that differ for that release.
  - Title on/off in the chart's kebab menu.
  - Legend off by default, on/off in the kebab menu (built).
  - No stepper arrows; the rail navigates, with keyboard up/down active when open (built).
- 5q. "ELPIS/JANIS Δ" section at the foot of the Plotter rail listing any physics deviation. Target: empty.
- 5r. Finish the JANIS tree map: 7,566 element pages unfetched, cache in `lake/_work/janis/pages/`. The crawler streams each library to disk and holds nothing in memory; parallel across IPs; concurrency ramped up until 429/403/refusals show, then held under that ceiling (`~/Code/scripts/SCRAPER-DOCTRINE.md` rule 2). Measure the ceiling.
- 5s. Every fix applies to all seven books, not the neutron book alone.

Each book opens to one fixed page (e.g. 44-Ru-96 MT28 (n,n+p)). Not a gap.

## 6. Paths
- Pages and components: `app/(site)/elpis/**`, `components/elpis/**`, `components/viz/chart-kebab.tsx`, `components/viz/use-echart.ts`.
- Book index: `public/elpis/book-{n,g,p,d,t,h,a}.json`, `books.json`, `res-ranges-n.json`; lake copy `lake/elpis/2026-11-11/`.
- JANIS tree and marks: `lake/janis/current/` on the CDN `https://daw1qggkn69lv.cloudfront.net`; scripts `scripts/janis/` (`crawl.py`, `mark.py`, `fill/`).
- Releases served: `RELEASES` and `INDEXED` in `services/nsr-api/structure.py` (47). Routes the pages call: `/endf/xs`, `/endf/section`, `/endf/section/production`, `/endf/resonances`, `/exfor/points`, `/exfor/search`, `/exfor/check`; route table in `services/nsr-api/README.md`.
- ENDF parsing and fan-out: `scripts/parse/endfb/README.md`, Lambda `nsr-endf-parse` (one invocation per material).
- PREPRO: `services/nsr-jobs/` and box `nsr-jobs-1` (`/opt/prepro/bin-o2`; linear → recent → sigma1).
- Library acquisition: `scripts/janis/fill/`, `scripts/iaea/box/wbget.py`; brief 70's report lists every failed route.
- For lookups only: `docs/HANDOFF-2026-11-11.md`.

## 7. Traps
- 7a. Briefs 67–71 present our additions as features. They are deviations; 5c and 5o say what goes.
- 7b. JANIS book pages need the session cookie its home page sets: open the home page first when fetching JANIS for reference.
- 7c. IAEA blocks boxes, Lambda and plain clients. First find how `raw/iaea/2026-11-07/` was fetched and reuse it. Brendan's small proxy budget is the last resort.
- 7d. Wayback holds JAEA's JENDL tarballs and NEA's evaluated tapes; fetch them free from a box.
- 7e. `/exfor/points` stops at 50,000 points per call; split energy windows.
- 7f. API gateway 30 s, Lambda answer 6 MB: ask six releases per call.
- 7g. Release `nsr-endf-parse`'s reserved concurrency after each fan-out, or nsr-api is capped at 100.

## 8. Working rules
- 8a. Finish the duplication phase completely, declare it done, then run the testing phase.
- 8b. Our design system and page frame stay. No redesign, no new components.
- 8c. Match JANIS by content and pattern: chart type, scale, series, symbols, items, order.
- 8d. Anything beyond JANIS appears only behind an approved affordance (5p).
- 8e. Never add a rule, floor, button or note JANIS doesn't have, unless Brendan says so.
- 8f. Compute in advance, never on click.
- 8g. Duplication is deterministic: same libraries, same tree counts at each level, same nuclides in the same order, same axes and scale, same series and symbols, same default release (JANIS's, even where we hold a newer one). Add-ons come after. Verify before declaring completion.
- 8h. Every fix applies to all seven books.
- 8i. Shared tree: `git pull --rebase --autostash origin main`, then `git commit -- <paths>`. Type check and lint on the dev box (i-0ec4775a5cd68d41b; `scripts/devbox/launch.sh start i-0ec4775a5cd68d41b`), not the Mac.
