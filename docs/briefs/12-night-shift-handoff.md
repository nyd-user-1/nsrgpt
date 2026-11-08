# 12 — Night shift handoff (2026-11-07, about 8:45 PM)

You're the night-shift lead for NSRgpt. Read the Efficiency Voice rules first (`docs/sketches/2026-11-06-efficiency-voice.html`,
22 rules) and report in them. NSRgpt: "Find, read, connect and work with nuclear data. In seconds." The plan is to hold
every nuclear dataset worth having, then parse, index and cite it in the app.

## Standing rules
1. The Mac has 8 GB: no python3, AWS CLI one call at a time; listing, parsing and fan-out run on AWS (Lambda or a box).
2. No commits or pushes without Brendan's say-so; no subagents. A hook blocks dev servers and builds without his express go.
3. The repo stays a thin UI layer; data and heavy work live in the lake and behind APIs. Pages load instantly.
4. Copy from the named source, then adapt (EV rule 14). Plain language.

## Where things stand
- Lake `s3://nsr-lake-613473203863` (profile `nysgpt-new`, us-east-2): about 277 GB, 73,926 files. `INVENTORY.md` at its root;
  `docs/sketches/2026-11-07-data-index.html` counts the core five (NSR, ENSDF, XUNDL, EXFOR, ENDF/B).
- agent-2 (`uds:/tmp/cc-socks/17897.sock`, brief 11) is done except its Internet Archive lane: box `nsr-wayback-1` (t3.small),
  about 59 GB left (TENDL-2023/2021, JENDL special files, JEFF-3.3 charged particles, then the 15 pending Quick Links' files),
  ETA about 02:30 UTC 2026-11-09. It relaunches the box every 4 hours. Spend about $0.90 of $5.
- Proxy army (Webshare, 250 GB a cycle, ends about 2026-11-19, not renewing): about 140 GB left, reserved for Brendan's evening
  evaluation. Pending proxy list: `raw/iaea/2026-11-07/_work/pending-proxy-window.json` (11,289 URLs, about 7.4 GB).
- `/pipeline` (pax2's production map, ported): sources, the lake and core datasets, built and planned surfaces. Code in
  `components/pipeline/`, data in `lib/pipeline-map.ts`. In the codespace; its dev server is off (needs Brendan's go).
- EXFOR remake sketch: `docs/sketches/2026-11-07-exfor-replica.html`, seed data, every "?" opens IAEA's real help page
  (copied to `raw/iaea/2026-11-07/exfor/help/`). The recipe for the real build is the collapsible prompt at its bottom.
- IAEA inventory sketch: `docs/sketches/2026-11-07-iaea-inventory.html` (Coverage, Holdings, Routes and spend tabs).
  Its "Save notes" writes `~/Downloads/iaea-inventory-notes-*.md`; read the newest when Brendan says his notes are saved.

## Uncommitted (Brendan decides)
README.md, the EV rule 22, `app/(site)/pipeline/`, `components/{pipeline,dash,blocks.tsx}`, `components/ui/nova/tooltip.tsx`,
`components/sidebar/SideBarFold.tsx`, `lib/{pipeline-map.ts,header-titles.ts}`, `services/{nsr-fetch,nsr-count,iaea-pull}/`,
`scripts/{nndc,proxy,nsr-fetch-ui,iaea}/`, and the 2026-11-07 sketches. The old `2026-11-04-datasets-erd.html` is staged for removal.

## Open, in Brendan's order when he gives it
1. The evening proxy evaluation (the 140 GB reserve against the pending list).
2. Build the real EXFOR search from the sketch's recipe (parse X4Pro and J4 into tables, cached API, /exfor).
3. Parse layer for ENSDF, XUNDL and ENDF/B; then search indexes beyond NSR; then answers that cite their record.
4. Saved chats: the DynamoDB table `nysgpt-ledger` doesn't exist yet.
5. Dev server go, then commit and push go.
