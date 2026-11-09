# 42 — Handoff for the next lead-agent session (2026-11-09, 02:55 ET)

You are the NSRgpt lead (Fable), Brendan's thinking partner. Read in this order: `docs/briefs/12-night-shift-handoff.md`
(the role), `docs/sketches/2026-11-06-efficiency-voice.html` (how to write to him, rules 25–27 are the working model),
`docs/briefs/41-morning-report-2026-11-09.md` (where everything stands), then the memory files the harness loads
(`lead-agent-working-model`, `brendan-review-session-rules`, `no-blocking-ci-waits`, `compact-counts-in-ui`,
`night-2026-11-09-state`, `diagram-library-2026-11-08`).

## The working model, in six lines
1. You judge and brief; other windows do bulk work. Briefs are files in `docs/briefs/` (next number 43), committed,
   kicked off with one line through SendMessage to the window by name. Never print a brief in chat.
2. Small UI asks ("you do this", one class, one label) you ship yourself at once, push, say "live in 20 s". Big ones
   go to a window. If he says "you do this" and you want to delegate, say so first and wait.
3. "rn"/"ao" = tell him first. "go" = act. "10"/"20" = word caps. "list" = numbered list. "y/n" gets yes or no.
   "noted" = acknowledged, drop it. Never write "Ways out".
4. Push, report, move on. Don't loop on `gh run list`; check CI once later. Workers type-check on the box before pushing.
5. Plain language, paper palette, no captions that restate the layout, counts in short form (304K) in tiles and
   pills, exact in tables. Port the named source whole, then adapt.
6. He reviews each morning against the morning report and wants the deck committed and pushed before he sleeps.

## Windows (peer sessions, SendMessage by name)
`ui-layer`, `ui-layer-2`, `ui-layer-3`: Opus windows, all idle at handoff, all working in `~/Code/nsrgpt` on main
(one shared checkout: commit with explicit paths, pull before each commit). The parsers are gone. Brendan opens or
closes windows; you ask, you don't spawn.

## Where things run
- **Repo:** `nyd-user-1/nsrgpt`, main only, clean at 6e05797. GitHub Actions runs Typecheck and Deploy to Cloudflare
  on every push; production is https://nsrgpt.brendan-stanton.workers.dev.
- **Dev box:** EC2 `i-0ec4775a5cd68d41b` (us-east-2, profile `nysgpt-new`), http://13.184.13.46:3000, pulls main
  every 20 s, serves within 20 s of a push. It stops itself 6 h after boot (set to 10:22 ET this morning);
  `scripts/devbox/launch.sh start i-0ec4775a5cd68d41b` restarts it and prints the new address (the IP changes).
  Dev sign-in, Bedrock and Athena work there through its role. SSM for commands: see `scripts/devbox/`.
- **Lake and API:** `s3://nsr-lake-613473203863`, Glue `nsr`, Athena workgroup `nsrgpt`; Lambda `nsr-api` behind
  https://daw1qggkn69lv.cloudfront.net (routes in `services/nsr-api/README.md`); chart data CDN
  https://dcl3kyt3ynmb2.cloudfront.net/viz-data/v20261108/.
- **Codespace:** dead (GitHub billing 402); the box replaced it. Proxy plan spent.
- **Rollback:** tag `before-diagram-library` (1ec1a91) predates the whole evening of 2026-11-08/09.

## Open, in order (details in brief 41)
1. Production saves need the Cloudflare secret `NSR_API_WRITE_KEY` (value in SSM `/nsrgpt/devbox/nsr-api-write-key`).
2. Brief 40 items 1–3: a plate box for every sidebar page, icons in place of numbers, drag to reorder (ui-layer-2).
3. Brief 39 part 2: the four decay series on the Z by A grid, plus decay-chart polish (ui-layer-3).
4. Brief 37 item 4: element symbols on the chart of nuclides on zoom (the first attempt blanked the cells).
5. Bugs: radiations over 100% on the nuclide card; /viz/heatmap's rainbow ramp; "60Cobalt" labels from /api/graph;
   a stray workspace file in the Library.
6. Next parsing: JEFF-3.3, JENDL-5, TENDL-2023, CENDL-3.2 into the ENDF-shaped tables; MF8 and MF33.
7. The chat discussion Brendan asked for (tools, accuracy, embeddings toggle); facts in brief 41's last section.

## Kickoff for the new window
`Read ~/Code/nsrgpt/docs/briefs/42-handoff-lead-agent.md and take over as NSRgpt lead; report in EV.`
