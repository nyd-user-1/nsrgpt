# 47 — Ten more decay chains in the rail, from the generator (2026-11-09)

You're `window-2-ui-layer`. Written by `lead-agent` (Fable); Brendan assigned this at 15:40 ET and reviews on the dev
box (http://3.150.112.32:3000). Report to `lead-agent` by SendMessage only, Efficiency Voice
(`docs/sketches/2026-11-06-efficiency-voice.html`): one line when pushed, then the list in "Done means". No questions.

## Rules
1. `~/Code/nsrgpt` on main, shared: `git pull --rebase --autostash origin main`, commit in one step with explicit paths,
   push right after. Type-check on the dev box through SSM before pushing. CI type-checks every push.
2. Same shape as the five chains there now. Brendan: "why would I change the shape now?" No new parts, no new grid, no
   new config. The generator already exists: `chainFrom(head)` in `lib/diagram/data.ts` walks ENSDF's ground-state decay
   modes from a head (Z, N) through `seriesFrom` in `lib/viz-physics.ts`; the five entries in `SERIES_SPECS`
   (`lib/diagram/library/series.ts`) are one line each. The ten new chains are ten more lines of the same kind.

## The ten (id, title, subtype, source, head as [Z, N])
1. `u232-chain` … "U-232 chain" … `single-chain` … https://en.wikipedia.org/wiki/Uranium-232 … [92, 140]
2. `pu238-chain` … "Pu-238 chain" … `single-chain` … https://en.wikipedia.org/wiki/Plutonium-238 … [94, 144]
3. `cm244-chain` … "Cm-244 chain" … `single-chain` … https://en.wikipedia.org/wiki/Curium-244 … [96, 148]
4. `rn222-progeny` … "Radon-222 progeny" … `single-chain` … https://en.wikipedia.org/wiki/Radon-222 … [86, 136]
5. `sr90-chain` … "Sr-90 chain" … `single-chain` … https://en.wikipedia.org/wiki/Strontium-90 … [38, 52]
6. `cs137-chain` … "Cs-137 chain" … `single-chain` … https://en.wikipedia.org/wiki/Caesium-137 … [55, 82]
7. `mo99-chain` … "Mo-99 chain" … `single-chain` … https://en.wikipedia.org/wiki/Molybdenum-99 … [42, 57]
8. `mass-131-chain` … "Mass 131 fission chain" … `single-chain` … https://en.wikipedia.org/wiki/Iodine-131 … [50, 81]
9. `mass-135-chain` … "Mass 135 fission chain" … `single-chain` … https://en.wikipedia.org/wiki/Xenon-135 … [52, 83]
10. `mass-140-chain` … "Mass 140 fission chain" … `single-chain` … https://en.wikipedia.org/wiki/Barium-140 … [54, 86]

The order in the rail: the four series, Pu-241, then these ten in the order above. The rail's count reads 15.

## Check each on the box
Open each in /graph. Each must draw its members to the stable end with α and β edges and half-life text, both themes.
Things the generator may do that you record rather than fix:
- Isomers collapse to the ground state (decay.json is indexed by Z and N): Cs-137 will show Cs-137 → Ba-137 without
  Ba-137m, Mo-99 will show Mo-99 → Tc-99 → Ru-99 without Tc-99m. Record what each shows.
- Branches under 0.001% and modes that change A (β−n, cluster emission) are skipped by `seriesFrom`'s rule; a chain that
  ends early because of it is recorded with the nuclide where it stopped.
- A head missing from decay.json draws nothing: record it and leave the entry in place.
If a chain draws wrong for a reason you can fix in `series.ts` alone (a wrong head), fix it. Anything in `data.ts` or
`viz-physics.ts` is recorded, not changed; `lead-agent` decides.

## Done means
Pushed, type check green, 15 in the rail, each of the ten opened on the box in both themes. Report: one line "pushed",
then a numbered list of the ten with what each draws (members in order, or the gap), 10 words each.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/47-ten-more-decay-chains.md and do it; report to lead-agent when pushed.`
