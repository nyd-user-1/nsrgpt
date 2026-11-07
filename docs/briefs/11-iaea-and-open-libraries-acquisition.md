# 11 — IAEA, OpenMC and the open nuclear data libraries: acquire everything worth having (2026-11-07)

You're "agent-2". Brendan approved this work tonight and assigned it through lead-agent (this brief's author). Report
to lead-agent with SendMessage (name `lead-agent`). If something here conflicts with what you find, lead-agent decides.

NSRgpt: "Find, read, connect and work with nuclear data. In seconds." The plan is to hold every nuclear dataset worth
having, then parse, index and cite it in the app. Your job tonight is the holding: phases 1 and 2 (evaluated data,
databases, codes, archives, documentation) for the sources below, plus OpenMC. An incomplete assignment is a failure:
every item ends either in the lake or listed with the reason it isn't.

## Rules (Brendan's, standing)
1. Efficiency Voice: `~/Code/nsrgpt/docs/sketches/2026-11-06-efficiency-voice.html`. Read it first. Reports are short,
   numbered, facts only.
2. Finish the job. No "how should I proceed" questions; a rejected step is adjusted, not a stop. Messages mid-job only
   for real blockers.
3. No commits, no pushes (Brendan directs both). No subagents. Plain language.
4. The Mac is an 8 GB MacBook Air. No `python3` on it. The AWS CLI (itself Python, ~68 MB a process) one call at a time:
   never looped in parallel, threaded or backgrounded together. Listing, counting, parsing and fan-out run on AWS
   (Lambda or a box), with output in S3. Big files never land on the Mac, except through Chrome when no other route
   exists (rules in "Access").
5. Write only in: `scripts/iaea/` (new), new Lambda functions under `services/` if you need them,
   `docs/sketches/2026-11-07-iaea-inventory.html`, the lake prefixes below, and new rows in the lake's `INVENTORY.md`.
   Don't touch `app/`, `components/` or `lib/`: lead-agent is building `/pipeline` there. Ask lead-agent before
   redeploying `nsr-fetch`; others use it.
6. Budget: $5 of AWS spend for the whole job (Brendan's figure). Free routes first: Lambda's free tier, free inbound
   transfer. Name any paid step and its price in the batch report before or as you take it. Keep a spend log in each
   manifest.
7. Drive Brendan's Chrome only through Claude in Chrome. Load the `anthropic-skills:chrome-browser` skill before the
   first browser step. Work in a new tab; he may be using the browser.

## Scope
1. Everything on https://nds.iaea.org/legacy and the pages it links.
2. https://nds.iaea.org/cdroms/
3. https://nds.iaea.org/exfor/endf.htm — the ENDF archive: every evaluated library it offers.
4. https://nds.iaea.org/exfor/ — EXFOR in every format offered (we hold J4 already).
5. https://nds.iaea.org/exfor/cinda.htm — CINDA.
6. The OpenMC official data libraries (openmc.org). Brendan asked for these by name: take them.
7. Brendan's Quick Links list, at the end of this brief: every item acquired or given a reason.

Acquire datasets, databases, tables, data points, formats, frameworks, codes and code packages, compilers, parsers,
libraries, documentation and charts that we don't hold and that add value to NSRgpt.

Phases: take phases 1 and 2 tonight, and OpenMC. Processed forms (ACE, groupwise, WIMSD, Geant4 data, PHSP
phase-space files, TENDL random/TMC files, extra temperature sets) are phases 3 and 4: list each in the manifest with
its URL, size and phase instead of pulling it, unless it is under 1 GB, in which case take it.

## Already held (don't pull again)
- All of www.nndc.bnl.gov: `raw/nndc/2026-11-07/` and its `manifest.json`. ENDF/B-II to B-VIII.1 (ENDF-6, GNDS, ACE,
  POINT, EPICS2017), the ENSDF, XUNDL and NSR archives, CapGam, B(E2), double-beta decay, MACS, Wallet Cards, NuDat
  chart data, low-fidelity covariances, ENDF reports, USNDP reports and meeting documents.
- `raw/github/`: njoy/ENDFtk; IAEA-NDS endf-parserpy, EXFOR-JSON-File (J4, 27,116 entries), exforparser, ripl3_json,
  RIPL-4, FENDL-ENDF (index only), IAEA-PD2019 (plots and documents only), ndlab, decaychain, lc_api_notebook.
- `raw/iaea-livechart/2026-11-06/`: the Live Chart API, 360,475 rows.
- Known gaps: JEFF-3.1, JENDL-4.0, JENDL-3.3, ROSFOND, CENDL-3.1 (NNDC's Sigma serves them); FENDL ENDF files and
  PD2019 ENDF/ACE files (git-annex content on IAEA's store); CINDA; IBANDL; OpenMC.
- The data index: `docs/sketches/2026-11-07-data-index.html`. The NNDC pull: `docs/sketches/2026-11-07-nndc-inventory.html`.

## Access, as measured on 2026-11-07
- nds.iaea.org and www-nds.iaea.org sit behind a Cloudflare managed challenge ("Just a moment…"). curl answers 403
  from the Mac, from AWS Lambda in us-east-2 and from all 12 working proxy lines. That includes the git-annex
  "hashstore" file URLs.
- Side doors first. IAEA-NDS's GitHub org is open (codeload tar.gz). Many libraries have home sites: NEA (JEFF), JAEA
  (JENDL), PSI (TENDL), the OpenMC hosts, NNDC. A git-annex repo's `git-annex` branch has `*.log.web` files with each
  file's real URL.
- Chrome: once Chrome passes the challenge, read IAEA pages and indexes through it (light work). For files, first test
  whether the file URLs are walled too, and whether anything outside the browser can use the clearance (it is usually
  tied to the browser and its address; expect not). If Chrome is the only route: download one file at a time to
  ~/Downloads, at most 2 GB a file, upload it with one `aws s3 cp`, delete the local copy. The Mac uploads at about
  2.3 MB/s. Tell lead-agent before starting a Chrome route that totals more than about 10 GB.

## Tools in place
- Lambda `nsr-fetch` (`services/nsr-fetch/`, us-east-2): copies web files straight into the lake (writes under `raw/`
  only), about 65 MB/s, skips a key that already holds the same byte count, multipart for files over 100 MB, optional
  `proxy` line. Files over 2 GB use parts mode (see `scripts/nndc/pull.py`). From the Mac: one `aws lambda invoke` at a
  time, up to 40 files a call. For bigger fan-out, drive it from inside AWS, not from the Mac.
- Lambda `nsr-count`: read-only record counts inside lake files.
- `scripts/nsr-fetch-ui/server.mjs`: Brendan's page on localhost:4317 for single files. Leave it running.
- The proxy army: `scripts/proxy/proxies.sh`, SSM `/nsrgpt/webshare/proxies` (New account). Lines 0–9, 12 and 13
  answer; 10 and 11 don't. The plan is paid through 2026-11-19. Use it where a source blocks AWS addresses or rate-limits
  one address but answers residential ones. From pax2: probe lines first; walls come and go per line within hours;
  rehearse on a few files before a fleet; drop a line that gets 0 of its first 5.
- The NNDC pull as a pattern: `scripts/nndc/crawl.py`, `list.py`, `pull.py`. They are Python: run them in AWS.

## Hard-won lessons (from leuk, govblock, pax, pax2, pax-trinity, solar, tariffs and today)
1. Politeness (tariffs, 2026-08-26, the CBP outage): a hard rate cap at about a fifth of the source's measured peak;
   back off when latency rises (p95 over twice the baseline), not only on errors; after an outage, resume slowly; never
   two heavy jobs against one origin.
2. Side doors (leuk): walled portals often leave their file egress open — CDN or bucket paths, static JSON catalogs,
   `/metadata` endpoints. Find the files' real host.
3. Measure limits before planning a crawl (leuk): rate limits, batch caps; retries with backoff and a cool-down breaker.
4. Buy through bottlenecks (pax2): when a constraint is measured, name the purchase that removes it, with its price,
   to lead-agent.
5. Long waits (tariffs): shell calls in the background cap at about 10 minutes; long chains run detached or in AWS.
6. No heavy work on the Mac (govblock, 2026-10-01: parallel AWS CLI calls locked it up).
7. Verify by code, not screenshots (pax-trinity). Chrome is for getting past the wall, not for checking results.
8. Count from what we hold, not from the source's website.
9. Sniff file types: a `.gz` can be a tar, ENDF tapes can be named `.txt` (nsr-count, 2026-11-07).
10. Harvest timers can be writing while you count (solar): check for running jobs before comparing counts.

## Where things go
- `s3://nsr-lake-613473203863/raw/<source>/2026-11-07/<path as on the source>`: `raw/iaea/…`, `raw/openmc/…`,
  `raw/nea/…`, `raw/jaea/…`, `raw/psi/…`, and so on. Profile `nysgpt-new`, us-east-2.
- One `manifest.json` per source folder: every file (URL, key, bytes, sha256 when known, phase), `not_taken` (URL, size
  when known, phase, reason), dead links, and spend.
- Storage class Intelligent-Tiering (`nsr-fetch` sets it).
- New rows in the lake's `INVENTORY.md` at the end (download, edit, upload: one call each).

## Batches: Brendan wants to see results as they land
- Bank one source group at a time. After each batch: files and GB in the lake, manifest updated, and a 3–5 line
  report to lead-agent.
- First batch within 30 minutes of starting. Order: (1) the evaluated libraries Sigma serves that we lack (JEFF-3.1,
  JENDL-4.0, JENDL-3.3, ROSFOND, CENDL-3.1) and their newer versions; (2) OpenMC; (3) EXFOR formats and CINDA;
  (4) the Quick Links databases; (5) codes; (6) CD-ROMs and the legacy pages.

## Done means
1. Every scope item and every Quick Link is in the lake with its manifest entry, or listed with its reason: blocked (with
   the test that showed it), phase 3 or 4 (with size), not offered, dead, or already held.
2. `docs/sketches/2026-11-07-iaea-inventory.html`, in the style of `2026-11-07-nndc-inventory.html`: taken, and not taken
   with why.
3. `INVENTORY.md` rows and a spend total.
4. A final report to lead-agent in Efficiency Voice.

## Quick Links (Brendan's list)
ADS-Lib · Atomic Mass Data Centre · Beta-delayed neutrons · CINDA · Charged particle reference cross section · CoNDERC ·
DICEBOX · DROSG-2000 · DXS-2 · Decay Data Library for Actinides · EE-View · EMPIRE-3.2 · ENDF Archive · ENDF Retrieval ·
ENDF-6 Codes · ENDF-6 Format · ENDVER · ENSDF · ENSDF ASCII Files · ENSDF programs · EPICS Electron & photon interaction
data · EXFOR · FENDL · Fission Yields · GANDR · GRUCON · Geant4 Libraries · IBANDL · IDB · INDL/TSL · IRDFF-II · LARELKIN ·
LOGFT · LiveChart of Nuclides · MIRD · Medical isotope browser (Isotopia) · Minsk Actinides Library · Missing-levels · NAA ·
NGATLAS · NSR · NuDat-3 · Nuclear Charge Radii · Nuclear Electromagnetic Moments · PADF-2 · PGAA · PHSP · PLOTTAB · POINT ·
PREPRO · Photon Strength Function database · Photonuclear · RIPL · RNAL · SIGACE · SPECOMP · SPECTER · STAYSL PNNL ·
Safeguards Data · SigmaCalc · Spallation models · Specialized Evaluated Libraries · Standards · Stopping Power Data · TALYS ·
Tendl2019 · Th-U · Thermal Scattering Law Library Generator · Thermal neutron capture gamma rays · Thin Layer Activation ·
URRPACK · WIMSD-IAEA Library · Wallet cards · X and Gamma-rays standards · ZVVIEW
