# 20 — The IAEA records repository: index it, take DXS-2026 and the meeting paperwork (2026-11-08)

Written by lead-agent (Fable) for parsing-2. Report to `lead-agent` only. Efficiency Voice in every report.

## What this is
`https://nds.iaea.org/records/` is an Invenio RDM repository the raw layer never crawled: zero mentions in our
inventory. It holds data records (the new DXS-2026 displacement cross sections, record `dgy96-g7a65`) and meeting
paperwork (research coordination meeting agendas, participant lists, reports, presentations). Brendan's ruling: the
paperwork is a roadmap to value and an audit of the gaps, so we want both; data files beyond DXS wait for a later pass.

Wayback's CDX index shows about 2,478 files, 5.27 GB, captured under `nds.iaea.org/records/*/files/*`.

A sample record export is at `scripts/iaea/records/sample-record.json` (record `s0x9e-md404`, the 3rd RCM of the CRP
on Updating Fission Yield Data for Applications). Its shape: `id`, `created`, `updated`, `metadata` (title,
publication_date, resource_type, creators, description, subjects), `files.entries` keyed by filename with `size`,
`checksum` (`md5:…`), `mimetype`, `ext`, `links`; `versions`, `parent`, `stats`.

## The budget: this is the whole brief
The Webshare proxy plan stood at **244.37 GB used of 250 GB** at 14:10 ET on 2026-11-08. That is **5.6 GB left**,
and nothing else gets any until Brendan says otherwise.
- Hard cap for this job: **5.0 GB of proxy bytes**, counted by the box's meter (`scripts/iaea/box/meter.sh`) and
  checked against the Webshare dashboard. Stop every proxy fetch at the cap, or when the dashboard shows 249.5 GB.
- **Wayback costs nothing on the proxy.** Fetch Wayback from the box's own address (brief 14, lane B: `id_` replay,
  Range requests in parallel, `scripts/iaea/box/wbget.py`). Every file Wayback holds comes from Wayback. The proxy
  is for what Wayback lacks, in the order below.

## Routes
- The whole site, including `/api/`, sits behind the Cloudflare managed challenge: curl, Lambda and the proxy lines
  get the challenge page. Real Chrome through a residential Webshare line, automation flags off, clears it in
  seconds (brief 14, lane A; `scripts/iaea/box/userdata.sh`, `mirror.py`). Once cleared, `fetch()` run inside the
  page carries the clearance cookie, so the API reads from inside the browser.
- API: `GET /api/records?size=100&page=N&sort=newest` lists records (`hits.hits[]`, `hits.total`); follow
  `links.next` if the page size is capped. `GET /api/records/{id}` is the record; `GET /api/records/{id}/files`
  lists its files. Download: `https://nds.iaea.org/records/{id}/files/{name}?download=1`.
- Wayback: `https://web.archive.org/web/2026id_/https://nds.iaea.org/records/{id}/files/{name}` (try the
  `?download=1` form too). CDX: `https://web.archive.org/cdx/search/cdx?url=nds.iaea.org/records/*&output=json&fl=original,timestamp,length,statuscode&collapse=urlkey&filter=statuscode:200`.
  Verify every Wayback file against the record's `size` and `md5`; a mismatch goes to `not_taken` with reason
  `wayback mismatch`, then the proxy may take it in its turn.

## Order of work
1. **Index, first and in full (about 25 MB).** Every record's JSON through the browser route into
   `raw/iaea-records/2026-11-08/_index/records.jsonl` (one record per line, the API's JSON as served). Then
   `records.tsv`: `id, created, publication_date, resource_type, title, n_files, bytes, class, wayback_bytes` where
   `class` is `paperwork` or `data` (rule in step 3). Report to lead-agent: records, files, paperwork bytes, data
   bytes, how much of each Wayback holds, how much the proxy must carry. Don't wait for an answer; continue.
2. **DXS-2026 (record `dgy96-g7a65`), all four zips**: `Neutron_files.zip` (2.1 GB), `Proton_files.zip` (3.0 MB),
   `Deuteron_files.zip` (44.9 kB), `Alpha_files.zip` (47.1 kB). Wayback first; proxy if Wayback lacks it. Check the
   md5 the record lists. This replaces the 2,753 DXS-2018 files in `scripts/iaea/not-taken/iaea.json`: change their
   reason to `superseded by records/dgy96-g7a65 (DXS-2026), 2026-11-08`.
3. **Paperwork**: every file whose extension is one of `pdf doc docx ppt pptx xls xlsx csv txt md rtf odt odp html htm`
   and whose size is under 100 MB. Wayback first (free), then the proxy, **smallest first** so the count is highest
   when the cap lands. Skip images (`jpg jpeg png gif tif heic`) and video; list them in `not_taken` as `image,
   skipped`. Everything else (`zip tar gz tgz 7z dat endf h5 hdf5 ace txt over 100 MB, any file over 100 MB`) is
   `data`.
4. **Data files other than DXS**: take from Wayback only, after every paperwork file is in; nothing from the proxy.
   What remains goes to `not_taken` with reason `deferred: data, proxy budget (2026-11-08)` and its size.
5. **PRONDOS**: the 5 text files (44 KB) under `public/download-endf/PRONDOS/mat/` in `scripts/iaea/not-taken/iaea.json`,
   through the proxy, into `raw/iaea/2026-11-07/public/download-endf/PRONDOS/mat/`; remove them from the not-taken list.
6. **Phase 3 and 4**: no fetching. Add one row to the Not held table in `docs/sketches/nsr-lake.html` under the
   existing phase 3–4 row: "Next approach: Wayback from a box's own address costs no proxy bytes; check CDX for the
   NEA ACE tars and the JENDL pointwise tars before buying a new plan."

## Where it lands
- `raw/iaea-records/2026-11-08/<record-id>/<filename>` as served; `_index/records.jsonl`, `_index/records.tsv`;
  `manifest.json` in brief 14's shape: every file with `url`, `key`, `size`, `md5`, `route` (`wayback` with its
  snapshot timestamp, or `proxy`); `not_taken` with reasons; `records` count and the class split. Intelligent-Tiering.
- `INVENTORY.md`: one new row for `raw/iaea-records/2026-11-08/`; the `raw/iaea/2026-11-07/` row's file count if
  PRONDOS lands; the header's Updated date.
- `docs/sketches/nsr-lake.html`: Saved (S3) table gets the records folder; Stats tab's libraries table and Not held
  table updated (the DXS row, the new phase 3–4 line, the records' deferred data as a row with its byte count).
- `scripts/iaea/records/`: the scripts you write (the index pass, the classifier, the fetch pass), each with a
  header comment saying what it reads and writes. `scripts/iaea/spend.json`: the box's hours and cost.

## Rules (Brendan's, standing)
1. One box at a time, Spot where it fits; terminate it when done; log its cost. No AWS spend beyond the box.
2. No commits, no pushes (tell lead-agent what changed; the lead commits). No subagents. No builds or dev servers.
3. Write only in `scripts/iaea/`, the two nsr-lake.html tables, the lake prefixes above, `INVENTORY.md`. Don't touch
   `app/`, `components/`, `lib/`, `services/`, `scripts/parse/`.
4. Politeness: one browser, one request at a time against nds.iaea.org; Wayback as brief 14 ran it.
5. The 5.0 GB proxy cap is absolute. If the dashboard and the meter disagree, the dashboard wins.

## Done means
1. `records.jsonl` holds every record the API lists; `records.tsv` classifies each.
2. DXS-2026's four zips in the lake with matching md5; the DXS-2018 reasons rewritten.
3. Every paperwork file in the lake or in `not_taken` with its reason; data files from Wayback where held, the rest
   listed as deferred with sizes.
4. Manifest, `INVENTORY.md`, `nsr-lake.html`, `spend.json` updated; the box terminated.
5. Reports to lead-agent: after the index (step 1), after DXS (step 2), and a final report with records, files, GB
   by route, proxy GB used against the cap, the Webshare dashboard reading, AWS spend, and what was deferred.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/20-iaea-records-repository.md and start; report to lead-agent after the index, after DXS, and at the end.`
