# 34 — A store behind saves and uploads; the dataset routes of the API (2026-11-08, 23:40 ET)

Written by lead-agent for parsing-1. Report to `lead-agent` only; no questions; one report at the end. Work in
`~/Code/nsrgpt` on main, pull before each commit, push each commit, CI type-checks every push. AWS on the new account
(profile `nysgpt-new`, us-east-2); the free route first and state its time before any paid move; the Lambda and its
deploy live in `services/nsr-api/` (README has the routes and the deploy steps). ui-layer-2 builds the pages that call
these routes (brief 33); keep to `services/nsr-api/**`, `scripts/**`, `app/api/**` and `lib/community*.ts` or whatever
the two API routes below import.

## Part A: a store behind /api/community and /api/upload
Today both routes are stubs: saving a view or recipe and uploading a file answer "isn't available yet"; the seeds are
fixed data. Give them a store so Brendan's Save and the canvas's drop work:
- **Views and recipes**: one DynamoDB table `nsrgpt-views` (on-demand, pay per request; free tier covers this use),
  key `id`, attributes name, saved_by, created_at, kind (view or recipe), state (the JSON the Save dialog posts), and a
  GSI on kind. `/api/community` GET lists (newest first, the seeds included as rows written once by a seed script in
  `scripts/community/seed.mjs`), POST saves, DELETE removes by id. Keep the response shape the page already reads
  (`views.data.views`, `isRecipe` by prompt steps).
- **Files**: `/api/upload` writes to `s3://nsr-lake-613473203863/files/pdfs/workspace/<yyyy-mm>/<name>` (the folder the
  seeds already use), 25 MB cap, returns the LibFile shape the Library lists; `/api/files` (or the existing list route)
  lists that prefix. The seeds stay where they are.
- Credentials: the app runs on Cloudflare Workers in production and on the box in dev; both call the Lambda, not AWS
  directly, so put these behind the Lambda `nsr-api` as `/community` and `/files` routes with the DynamoDB and S3
  permissions added to its role, and have the Next routes proxy to it. No AWS keys in the app.

## Part B: the dataset routes
The app has no page for a dataset yet; brief 33 builds five (ENSDF, XUNDL, EXFOR, ENDF/B, NSR). They need:
1. `GET /dataset/{source}/{id}` where source is `ensdf` or `xundl` and id is the dataset id the parsed tables use
   (NUCID plus DSID, URL-encoded). Returns: header (nucid, dsid, title, date, authors, citation, cutoff where present),
   the levels (energy, Jπ, half-life, comments), the gammas (from, to, energy, intensity, multipolarity), the other
   records, the references the dataset cites (NSR keys), and `cards`: the raw ENSDF lines exactly as held
   (`nsr.ensdf_cards` / `xundl_cards`), in order.
2. `GET /dataset/{source}/{id}/text` returns the raw cards as `text/plain`, and `…/md` returns a Markdown rendering
   (header as a list, levels and gammas as tables, comments as quoted blocks, references as a list with NSR links).
   The page's "PDF" is the browser's print of the page for now; say so in the README.
3. `GET /dataset/{source}` lists datasets for a nuclide or mass (`?nucid=`, `?mass=`), with id, title, date, counts,
   as NNDC's index pages do.
4. The same for EXFOR (`/exfor/subentry/{id}` exists; add `/exfor/entry/{id}` with its subentries and the X4 text),
   ENDF/B (`/endf/material/{release}/{mat}` with the sections list and the MF/MT text where parsed), and NSR
   (`/nsr/{key}` exists; add `/nsr/{key}/text` as the exchange-format record). Where a source's raw text isn't in the
   lake as a table, serve what is and say what is missing in the README.
5. Every record carries `graph`: the node the graph should draw for it (type, id, label, sub) and its links (nuclide,
   references, parent dataset), so "Open in Graph" has what it needs.
Document each route in `services/nsr-api/README.md` with one example; keep the 1-hour cache for GETs.

## Done means
Save, delete and upload work end to end on the box; the seeds listed from the store; the dataset routes live with
examples; the README current; spend stated; one report.
