# 45 — NSRgpt's own Cognito user pool (2026-11-09)

You're `window-3-cognito-pool`. Written by `lead-agent` (Fable); Brendan ordered this at 11:05 ET: NSRgpt must not share
a user pool with another application. Today it signs into the NYSgpt pool `us-east-1_ZOLVWIZqD` (Old account
638175140432, profile `default`), which holds three of Brendan's own addresses. Report to `lead-agent` by SendMessage
only, in Efficiency Voice (`docs/sketches/2026-11-06-efficiency-voice.html`, read it first): one line per step as it
lands, one report at the end. No questions mid-job; a blocker goes in a report and you continue with what doesn't
depend on it. Never print a secret value, a key id or a token; name the parameter or file that holds it.

## Rules
1. The Mac is an 8 GB MacBook Air: the AWS CLI one call at a time, never parallel or backgrounded; no `python3`.
2. Work in `~/Code/nsrgpt` on main, a checkout shared with other windows: `git pull --rebase --autostash origin main`,
   commit in one step with explicit paths (`git commit -m "…" -- <paths>`), push right after. No `git add -A`.
3. Copy the existing pool's settings, then adapt (EV rule 17): the new pool is the NYSgpt pool's shape with NSRgpt's
   names, not a hand-rolled one. Change code only where an env name or ARN forces it; `lib/auth.ts`, `lib/account.ts`
   and `lib/limits.ts` are the read side (pool and client from `NYSGPT_COGNITO_POOL_ID` and `NYSGPT_COGNITO_CLIENT_ID`,
   region us-east-1, admin calls through the Worker's `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, the IAM user
   `nsrgpt-worker` from brief 04, `~/.secrets/nsrgpt-worker-aws.json`).
4. Nothing is deleted from the NYSgpt pool or its account; NSRgpt only stops using it.

## Accounts
- New account 613473203863 (profile `nysgpt-new`) is NSRgpt's: the lake, the API, the dev box. A service control policy
  denied `cognito-idp:ListUserPools` there today (policy `p-qbiznb5q` of org `o-ed9y76h6ui`). Test whether it also denies
  `CreateUserPool` (one dry call: `aws cognito-idp create-user-pool --pool-name nsrgpt-scp-test` and delete it at once if
  it succeeds). If the New account allows Cognito, the pool and a new IAM user `nsrgpt-worker` go there (the Worker's
  AWS keys then change to that user's). If it denies, the pool goes in the Old account beside the NYSgpt pool, named
  `nsrgpt`, and the existing `nsrgpt-worker` user's inline policy is re-pointed at it. Say which in the first report.

## Do
1. `aws cognito-idp describe-user-pool --user-pool-id us-east-1_ZOLVWIZqD --profile default --region us-east-1` and
   `describe-user-pool-client` for its app client (`list-user-pool-clients` first): save both as
   `docs/briefs/45-source-pool.json` with every id, ARN and secret-like value removed. These are the settings to copy:
   username attributes, auto-verified attributes, password policy, MFA, account recovery, email configuration,
   verification message templates, schema, deletion protection, the client's auth flows (`USER_PASSWORD_AUTH` is what
   `lib/auth.ts` uses), token validity, no client secret.
2. Create the pool `nsrgpt` (us-east-1) with those settings; one app client `nsrgpt-web` with the same flows and no
   secret. Tags `project=nsr`. Deletion protection on.
3. IAM: the policy for the Worker's user names exact resources: the new pool's ARN for the admin actions
   `lib/account.ts` and the sign-up path use (read the code for the list: AdminGetUser and whatever else is called),
   plus what `lib/limits.ts` needs on its DynamoDB table (keep that as it is if the user stays in the Old account; if
   the user moves to the New account, the limits table must be reachable: create `nysgpt-limits` there with the same key
   schema, or report that sign-up caps need a decision). Save a new access key only if a new user is made, to
   `~/.secrets/nsrgpt-worker-aws.json` (mode 600), replacing the old file after the Worker is switched.
4. Switch the Worker: `CLOUDFLARE_API_TOKEN="$(tr -d '\n' < ~/.secrets/cf-token)" node_modules/.bin/wrangler secret put
   <NAME> --name nsrgpt` with the value on stdin, for `NYSGPT_COGNITO_POOL_ID` and `NYSGPT_COGNITO_CLIENT_ID` (and the
   two AWS keys if the user is new). Each put redeploys the Worker with the new binding.
5. Switch the dev box the same way it gets its other values (`scripts/devbox/`: the service's environment and the SSM
   parameters under `/nsrgpt/devbox/`); add `/nsrgpt/devbox/cognito-pool-id` and `cognito-client-id` SecureStrings and
   read them where the others are read. `NEXT_PUBLIC_DEV_SIGNED_IN=1` stays for the box's dev sign-in.
6. Record it: in `wrangler.jsonc`'s secrets comment add the two Cognito names and what pool they point at;
   in `docs/briefs/45-nsrgpt-cognito-pool.md` (this file) append a "Result" section with the pool id, client id, account,
   and the date. Pool and client ids are not secrets; keys are.
7. Verify on production (https://nsrgpt.brendan-stanton.workers.dev): sign up with a throwaway address you control,
   confirm, sign in, open a page that needs a session, sign out; then delete that user from the new pool. Then
   `aws cognito-idp list-users` on the new pool returns zero users. Repeat sign-in on the dev box
   (http://3.150.112.32:3000) if its sign-in path is live there; else say it relies on the dev bypass.

## Done means
The pool `nsrgpt` and client exist with the NYSgpt pool's settings; production and the dev box authenticate against
it; the Worker's admin calls answer without a credentials error; the new pool holds zero users; the NYSgpt pool is
untouched; this brief's Result section and the wrangler comment are committed and pushed; one final report to
`lead-agent` with the account chosen, the pool and client ids, what changed in code (ideally nothing), and spend (should
be zero).

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/45-nsrgpt-cognito-pool.md and do it; report to lead-agent after each step.`

## Result (2026-11-09)
- **Account:** Old account 638175140432 (profile `default`), us-east-1. The New account's service control policy
  `p-qbiznb5q` denies `cognito-idp:CreateUserPool` (explicit deny; nothing was created there).
- **Pool:** `nsrgpt`, `us-east-1_i2dgOXMsI`. The NYSgpt pool's settings (`45-source-pool.json`) with the name, the
  message text ("NSRgpt"), tag `project=nsr` and deletion protection on as the only differences. Like the NYSgpt pool it
  is admin-create-only: the app's self sign-up route is refused by Cognito; accounts come from invites or by hand.
- **Client:** `nsrgpt-web`, `3mqp5dmd7s16hd4v4e0h5a9c34`, no secret, `USER_PASSWORD_AUTH` and refresh.
- **IAM:** the existing user `nsrgpt-worker`, inline policy `nsrgpt-worker-limits-and-account`: AdminGetUser,
  AdminCreateUser, AdminUpdateUserAttributes, AdminSetUserPassword, AdminDeleteUser on the new pool only;
  `dynamodb:UpdateItem` on `nysgpt-limits` unchanged. No new user or access key.
- **Worker:** secrets `NYSGPT_COGNITO_POOL_ID` and `NYSGPT_COGNITO_CLIENT_ID` replaced.
- **Dev box:** SecureStrings `/nsrgpt/devbox/cognito-pool-id` and `cognito-client-id` (us-east-2, New account), read by
  `scripts/devbox/userdata.sh` into the drop-in `cognito.conf`; applied to the running box.
- **Code:** unchanged.
- **NYSgpt pool:** untouched.
