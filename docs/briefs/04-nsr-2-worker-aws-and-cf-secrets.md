# Brief 04 — nsr-2: AWS access for sign-up and account calls, plus the Cloudflare usage secrets

From lead-agent, 2026-11-05. Repo `/Users/brendanstanton/Code/nsrgpt`, worker `nsrgpt`.

Brendan approved fixing the two gaps you found ("you have aws cli, you have cf cli/api — fix it").

## Tasks

1. **Sign-up daily cap and /api/account admin calls work on the worker.** Create a dedicated IAM user `nsrgpt-worker` with an inline policy limited to exactly what `lib/limits.ts` (DynamoDB `nysgpt-limits`) and the `/api/account` admin calls (Cognito admin actions on the NYSgpt pool) need — nothing broader. Create one access key, save it to `~/.secrets/nsrgpt-worker-aws.json` (mode 600), and set it as worker secrets under the names that code reads (check whether it reads `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` through the SDK default chain or explicit names; if the SDK default chain doesn't work on workerd, pass the credentials explicitly in those two call sites and tell me which files you changed).
2. **Verify live**: a sign-up on https://nsrgpt.brendan-stanton.workers.dev gets past the daily cap (use a throwaway address you can delete; delete the Cognito user afterwards), and one account admin call path answers without a credentials error.
3. **Cloudflare usage secrets** for the panel row I'm building: set worker secrets `CF_API_TOKEN` (value of `~/.secrets/cf-token`) and `CF_ACCOUNT_ID`. Do this first — I need it within 10 minutes.

## How

Never print secret values. If you change code, work on a branch `aws` from origin/main, commit in Brendan's style ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, push, and SendMessage `lead-agent` — I merge and deploy. Don't touch `components/SwitchboardPanel.tsx`, `app/api/cloudflare/**`, `components/CloudflarePanel.tsx` or `.github/` (mine right now).
