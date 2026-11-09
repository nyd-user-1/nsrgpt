# 43 — JEFF-3.3, JENDL-5, TENDL-2023 and CENDL-3.2 into the ENDF tables; MF8 and MF33 for every release (2026-11-09)

You're `window-1`, the parsing window. Written by `lead-agent` (Fable); Brendan assigned this at 10:40 ET. Report to
`lead-agent` by SendMessage only: 3–5 lines in Efficiency Voice (`docs/sketches/2026-11-06-efficiency-voice.html`,
read it first) after each library lands and once at the end. No questions mid-job; blockers go in a report and you
keep going on the next item. This is background work: Brendan is not waiting on it, so take the time to get counts right.

## Rules (standing)
1. The Mac is an 8 GB MacBook Air: no `python3` on it, the AWS CLI one call at a time, never parallel or backgrounded
   together, nothing over a few MB downloaded to it. All parsing runs on a parse box (below). Scripts reach the box
   through S3 (`lake/_work/parse/`), never pasted into SSM commands.
2. Work in `~/Code/nsrgpt` on main, a checkout shared with other windows. Commit in one step with explicit paths
   (`git add -- <new files> && git commit -m "…" -- <paths>`), `git pull --rebase --autostash origin main` before each
   commit, push right after. Never `git add` then commit separately; never `git add -A`.
3. You own `scripts/parse/endfb/**`, `scripts/parse/serve-structure/**`, `scripts/parse/search/**`, `scripts/parse/box/**`,
   `services/nsr-api/structure.py` (only the release lists and what a new release needs), the lake prefixes below and
   `INVENTORY.md` rows. Don't touch `app/`, `components/`, `lib/` (the UI window owns them); report what they will need.
4. Copy the existing pattern, then adapt (EV rule 17): `scripts/parse/endfb/parse.py` and `releases.sh` are the parser,
   `scripts/parse/serve-structure/serve.py` the serving builder, `scripts/parse/search/` the search index,
   `scripts/parse/box/create.sh` the box. endf-parserpy 0.18.0 is the ENDF-6 reader (held at
   `raw/pypi/2026-11-07/endf-parserpy/`; the box's userdata installs it).
5. Spend cap $8 (box hours, Athena scans, S3 requests). Free routes first; name any paid step and its price in a report
   before taking it; keep the spend in each manifest. Terminate the box when done.

## Where things are (all in `s3://nsr-lake-613473203863`, profile `nysgpt-new`, us-east-2; Glue `nsr`, Athena workgroup `nsrgpt`)
- Parsed ENDF/B, the convention: `lake/endfb/<release>/{materials,sections,xs_points,records}/`, Athena `nsr.endfb_*`
  partitioned by `release`, a `manifest.json` per release. Nine ENDF/B releases plus four POINT releases are in.
- Serving: `lake/serve/endf/<release>/{materials,xs}/`, `nsr.endf_serve_*` partitioned by release, built by
  `serve.py endf <release>`; the API (Lambda `nsr-api`, `services/nsr-api/structure.py`) lists held releases in
  `RELEASES` (line 26) and answers `held: false` for any other (line 228). Search: `lake/serve/search/2026-11-08/`,
  `search_docs_structure` holds ENDF/B materials and MF3 sections (`scripts/parse/search/`).
- The dev box `i-0ec4775a5cd68d41b` builds and deploys the Lambda (`services/nsr-api/README.md`, "Packages and build";
  `build.sh` on the box, `deploy.sh` from the Mac). Running now at http://3.150.112.32:3000; it stops itself about
  16:40 ET; `scripts/devbox/launch.sh start i-0ec4775a5cd68d41b` restarts it.

## Sources (ENDF-6 text, one zip per sublibrary; `_n` = neutrons, `_tsl` thermal scattering, `_decay`, `_nfpy`/`_sfpy`
fission yields, `_g` photonuclear, `_p`, `_d`, `_t`, `_he3`, `_he4` charged particles, `_photo` photo-atomic, `_e` electrons, `_ard` atomic relaxation)
- CENDL-3.2: `raw/iaea/2026-11-07/public/download-endf/CENDL-3.2/backup/cendl-3-2_n.sublib.zip` (109 MB).
- JEFF-3.3: `raw/iaea/2026-11-07/public/download-endf/JEFF-3.3/_backup-by-NSUB/zip/jeff-3-3_{n,tsl,decay,nfpy,sfpy}.sublib.zip`
  (450, 37, 6.4, 1.0, 0.1 MB) with a `.lst` beside each listing its materials. Charged-particle and photonuclear sets
  are in `raw/nea/2026-11-07/` (NEA's JEFF-3.3 archives; find them in its `manifest.json`); add them as sublibraries.
- JENDL-5: `raw/iaea/2026-11-07/public/download-endf/JENDL-5-Aug2023/backup/jendl-5_{n,g,p,tsl,d,photo,decay,he4,e,nfpy,ard}.sublib.zip`
  (4.2 GB, 1.5 GB, 951, 385, 68, 30, 27, 18, 7.7, 1.9, 1.5 MB). JAEA's later updates (`raw/jaea/2026-11-07/ftpnd/`,
  `jendl5_upd6.tar.gz` and friends) are not parsed in this brief; list them in the manifest as held, unparsed.
- TENDL-2023: `raw/iaea/2026-11-07/public/download-endf/TENDL-2023/backup/tendl-2023_{n,p,d,t,he3,he4,g}.sublib.zip`
  (2.9, 2.0, 2.6, 2.6, 2.4, 1.4, 1.4 GB) with `.lst` files beside them.
- Release names, used as the `release` partition value everywhere: `CENDL-3.2`, `JEFF-3.3`, `JENDL-5`, `TENDL-2023`.

## Part A: the four libraries into `endfb_*`
1. Box: `scripts/parse/box/create.sh nsr-parse-2` with a 400 GB gp3 root (TENDL unpacks past 100 GB; check the script's
   size argument). Reach it only through `scripts/iaea/box/ssm.sh`. Wait for `/opt/box/ready`.
2. `parse.py` takes one archive per release. Extend it to take several: `parse.py <release> <key> [<key>…]`, each key
   read in turn with the existing reader, the sublibrary named from the archive's NSUB token mapped to ENDF/B's words
   (n → neutrons, tsl → thermal_scatt, decay → decay, nfpy → nfy, sfpy → sfy, g → gammas, p → protons, d → deuterons,
   t → tritons, he3 → helium3s, he4 → alphas, photo → photoat, e → electrons, ard → atomic_relax) so one query spans all
   libraries. Everything else stays: the four tables, the partition per release, the manifest.
3. Counts check: there is no nsr-count reference for these libraries. The reference is each archive's `.lst` (one line
   per material) and, failing that, the number of files in the zip with an MF1/MT451 section. The manifest records
   reference, parsed, and any difference explained. Add the four to `REFERENCE` in parse.py from the `.lst` counts.
4. Order: CENDL-3.2 (small; proves the multi-archive path), JEFF-3.3, JENDL-5, TENDL-2023 (n first, then g, p, d, t,
   he3, he4). Add each release's line to `releases.sh`. Report after each library: materials, MF3 sections, points,
   bytes, seconds.
5. Serving: `serve.py endf <release>` for each (materials and xs into `lake/serve/endf/<release>/`, partitions added).
   Then in `services/nsr-api/structure.py` add the four to `RELEASES` (ENDF/B first, then JEFF-3.3, JENDL-5, TENDL-2023,
   CENDL-3.2); check line 64's index use still holds; build and deploy per the README from the dev box. Verify from
   the Mac: `/endf/xs?name=Fe-56&mt=102&compare=JEFF-3.3,JENDL-5,TENDL-2023` answers four series with `held: true`;
   `/endf/materials?release=JEFF-3.3&sublibrary=neutrons&z=92` lists U. Report the latencies.
6. Search: add the new materials and MF3 sections to `search_docs_structure` the way ENDF/B's are there, rebuild the
   index (`scripts/parse/search/`, its README), redeploy if the index file moves. Brief 18's sixth check ("asks for
   JEFF") should now pass.
7. `INVENTORY.md`: extend the `lake/endfb/` and `lake/serve/endf/` rows (download, edit, upload: one call each).

## Part B: MF8 and MF33 for every release held
Every release in `nsr.endfb_sections` with `mf = 8` or `mf = 33` (the nine ENDF/B releases and the four above; POINT
releases have neither). The archives are re-read on the box; add a `--mf=8,33` mode to parse.py that parses only those
sections (MF1/451 for the material row is already there) and writes the tables below, partitioned by release, DDL in
`scripts/parse/endfb/ddl/`, registered in `nsr`. endf-parserpy reads MF8 and MF33; a section it rejects is counted in
the manifest with its MAT/MT, not dropped silently.
1. `endfb_fy` … MF8 MT454 (independent) and MT459 (cumulative): release, sublibrary, mat, mt, energy_ev,
   interpolation, zafp, fps, yield, yield_unc. One row per product per incident energy.
2. `endfb_decay` … MF8 MT457, one row per material: release, sublibrary, mat, za, liso, half_life_s, half_life_unc,
   stable (NST), spin, parity, mean energies (light particles, electromagnetic, heavy particles) with uncertainties.
3. `endfb_decay_modes` … MT457's mode list: release, sublibrary, mat, rtyp, rfs, q_ev, q_unc, br, br_unc.
4. `endfb_decay_lines` … MT457's discrete spectra: release, sublibrary, mat, styp, er_ev, er_unc, ri, ri_unc, type, and
   a `continuum` flag row per STYP that has one (its parameters as a JSON string). Nothing from the spectra is lost.
5. `endfb_cov` … MF33 in long form: release, sublibrary, mat, mt, mat1, mt1, ni_index, lb, row_energy_ev,
   col_energy_ev, value, with `lb` kept so a reader knows the representation; LB=5 and 6 expanded to (row, col, value),
   LB=0–4 stored as (energy, value, energy1, value1) pairs in the same columns with `col_energy_ev` null.
6. Counts check: for each release and table, sections parsed against `SELECT count(*) FROM endfb_sections WHERE mf = 8
   AND mt IN (454, 459)` (and 457, and `mf = 33`); the manifest shows both numbers per release.
7. Run order: B-VIII.1 first (report its numbers), then the other eight ENDF/B releases, then the four libraries.
8. Serving for these waits for a later brief; the raw tables and their counts are this brief's deliverable. Add a
   `lake/endfb/<release>/manifest.json` section `mf8_mf33` and an `INVENTORY.md` note.

## Done means
1. Four releases in `nsr.endfb_*` and `nsr.endf_serve_*`, the API serving them, the search index holding them,
   manifests with counts and spend, INVENTORY rows, `releases.sh` listing them.
2. `endfb_fy`, `endfb_decay`, `endfb_decay_modes`, `endfb_decay_lines`, `endfb_cov` registered for every release with
   MF8 or MF33, counts matching the sections table or explained.
3. Scripts and DDL committed and pushed; `scripts/parse/endfb/README.md` says how to rerun each part in one line.
4. One final report to `lead-agent`: rows and bytes per table, spend, latencies, what the UI window needs to change
   (release lists, counts on /pipeline and the lake page, the data dictionary's `held` note), anything unparsed and why.
   Box terminated.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/43-parse-jeff-jendl-tendl-cendl-mf8-mf33.md and start; report to lead-agent after each library.`
