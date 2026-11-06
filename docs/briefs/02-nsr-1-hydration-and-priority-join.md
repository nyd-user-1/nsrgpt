# Brief 02 — nsr-1: React error #418, then the priority-vs-coverage join

From lead-agent, 2026-11-05. Repo: `nyd-user-1/nsrgpt` (private), local `/Users/brendanstanton/Code/nsrgpt`.

## Context

NSRgpt is NYSgpt cut down to its NSR content. I (lead-agent) am doing the cut on `main`; nsr-2 is on speed (branch `perf`). Brendan is away until ~21:00 and expects a working Cloudflare deploy.

## Task A — React error #418 (first)

Every page load on nysgpt.netlify.app throws `Minified React error #418` (hydration mismatch, args `HTML`). The same code is in nsrgpt, so fix it there.

- Reproduce headless against https://nysgpt.netlify.app/viz/nuclide-card and `/`. Tools already on disk: `require('/Users/brendanstanton/Code/pax-trinity/node_modules/playwright-core')`, executable `~/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`. Keep scripts in your scratchpad.
- Find the component whose server HTML differs from the first client render. Likely suspects: anything rendering time or relative time (`VisitorLog.tsx` shows "57s"), `Date`/`Math.random`/locale formatting during render, `CountUp`, theme-dependent markup outside `suppressHydrationWarning`, `typeof window` branches in render.
- Fix the cause (move to `useEffect`, or render a stable placeholder first). Don't paper over it with blanket `suppressHydrationWarning`.

## Task B — priority-vs-coverage join (only with assets we already hold)

Brendan approved this only if it needs no new data. Inputs we hold:
- Ranked nuclide/reaction lists from the Nuclear Data Week decks, text at `/private/tmp/claude-501/-Users-brendanstanton-Code-NYSgpt/3a69a5b1-fd09-461a-a619-1f0d6fc5b322/scratchpad/slides.txt` (Hutchinson/LANL: ranked pairs missing MF33 with `user_rank`, Z, A, MT; Ebiwonjumi/MIT: prioritized reactions table). PPPL's top nuclides/modes (Pb-207, Pb-206, Er-166, Mg-26, Er-170, Zr-92, Mo-92, Zr-96, Pt-196, Pb-208; W-180, Si-28, O-16) are from photos only.
- Athena database `nysgpt_nsr` (us-east-1): `exfor_entries`, `nsr_exfor`, `nsr_reactions`, `nsr_nuclides`, `reaction_dict`, `nuclide_dict`.

Map each ranked (Z, A, MT) to the EXFOR/NSR reaction notation (MT2 elastic → N,EL; MT4 → N,INL; MT16 → N,2N; MT102 → N,G; MT103 → N,P; MT105 → N,T; MT107 → N,A), count EXFOR entries and NSR papers per pair, and write:
- `docs/analysis/2026-11-05-priority-vs-coverage.csv` (rank, source, nuclide, MT, reaction, exfor_entries, nsr_papers)
- `docs/analysis/2026-11-05-priority-vs-coverage.md` — a short plain table and three or four plain sentences on which high-priority pairs are thinly measured.

If the schema can't support the join without new data, stop and write down what's missing instead.

## How

- Work in a worktree: `cd /Users/brendanstanton/Code/nsrgpt && git worktree add ../nsrgpt-418 -b fix-418` and stay there.
- **No local builds, dev servers, typechecks or lint** (a hook blocks them). Syntax check: `node_modules/.bin/esbuild <file> --loader:.tsx=tsx > /dev/null` run from `/Users/brendanstanton/Code/NYSgpt`.
- Files: only what #418 needs, plus `docs/analysis/`. Do NOT touch `components/SwitchboardPanel.tsx`, `lib/home-data.ts`, `app/(site)/(plate)/**`, chat, auth, `package.json`, `.github/`, `wrangler.jsonc`, or `components/viz/**` (nsr-2's).
- Commit messages in Brendan's style (what and why, dated), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push `fix-418`; SendMessage `lead-agent` after Task A (files + cause) and again after Task B.
- Prose: plain literal words, first person singular, no metaphors.

Target: Task A within 25 minutes.
