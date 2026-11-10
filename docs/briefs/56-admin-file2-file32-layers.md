# 56 — Site admin, File 2 and File 32 for every release, the layers finished (2026-11-10, overnight before launch)

You're `worker-1`. Written by `lead-agent` (Fable) from brief 55 (read it first: the orders, the windows, the box
addresses). Launch is in the morning; Brendan reviews on the dev box and on production when he wakes. Report to
`lead-agent` by SendMessage only, in Efficiency Voice (`docs/sketches/2026-11-06-efficiency-voice.html`): one line per
part as it lands, one report at the end. No questions mid-job; a blocker goes in a report and you continue with what
doesn't depend on it. Never print a secret value; name the parameter that holds it.

## Rules
1. Mac rules (8 GB Air): no `python3` locally, the AWS CLI one call at a time, nothing heavy downloaded. Parsing on a
   parse box (`scripts/parse/box/create.sh`), reached only through `scripts/iaea/box/ssm.sh`; scripts reach it through
   S3 (`lake/_work/parse/`), never pasted into SSM. Exclude `ddl/` from mid-run syncs (brief 43's pitfall: the sync
   overwrites the partition lines the box appends).
2. `~/Code/nsrgpt` on main, shared with `worker-2` and `worker-3`: `git pull --rebase --autostash origin main`, commit
   in one step with explicit paths, push right after. Never `git add -A`; never add another window's files (nine
   uncommitted chart files are `worker-2`'s).
3. You own `scripts/parse/**`, `services/nsr-api/**` (routes below; `worker-3` adds `sweep.py` there, pull often and
   don't touch it), `lib/auth.ts`, `components/shell.tsx` (the admin line only), `scripts/devbox/**`, the lake prefixes
   below, `INVENTORY.md` (an S3 object at the bucket root: download, edit, upload, one call each), the data dictionary
   (`lib/data-dictionary.ts`), `lib/pipeline-map.ts` and the lake page's counts. Other UI files are `worker-2`'s; report
   what they need.
4. Copy the pattern, then adapt (EV rule 17): `parse.py`'s `--mf=8,33` mode is the model for File 2 and 32; `serve.py`
   for serving; brief 43 and `scripts/parse/endfb/README.md` for the rerun lines.
5. Spend cap $12 for the night (box hours, Athena). Name any paid step and its price in a report before taking it.
   Terminate the parse box when Part B is done.
6. Type-check on the dev box before each push (`scripts/iaea/box/ssm.sh` with a `tsc --noEmit` on a copy of the tree,
   as the lead's `tc.sh` does: `git ls-files` tarball to `lake/_work/tc/`, untar on the box, `npx tsc --noEmit`). CI
   type-checks every push and deploys production on green.

## Part A: `brendan@nysgpt.com` as site admin (first, about 20 minutes)
The pool is `nsrgpt`, `us-east-1_i2dgOXMsI`, Old account 638175140432, profile `default` (brief 45). Self sign-up stays
off. Nothing in the NYSgpt pool is touched.
1. Create the user: `aws cognito-idp admin-create-user --user-pool-id us-east-1_i2dgOXMsI --username brendan@nysgpt.com
   --user-attributes Name=email,Value=brendan@nysgpt.com Name=email_verified,Value=true --message-action SUPPRESS
   --profile default --region us-east-1`. Then a temporary password you generate (24 characters, `openssl rand -base64
   18`), set with `admin-set-user-password` without `--permanent`, so the first sign-in asks for a new one. Check that
   `lib/auth.ts`'s `signIn` handles the `NEW_PASSWORD_REQUIRED` challenge; if it doesn't, add the respond-to-challenge
   step on the pattern the NYSgpt app used (`~/Code/nysgpt` or `~/Code/pax-trinity`, `lib/auth.ts`, EV rule 17), with
   the sign-in page's "new password" field. If that is more than an hour, set the password `--permanent` instead and
   say so.
2. Put the password in SSM, New account, us-east-2, profile `nysgpt-new`: `aws ssm put-parameter --name
   /nsrgpt/admin/first-password --type SecureString --value "$PW"` with the value from a variable, never on the command
   line in a report. Tell the lead the parameter name only.
3. Admin flag: `components/shell.tsx` carries `admin: false` twice (lines 87 and 309) and `lib/auth.ts`'s `currentUser`
   returns `admin: false`. Add `NSRGPT_ADMIN_EMAILS` (comma-separated, lower-cased) read in `lib/auth.ts`: `admin` is
   true when the session's email is in it; `superAdmin` the same for now. Thread it from `currentUser` to where
   `shell.tsx` gets `signedIn` (find the server component that passes the session into the provider; the two `false`s
   become the user's flags). Set the Worker secret (`CLOUDFLARE_API_TOKEN="$(tr -d '\n' < ~/.secrets/cf-token)"
   node_modules/.bin/wrangler secret put NSRGPT_ADMIN_EMAILS --name nsrgpt`, value on stdin) and the dev box's service
   environment the way brief 45 did Cognito (`/nsrgpt/devbox/admin-emails` SecureString, read in
   `scripts/devbox/userdata.sh` into the drop-in; applied to the running box). Add the name to `wrangler.jsonc`'s
   secrets comment.
4. Verify on production: sign in as the user with the temporary password, set the new one when asked, see the admin
   surfaces appear (whatever `admin` gates: grep `admin` in `components/` and `app/`), sign out. Then
   `admin-set-user-password` once more to a fresh temporary one (not permanent), store that in the SSM parameter
   (overwrite), so Brendan's first sign-in is still his first. `list-users` shows one user.
5. Report: `Part A done. Pool user brendan@nysgpt.com; password in SSM /nsrgpt/admin/first-password (us-east-2, New
   account); NSRGPT_ADMIN_EMAILS on production and the box.` Nothing else.

## Part B: File 2 and File 32 for all 13 releases
The resonance parameters (MF2 MT151: LRU 1 resolved with LRF 1 SLBW, 2 MLBW, 3 Reich-Moore, 7 R-matrix limited; LRU 2
unresolved, LRF 1 and 2; and the scattering-radius-only case) and their covariances (MF32 MT151: LCOMP 0, 1 and 2, with
the compact format's correlation matrix). The format is ENDF-102 (ENDF-6 Formats Manual, chapters 2 and 32) and
ENDF-367 (SAMMY's guide to File 2 and 32, `~/Downloads/ENDF-367.pdf`; copy it to `raw/manual/2026-11-10/ENDF-367.pdf` if
not there). endf-parserpy 0.18.0 reads both files (`raw/pypi/2026-11-07/endf-parserpy/`; the box installs it); where it
rejects a section, record it in the manifest with MAT and the error, not dropped silently, and parse what it accepts.
1. `parse.py --mf=2,32`: a third mode beside `--mf=8,33`, same file streaming, same section selection (MF 2 and 32,
   MT 151), the material row from MF1/451 as now. Tables, Parquet under `lake/endfb/<release>/<table>/`, DDL in
   `scripts/parse/endfb/ddl/`, registered in `nsr`, partitioned by `release`:
   - `endfb_res_ranges` … one row per energy range per isotope: release, sublibrary, file_name, mat, zai, abn, lfw,
     ner, range_index, el_ev, eh_ev, lru, lrf, nro, naps, spi, ap, lad, nls, and for LRF 7 the particle-pair and
     spin-group counts (npp, njs) and kmat/kcomp flags; `scattering_radius_only` boolean for NER=1, LRU=0.
   - `endfb_res_params` … one row per resonance: release, sublibrary, mat, range_index, l, j, er_ev, gn_ev, gg_ev,
     gf_ev (gfa, gfb for Reich-Moore), gt_ev where given, and for LRF 7 a `widths` JSON string holding every channel's
     width in order with the spin group's channel list. LRU 2 (unresolved) rows carry the energy-dependent averages:
     es_ev, d, amun, gn0, gg, gf, gx, with `unresolved` true and `lrf` kept.
   - `endfb_res_cov` … MF32 in long form, the `endfb_cov` shape where it fits: release, sublibrary, mat, range_index,
     lcomp, lrf, isr, dap, and (row_param, col_param, value) over the parameter list: LCOMP 0 as the per-resonance
     variance pairs; LCOMP 1 as the NSRS short-range blocks (parameter index pairs, the covariance value) and NLRS
     long-range (LB, energy pairs, value); LCOMP 2 as the compact format: the per-resonance uncertainties
     (`params` JSON) and the correlation matrix's non-zero (i, j, corr) with NDIGIT kept. `endfb_cov`'s `params`
     column holds what has no column.
   Columns beyond these that endf-parserpy returns go into `params` as JSON rather than lost.
2. Counts: for each release, `SELECT count(*) FROM endfb_sections WHERE mf = 2 AND mt = 151` and the same for `mf = 32`
   against the sections parsed; the manifest's new `mf2_mf32` section holds both numbers per release and the rejects.
3. Run order on `nsr-parse-3` (create.sh, 400 GB gp3 as brief 43's box): B-VIII.1 first and report its numbers (U-235
   MAT 9228 should show Reich-Moore ranges to 2.25 keV and an unresolved range to 25 keV; Fe-56 MAT 2631 SLBW/MLBW or
   Reich-Moore to 850 keV), then B-VIII.0, B-VII.1, B-VII.0, B-VI.8, JEFF-3.3, JENDL-5, TENDL-2023, CENDL-3.2, then
   B-V and older (File 32 is absent there; File 2 present). `releases.sh --mf=2,32 [<release>]` runs it, logs to
   `/data/mf2-<release>.log`.
4. Serving: `GET /endf/resonances?name=U-235&release=B-VIII.1` in `services/nsr-api/structure.py` (or a new
   `resonances.py` on the module-route pattern): `{ release, mat, ranges: [{ el_ev, eh_ev, lru, lrf, spi, ap,
   n_resonances }], resonances: [{ l, j, er_ev, gn_ev, gg_ev, gf_ev }] (resolved ranges, at most 5,000 rows; `&range=`
   picks one), unresolved: [...] }`, and `GET /endf/resonances/cov?name=&release=` giving the LCOMP, the parameter
   uncertainties and, when asked `&matrix=1`, the correlation triples. Read from the Parquet by MAT the way `/endf/cov`
   reads `lake/endfb/<rel>/cov/`. README rows with example URLs. Build and deploy the Lambda from the dev box as
   before. Measure the latency for U-235 B-VIII.1.
5. The band below the unresolved range: `/endf/cov` answers MF33 groups; in the resolved range MF33 often carries
   nothing and the honest uncertainty is MF32's. Add to `/endf/cov` a `resolved` section: for the material's resolved
   ranges, the relative uncertainty of the capture, fission and elastic cross sections per energy group from MF32,
   first-order: the diagonal of the parameter covariance propagated through the Breit-Wigner or Reich-Moore
   derivative at each resonance's peak, grouped on the same decade bins `/endf/cov` uses, with `method:
   "mf32-diagonal-first-order"` so a reader knows it is the diagonal only, no correlations. If the derivative is more
   than two hours, answer instead the per-resonance relative width uncertainties `dgn/gn, dgg/gg, dgf/gf` grouped by
   bin as `method: "mf32-width-uncertainty"` and say so. Either way the Lab's Compare and the sweep get a number
   where today they get `groups: []`.
6. `scripts/parse/endfb/README.md` gets the one-line rerun; `INVENTORY.md` rows; the manifest's spend.
7. Report after B-VIII.1 and at the end of Part B: ranges, resonances and covariance rows per release, rejects, the
   route's latency, spend.

## Part C: the layers, nothing lost
The 03:00 ET table (brief 55 item 6). Do each, in this order, and say in the report what each left undone and why.
1. **Parsed:** MF4, MF5, MF6 (angular, energy, energy-angle distributions) and MF9 to MF15 (multiplicities, production
   cross sections, photon production, photon distributions) counted and registered at least as sections: they are
   already in `endfb_sections` (every section's MF/MT with line counts); confirm with one Athena query per MF that
   every release has rows, and write the counts into each release's manifest under `sections_by_mf`. No new parsing
   unless a release shows zero where its tape has them. POINT above 293.6 K: only if the box has hours left after
   Part B and the spend cap allows; else list as held, unparsed.
2. **Serving:** routes for the MF8 tables and ICRP 107, in `services/nsr-api`:
   - `GET /endf/fy?name=U-235&release=B-VIII.1&mt=454|459&energy_ev=` … the fission product yields from `endfb_fy`
     (`{ release, mat, mt, energies: [...], products: [{ zafp, fps, yield, yield_unc }] }`).
   - `GET /endf/decay?name=Co-60&release=` … `endfb_decay` + modes + lines in one answer.
   - `GET /icrp/nuclide/{name}`, `GET /icrp/radiations/{name}`, `GET /icrp/chain/{name}` from `nsr.icrp107_*`
     (brief 48's six tables under `lake/icrp107/2008/`): the nuclide row, its radiations, and the chain walked through
     `daughters` to stable with branching fractions.
   - `/nuclide/{name}` (the card's route, wherever it is served) carries `fy_releases`, `decay_releases` and `icrp:
     true|false` so the card can link.
   README rows for each; deploy; latencies.
3. **Catalog:** `INVENTORY.md` rows and `lib/data-dictionary.ts` entries for every table added since brief 43 that
   lacks one: `endfb_fy`, `endfb_decay`, `endfb_decay_modes`, `endfb_decay_lines`, `endfb_cov`, the five `icrp107_*`,
   `exfor_serve_points`, `nsrgpt-jobs`, and Part B's three. Fix the dictionary's `held` note (line 143 says "false for
   one it doesn't, as JEFF-3.3": JEFF-3.3 is held; say "false for a release the lake does not hold, as JEFF-3.2").
4. **API:** `services/nsr-api/README.md` has a row for every route the Lambda answers (walk `lambda_function.py`'s
   dispatch and each module's `route`; add what's missing).
5. **Search:** ICRP nuclides and the four libraries' decay and fission-yield records into `search_docs_structure`
   the way ENDF/B materials are there (`scripts/parse/search/`, `serve.py docs` then `index.py` on the box; the
   Lambda's /tmp is 512 MB, the index is 234 MB; if the new docs push it past 400 MB, say so and keep the ICRP
   nuclides only). Redeploy; a search for "Ac-225" returns the ICRP nuclide and a search for "JEFF-3.3 decay" a record.
6. **UI (report only, `worker-2` does them):** the four libraries in every release picker; /pipeline and the lake
   page's counts (`lib/pipeline-map.ts` is yours: update its rows and counts yourself); the release pickers' files.
   List each file and the change in your final report.

## Done means
Part A verified on production with the SSM parameter named; Part B's three tables registered for 13 releases with
counts, the two routes live with README rows, `/endf/cov` answering a resolved-range band; Part C's items each done or
listed with why; scripts, DDL, README, dictionary and INVENTORY committed and pushed; the parse box terminated; spend
in the manifests; one final report to `lead-agent` with every URL (dev box and production), rows per table, latencies,
spend, what the UI window must change.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/56-admin-file2-file32-layers.md and do it; report to lead-agent after each part.`
