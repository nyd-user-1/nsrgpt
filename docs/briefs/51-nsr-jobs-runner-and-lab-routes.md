# 51 — The job runner (nsr-jobs) and the routes the Lab needs: broadening on a box, covariance, EXFOR points (2026-11-09)

You're `window-1-parser`, now the backend window. Written by `lead-agent` (Fable); Brendan approved the Lab at 18:20 ET.
Report to `lead-agent` by SendMessage only: one line per part as it lands and a final report; nothing goes to Brendan
until the whole Lab lands, so don't wait for answers, decide and record. Efficiency Voice
(`docs/sketches/2026-11-06-efficiency-voice.html`). Peers: `window-3-cognito-pool` builds the /lab page (brief 52),
`window-2-ui-layer` the test canvas (brief 53). Message them directly when a route of yours is live, with its exact
URL and an example response; they build against this contract from the start.

## Rules
1. Mac rules (8 GB Air): no python3 locally, AWS CLI one call at a time, nothing heavy downloaded. Builds and runs
   on boxes. `~/Code/nsrgpt` on main, shared: pull with `--rebase --autostash`, commit in one step with explicit
   paths, push right after. You own `services/nsr-jobs/` (new), `services/nsr-api/` (routes below), `scripts/jobs/`
   (new), the lake prefixes below, `INVENTORY.md` rows. Don't touch `app/`, `components/`, `lib/`.
2. Copy the patterns that exist (EV rule 17): `services/nsr-api/` for a Lambda with `build.sh`/`deploy.sh` and the
   write-key guard (`community.py`); `scripts/parse/box/create.sh` and `scripts/iaea/box/ssm.sh` for a box;
   DynamoDB `nsrgpt-views` (on demand, in `scripts/community/`) for a table.
3. Spend cap $10: the job box at most an m7i-flex.large, stopped (not terminated) when idle 30 minutes, started by
   the runner on demand; name any paid step first in a report. Free routes first.
4. Every route answers in JSON with the same shapes it documents in `services/nsr-api/README.md`; errors are
   `{ error }` with a status. Latency targets: served data under 0.5 s warm; a job's status poll under 0.2 s.

## The test case the Lab opens on (brief 53), so you know what the routes must carry
U-235 (n,f), 9 to 18 keV: EXFOR points (2020AMZZ, n_TOF, among others), ENDF/B-VIII.1, JEFF-3.3 and JENDL-5 MT18,
Doppler-broadened to 300 K (and 900 K) on the box, the ratio data to evaluation per energy bin with the MF33
relative uncertainty as a band, every point traced to its EXFOR subentry.

## Part A: routes in nsr-api (structure.py, dataset.py or a new lab.py; deploy from the dev box as before)
1. `GET /exfor/points?target=U-235&reaction=N,F&quantity=SIG&emin=1e3&emax=2e5&limit=20000` … every data point of
   every EXFOR dataset matching the search (`/exfor/search`'s fields), as `{ datasets: [{ dataset_id, subentry,
   entry, author, year, institute, n }], points: [{ dataset_id, e_ev, de_ev, xs_b, dxs_b }] }`, energies in eV,
   cross sections in barns, sorted by dataset then energy. Read from the serving tables under `lake/serve/exfor/`
   or the C5/x4 points in `lake/exfor/`; if points live only in subentry files, build a `points` serving table first
   (Athena UNLOAD, registered as `nsr.exfor_serve_points`) and say so.
2. `GET /endf/cov?name=U-235&mt=18&release=B-VIII.1` … the MF33 self-covariance's diagonal as relative standard
   deviation per energy group: `{ release, mat, mt, lb, groups: [{ e_lo_ev, e_hi_ev, rel_sd }] }`, from
   `nsr.endfb_cov` (brief 43; `lb` 5 and 6 hold the matrix, the diagonal is `value` where row = col, converted to a
   relative sd by the LB's convention; LB 0 to 4 as the pairs they are). `&release=` repeats for several releases.
   Where a release has no MF33 for the section, `{ groups: [] }` with a `note`.
3. `GET /endf/xs` already serves MT18 for the three releases (brief 43). Confirm `&compare=JEFF-3.3,JENDL-5`
   answers and add `&emin=&emax=` to cut the arrays server-side, so the Lab doesn't pull 40,000 points for 10 keV.
4. `README.md` rows for each, with example URLs.

## Part B: the job runner, `services/nsr-jobs/`
1. **Table:** DynamoDB `nsrgpt-jobs` (on demand; pk `id`, index `status-created_at`): id, kind, params, status
   (queued, running, done, failed), created_at, started_at, finished_at, result_key, error, owner (the write key's
   caller; later the reader).
2. **Lambda `nsr-jobs`** (Python, the nsr-api build pattern), behind the same API Gateway and CloudFront, routes:
   `POST /jobs` `{ kind: "broaden", params: { release, name | mat, sub: "neutrons", mt, temps_k: [300, 900] } }` →
   `{ id, status }`; guarded by `x-nsr-write-key` as `/community` is (the app proxies it server-side the same way).
   `GET /jobs/{id}` → the row plus, when done, `result_url` (CloudFront, the lake key). `GET /jobs?status=` → list.
   On POST the Lambda writes the row, starts the box if it is stopped (`ec2 start-instances`, then waits for SSM),
   and sends one SSM command: `/opt/jobs/run.sh <id>`. It does not wait for the job.
3. **Box `nsr-jobs-1`:** created with `scripts/parse/box/create.sh`'s pattern (`scripts/jobs/box/create.sh`,
   `userdata.sh`): Ubuntu, gfortran, PREPRO built from the lake's copy (`raw/iaea/2026-11-07/…` holds PREPRO and
   NJOY2016 per INVENTORY; find the archive in the manifest; IAEA's PREPRO builds with `gfortran` in minutes), the
   venv with boto3 and pyarrow, `/opt/jobs/run.sh` and `broaden.py`. The box stops itself after 30 idle minutes
   (a cron that checks for running jobs and `shutdown -h`); the Lambda starts it again on demand. Role: read
   `lake/*`, write `lake/jobs/*`, DynamoDB `nsrgpt-jobs`.
4. **`broaden.py <id>`:** reads the job row; fetches the material's ENDF text (from `nsr.endfb_records` through
   Athena, or `/endf/material/{release}/{mat}/text`); writes it as a tape; runs PREPRO's `linear` then `recent`
   then `sigma1` at each temperature (the standard chain: linearize, reconstruct resonances, broaden); reads MT`mt`
   from the broadened tape into `{ release, mat, mt, temp_k, energy_ev: [...], xs_barn: [...] }`; writes
   `lake/jobs/<id>/result.json` (and one file per temperature beside it); updates the row done, with timings in
   the row. A failure writes `error` with PREPRO's last 40 lines. Target: U-235 MT18 at two temperatures in under
   90 s warm. If PREPRO won't build, NJOY2016 (also held) with `reconr`, `broadr`; say which in the report.
5. **Warm the test case:** run the three releases (B-VIII.1, JEFF-3.3, JENDL-5) for U-235 MT18 at 300 K and 900 K
   once, so the Lab's first load reads results, not a queue. Keep their ids in `lake/jobs/warm.json` and tell
   `window-2-ui-layer` the ids and URLs.
6. **App proxy:** `app/api/jobs/route.ts` is `window-3-cognito-pool`'s to write (brief 52) on the pattern of
   `app/api/community/route.ts`; give them the Lambda's URL, the write-key env name (`NSR_API_WRITE_KEY` is already
   on production and the box), and the JSON shapes.
7. `INVENTORY.md` rows for `lake/jobs/`; `services/nsr-jobs/README.md` with every route and the box's lifecycle.

## Done means
Routes 1 to 3 live with README rows; `nsr-jobs` deployed, the box built, a `POST /jobs` broadening U-235 MT18 to
300 K on B-VIII.1 returning a result under 90 s warm; the warm results in the lake; both peer windows told the
contracts; spend under $10; a final report to `lead-agent` with URLs, timings and anything left out.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/51-nsr-jobs-runner-and-lab-routes.md and do it; report to lead-agent after each part.`
