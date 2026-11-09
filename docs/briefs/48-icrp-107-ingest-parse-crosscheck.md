# 48 — ICRP Publication 107 into the lake, parsed, and the 15 decay chains checked against it (2026-11-09)

You're `window-3-cognito-pool`; brief 45 is done. Written by `lead-agent` (Fable); Brendan assigned this at 15:40 ET.
Report to `lead-agent` by SendMessage only, Efficiency Voice (`docs/sketches/2026-11-06-efficiency-voice.html`): one
line after Part A, one after Part B, the table after Part C. No questions mid-job; blockers go in a report and you move
to what doesn't depend on them.

## Rules
1. The Mac is an 8 GB MacBook Air: no `python3`, the AWS CLI one call at a time, no file over a few MB downloaded to
   it. Parsing runs on a box (Part B). `~/Code/nsrgpt` on main, shared: pull with `--rebase --autostash`, commit in one
   step with explicit paths, push right after.
2. Write only in `scripts/parse/icrp107/` (new), `lake/raw/icrp/`, `lake/icrp107/`, `INVENTORY.md` rows, and
   `docs/briefs/48-icrp-crosscheck.md` (new). Don't touch `app/`, `components/`, `lib/`.
3. Copy the lake's conventions (EV rule 17): `scripts/parse/box/` for the box and `lake.py` helpers, `scripts/parse/endfb/`
   for the manifest and DDL shape, Athena workgroup `nsrgpt`, database `nsr`, one DDL per table in `ddl/`.
4. Licence: the ICRP-07 data files permit copying for educational, research and not-for-profit use with the notice kept
   (`License_DECDATA.TXT`). Keep the notice beside the files. The report PDF Brendan downloaded
   (`~/Downloads/icrp_ANIB_38_3.pdf`) says on its page 2 it is for internal ICRP use: leave it out of the lake.

## Part A: ingest
1. Source: the "Supplemental Material" zip on https://www.icrp.org/publication.asp?id=ICRP+Publication+107
   (the CD's contents: `ICRP-07.NDX`, `ICRP-07.RAD`, `ICRP-07.BET`, `ICRP-07.ACK`, `ICRP-07.NSF`, the DECDATA program
   and its user guide; the publisher named it `P107JAICRP_38_3_Nuclear_Decay_Data_suppl_data.zip`). Fetch it on the box
   or through Lambda `nsr-fetch`, not the Mac, straight into `s3://nsr-lake-613473203863/raw/icrp/2026-11-09/`. If
   icrp.org refuses scripts, the same files are in https://github.com/OpenGATE/icrp107-database and
   https://github.com/markhogue/RadData (inst/extdata); take them from there and say so in the manifest.
2. The 2022 corrigenda: Brendan has `~/Downloads/Corrigenda of Publication 107.zip` (214 KB: the corrigenda PDF, the
   corrected `ICRP-07.NDX`, `ICRP Publication 107 corrected atomic masses.xlsx`, `License_DECDATA.TXT`). Upload it from
   the Mac (one `aws s3 cp`) to `raw/icrp/2026-11-09/corrigenda-2022/` and unpack it beside the originals on the box.
   The corrected NDX supersedes the CD's NDX; keep both, parse the corrected one.
3. `raw/icrp/2026-11-09/manifest.json` (every file, bytes, sha256, source URL, licence note) and an `INVENTORY.md` row.

## Part B: parse (on a box: `scripts/parse/box/create.sh nsr-icrp-1`, terminate when done; or the dev box if its role can write the lake)
The formats are in the DECDATA user guide inside the zip (fixed-width records). Tables, Parquet under
`lake/icrp107/2008/<table>/`, Athena `nsr.icrp107_<table>`:
1. `nuclides` … from the corrected NDX, one row per nuclide (1,252): name, z, a, isomer, half_life, half_life_unit,
   half_life_s (converted), decay_modes (text), daughters as rows in `daughters` below, mean energies (alpha, electron,
   photon), atomic mass, record offsets into RAD, BET, ACK, NSF.
2. `daughters` … one row per (parent, daughter, branching fraction, mode) from the NDX's daughter fields: this is the
   chain table.
3. `radiations` … from RAD: nuclide, radiation type code and name, yield per transformation, energy MeV.
4. `beta_spectra` … from BET: nuclide, energy grid MeV, intensity.
5. `auger_ck` … from ACK: nuclide, transition, yield, energy.
6. `neutron_spectra` … from NSF: nuclide, energy grid, intensity.
Counts check: 1,252 nuclides; radiation rows per nuclide equal the NDX's record counts; every nuclide in RAD is in NDX.
`lake/icrp107/2008/manifest.json` with sources, rows, bytes, the check, spend. `INVENTORY.md` row.

## Part C: cross-check the 15 chains
The rail's chains are the four natural series, Pu-241, and the ten in `docs/briefs/47-ten-more-decay-chains.md`
(heads listed there as [Z, N]). Ours come from ENSDF: `nsr.nuclide_serve_decays` (parent, daughter, mode,
branching_pct, half_life_s) and `nuclide_serve_summary` (decay_modes JSON, half_life_s). For each head, walk both
sources to stable, branches of at least 0.001%, and compare member by member: present in one and not the other, mode,
branching (flag over 1 percentage point apart), half-life (flag over 1% apart). Write
`docs/briefs/48-icrp-crosscheck.md`: one table per chain (nuclide, ours, ICRP, difference) and a summary table
(chain, members ours, members ICRP, differences). Commit and push it. The chains' isomers (Ba-137m, Tc-99m) are in ICRP
and not in our ground-state walk: list them as "isomer, ours collapses to ground state", not as errors.

## Done means
Raw files and the corrigenda in the lake with manifest and INVENTORY rows; six tables in `nsr`, counts checked;
the cross-check file pushed; box terminated; reports after each part; spend under $1.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/48-icrp-107-ingest-parse-crosscheck.md and do it; report to lead-agent after each part.`
