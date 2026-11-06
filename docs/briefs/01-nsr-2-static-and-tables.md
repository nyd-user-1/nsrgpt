# Brief 01 — nsr-2: every kept page static, tables light

From lead-agent, 2026-11-05. Repo: `nyd-user-1/nsrgpt` (private), local `/Users/brendanstanton/Code/nsrgpt`.

## Context

NSRgpt is NYSgpt cut down to its NSR content (the /viz charts, their /viz/data tables, /chat with NSR tools, sign-in, account pages, the shell). Brendan is away until ~21:00 and expects a working deploy on a new Cloudflare Worker. I (lead-agent) am doing the cut on `main`: deleting non-NSR routes, making the /viz plate the root page, pruning the right panel, renaming to NSRgpt, and wiring the Cloudflare deploy.

Your job is speed on the pages that stay. Last night already removed the root layout's revalidate and digest, moved chart data to `public/viz-data/`, and turned prefetch back on — confirm those hold, then do what's left.

## Tasks

1. **Every kept page prerenders as static.** Routes: `/`, `/viz/*` (27 charts), `/viz/data/[slug]` (12 tables, should be generateStaticParams), `/chat` shell if possible, account/profile/settings/notifications, signin/signup/welcome. Find anything that forces dynamic rendering in their layouts or pages (`cookies()`, `headers()`, `searchParams` on the server, `force-dynamic`, `revalidate`, uncached fetch). Fix by moving per-user reads client-side. Report each route's expected render mode.
2. **No chart data inlined into HTML.** Check each `/viz/*` chart: data must be fetched from `public/viz-data/` (or a static import that lands in a JS chunk), never passed as a server prop. Fix any that still inline.
3. **Tables render only what's visible.** `components/viz/DataTable.tsx` and `app/(site)/viz/data/[slug]/page.tsx`: if it renders more than one page of rows into the DOM or ships the whole dataset in the HTML, fix it (fetch the JSON client-side; render the visible page only).
4. Nothing else. Don't redesign.

## Files you own

`components/viz/**`, `app/(site)/viz/**` (chart pages and `data/[slug]`), `lib/viz-*.ts`, `public/viz-data/**`, and render-mode-only edits in `app/(site)/layout.tsx` / `app/layout.tsx` (tell me before touching either — I'm editing the shell around them).

Do NOT touch: `components/SwitchboardPanel.tsx`, `lib/home-data.ts`, `app/(site)/(plate)/**`, `app/HomeMasthead.tsx`, chat, auth, `package.json`, `.github/`, `wrangler.jsonc`, `open-next.config.ts`.

## How

- Work in a worktree: `cd /Users/brendanstanton/Code/nsrgpt && git worktree add ../nsrgpt-perf -b perf` and stay there.
- **No local builds, dev servers, typechecks or lint on this Mac** (a hook blocks them). Verify syntax with `node_modules/.bin/esbuild <file> --loader:.tsx=tsx > /dev/null` from `/Users/brendanstanton/Code/NYSgpt` (nsrgpt has no node_modules). CI builds on push.
- Commit small, plain-English messages in Brendan's style (what changed and why, dated), ending with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Push the `perf` branch (not main). When done, SendMessage `lead-agent`: files touched, what changed, anything you couldn't fix. I merge.
- UI copy, if any: plain literal words, first person singular, no metaphors.

Target: done within 35 minutes.
