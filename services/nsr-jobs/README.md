# nsr-jobs

The job runner (brief 51): Lambda `nsr-jobs` behind nsr-api's API Gateway HTTP API (`https://3o2ps7jan4.execute-api.us-east-2.amazonaws.com`)
and its CloudFront distribution (`https://daw1qggkn69lv.cloudfront.net`), DynamoDB `nsrgpt-jobs`, and the EC2 box
`nsr-jobs-1` that does the work. The first kind is `broaden`: Doppler broadening of one ENDF cross section with PREPRO.

## Routes

| Route | What |
| --- | --- |
| `POST /jobs` | `{kind: "broaden", params: {release, name or mat, sub, mt, temps_k}}` → `202 {id, status: "queued", created_at, kind, params}` |
| `GET /jobs/{id}` | the row: `{id, kind, params, status, created_at, started_at, finished_at, timings, error}`; when done also `summary`, `result_url`, `result_urls` (one per temperature) |
| `GET /jobs/{id}/result` | `result.json`: `{job, kind, params, release, name, mat, mt, sublibrary, series: [{temp_k, key, n_points, e_min_ev, e_max_ev}], timings}` |
| `GET /jobs/{id}/result?temp_k=300&emin=9e3&emax=1.8e4` | one temperature: `{job, release, name, mat, mt, temp_k, n_points, interp_law, energy_ev, xs_barn, units, method}`, cut to the window (plus a point each side) with `n_window` and `window` |
| `GET /jobs?status=done` | the newest 50 jobs with that status (default every status) |

- `POST` goes to the API Gateway origin (CloudFront passes GET and HEAD only) with `x-nsr-write-key` equal to the Lambda's
  `NSR_WRITE_KEY` (SSM `/nsrgpt/devbox/nsr-api-write-key`, the key `/community` takes; the app holds it as `NSR_API_WRITE_KEY`
  and proxies it server-side). `GET` needs no key.
- A `POST` whose job is already queued, running or done (same kind, release, material, sub and mt, and `temps_k` covered
  by that job's) returns that job with `reused: true`; `{fresh: true}` in the body runs it again.
- `params`: `release` one of B-VIII.1, B-VIII.0, B-VII.1, B-VII.0, B-VI.8, JEFF-3.3, JENDL-5, TENDL-2023, CENDL-3.2;
  `name` (U-235) or `mat` (9228); `sub` defaults to `neutrons`; `mt` a whole number; `temps_k` one to four temperatures
  in (0, 5000] K, default `[300]`.
- Status and list answers are `no-store`, so polling through CloudFront is fresh; results are cached an hour.
- Errors are `{error}` with 400, 403 or 404.

## What a broaden job does (`scripts/jobs/box/broaden.py`)

The material's lines come from `lake/endfb/<release>/records/` (the row groups for its file and MAT), written as a tape
with MF1, MF2 and MF3 MT `mt`. PREPRO 2023 (IAEA-NDS/PREPRO, the lake's copy at commit cc5fd087) runs `linear` then
`recent` (resonances reconstructed within 0.1%) then `sigma1` for every temperature at once (broadened, thinned within
0.1%; the unresolved resonance range is copied, PREPRO's default). linear, recent and sigma1 are built at -O2
(`/opt/prepro/bin-o2`); their output matched the repository's -O0 build byte for byte on U-235. `recent`'s output is
cached per release, MAT and MT on the box, since it does not depend on temperature. Each temperature is written to
`lake/jobs/<id>/<T>K.json`, the summary to `lake/jobs/<id>/result.json`, the timings into the row. A failure marks the row
failed with the program's last 40 lines.

Measured on 2026-11-10, box running: U-235 MT18 B-VIII.1 at 300 K, 35 s from POST to done (recent 27 s, sigma1 4 s);
7 s when recent is cached. Two temperatures (300 and 900 K) take about 40 s. The warm test-case jobs are listed in
`lake/jobs/warm.json`.

## The box and its lifecycle

`scripts/jobs/box/create.sh` launches `nsr-jobs-1` (m7i-flex.large, Ubuntu 24.04, 30 GB gp3, role `nsr-jobs-box`;
instance-initiated shutdown stops it). `userdata.sh` builds PREPRO and the venv (boto3, pyarrow, DuckDB 2.0.0) and copies
`run.sh`, `broaden.py` and `idle.sh` from `lake/_work/jobs/box/`.

1. `POST /jobs` writes the row (queued) and invokes the Lambda asynchronously.
2. That call starts the box if it is stopped, waits for SSM, and sends `/opt/jobs/run.sh <id>`.
3. `run.sh` takes a lock (one job at a time), refreshes `broaden.py` from the lake, and runs it. The row goes running,
   then done or failed.
4. cron runs `idle.sh` every 5 minutes. After 30 minutes with no job it shuts the box down, which stops it. The next POST
   starts it again; a stopped box adds its boot time to that job.

## Deploy

`./services/nsr-jobs/deploy.sh [box id]` creates or updates the table, the role (`policy.json`), the function (one file,
zipped on the Mac), its write key and the four routes. Box scripts: `aws s3 sync scripts/jobs/box/ s3://nsr-lake-613473203863/lake/_work/jobs/box/`.

Spend: the box costs about $0.10 an hour while running and its 30 GB disk about $2.40 a month while stopped. DynamoDB on
demand and the Lambda and API Gateway requests are under a cent at this use.
