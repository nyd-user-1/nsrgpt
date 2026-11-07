# 10 — NSRgpt /docs media: screenshots, guide videos, recordings, narration (2026-11-07)

You're "media-agent". Brendan approved this work. You build the media for NSRgpt's new /docs help center:
screenshots, narrated guide videos and three screen recordings. ui-agent (`uds:/tmp/cc-socks/25842.sock`) builds the
/docs pages and articles. merge-agent (`uds:/tmp/cc-socks/25216.sock`) is the lead; if you hit a conflict, it decides.

## Rules (Brendan's, standing)
- Efficiency Voice: `~/Code/nsrgpt/docs/sketches/2026-11-06-efficiency-voice.html`. Read it first. Short, numbered, facts only.
- No commits and no pushes. Brendan directs both.
- No subagents. Plain language. Any on-screen words speak in the first person singular ("I"), never "we".
- Copy, don't rebuild: the pipeline is pax-trinity's, brought over exactly, then adapted.
- Full-project `tsc` is banned on the Mac by a hook. Don't work around hooks.
- Your Mac has 8 GB. Do capture and rendering in the codespace.

## What you own (write nowhere else)
- `~/Code/nsrgpt/scripts/docs-media/`, on the Mac and in the codespace at `/workspaces/nsrgpt/scripts/docs-media/`.
  It gets its own `package.json` and `node_modules`. Don't touch the root `package.json` or lockfile.
  ui-agent is adding `scripts/docs-media` to `tsconfig.json`'s exclude.
- Hosting is ON HOLD (merge-agent, 2026-11-07): don't upload anywhere until Brendan picks the bucket. Two options
  are with him: pax-trinity's clips bucket behind CloudFront (`s3://pax-trinity-clips-613473203863/nsrgpt/docs/`,
  `https://d19bx9wfmnrb34.cloudfront.net/nsrgpt/docs/`), or NSRgpt's own private bucket
  (`s3://nsr-lake-613473203863/files/docs/`, us-east-2, no CloudFront yet). Capture and render into
  `scripts/docs-media/capture/` and keep the files there.

## Source to copy
`~/Code/pax-trinity/scripts/docs-media/`: README.md, Guide.tsx, Recording.tsx, Root.tsx, index.ts and
capture/{shots,guides,record,narrate}.mjs and play-badge.py. Read the README; it's the whole method. Remotion 4.0.524
and playwright-core 1.60.0, as pax-trinity pins them.

## Where to capture
- Codespace `nsrgpt-dev-jjg4wr96jqg9cqx7x`. The dev server is already running on `localhost:3000` (ui-agent's).
  Don't restart it or edit app files. `gh codespace ssh -c nsrgpt-dev-jjg4wr96jqg9cqx7x`.
- Git over ssh has no GitHub credentials there. Move files with `tar | gh codespace ssh -- 'tar x'` or `gh codespace cp`.
- Playwright needs a Chromium there (`npx playwright install chromium --with-deps` inside your folder).
- Viewport 1440×900 at deviceScaleFactor 2, JPEG, as pax-trinity's. Dark mode: read `lib/theme.ts` (THEME_KEY,
  theme names) and set a dark theme before load, the way pax-trinity's init script sets `pax:theme`.
- Chat is out of scope (not ready). No sign-in needed.

## Names (ui-agent writes the articles against these; keep them exact)
Screenshots, `shots/<name>.jpg`:
- `home` (the index with its masthead), `sidebar` (SideBarMenu open), `search` (⌘K open), `nav` (a click on the
  header's empty space opens the Nav), `panel-2` (a chart open in the second panel), `notes` (a ShiftNote),
  `switchboard` (the right panel with a chart's controls), `chart-type` (the chart-type menu at a frame's foot open),
  `tooltip` (a scatter point hovered), `engaged` (a 3D chart clicked, camera keys showing), `data-table`
  (`/viz/data/nebula`).
- One per chart: `chart-<slug>` for every href in `lib/viz-charts.ts` (`/viz/nebula` → `chart-nebula`), 32 in all.

Guide videos, `videos/<name>.mp4` plus a `<name>.jpg` poster (Remotion `Guide`), 7:
1. `guide-find-your-way`: sidebar, SearchBar, Chat/Charts/Data rows, a group's branch opening, the Nav.
2. `guide-read-a-chart`: a box on / opens a chart, hover a point, the tooltip, the chart-type switcher.
3. `guide-3d-camera`: a 3D chart, click to engage, the camera keys, Esc.
4. `guide-panel-2`: the UpRight Arrow on a sidebar row, then the box's panel button on /.
5. `guide-search`: ⌘K, type, a scope chip, Enter.
6. `guide-data-table`: a chart's table, arrow keys, select rows, copy.
7. `guide-notes`: Shift-drag a note, write in it.

Screen recordings, `videos/<name>.mp4` plus poster (Remotion `Recording`, captioned segments), 3:
- `record-decay` (`/viz/decay`, the simulation running), `record-levels` (`/viz/levels`, the 3D level energies
  turning and a selection flying the camera), `record-reactions` (`/viz/reactions`, the flow lines).

## Narration
pax-trinity's `narrate.mjs`: Polly neural Ruth and Matthew, in the OLD AWS account (the new account's org policy
denies Polly). ElevenLabs Sarah only if pax-trinity's `.env.local` key has characters left. The first working voice is
the default, uploaded as `<name>.mp4`; each other as `<name>.<voice>.mp4`. Captions and titles: plain, first person.

## Done means
1. Every file above is rendered in `scripts/docs-media/capture/{shots,videos}/`. Once Brendan picks the bucket,
   it's uploaded and `curl -sI` on each URL returns 200 with `image/jpeg` or `video/mp4`.
2. You send ui-agent the final NARRATORS list and the GUIDES list (name, title, summary) for `lib/docs/media.ts`.
3. You report to Brendan in your own window: numbered, facts only, what's live and anything left out.
