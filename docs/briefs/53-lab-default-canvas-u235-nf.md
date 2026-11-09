# 53 — The Lab's default canvas: U-235 (n,f), 9 to 18 keV, measured against evaluated (2026-11-09)

You're `window-2-ui-layer`. Written by `lead-agent` (Fable); Brendan approved the Lab and this test case at 18:20 ET.
Report to `lead-agent` by SendMessage only, one line when the canvas opens by default and one final report; nothing
goes to Brendan until the Lab lands. No questions. Efficiency Voice (`docs/sketches/2026-11-06-efficiency-voice.html`).
Peers: `window-3-cognito-pool` builds /lab and pushes the block contract (`lib/lab/blocks.ts`, brief 52) within the
hour; `window-1-parser` builds the routes and the job runner (brief 51) and will message you the warm job ids.

## Rules
1. `~/Code/nsrgpt` on main, shared: pull with `--rebase --autostash`, commit in one step with explicit paths, push
   right after. Type-check on the dev box before each push. You own `lib/lab/default.ts`, `lib/lab/canvases/**`
   (new), and the Plot kind's chart options if window-3 hands them to you; otherwise you build against their kinds.
   Don't touch `components/nsr/graph/**` or window-3's files without messaging them first.
2. Paper palette, the dataviz skill's series colours (evaluations as lines in the categorical palette, EXFOR
   datasets as hollow points, the band as the evaluation's colour at low alpha), plain language.

## The canvas (`lib/lab/canvases/u235-nf-9-18-kev.ts`, named in `lib/lab/default.ts`)
Title: "U-235 (n,f): measured against evaluated, 9 to 18 keV". Blocks left to right, wired:
1. **Data, EXFOR:** target U-235, reaction N,F, quantity SIG, 1e3 to 2e5 eV. Output: points with their dataset ids.
2. **Data, ENDF cross sections:** name U-235, mt 18, releases B-VIII.1, JEFF-3.3, JENDL-5, 1e3 to 2e5 eV. Output:
   three series.
3. **Data, covariance:** B-VIII.1 (and the others where held), mt 18. Output: groups with relative sd.
4. **Process, Broaden:** the three releases to 300 K (900 K as a second temperature the reader can switch on). The
   warm results window-1 prepares make this instant on first load; a rerun goes to the box.
5. **Compare:** data points against the broadened series, 20 bins per decade, highlight 9e3 to 1.8e4 eV, band from
   block 3. Output: the bin table and three ratio series with lo/hi.
6. **Plot:** σ against E (log-log) with points, lines and bands; the ratio view beneath or by toggle, 9 to 18 keV
   shaded. Each point opens its EXFOR subentry in the right panel.
7. **Prompt:** "Where do the measurements and the evaluations part on U-235 (n,f) between 9 and 18 keV, by how
   much, and which measurements carry it? Cite the EXFOR entries and the papers." Context: the Compare table and
   the datasets' authors and years. The answer should surface 2020AMZZ (Amaducci, n_TOF); if the retrieval doesn't,
   record it in the report rather than hard-coding it.
Layout: Data blocks in a column at left, Process and Compare in the middle, Plot large at the right top, Prompt
beneath it. The canvas opens with blocks 1 to 6 already run (the warm path) and the Prompt idle with Run showing.

## Checks before you call it done
On the box: /lab opens on this canvas within 3 s with the plot drawn; the ratio view shows the 9 to 18 keV window;
clicking a point opens a subentry; Run on the Prompt streams an answer with chips; Run all reruns without errors;
both themes. Report the measured ratio in the 9 to 18 keV window per release (the number the demo makes).

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/53-lab-default-canvas-u235-nf.md and do it; report to lead-agent when the canvas opens by default.`
