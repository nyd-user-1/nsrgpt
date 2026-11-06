# Brief 03 — nsr-2: the Cloudflare deploy for nsrgpt

From lead-agent, 2026-11-05. Same repo, same worktree (`../nsrgpt-perf`); rename the branch to `deploy` or start a fresh one from `origin/main`.

Brendan wants NSRgpt live on a new Cloudflare Worker by ~21:00. It becomes the only app on Cloudflare (NYSgpt's worker comes off later — not now). I'm cutting the app on `main`; you wire the deploy.

## Tasks

1. **Workflow.** Add `.github/workflows/cloudflare.yml`: on push to `main` (and workflow_dispatch), build with `npx opennextjs-cloudflare build` (env `NODE_OPTIONS: --max-old-space-size=6144`) and `npx opennextjs-cloudflare deploy`. Copy NYSgpt's version: `git -C /Users/brendanstanton/Code/NYSgpt show origin/cloudflare:.github/workflows/cloudflare.yml`. Same Node 22 / pnpm 11.1.1 / `--frozen-lockfile`.
2. **Worker name.** `wrangler.jsonc`: `"name": "nsrgpt"`. Keep the rest.
3. **Repo secrets** on `nyd-user-1/nsrgpt` with `gh secret set`: `CLOUDFLARE_API_TOKEN` from `~/.secrets/cf-token` (it's the token NYSgpt's CF workflow uses; if it can't deploy Workers, try `~/.secrets/cf-dns-token`, and tell me which worked), `CLOUDFLARE_ACCOUNT_ID` (look it up with the token: `GET https://api.cloudflare.com/client/v4/accounts`). Never print token values.
4. **typecheck.yml**: drop the `fumadocs-mdx` step (the blog and fumadocs are gone). Keep the rest.
5. **Caching.** Add `public/_headers` for Workers static assets: `/viz-data/*` → `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`. Leave `/_next/static/*` to the platform.
6. **Worker runtime settings for chat and sign-in.** Find every `process.env.*` that `app/api/chat/**`, `lib/chat-data/**`, `lib/auth.ts` and `app/api/auth/**` read. Get the values from the Amplify production app (`aws amplify get-app --app-id d3etwd4srq8khx` / `get-branch --branch-name amplify`, us-east-1). After the first deploy creates the worker, set them as worker secrets (wrangler or `PUT /accounts/{id}/workers/scripts/nsrgpt/secrets`). Report the names you set, never the values.

## Files you own

`.github/**`, `wrangler.jsonc`, `public/_headers`. Don't touch `package.json` or `next.config.ts` (mine).

## How

No local builds, dev servers, typechecks or lint (hook). Commit in Brendan's style ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, push the branch, SendMessage `lead-agent` when tasks 1–5 are pushed (I merge, which triggers the first deploy); then do task 6 once the worker exists and report again.
