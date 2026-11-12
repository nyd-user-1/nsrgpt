# JANIS as the engine (brief 77)

Elpis's book, browse, search and checker are JANIS's own output. JANIS 4.1 (NEA's Java Web Start build, source version
652, the version JANIS Web reports) runs on EC2 boxes against JANIS's own data packages (NEA GitLab `janis/data`, held at
`lake/_raw/janis-data/`), and its results are files and Lambdas the pages read. NEA's program, jars and data are kept in
the lake and run as tools; none of them is committed here. The rules JANIS applies are written up, with their classes, in
`docs/analysis/janis-engine.md`.

## Files
| File | What it does |
|---|---|
| `fetch.sh` | JANIS 4.1's jars (from its JNLP), the manual, the 2020 JNS archive and PDFs, the TRANS checker, NEA's pages -> `lake/_raw/janis-software/` (manifest.json) |
| `setup.sh` | a box ready to run JANIS: Java 8, Xvfb, 7-Zip, CFR, JANIS's jars in `/opt/janis` |
| `userdata.sh` | EC2 user-data for an engine box (setup.sh, the harness compiled, NJOY2016 from lane B's build); ends itself after 12 h |
| `libs.tsv` | every janis/data package, the label JANIS Web gives its library (the dataset name JANIS stores), its base and format |
| `import.sh BOOK\|REST` | JANIS's importer (`org.nea.janis.format.tools.Import`) loads the packages into local JANIS bases (H2 1.3 + DataPack, user and password `janis`, as README_janis.md sets); the packages carry no H2 index, so JANIS builds it. BOOK holds the 14 libraries JANIS's book generator draws plus EXFOR 2025-06-28 (the generator searches one connection); REST the rest |
| `java/BookRun.java` | JANIS's book generator (`org.nea.janis.book.BarnBook`, OFFICIAL options) for one book; Q-value table off (PDF only; it needs a Nubase 2020 dataset) |
| `java/PageExport.java` | each page's JNS restored by JANIS's loader; every plotted series through JANIS's Tabler on its own X values (`janis -table`'s path); the selection tree's labels and order |
| `java/NavExport.java` | JANIS's outline of a book (`BarnBookItemNavigator.buildOutline`) as JSON |
| `pages.py` | the page files: `lake/janis/book/<letter>/<Z-Sym-A>/<MT>.json` (gzip; series in drawing order with legend, colour, mark or stroke, values; axes; title; sheet rows), `pages.json`, `navigation.json` |
| `book.sh <letter> [threads] [material]` | BookRun, PageExport, pages.py, NavExport for one book, synced to the lake (a material: a test run of one nuclide) |
| `compare_web.py` | the engine's pages against JANIS Web's own saved state for the 754 pages lane C fetched -> `lake/janis/engine/compare/web-structure.json` |
| `elpis.py prep\|run\|pack <release>` | libraries JANIS has no package for (ENDF/B-VIII.1, TENDL-2023, B-V to B-II): the evaluation with its neutron MF3 replaced by NJOY2016's (reconr 0.0005, broadr 293.6 K: lane B's settings), for JANIS's importer |

Services: `services/nsr-trans-check/` (JANIS's TRANS checker, Lambda, behind nsr-api's `/exfor/check`) and
`services/nsr-janis/` (JANIS's list and search over the bases' H2 index, container Lambda, `GET /janis/list`, `/janis/search`).

## Rerun
```
./scripts/parse/box/create.sh nsr-janis-1 m7i-flex.large ../../janis/engine/userdata.sh 200   # role nsr-parse-box
./scripts/iaea/box/ssm.sh <box> 'bash /opt/engine/import.sh BOOK'                              # ~25 min
./scripts/iaea/box/ssm.sh <box> 'bash /opt/engine/book.sh n 2'                                 # each of n g p d t h a
```
Heap: 3.5 GB for the importer (5 GB outgrew the 8 GB box on TENDL-2019 and the OOM killer ended it, taking SSM with it).
