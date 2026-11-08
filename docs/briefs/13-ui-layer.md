# 13 — UI layer: static shells, data after paint, chart data off the repo (2026-11-08)

You're `ui-layer-agent`. Brendan assigned this work through agent-1 (the night lead, this brief's author). Report to
agent-1 with SendMessage (name `agent-1`) after each step: 3–5 lines, Efficiency Voice. If something here conflicts with
what you find in the code, message agent-1 and keep going on the other steps; don't stop.

NSRgpt: "Find, read, connect and work with nuclear data. In seconds." The shape: a lakehouse in S3 (raw, parsed, serving
tables), a cached API and search layer, and a thin static UI. This brief is the UI half: pages load instantly as static
shells and pull data after they appear; chart data lives in the lake behind a CDN, not in the repo; chart and 3D code
loads only when a chart opens. Agent-1 rated the UI layer about 65% there. Your job is the other 35%, in five steps.

## Rules (Brendan's, standing)
1. Efficiency Voice: `docs/sketches/2026-11-06-efficiency-voice.html`. Read it first. Reports are short, numbered,
   facts only. Plain language, no metaphors. UI copy in the first person singular ("I", "my"), never "we".
2. The Mac is an 8 GB MacBook Air. No `python3`. The AWS CLI one call at a time: never in parallel, never backgrounded
   together. No Next.js build, no dev server, no `npm run build` or `npm run dev`, and no whole-project type check on
   the Mac (a hook blocks them). Per-file checks only: `npx eslint <file>`. Builds run in the codespace `nsrgpt-dev`
   after Brendan okays a push.
3. Work on branch `ui-layer` from `main` at commit 32d4e9d (the night-shift baseline). Commit on that branch after each
   step with a plain message. No push and no merge until agent-1 relays Brendan's go. No subagents.
4. Don't touch: `scripts/iaea/`, `scripts/nndc/`, `services/`, `docs/sketches/nsr-lake.html`, `lib/pipeline-map.ts`,
   `components/pipeline/`. Other sessions own them.
5. Copy from the named source, then adapt (EV rule 14). If a pattern exists in the codebase (a hook, a loader, a
   dynamic import), reuse it; don't hand-roll a second one. Fight drift: one helper per job, named plainly.
6. Free routes first for AWS. CloudFront's free tier (1 TB a month out, 10 million requests) covers this site. Name
   any paid step and its price to agent-1 before taking it.

## What the code does today (measured 2026-11-08 at 32d4e9d)
- Hosting: Next.js App Router on Cloudflare Workers through OpenNext (`wrangler.jsonc`, assets binding serves `public/`).
- Chart data: `public/viz-data/` (17 MB of JSON: levels 3.2 MB, exfor 1.6 MB, capgam 1.0 MB, flows, triples,
  livechart-ground, masses, bars, scatter, dict/{authors,reactions,nuclides}, decay, decay-energy, knowledge,
  graph-layout, and the per-item folders radiation/, gamma/, fission/). Built by `scripts/viz-*-snapshot.mjs`,
  `scripts/viz-graph-layout.mjs` and `scripts/chat-dict-snapshot.mjs`. Read by client code with
  `fetch('/viz-data/<name>.json')` (about 25 call sites under `app/(site)/viz/` and `components/`).
- Pages: 45 under `app/` (see `find app -name page.tsx`). 34 are `/viz/*` pages. Four are async server components that
  read data while rendering: `app/(site)/account`, `notifications`, `profile`, `settings`.
- Server data access: `lib/chat-data/athena.ts`, `lib/chat-data/tools.ts`, `app/api/{record,chat,graph}/route.ts`.
- Data hooks: `@tanstack/react-query` is installed; `useQuery` appears only in `components/nsr/SearchPage.tsx` and
  `components/nsr/graph/GraphPage.tsx`. About 80 other files fetch inside `useEffect`.
- Chart and 3D libraries: `three`, `@react-three/{fiber,drei,postprocessing}`, `threejs-particle-fluids`, `echarts`,
  `echarts-gl`, `recharts`. Static imports in 8 files: `app/(site)/viz/decay/scene.tsx`, `graph/graph3d.tsx`,
  `particles/{shared.ts,plume.ts,world.ts,scene.tsx}`, `knowledge/scene.tsx`, `levels/scene.tsx`. `next/dynamic` is
  already used in `decay/view.tsx`, `graph/chart.tsx`, `particles/view.tsx`, `knowledge/view.tsx`,
  `levels/levels-view.tsx`.
- Lake: `s3://nsr-lake-613473203863` (profile `nysgpt-new`, us-east-2). Public access blocked; versioning on.

## The five steps, in order

### Step 1 — Chart data out of the repo, into the lake, behind a CDN
1. Prefix in the lake: `site/viz-data/v<YYYYMMDD>/…` with the same paths as `public/viz-data/` (first version
   `v20261108`). Storage class Standard. Upload with one call:
   `aws s3 sync public/viz-data s3://nsr-lake-613473203863/site/viz-data/v20261108 --cache-control "public, max-age=31536000, immutable" --content-type application/json --profile nysgpt-new --region us-east-2`
   (`sync` is one process; it is the one call).
2. CDN: one CloudFront distribution in the New account, origin the lake bucket, origin path empty, Origin Access
   Control (OAC) so the bucket stays private; a bucket policy statement that lets that distribution read
   `site/*` only; default behavior: GET/HEAD, compress on, cache policy CachingOptimized, a response headers policy
   that adds `Access-Control-Allow-Origin: *`. Price: inside the free tier; say so in your step report with the
   distribution id and domain (`dxxxx.cloudfront.net`). Don't buy a custom domain or certificate; Brendan decides that.
3. App side: one helper, `lib/data-url.ts`, exporting `dataUrl(path: string): string` that returns
   `${NEXT_PUBLIC_DATA_BASE}/viz-data/${VIZ_DATA_VERSION}/${path}`. `NEXT_PUBLIC_DATA_BASE` comes from the
   environment (`.env.local` for the Mac, `wrangler.jsonc` `vars` for Cloudflare; put both in, same value).
   `VIZ_DATA_VERSION` is a constant in `lib/data-url.ts` (`"v20261108"`). Replace every `fetch('/viz-data/…')` and
   every string literal `/viz-data/` with `dataUrl('…')`. No other code path may build these URLs.
4. The snapshot scripts (`scripts/viz-*-snapshot.mjs`, `scripts/viz-graph-layout.mjs`, `scripts/chat-dict-snapshot.mjs`)
   keep writing where they write today, but add one line to each file's header comment: "Upload with
   `scripts/viz-data-publish.sh <version>`". Write that script: it runs the one `aws s3 sync` above for a version
   folder and prints the count and bytes. Don't run the snapshot scripts (they read the lake and are heavy).
5. `git rm -r public/viz-data` once items 1–3 are in and `dataUrl` is the only reader. Add `public/viz-data/` to
   `.gitignore` so a local snapshot run can't put it back in the repo.
6. Verify from the Mac with `curl -sI <cloudfront-domain>/viz-data/v20261108/levels.json`: 200, `content-type:
   application/json`, `cache-control: public, max-age=31536000, immutable`, `content-encoding: br` or `gzip`,
   `access-control-allow-origin: *`.
7. Report: files and bytes uploaded, distribution id and domain, call sites changed (count), repo size change.

### Step 2 — Every page a static shell; data loads after it appears
1. Inventory every `page.tsx` (45). For each: does the server component `await` anything, read cookies/headers, or
   force `dynamic = 'force-dynamic'`? Write the inventory as a table in your report: page · static shell today (y/n) ·
   what it awaited · what you changed.
2. For the four async pages (`account`, `notifications`, `profile`, `settings`): the page becomes a static shell that
   renders the layout, headings and skeleton rows immediately; a client component mounts, calls an API route under
   `app/api/` (reuse `app/api/account/[action]/route.ts` and `app/api/auth/[action]/route.ts` where they already
   serve the data; add a route only when none exists), then fills in. Sign-in state is read on the client from the
   existing auth helper; a signed-out visitor sees the shell and the existing sign-in prompt, not a server redirect
   computed during render.
3. Any other page that awaits data during render gets the same treatment. `/viz/*` pages already fetch on the
   client; confirm each one renders its frame (title, axes, controls) before data arrives, with a skeleton or an
   empty state from the design system (`components/ui/`), never a blank page.
4. Rule to leave in the code, as a comment at the top of `app/(site)/layout.tsx`: "Pages are static shells. Data
   loads after the shell paints, through `useData` or an API route. No server component awaits data."
5. Report: the table from item 1, the number of pages changed, and the API routes used or added.

### Step 3 — Chart and 3D libraries load only when a chart opens
1. For each of the 8 files with a static import of `three`, `@react-three/*`, `threejs-particle-fluids`, `echarts`,
   `echarts-gl` or `recharts`: the file must be reached only through a
   `next/dynamic(() => import('./scene'), { ssr: false, loading: () => <ChartSkeleton /> })` boundary in its view.
   Where a view already does this (`decay/view.tsx`, `graph/chart.tsx`, `particles/view.tsx`, `knowledge/view.tsx`,
   `levels/levels-view.tsx`), confirm the chain and leave it. Where it doesn't, add the boundary. `ChartSkeleton` is
   one shared component in `components/ui/` (reuse an existing skeleton if the design system has one; check
   `docs/sketches/2026-11-06-design-system.html` and `components/ui/`).
2. Grep the whole of `app/` and `components/` for any other import of those packages, including transitive helpers
   (`shared.ts`, `world.ts`, `plume.ts`): they must sit behind the same boundaries. List each file and its boundary
   in the report.
3. Verification on the Mac is by reading import chains (no build). The measured check comes from the codespace build
   after Brendan's push go: the build prints "First Load JS" per route; record the number for `/`, `/search`,
   `/graph`, `/chat` and five `/viz/*` pages in the report, before and after if you can get a before from the baseline.
4. Report: files behind a boundary (count), any that could not be split and why.

### Step 4 — One shared, cached data hook
1. `lib/use-data.ts`: `useData<T>(path: string | null, opts?)` built on `@tanstack/react-query` `useQuery`:
   key `['data', url]`, `queryFn` fetches `dataUrl(path)` and parses JSON, `staleTime: Infinity`, `gcTime: 1 hour`,
   `enabled: path !== null`, `retry: 1`. Returns `{ data, error, loading }` and nothing else. Chart JSON is
   immutable by version, so it never refetches.
2. A `QueryClientProvider` at the root, once (check `app/layout.tsx` and `components/AppLayout.tsx`; if
   `SearchPage`/`GraphPage` create their own client, lift it to the root and delete theirs).
3. Replace every `useEffect` + `fetch` of chart data with `useData`. Tables, cards and charts that read the same
   file share one request and one cache entry. Keep `SearchPage` and `GraphPage` on `useQuery` if they already
   are, but through the same client.
4. Report: call sites converted (count), files touched, any fetch left outside the hook and why.

### Step 5 — No server data calls while a page renders; API only
1. After steps 2 and 4, grep `app/**/page.tsx` and `app/**/layout.tsx` for `await`, `cookies()`, `headers()`,
   `fetch(`, `lib/chat-data`, `@aws-sdk`, `dynamo`, `athena`: the count must be zero in page and layout files.
   Everything that reads data lives under `app/api/` (route handlers) or in `lib/` called only from route handlers.
2. Add a small script `scripts/check-static-shells.sh` that greps for those patterns in page and layout files and
   exits 1 on a hit; mention it in the layout comment from step 2.
3. Report: the grep result (zero), the script's path.

## Done means
1. Five step reports sent to agent-1, each 3–5 lines plus any table asked for.
2. Branch `ui-layer` with one commit per step, no push.
3. `public/viz-data/` gone from the repo; the CDN serves it; `dataUrl` and `useData` are the only readers.
4. Zero server data calls in page and layout files; `scripts/check-static-shells.sh` passes.
5. A final report to agent-1: what changed, the First Load JS numbers if a build ran, what Brendan must decide
   (push, custom data domain, the `NEXT_PUBLIC_DATA_BASE` value in Cloudflare).

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/13-ui-layer.md and start; report to agent-1 after each step.`
