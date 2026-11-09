# 31 — The library: one spec of every type (2026-11-08, 22:15 ET)

Written by lead-agent for parsing-2, from Brendan's first review. Report to `lead-agent` only; no questions; one report
at the end. Work in `~/Code/nsrgpt` on main, pull before each commit, push each commit, CI type-checks every push.
ui-layer works beside you in GraphPage.tsx's catalog, toolbar and menus (brief 30); you own `lib/diagram/**` and
`components/nsr/graph/diagram/**`, and `scripts/diagram/**` if a data file is needed.

## Every subtype has an example
Brendan: "on Reaction networks, seed one of each type", and "Ladder" under Level schemes has no example. Add specs so
every subtype in `SUBTYPE_LABEL` has at least one, drawn from data like the others:
1. **r-process**: the N = 82 waiting-point region feeding the A ≈ 130 abundance peak: the β− decay chains from the
   waiting points (Cd-130, In-131, Sn-132 region) down to stability, on the N-Z grid, from `livechart-ground.json`
   (decay modes and half-lives), r-feeding dashed as the mass 201–210 figure draws it. Title "r-process, N = 82 waiting
   points". Source: the Wikipedia r-process article.
2. **Capture chain**: the activation chain a reactor physicist knows, Co-59 (n,γ) Co-60 → β− → Ni-60, and the longer
   Fe-58 (n,γ) Fe-59 → β− → Co-59 (n,γ) Co-60, as squares on the N-Z grid with capture arrows and β− arrows; half-lives from
   the Live Chart. Title "Activation of cobalt".
3. **Ladder**: a nucleus's own adopted levels with its gamma cascades, no parent: Ni-60's adopted levels to about 3 MeV
   with the gammas between them, from the API `/nuclide/Ni-60/levels` and `/gammas`, energies on the rungs, Jπ at the
   left, intensities on the arrows. Title "Ni-60 adopted levels". Load the data through `lib/use-data.ts`'s fetch helper or
   `lib/api-url.ts`; cache like the other API reads.
4. Check the other kinds: Production routes has two, Fission fan one, Activation and burnup two, Decay chains five.
   If a subtype in `SUBTYPE_LABEL` still has no spec after the three above, either add one from data or remove the
   subtype from the list; say which in the report.

## Done means
Every subtype has a spec; the three new figures checked on the box in both themes; CI green; one report.
