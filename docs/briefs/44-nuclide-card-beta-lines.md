# 44 — The nuclide card's β lines read the wrong columns (2026-11-09)

You're `window-2`, the UI window. Written by `lead-agent` (Fable); Brendan assigned this at 10:40 ET and will look at
the result on the dev box (http://3.150.112.32:3000, pulls main every 20 s). Report to `lead-agent` by SendMessage in
one line when it is pushed. Efficiency Voice: `docs/sketches/2026-11-06-efficiency-voice.html`; read it first.

## Rules
1. Work in `~/Code/nsrgpt` on main, a checkout shared with other windows: `git pull --rebase --autostash origin main`,
   then commit in one step with explicit paths (`git commit -m "…" -- <paths>`), push right after. No `git add -A`.
2. Type-check before pushing on the dev box through SSM (the Mac is an 8 GB Air; no builds or `tsc` on it). CI runs
   Typecheck and Deploy on every push.
3. Change only what the issue needs. Paper palette, plain language, no new captions.

## The issue
`app/(site)/viz/chart/chart.tsx` lines 185–189 read every radiation line as `[keV, %]`, but β− and β+ lines in
`radiation/<Z>.json` are stored as `[mean keV, endpoint keV, %, neutrino mean keV]` (written by
`scripts/iaea-livechart-build.mjs` lines 133–136; the other types are `[keV, %]` or `[keV, %, note]`). So the card's
"Major radiations" prints the endpoint energy as the percentage: 137Cs shows β− 174 keV at 514%. That is wrong. The
correction is reading column 0 as keV and column 2 as % for `bm` and `bp` lines, sorting those two types by column 2
when choosing the top three; the other types stay as they are.

## Do
1. In `chart.tsx`, a small accessor for a line's percentage and energy by type (`bm`/`bp` → columns 0 and 2; else 0 and
   1; the note stays column 2 for the `e` and `x` lines), used by both the sort and the rows. Four to six lines.
2. Fix the comment on `Radiation` in `app/(site)/viz/chart/data.ts` line 31 so it states the real shape per type.
3. Check `app/(site)/viz/radiation/chart.tsx` (the decay radiation card, same files): it already draws β as mean and
   endpoint (its line 14), so it reads the four columns correctly; confirm and leave it.
4. Verify on the dev box: open /viz/chart, pick 137Cs; "Major radiations" shows β− 174.3 keV 94.7%, γ 661.7 keV 85.1%.
   Check 60Co (β− 95.8 keV 99.9%) too.

## Done means
Pushed, type check green, the two nuclides reading right on the box, one line to `lead-agent`.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/44-nuclide-card-beta-lines.md and do it; report to lead-agent in one line when pushed.`
