# 58 — The pages for the morning review: /nsrcpt, /about, /sweep, /sweep/medical (2026-11-10, overnight before launch)

You're `worker-2`. Written by `lead-agent` (Fable) from brief 55 (read it first). You are on brief 54 Part C now;
finish C, then this brief, then 54's Part D (the "Decay chain" rename), then the release pickers and counts
`worker-1` reports. Launch is in the morning: Brendan opens every page on the dev box and on production when he wakes.
Report to `lead-agent` by SendMessage only, in Efficiency Voice (`docs/sketches/2026-11-06-efficiency-voice.html`):
one line per page as it lands with its URL on the box, one report at the end. No questions mid-job.

## Rules
1. Mac rules: no local `tsc` (the hook blocks it); type-check on the dev box through `scripts/iaea/box/ssm.sh`;
   screenshot there with Playwright at `/opt/shot` (both themes, the theme key is `theme`). The box stops itself
   about 07:10 ET: `scripts/devbox/launch.sh start i-0ec4775a5cd68d41b` restarts it and prints the new address; SSM
   needs about a minute after start.
2. `~/Code/nsrgpt` on main, shared with `worker-1` and `worker-3`: `git pull --rebase --autostash origin main`, commit
   in one step with explicit paths, push right after. Never `git add -A`. You own `app/`, `components/`, `lib/`;
   `worker-1` touches only `lib/auth.ts`, `components/shell.tsx`'s admin lines, `lib/data-dictionary.ts` and
   `lib/pipeline-map.ts`; `worker-3` nothing in your tree. Pull often.
3. The standards: the page's name in the app shell header (`lib/header-titles.ts`, brief 38; no page draws its own
   h1); a sidebar row (`components/sidebar/SideBarMenu.tsx`, `ALL`, group Main) and its icon in `PAGE_ICONS`; a plate
   box (`lib/viz-charts.ts` `PLATE_PAGES`); the paper palette (`--paper-*`); counts through the page-wide formatter
   (304K, 9.1M); plain language, no label that restates what the layout shows; the app speaks in the first person
   singular. A static shell that reads the API after it paints (the pattern of `app/(site)/datasets/[source]/page.tsx`
   and `components/datasets/DatasetIndex.tsx`; `lib/api-url.ts`'s `apiUrl`). Check `scripts/check-static-shells.sh`
   still passes.
4. Port whole, then adapt (EV rule 17): `/nsrcpt` is `~/Code/nsr/src/pages/Announcing.tsx` as it is, every number
   kept, restyled only where the palette and the shell force it.

## Order
A `/nsrcpt` → B `/about` (neither waits on data) → C `/sweep` → D `/sweep/medical` (as `worker-3`'s routes land; they
message you each route with an example; build the shells against brief 57's shapes from the start, with the sample
rows in `lib/sweep-sample.ts` until the route answers) → 54 Part D → the pickers and counts.

## A: `/nsrcpt`
1. `app/(site)/nsrcpt/page.tsx` + `components/nsrcpt/Announcing.tsx`: the 787-line page ported whole (its `BarChart`,
   `Legend`, `Stat`, `Claim`, `FootRow`, `FinePrint`, the data arrays, the two bar colours checked against the paper
   palette with the dataviz validator the way the source did). The hero's "Live now on nsr.nysgpt.com" becomes "Live
   on this site: every search runs on it" if NSRgpt's /search runs on nsr-encoder (check `lib/nsr-search.ts`; if it
   does not, say "Served from huggingface.co/NYSgpt/nsr-encoder" and nothing about this site). The source's
   `text-nuclear` accent maps to the house red. Header title "NSR-CPT"; sidebar row; plate box ("The retrieval model
   trained on 277,068 nuclear-physics references, with its benchmark.").
2. The foot: a "Coming soon" section, cards from `lib/home-data.ts`'s `HF_MODELS` in the home grid's card component
   (`components/home-grid.tsx`): the NSR pair first (nsr-encoder, nsr-reranker) marked "Served" where the app uses
   them, then the rest of the family (Rxiv Biomed, 44b, CSHL, Martian) marked "Coming soon", each linking to its
   Hugging Face page. One line above the cards, first person: "The models I will serve next, trained the same way."
3. Both themes on the box; the SVG charts theme with the palette.

## B: `/about`
`app/(site)/about/page.tsx` + `components/about/About.tsx`, first person singular, plain language, the paper palette,
no captions that restate the layout. Sections, each a short paragraph or a list, no heading that renames the section
under it:
1. Who I am for: evaluators and the USNDP, NNDC and IAEA-NDS community; experimenters compiling to EXFOR; reactor,
   shielding and medical physicists; students.
2. What I hold, by layer with live counts from the API (the lake page's counts source; the Pipeline page's rows in
   `lib/pipeline-map.ts` are the names): NSR, ENSDF, XUNDL, EXFOR (datasets and points), ENDF/B's nine releases and
   JEFF-3.3, JENDL-5, TENDL-2023, CENDL-3.2 (materials, sections, points), ICRP 107, the decay chains, the models.
3. What I do: search by meaning with citations; the chart of nuclides and the charts; the graph with its diagrams;
   the Lab; the sweep (one sentence: every measured cross section against every evaluation, ranked, rerun the day a
   library changes) with a link to `/sweep`; chat that cites the record it read.
4. How I am built: the lake in S3, Athena tables, the API, the pages; a link to `/pipeline`, `/factory`, `/schema`,
   `/data-dictionary`; the sources page's credits line.
5. Who made me: Brendan Stanton, NYSgpt; the contact address `brendan@nysgpt.com`.
Header title "About"; sidebar row; plate box.

## C: `/sweep`
Brief 57 Part A.5 and C give the routes: `GET /sweep?release=&sort=&dir=&nuclide=&mt=&sub=&min_datasets=&single=&page=`,
`GET /sweep/pair?target=&mt=&sub=&release=`, `GET /sweep/releases`, `GET /sweep/retrodiction`, `GET /sweep/flags`.
1. `app/(site)/sweep/page.tsx` + `components/sweep/SweepPage.tsx`: the ranked table (target, reaction, release,
   points, datasets, mean ratio, z, the largest bin's deviation and energy, MF33 sd, the driver dataset, support),
   100 rows a page, sorted by z by default; filters in the right panel (the Switchboard's sections, as the charts'
   controls are): release (B-VIII.1 default), sublibrary, nuclide (the entity search's picker), MT, minimum datasets,
   "single-dataset disagreements" toggle (`&single=1`). A row click opens the pair in the second panel: the bins as a
   ratio chart (ECharts, the Lab's plot style: points per dataset, the band at 1 ± MF33 sd, the bin means) and the
   per-dataset table with each subentry linking to `/datasets/exfor/<subentry>`; a button "Open in the Lab" that goes
   to `/lab?target=U-235&reaction=N,F&mt=18&emin=&emax=&releases=B-VIII.1,JEFF-3.3`. Header title "Sweep";
   sidebar row; plate box ("Every measured cross section against every evaluation, ranked by disagreement.").
2. The Lab from parameters: `lib/lab/canvases/from-pair.ts`, generalising `u235-nf-9-18-kev.ts` (the same six blocks
   with the pair's target, reaction, MT, window and releases; the Prompt's question written for the pair); `LabPage`
   reads the query when there is no `?canvas=` and builds it. Nothing else in the Lab changes.
3. Tabs on the page (the Switchboard's tabs where the charts have them, else a row of pills at the top of the
   table): "VIII.1 list" (the default), "Retrodiction" (`/sweep/retrodiction`: the summary's three numbers in one row
   as stat tiles without captions that repeat them, then the ranked table with `changed` and `moved toward data` as
   check marks), "Flags" (`/sweep/flags`: two tables, the VIII.1 entries not on any public list with their receipts,
   and the EXFOR datasets by rule, each row linking to its subentry record and its NSR paper).
4. Every number from the API; nothing typed into the page.

## D: `/sweep/medical`
Brief 57 Part D: `GET /sweep/medical` and `GET /sweep/medical/{route}`.
1. `app/(site)/sweep/medical/page.tsx`: the routes table (product, route, irradiation, each evaluation's yield, the
   data's yield, the spread across evaluations, the verdict as a tinted pill: agree / disagree beyond the data);
   sorted by the spread descending. Header title "Medical isotope routes"; sidebar row under Sweep; plate box
   ("Production routes for the medical isotopes, each route's yield from every evaluation and from the data.").
2. `app/(site)/sweep/medical/[route]/page.tsx`: the route's chart (EXFOR points by dataset, each evaluation's curve,
   the IAEA recommended curve where held; log-log; the legend in the right panel as the charts' legends are), the
   yield table beneath (evaluation, yield, uncertainty, method), the verdict sentence, the route's chain where the
   product is a daughter (the parent's half-life from ICRP 107), "Open in the Lab" with the route's pair, and the
   method paragraph from the manifest (the stopping-power formula and the assumed spectrum, named).
3. The decay-only routes (generators) show the parent, the half-life and no chart.

## Done means
Four pages live on the box and on production, both themes checked, each in the header, sidebar and plate; the Lab
opens from a sweep row; CI green; one final report to `lead-agent` with each page's URL on the box and production
and anything left out.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/58-sweep-medical-nsrcpt-about-pages.md; after 54 Part C, do it in order; report to lead-agent after each page.`
