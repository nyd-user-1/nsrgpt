# 22 — The type-check hook: allow it on the box, loosen it on the Mac (2026-11-08)

Written by lead-agent for parsing-1. Report to `lead-agent` only. Efficiency Voice.

## The hook
`~/.claude/hooks/block-heavy-typecheck.py` (Brendan's, user level) rejects any Bash command whose text contains
`tsc --noEmit` or `eslint`. Read it first; keep its structure and message style.

## Why it exists
The Mac is an 8 GB Air that usually runs at about 6.2 GB used. A local type check has frozen it. That is the only
constraint: memory, not the command.

## Brendan's ruling (2026-11-08)
1. **Remote runs pass.** A command that runs the check somewhere else is allowed as written: anything containing
   `aws ssm send-command`, `aws ssm start-session`, `gh codespace ssh`, or `ssh `. The hook should not read the text
   inside such a command as a local run.
2. **Local runs are allowed when memory permits, capped.** Allow a local `tsc --noEmit` or `eslint` when both hold:
   - available memory (free plus inactive pages from `vm_stat`, page size 16384) is at least 2.5 GB; and
   - the command caps Node at or below 1.5 GB (`NODE_OPTIONS=--max-old-space-size=1536` or a lower value is present
     in the command text).
   Otherwise block, and say in the message which of the two failed, with the numbers, and the form that would pass.
3. `BRENDAN_OK_LOCAL_BUILD=1` keeps its meaning as the explicit override; leave that path as it is.

## Where the type check already runs
GitHub Actions runs a `Typecheck` workflow on every push to main (see the repo's Actions tab), so a push is itself a
type check. The box (i-0ec4775a5cd68d41b, us-east-2, profile nysgpt-new) is the place for an on-demand run:
`aws ssm send-command --profile nysgpt-new --region us-east-2 --instance-ids i-0ec4775a5cd68d41b --document-name AWS-RunShellScript --parameters 'commands=["cd /srv/nsrgpt && pnpm exec tsc --noEmit 2>&1 | tail -20"]'`
then `aws ssm get-command-invocation` with the returned command id.

## Do
1. Edit the hook for rules 1 and 2. Python only, no new dependencies.
2. Test without running a real check: feed the hook a JSON stdin shaped like Claude Code's PreToolUse payload for
   (a) the SSM command above → allowed; (b) `pnpm exec tsc --noEmit` → blocked with the memory or cap reason;
   (c) `NODE_OPTIONS=--max-old-space-size=1536 pnpm exec tsc --noEmit` → allowed only if memory permits now, and
   the message says so either way; (d) `BRENDAN_OK_LOCAL_BUILD=1 pnpm exec tsc --noEmit` → unchanged behaviour.
3. Don't run a type check on the Mac. Don't touch other hooks or settings.
4. Report: the diff of the hook and the four test results.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/22-typecheck-hook.md and start; report to lead-agent when done.`
