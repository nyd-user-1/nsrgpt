# 14 — Finish the raw layer: the proxy lane and a faster Wayback lane (2026-11-08)

You're `agent-3`. Brendan assigned this through agent-1 (the night lead, this brief's author). Report to agent-1 with
SendMessage (name `agent-1`) after each batch: 3–5 lines, Efficiency Voice. Blockers go to agent-1; don't stop on them.

Read first: `docs/sketches/2026-11-06-efficiency-voice.html` (the rules of reporting), then
`docs/briefs/11-iaea-and-open-libraries-acquisition.md` (agent-2's brief: the scope, the access facts, the tools, the
hard-won lessons) and the "After the reboot" section of `docs/briefs/12-night-shift-handoff.md`. This brief changes the
route, not the goal: every file still lands in the lake or is listed with its reason.

## What's left (as of 04:50 UTC 2026-11-08)
1. **The Wayback lane's list** … `s3://nsr-lake-613473203863/raw/iaea/2026-11-07/_work/wayback-lane-remaining.json`:
   75 files, 58.9 GB, each with `original` (the file's own URL), `snapshot`, `key`, `wayback_bytes`, `tier`.
   TENDL-2023 and 2021 (30.4 GB, hosted by IAEA at www-nds.iaea.org/public/download-endf/TENDL-*/backup/), JEFF-3.3
   charged particles (10.0 GB, NEA), JENDL special files (3.4 GB, JAEA), processed ACE sets (14.6 GB, mixed hosts).
2. **The full box list** … `…/_work/wb-box-priority3.json`: 16,162 items (`original`, `url` = Wayback id_ URL, `key`,
   `wb_size`, `tier`). The box run `…/_work/box/wb-priority4/results.jsonl` got 2,197 of them before its box ended
   at 04:03 UTC. The rest, mostly 13,884 small Quick Links files (0.8 GB), are not in the lake yet. A key is "in the
   lake" when `head_object` finds it with the expected byte count (wbget.py does this check).
3. **The proxy list** … `…/_work/pending-proxy-window.json`: 11,289 IAEA URLs, 7.4 GB (`url`, `key`, `subsite`,
   `est_bytes`): public/ 3,273, fendl 3,258, ads 933, epics 601, medical 520, the rest small.
4. **No box is running.** `nsr-wayback-1` terminated itself at 04:03 UTC.

## Brendan's decisions (2026-11-08)
1. IAEA-hosted files come through the proxy now, not the Wayback Machine. Budget: up to 70 GB of the Webshare
   allowance for this job (about 140 GB remain; the plan ends 2026-11-19 and unused GB is lost).
2. Files whose home is NEA or JAEA (Cloudflare and Incapsula refuse proxy fetches of files) come from the Wayback
   Machine on one long-lived box, fetched in parallel ranges so a 3 GB file no longer takes 3 hours.
3. AWS spend for this job: up to $1.50. Free routes first; name any paid step and its price in your report.

## Lane A — the proxy lane (IAEA hosts), first
1. Split the work by host with jq on the Mac (small files, fine): from list 1 and the not-yet-in-lake part of list 2,
   every item whose `original` host is `nds.iaea.org` or `www-nds.iaea.org` goes to lane A with `url` = `original`;
   everything else goes to lane B. List 3 is lane A as it stands. Write the lane A items as mirror.py job files under
   `scripts/iaea/box/jobs/` (`proxy-tendl.json`, `proxy-ql.json`, `proxy-window.json`), in the shape of
   `jobs/iaea-cdroms.json`: `name`, `prefix` `raw/iaea/2026-11-07`, `warm` `https://nds.iaea.org/`, `items` with
   `url` and `key`, `lines` (proxy line numbers), `rate`, `minutes`. Upload each to
   `s3://nsr-lake-613473203863/raw/iaea/2026-11-07/_work/box/jobs/<name>.json` (one `aws s3 cp` each).
2. Box: `./scripts/iaea/box/create.sh nsr-browser-2 m7i-flex.large userdata.sh` (real Chrome under Xvfb, Free Tier
   type, self-terminates in 4 hours; relaunch if the work outlives it). Wait for `/opt/box/ready` through
   `./scripts/iaea/box/ssm.sh <id> 'ls /opt/box'`. Start each job with `./scripts/iaea/box/run-job.sh <id> <name>`;
   one job at a time against nds.iaea.org (never two heavy jobs against one origin). Big files first
   (`proxy-tendl`), then `proxy-ql`, then `proxy-window`.
3. Lines: probe first (`./scripts/proxy/proxies.sh probe https://nds.iaea.org/`), use the lines that answer, 3 to 4
   browsers, `rate` 2.0 requests a second for the site. Rehearse on 3 files, then run the fleet. Drop a line that
   gets 0 of its first 5. Back off when latency rises, not only on errors.
4. Watch `…/_work/box/<name>/status.json` (one `aws s3 cp … -` at a time, no tighter than every 5 minutes). Every
   file is checked against the server's byte count by mirror.py; a short read is an error, not a done.
5. Proxy meter: keep a running GB total in your reports. Stop lane A at 70 GB and list the rest with reason
   "proxy budget" if it comes to that.

## Lane B — the Wayback lane (NEA and JAEA hosts), in parallel ranges
1. The Wayback Machine honors Range requests (tested 04:52 UTC: `-r 0-1023` on a JEFF-3.3 id_ URL answered 206,
   1,024 bytes). One address gets about 0.27 MB/s per connection and 429 above 3 connections. So: fetch each file as
   256 MB ranges, each range on its own connection through its own proxy line (different exit addresses), and write
   them as the parts of one S3 multipart upload. 12 lines × 0.27 MB/s is about 3.2 MB/s: a 2.7 GB file in about 15
   minutes, the 13.4 GB of lane B in about 75 minutes. The ranges are small, so the proxy cost is only the bytes
   themselves (13.4 GB, inside the 70 GB budget).
2. Extend `scripts/iaea/box/wbget.py` with a ranges mode (keep the existing mode intact): `wbget.py <list-key>
   <out-prefix> --ranges 256M --lines 0,1,2,…`. For each file: HEAD for `Content-Length`; `create_multipart_upload`
   with `StorageClass=INTELLIGENT_TIERING` and the same `Metadata` as today; a thread pool of N workers, worker i uses
   proxy line (i mod N) through `urllib.request.ProxyHandler`; each range request carries `Range: bytes=a-b` and the
   same User-Agent; a range that returns anything but 206 with the right length is retried 5 times with backoff
   (30 s × attempt); `upload_part` per range; `complete_multipart_upload`; then `head_object` must equal the
   `Content-Length`. On any final failure, `abort_multipart_upload` and record `status: error`. Write `results.jsonl`
   and `status.json` as today. Files under 300 MB go the old way (one GET, one stream).
3. Box: `./scripts/iaea/box/create.sh nsr-wayback-2 t3.small userdata-wb-24h.sh 8` (24-hour cap; 8 GB disk; wbget
   streams to S3 and needs no disk). Copy `wbget.py` to the box through S3 (`…/_work/box/wbget.py`, then
   `aws s3 cp` on the box through ssm.sh), start it detached, with `; shutdown -h now` after it so the box ends when the
   list ends. The lane B list: lane B items from step A1 written to `…/_work/wb-lane-b.json` in wbget's input shape
   (`files: [{url (Wayback id_ URL), key, original, snapshot}]`).
4. Lanes A and B run at the same time: different origins, different boxes.

## After both lanes
1. Manifests: `./scripts/iaea/manifest.sh iaea raw/iaea/2026-11-07`, then `nea raw/nea/2026-11-07`, then
   `jaea raw/jaea/2026-11-07` (each runs its AWS calls one at a time). Spend goes in `scripts/iaea/spend.json`
   (append rows: the two boxes, S3 requests, proxy GB).
2. The page `docs/sketches/nsr-lake.html` is now edited by hand (its generator `scripts/iaea/inventory.sh` is out of
   date; don't run it). Move each Pending row whose files landed to the Saved (S3) table (same row shape as its
   neighbours: `data-group`, `data-item`, kind, files, size, `<code>` where, commit `n/a`), leave rows that didn't
   with their reason updated, and update the header line's files and GB from one
   `aws s3 ls --recursive --summarize s3://nsr-lake-613473203863/ | tail -2`.
3. `INVENTORY.md` at the lake root: update the `raw/iaea`, `raw/nea`, `raw/jaea` rows' files and sizes (download,
   edit, upload: one call each).
4. Terminate both boxes if they're still up (`aws ec2 terminate-instances`), then the final report.

## Rules (Brendan's, standing)
1. The Mac is an 8 GB MacBook Air: no `python3` on it; the AWS CLI one call at a time, never parallel, never
   backgrounded together; nothing heavy on the Mac. Python runs on the boxes. Big files never touch the Mac.
2. No commits, no pushes (tell agent-1 what changed; the lead commits). No subagents. No builds or dev servers.
3. Write only in: `scripts/iaea/`, `docs/sketches/nsr-lake.html` (the two tables and the header line), the lake
   prefixes above, `INVENTORY.md`. Don't touch `app/`, `components/`, `lib/`, `services/`.
4. Efficiency Voice in every report. Plain language. Copy from the named source, then adapt.
5. Politeness: a hard rate cap near a fifth of the source's measured peak; never two heavy jobs against one origin.

## Done means
1. Every item in the three lists is in the lake at its key with the right byte count, or listed in a manifest's
   `not_taken` with its reason (dead, proxy budget, phase 3–4, not offered).
2. Manifests, `nsr-lake.html` and `INVENTORY.md` updated; spend logged; boxes terminated.
3. Batch reports to agent-1 as each job lands (first within 30 minutes of starting), then a final report with files,
   GB, proxy GB used, AWS spend, and what was listed instead of taken.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/14-finish-the-raw-layer.md and start; report to agent-1 after each batch.`
