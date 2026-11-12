# Resonance curves for Elpis (brief 74, Elpis lane B)

JANIS Web draws, for every library it holds, pointwise cross sections whose resonances are reconstructed and broadened.
Those curves are in JANIS's own packages (NEA GitLab project `janis/data`, copied by lane A to
`lake/_raw/janis-data/<NAME>/<VERSION>/`), so Elpis serves them decoded, unchanged: `lake/serve/endf/<release>-janis/`
(`xs/`, `xs_index/`, `xs_series/series.bin`, the `endf_serve_xs` partition), read by `/endf/xs` with `janis=1`, which
Elpis's book sends (`components/elpis/use-book.ts`). ENDF/B-VIII.0 Fe-56 MT 102 from the package is JANIS's Tabler table
exactly: 40,561 points, every energy and cross section identical.

## Serving JANIS's curves

`janis_serve.py <release>…` (or `--loop` on several boxes at once; each release is claimed with an S3 conditional write,
`lake/endfb/<release>/janis/claim`) does, per release: the package's `.jpk` files (complete when every `.jpk` GitLab lists
is in the lake at its size; the list is cached at `lake/_work/parse/endfb/recon/janis/gitlab-files.json`), every MF3
section of every sublibrary decoded by `jpk.py`, named from `lake/serve/endf/<release>/materials/` by sublibrary and MAT
(from the section's ZA where the lake has not parsed the release), thinned as `serve.py endf_point` thins POINT files
(over 40,000 points: the lowest and highest in each of 20,000 log-energy steps), registered and split for the API
(`serve.py point_files`). `lake/endfb/<release>/janis/manifest.json` has the counts and B2's check (the materials with
resolved or unresolved parameters that the package holds); a release that cannot be served gets `janis/error.json`.

Computed rows JANIS draws are computed here in advance, in a `computed` column the API passes through:
`Sum(MT50-91)`, MT 4 where a material has no MT 4, the sum of its MT 50-91 sections on the union of their grids, each
lin-lin and zero outside its range. Production through MT 5 (`MF3+MF6MT5`, `MF6MT5`, `Production cross section`) is
`/endf/section/production` (`services/nsr-api/endf_sections.py`), which takes a step's right value as JANIS does.

`jpk.py` is the decoder (format in `scripts/janis/README.md`); `jpk.to_endf()` rebuilds a material as ENDF-6 text.

## How JANIS's curves were identified (B1)

- `janis_tabler.py` reads JANIS's Tabler ("original values") through its renderer: `/janisweb/renderer?root=…`, then
  `toogleProducer.json` with `producerId=janis-render-T-<ref>` opens the table, then `tabler/<viewer>?pg=<n>`, 500 rows a
  page. A computed series (`calc[...]`) opens only from its book page's renderer (`/janisweb/book/<book>/<nuc>/<MT>`).
- Against my own reconstructions (`recon.py`, `b1.py`; U-235, U-238, Fe-56, Au-197, Pu-239 in ENDF/B-VIII.0): JANIS is
  broadened to 293.6 K (0 K differs by up to 100x at resonance peaks, 300 K by about 2% in the resolved range); its grid
  is NJOY RECONR's (every JANIS energy below 1 eV and above the resonance range is an NJOY node); NJOY2016 with reconr
  err 0.0005 and broadr 293.6 K came within 1e-4 (median, at shared nodes) in the resolved range, but a uniform 3e-4
  below 1 eV and about 9e-4 at 1-100 eV remained, from no published setting. The packages settled it.
- `janis_book.py` reads JANIS's book pages (one per distinct reaction per book) for the kinds of computed series.

## Reconstruction for releases JANIS does not hold

`recon.py` (list, tapes, run, serve, check) reconstructs a release from its own MF2 with NJOY2016 (reconr 0.05%, broadr
293.6 K; PREPRO 2023 where NJOY refuses a material, e.g. the standards sublibrary) into `<release>-recon-{0K,293.6K}`. JANIS
Web draws none of the releases it would apply to (ENDF/B-VIII.1, TENDL-2023, B-V to B-II), so no bulk run was made
(new-lead-agent, 2026-11-12). Boxes: `./scripts/parse/box/create.sh nsr-recon-<n> m7i-flex.large ../../recon/userdata.sh 60`
(role nsr-parse-box; NJOY2016 from `lake/_work/parse/endfb/recon/bin/njoy`, PREPRO built at boot; ends itself after 8
hours). Scripts are read from `lake/_work/parse/endfb/recon/` at boot.
