#!/usr/bin/env bash
# Write docs/sketches/2026-11-07-iaea-inventory.html from the manifests in the lake (brief 11).
# Three tabs (Coverage, Holdings, Routes and spend), each one table; every row has a checkbox and a Note toggle;
# "Copy notes" and "Save notes" collect the checked or noted rows by tab, then by Type or Kind. Nothing is saved.
#   ./scripts/iaea/inventory.sh            # run scripts/iaea/manifest.sh for each source first
#   STAMP="Early version, 23:56 UTC" ./scripts/iaea/inventory.sh
set -euo pipefail
cd "$(dirname "$0")"
A=(--profile nysgpt-new --region us-east-2 --only-show-errors)
B=s3://nsr-lake-613473203863
T=$(mktemp -d)
for s in iaea jaea nea openmc nndc-sigma pypi; do
  aws s3 cp "$B/raw/$s/2026-11-07/manifest.json" "$T/$s.json" "${A[@]}" 2>/dev/null || echo '{"files":[],"not_taken":[]}' > "$T/$s.json"
done
for g in iaea-nds-2026-11-07 upstream-2026-11-07 nsdd-2026-11-08; do
  aws s3 cp "$B/raw/github/_work/$g.json" "$T/gh-$g.json" "${A[@]}" 2>/dev/null || echo '{"files":[]}' > "$T/gh-$g.json"
done
aws s3 cp "$B/raw/iaea/2026-11-07/_work/pending-proxy-window.json" "$T/pending-full.json" "${A[@]}" 2>/dev/null \
  && jq '{count, est_gb_total}' "$T/pending-full.json" > "$T/pending.json" || echo '{"count":0,"est_gb_total":0}' > "$T/pending.json"
OUT=../../docs/sketches/nsr-lake.html
aws s3 cp "$B/raw/github/manifest.json" "$T/github-all.json" "${A[@]}" 2>/dev/null || echo '{"repos":[]}' > "$T/github-all.json"
aws s3 cp "$B/raw/nndc/2026-11-07/manifest.json" "$T/nndc.json" "${A[@]}" 2>/dev/null || echo '{"files":[]}' > "$T/nndc.json"
# every key the lake holds, with bytes, for the Quick Links paths
jq -s '[.[0:6][] | .files[] | {k: .key, b: (.bytes // 0)}] + [.[6].repos[] | {k: .key, b: (.bytes // 0)}] + [.[7].files[] | {k: .key, b: (.bytes // 0)}]' \
  "$T/iaea.json" "$T/jaea.json" "$T/nea.json" "$T/openmc.json" "$T/nndc-sigma.json" "$T/pypi.json" "$T/github-all.json" "$T/nndc.json" > "$T/keys.json"
H='def gb: if . == null then null elif . >= 1e9 then "\(. / 1e9 * 10 | round / 10) GB" elif . >= 1e6 then "\(. / 1e6 | round) MB" else "\(. / 1e3 | round) KB" end;
   def n: if . == null then null else tostring | if length > 3 then (.[:-3] | if length > 3 then (.[:-3] + "," + .[-3:]) else . end) + "," + .[-3:] else . end end;
   def esc: tostring | gsub("&"; "&amp;") | gsub("<"; "&lt;") | gsub(">"; "&gt;");
   def tot: {n: (.files | length), b: (.files | map(.bytes // 0) | add // 0)};'

# ---- numbers -------------------------------------------------------------------------------------------------------
jq -n --slurpfile i "$T/iaea.json" --slurpfile j "$T/jaea.json" --slurpfile e "$T/nea.json" --slurpfile o "$T/openmc.json" \
  --slurpfile s "$T/nndc-sigma.json" --slurpfile p "$T/pypi.json" --slurpfile g1 "$T/gh-iaea-nds-2026-11-07.json" \
  --slurpfile g2 "$T/gh-upstream-2026-11-07.json" --slurpfile g3 "$T/gh-nsdd-2026-11-08.json" "$H"'
  ([$g1[0].files[], $g2[0].files[], $g3[0].files[]] | map(select(.status == "done" or .status == "skipped"))) as $gh
  | ($i[0].files | map(select(.key | contains("/cdroms/dwn/")))) as $cd
  | ($i[0].files | map(select(.key | contains("/public/download-endf/")))) as $endf
  | {iaea: ($i[0] | tot), jaea: ($j[0] | tot), nea: ($e[0] | tot), openmc: ($o[0] | tot), sigma: ($s[0] | tot), pypi: ($p[0] | tot),
     github: {n: ($gh | length), b: ($gh | map(.bytes // 0) | add // 0)},
     cd: {n: ($cd | length), b: ($cd | map(.bytes) | add // 0)}, endf: {n: ($endf | length), b: ($endf | map(.bytes) | add // 0)},
     nt: {iaea: ($i[0].not_taken | length), jaea: ($j[0].not_taken | length), nea: ($e[0].not_taken | length)},
     dead: ($i[0].dead_links | length),
     pend: ($i[0].not_taken | map(select((.reason // "") | startswith("pending"))) | length)}
  | .all = {n: ([.iaea, .jaea, .nea, .openmc, .sigma, .pypi, .github] | map(.n) | add), b: ([.iaea, .jaea, .nea, .openmc, .sigma, .pypi, .github] | map(.b) | add)}' > "$T/num.json"

# ---- Coverage: scope pages, Quick Links, other ---------------------------------------------------------------------
jq -n --slurpfile x "$T/num.json" "$H"'$x[0] as $u | [
 {item: "nds.iaea.org/legacy", url: "https://nds.iaea.org/legacy", type: "scope page", status: "taken", files: 2, where: "Read through Chrome; its Quick Links list set the subsite crawl. Saved as legacy and legacy.rendered.html"},
 {item: "nds.iaea.org/cdroms", url: "https://nds.iaea.org/cdroms/", type: "scope page", status: "taken", files: $u.cd.n, bytes: $u.cd.b, where: "raw/iaea/2026-11-07/cdroms/dwn/, through the direct path the page script links to (Brendan approved). 10 catalog files answer 404"},
 {item: "nds.iaea.org/exfor/endf.htm", url: "https://nds.iaea.org/exfor/endf.htm", type: "scope page", status: "taken", files: $u.endf.n, bytes: $u.endf.b, where: "raw/iaea/2026-11-07/public/download-endf/: all 107 library folders taken, held, or listed with a reason (Holdings tab)"},
 {item: "nds.iaea.org/exfor", url: "https://nds.iaea.org/exfor/", type: "scope page", status: "taken", where: "EXFOR as X4, C4, CX4 and JSON, the master files and dictionary (raw/github/IAEA-NDS/); J4 already held; X4Pro SQLite, x5json and C5 in cdroms/dwn/. The search pages are a front end"},
 {item: "nds.iaea.org/exfor/cinda.htm", url: "https://nds.iaea.org/exfor/cinda.htm", type: "scope page", status: "pending", where: "CINDA backup and dated snapshots (exfor-master/cinda/): folder pages in; the data files wait for the proxy window. The CINDA search is a front end"},
 {item: "openmc.org/data", url: "https://openmc.org/data/", type: "scope page", status: "taken", files: $u.openmc.n, bytes: $u.openmc.b, where: "raw/openmc/2026-11-07/: all 24 downloads plus openmc-dev/data, 0 errors"}]' > "$T/cov-scope.json"

jq -R -s --slurpfile keys "$T/keys.json" "$(cat ql.jq)" quicklinks.tsv > "$T/cov-ql.json"

jq -n --slurpfile x "$T/num.json" --slurpfile pf "$T/pending.json" "$H"'$x[0] as $u | $pf[0] as $pp | [
 {item: "IAEA ENDF archive and subsite files beyond the proxy allowance", type: "other", status: "pending", files: $pp.count, bytes: ($pp.est_gb_total * 1e9), where: "raw/iaea/2026-11-07/_work/pending-proxy-window.json, by subsite with estimated size, for the 6 p.m. proxy window"},
 {item: "TENDL-2025, TENDL-2019, TENDL-2008 to 2017", type: "other", status: "pending", where: "IAEA serves them per material only (about 20,000 files each); PSI no longer resolves. Need the proxy. TENDL-2015 backup zips are in the Wayback Machine (19.8 GB)"},
 {item: "TENDL-2023 and TENDL-2021, JENDL special-purpose tarballs, JEFF-3.3 charged-particle sublibraries, ACE under 1 GB", type: "other", status: "pending", where: "Wayback lane running on the box (about 2.9 GB an hour, 3 streams); manifests update as files land"},
 {item: "Processed forms over 1 GB: JENDL-5 pointwise 0 K and 300 K, JEFF-3.3 ACE at six temperatures; POINT, Pointwise2020, PHSP, Geant4 and WIMSD files", type: "other", status: "listed", where: "Phase 3 and 4: URLs in the manifests"},
 {item: "ENDF/B-IV to VIII.1, JEFF-3.1, JENDL-3.3, JENDL-4.0, ROSFOND, CENDL-3.1 from IAEA", type: "other", status: "held", where: "raw/nndc/2026-11-07/ and raw/nndc-sigma/2026-11-07/"},
 {item: "Search front ends: ENDF Retrieval, EXFOR and CINDA search, Data Explorer, LiveChart, NuDat, Isotopia queries", type: "other", status: "not taken", where: "Query services over data that are in as files"},
 {item: "IAEA-NDS mirrors in China, Russia and India", type: "other", status: "not taken", where: "Do not answer AWS (timed out or refused)"},
 {item: "JAEA file URLs (wwwndc.jaea.go.jp/ftpnd/ftp/JENDL/)", type: "other", status: "not taken", where: "Incapsula: Chrome through a proxy passes pages, files never arrive. JENDL taken from Wayback copies and IAEA instead"},
 {item: "All not-taken entries", type: "other", status: "listed", where: "not_taken in each manifest.json: IAEA \($u.nt.iaea | n), JAEA \($u.nt.jaea), NEA \($u.nt.nea); IAEA dead links \($u.dead | n)"}]' > "$T/cov-other.json"
jq -s 'add' "$T/cov-scope.json" "$T/cov-ql.json" "$T/cov-other.json" > "$T/coverage.json"

# ---- Holdings: folders, libraries, subsites, repositories ----------------------------------------------------------
ENDF_GROUPS='[
 ["Newer general-purpose: JEFF-4.0, JEFF-3.3, JENDL-5 (Aug 2023), CENDL-3.2, ROSFOND-2010, BROND-3.1", "^(JEFF-4\\.0|JEFF-3\\.3|JENDL-5-Aug2023|JENDL-5|CENDL-3\\.2|ROSFOND-2010|BROND-3\\.1)/"],
 ["FENDL 3.2c, 3.2b, 3.2, 3.1c, 2.1", "^FENDL-"],
 ["Dosimetry: IRDFF-II (aux, b1), IRDFF v0 to v1.05, IRDF-2002, 90, 85, 82", "^(IRDFF|IRDF-)"],
 ["Photonuclear and medical: IAEA-PD-2019, IAEA-PD-1999, Medical, IAEA-Medical, IAEA-Therapeutic", "^(IAEA-PD-[^/]+|Medical|IAEA-Medical|IAEA-Therapeutic)/"],
 ["Charged particles, high energy, ion beams: ADS-2.0, ADS-HE, INDEN, IBA-Eval, ENDF-HE-VI, MINKS-ACT, JEFF-3.3-DPA", "^(ADS-|INDEN|IBA-Eval|ENDF-HE-VI|MINKS-ACT|JEFF-3\\.3-DPA)"],
 ["Activation and decay: EAF-2010, UKDD-12, UKPADD-2, PADF-2007, JEF-2.2, LLCRP", "^(EAF-2010|UKDD-12|UKPADD-2|PADF-2007|JEF-2\\.2|LLCRP)/"],
 ["TENDL-2023 and TENDL-2021 (Wayback copies of IAEA backup/)", "^TENDL-"],
 ["Older and specialized: BROND-2-2, CENDL-2, ENDL-84, Fond22, Mendl2, Mendl2P, Adl3t, Activ87, Biserm2, Rnal, RRDF-98, Wind1, Wind2, ASIYAD, PRONDOS, DXS, W3000, Yavshits, INDL-TSL, SigmaCalcData-2013", "^(BROND-2-2|CENDL-2|ENDL-84|Fond22|Mendl2|Adl3t|Activ87|Biserm2|Rnal|RRDF-98|Wind|ASIYAD|PRONDOS|DXS|W3000|Yavshits|INDL-TSL|SigmaCalcData)"],
 ["Archive pages, Tools, ENDF-Manual, zv_VMS_Archive, xtool", "."]]'
jq -n --slurpfile x "$T/num.json" "$H"'$x[0] as $u | [
 {item: "NNDC Sigma: JEFF-3.1, JENDL-4.0, JENDL-3.3, ROSFOND, CENDL-3.1 (ENDF-6 text per material)", kind: "folder", files: $u.sigma.n, bytes: $u.sigma.b, where: "raw/nndc-sigma/2026-11-07/"},
 {item: "OpenMC libraries, depletion chains, openmc-dev/data", kind: "folder", files: $u.openmc.n, bytes: $u.openmc.b, where: "raw/openmc/2026-11-07/"},
 {item: "IAEA ENDF archive and IAEA-NDS subsites, at site paths", kind: "folder", files: $u.iaea.n, bytes: $u.iaea.b, where: "raw/iaea/2026-11-07/"},
 {item: "JAEA JENDL tarballs (Wayback copies)", kind: "folder", files: $u.jaea.n, bytes: $u.jaea.b, where: "raw/jaea/2026-11-07/"},
 {item: "NEA JEFF archives and tapes (Wayback copies)", kind: "folder", files: $u.nea.n, bytes: $u.nea.b, where: "raw/nea/2026-11-07/"},
 {item: "GitHub source archives added tonight", kind: "folder", files: $u.github.n, bytes: $u.github.b, where: "raw/github/"},
 {item: "PyPI source packages: endf, endf-parserpy, x4i3, sandy, fudge", kind: "folder", files: $u.pypi.n, bytes: $u.pypi.b, where: "raw/pypi/2026-11-07/"}]' > "$T/h-folders.json"
jq -n --slurpfile m "$T/iaea.json" --argjson g "$ENDF_GROUPS" "$H"'
  ($m[0].files | map(select(.key | contains("/public/download-endf/"))) | map(. + {rel: (.key | split("/public/download-endf/")[1])})) as $f
  | reduce $g[] as $grp ({left: $f, rows: []};
      (.left | map(select(.rel | test($grp[1])))) as $hit
      | .rows += [{item: $grp[0], kind: "library", files: ($hit | length), bytes: ($hit | map(.bytes // 0) | add // 0), where: "raw/iaea/2026-11-07/public/download-endf/"}]
      | .left -= $hit)
  | .rows | map(select(.files > 0))' > "$T/h-libs.json"
jq -n --slurpfile m "$T/iaea.json" "$H"'
  $m[0].files | map(select(.key | contains("/public/download-endf/") | not)) | map(. + {top: (.key | split("/2026-11-07/")[1] | split("/")[0])})
  | group_by(.top) | map({top: .[0].top, n: length, b: (map(.bytes // 0) | add // 0)}) | sort_by(-.b)
  | (map(select(.b >= 1e6)) | map({item: .top, kind: "subsite", files: .n, bytes: .b, where: "raw/iaea/2026-11-07/\(.top)/"}))
    + (map(select(.b < 1e6)) | [{item: "\(length) smaller folders and pages: \(map(.top) | join(", "))", kind: "subsite", files: (map(.n) | add), bytes: (map(.b) | add), where: "raw/iaea/2026-11-07/"}])' > "$T/h-sites.json"
jq -s '[.[].files[] | select(.status == "done" or .status == "skipped")] | sort_by(.repo) | map({item: .repo, kind: "repository", files: 1, bytes: .bytes, where: .key, commit: .commit[:7]})' "$T"/gh-*.json > "$T/h-repos.json"
jq -s 'add' "$T/h-folders.json" "$T/h-libs.json" "$T/h-sites.json" "$T/h-repos.json" > "$T/holdings.json"

# ---- Routes and spend ----------------------------------------------------------------------------------------------
jq -n --slurpfile sp spend.json '[
 {item: "nds.iaea.org", wall: "Cloudflare managed challenge: 403 to curl from the Mac, AWS and all 12 proxy lines; real Chrome from AWS without a proxy not cleared in 90 s", route: "Real Chrome (Playwright) on an EC2 box through a residential proxy line, automation flags off: cleared in 5 s. In-page fetch, big files as Chrome downloads, 2 requests a second for the site", usage: "about 75 GB of proxy traffic (the allowance)"},
 {item: "www.oecd-nea.org (JEFF)", wall: "Cloudflare: 403 from the Mac, AWS and proxy lines", route: "Wayback Machine copies of NEA\u0027s own URLs, streamed by the box to S3", usage: "3 streams to archive.org"},
 {item: "wwwndc.jaea.go.jp (JENDL)", wall: "Incapsula: file URLs answer a script page; Chrome through a proxy passes pages, files never arrive", route: "Wayback Machine copies of JAEA\u0027s own URLs (2022 to 2025 snapshots)", usage: "shares the 3 streams"},
 {item: "NNDC Sigma", wall: null, route: "Lambda iaea-pull reads Sigma\u0027s static tree, nsr-fetch copies each ENDF-6 text", usage: "Lambda, 8 at a time"},
 {item: "OpenMC (anl.box.com), GitHub, PyPI", wall: null, route: "Lambda iaea-pull driving nsr-fetch straight into S3", usage: "Lambda"}]
 + ($sp[0].all | map({item: .item, wall: null, route: null, usage: ("$\(.amount_usd): \(.note)")}))
 + [{item: "Total spend", wall: null, route: null, usage: "$\([$sp[0].all[].amount_usd] | add) of the $5 budget"}]' > "$T/routes.json"

# ---- render --------------------------------------------------------------------------------------------------------
# cols: [[header, field, kind]], kind: t (text), n (count), b (bytes), c (code), l (link item)
render() { # $1 rows file, $2 cols json, $3 tab id, $4 group field
  jq -r --argjson c "$2" --arg tab "$3" --arg grp "$4" "$H"'
    "<table data-mark data-tab=\"\($tab)\"><tr>" + ($c | map("<th\(if .[2] == "n" or .[2] == "b" then " class=\"n\"" else "" end)>\(.[0])</th>") | join("")) + "</tr>",
    (.[] | . as $r | "<tr data-group=\"\(if $grp == "" then "" else ($r[$grp] // "") end | esc)\">" + ($c | map(
      .[1] as $f | .[2] as $k | ($r[$f]) as $v
      | if $k == "l" then "<td data-item>\(if $r.url then "<a href=\"\($r.url)\">\($v | esc)</a>" else ($v | esc) end)</td>"
        elif $k == "n" then "<td class=\"n\">\(if $v == null then "n/a" else ($v | n) end)</td>"
        elif $k == "b" then "<td class=\"n\">\(if $v == null then "n/a" else ($v | gb) end)</td>"
        elif $k == "s" then "<td data-status class=\"\(if $v == "taken" or $v == "held" then "yes" elif ($v | tostring | test("pending")) then "no" else "" end)\">\(if $v == null then "n/a" else ($v | esc) end)</td>"
        elif $k == "c" then "<td>\(if $v == null then "n/a" else "<code>\($v | esc)</code>" end)</td>"
        else "<td>\(if $v == null then "n/a" else ($v | esc) end)</td>" end) | join("")) + "</tr>"),
    "</table>"' "$1"
}
COV=$(render "$T/coverage.json" '[["Item","item","l"],["Type","type","t"],["Status","status","s"],["Files","files","n"],["Size","bytes","b"],["Where, or why not","where","t"]]' coverage type)
HOLD=$(render "$T/holdings.json" '[["Item","item","l"],["Kind","kind","t"],["Files","files","n"],["Size","bytes","b"],["Where in the lake","where","c"],["Commit","commit","c"]]' holdings kind)
ROUTES=$(render "$T/routes.json" '[["Item","item","l"],["Wall","wall","t"],["Route","route","t"],["Usage or cost","usage","s"]]' routes "")
TOTAL=$(jq -r "$H"' "\(.all.n | n) files · \(.all.b | gb)"' "$T/num.json")
SPEND=$(jq '[.all[].amount_usd] | add' spend.json)
ALLN=$(jq '.all.n' "$T/num.json")

cat > "$OUT" <<HTMLEND
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>IAEA, OpenMC and the open libraries in the NSR lake</title>
<style>
  body { margin: 0; background: #f6f5f1; color: #1f2328; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; }
  main { max-width: 1180px; margin: 48px auto 96px; padding: 0 24px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .date { color: #6b7280; font-size: 13px; }
  h2 { font-size: 13px; margin: 44px 0 14px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
  code { background: #efede7; padding: 1px 5px; border-radius: 4px; font-size: 12.5px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e5e2da; border-radius: 0 8px 8px 8px; overflow: hidden; }
  th { text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; padding: 8px 12px; border-bottom: 1px solid #e5e2da; background: #fbfaf7; }
  td { padding: 7px 12px; font-size: 13px; vertical-align: top; border-top: 1px solid #f0eee8; }
  td.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.n { text-align: right; }
  a { color: inherit; }
  .yes { color: #067647; }
  .no { color: #b42318; }
  ol { margin: 0; padding-left: 20px; }
  ol li { margin: 4px 0; }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 28px; }
  .tools { display: flex; gap: 8px; flex-shrink: 0; }
  .chip { flex-shrink: 0; cursor: pointer; border: 1px solid #d6d3cb; background: #fff; color: #1f2328; border-radius: 999px; padding: 6px 12px; font: 500 13px/1 -apple-system, BlinkMacSystemFont, "Inter", sans-serif; box-shadow: 0 1px 2px rgba(15,23,42,.06); }
  .chip:hover { border-width: 2px; padding: 5px 11px; }
  .rail { display: flex; gap: 4px; }
  .rail button { cursor: pointer; border: 1px solid #e5e2da; border-bottom: 0; background: #efede7; color: #6b7280; border-radius: 8px 8px 0 0; padding: 8px 16px; font: 600 13px -apple-system, BlinkMacSystemFont, "Inter", sans-serif; }
  .rail button[aria-selected="true"] { background: #fff; color: #1f2328; }
  td.mk, th.mk { width: 22px; padding-right: 0; }
  td.nt, th.nt { width: 52px; text-align: right; }
  button.toggle { cursor: pointer; border: 1px solid #d6d3cb; background: #fff; color: #6b7280; border-radius: 4px; padding: 2px 7px; font: 500 11.5px -apple-system, BlinkMacSystemFont, "Inter", sans-serif; }
  button.toggle.open, button.toggle.has { color: #1f2328; border-color: #9ca3af; }
  tr.noterow td { border-top: 0; padding-top: 0; }
  textarea.note { display: block; width: 100%; min-width: 360px; box-sizing: border-box; resize: vertical; overflow: hidden; white-space: pre-wrap; border: 1px solid #e5e2da; border-radius: 6px; padding: 6px 8px; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Inter", sans-serif; }
</style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>IAEA, OpenMC and the open libraries in the NSR lake</h1>
      <div class="date">${STAMP:+$STAMP · }2026-11-07 · <code>s3://nsr-lake-613473203863</code> · New account (nysgpt-cli) · $TOTAL · \$$SPEND of the \$5 budget, with the Wayback lane's projected cost</div>
    </div>
    <div class="tools"><button class="chip" id="copy" type="button"><span id="copy-label">Copy notes</span></button><button class="chip" id="save" type="button"><span id="save-label">Save notes</span></button></div>
  </header>

  <div class="rail" role="tablist">
    <button type="button" role="tab" data-tab="coverage" aria-selected="true">Coverage</button>
    <button type="button" role="tab" data-tab="holdings" aria-selected="false">Holdings</button>
    <button type="button" role="tab" data-tab="routes" aria-selected="false">Routes and spend</button>
  </div>
  <section data-panel="coverage">
$COV
  </section>
  <section data-panel="holdings" hidden>
$HOLD
  </section>
  <section data-panel="routes" hidden>
$ROUTES
  </section>

  <h2>How</h2>
  <ol>
    <li>Lambda <code>iaea-pull</code> (<code>services/iaea-pull/</code>): probe, crawl, Wayback index, select and pull modes. Pulls fan out to <code>nsr-fetch</code> and chain past 15 minutes. Deployed by <code>scripts/iaea/deploy.sh</code>, called by <code>scripts/iaea/run.sh</code>.</li>
    <li>The boxes (<code>scripts/iaea/box/</code>): EC2 m7i-flex.large for Chrome, t3.small for the Wayback lane, reached through SSM, each ends itself after 4 hours. <code>mirror.py</code> runs real Chrome under Xvfb, one browser per proxy line, one queue and one rate limit per site. <code>wbget.py</code> streams Wayback copies straight to S3.</li>
    <li>Manifests: <code>scripts/iaea/manifest.sh</code> merges each folder's Lambda and box records into one <code>manifest.json</code>: every file with its source URL, bytes, sha256 when known, and for Wayback copies the snapshot date; not taken with reasons; dead links; spend. This page: <code>scripts/iaea/inventory.sh</code>.</li>
  </ol>
</main>
HTMLEND
cat >> "$OUT" <<'JS'
<script>
  // Tabs: plain show and hide.
  document.querySelectorAll('.rail button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.rail button').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false') })
      document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== b.dataset.tab })
    })
  })
  // Each row: a checkbox and a "Note" toggle that opens a full-width note row under it. Nothing is saved in the page.
  document.querySelectorAll('table[data-mark]').forEach(function (t) {
    t.querySelectorAll('tr').forEach(function (tr, i) {
      var head = i === 0
      var first = document.createElement(head ? 'th' : 'td'), last = document.createElement(head ? 'th' : 'td')
      first.className = 'mk'; last.className = 'nt'
      tr.insertBefore(first, tr.firstChild); tr.appendChild(last)
      if (head) return
      first.innerHTML = '<input type="checkbox">'
      last.innerHTML = '<button type="button" class="toggle">Note</button>'
      var nr = document.createElement('tr'), td = document.createElement('td')
      nr.className = 'noterow'; nr.hidden = true
      td.colSpan = tr.children.length
      td.innerHTML = '<textarea class="note" rows="3"></textarea>'
      nr.appendChild(td); tr.parentNode.insertBefore(nr, tr.nextSibling)
      var ta = td.firstChild, btn = last.firstChild
      btn.addEventListener('click', function () {
        nr.hidden = !nr.hidden
        btn.classList.toggle('open', !nr.hidden)
        if (!nr.hidden) ta.focus()
      })
      ta.addEventListener('input', function () {
        ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'
        btn.classList.toggle('has', ta.value.trim() !== '')
      })
    })
  })
  // [{tab, groups: [{group, rows: [{checked, item, status, note}]}]}] for the rows with a check or a note
  function marked() {
    var out = []
    document.querySelectorAll('table[data-mark]').forEach(function (t) {
      var tab = document.querySelector('.rail button[data-tab="' + t.dataset.tab + '"]').textContent.trim()
      var groups = [], byName = {}
      t.querySelectorAll('tr').forEach(function (tr, i) {
        if (i === 0 || tr.className === 'noterow') return
        var cb = tr.querySelector('input[type=checkbox]')
        var note = tr.nextElementSibling.querySelector('textarea').value.replace(/\s+$/, '')
        if (!cb.checked && !note.trim()) return
        var status = tr.querySelector('[data-status]')
        status = status ? status.textContent.trim() : (tr.children[3].textContent.trim() + ' files, ' + tr.children[4].textContent.trim())
        status = status.split(/\.\s|: /)[0]
        if (status.length > 80) status = status.slice(0, 77) + '…'
        var g = tr.dataset.group || ''
        if (!byName[g]) { byName[g] = {group: g, rows: []}; groups.push(byName[g]) }
        byName[g].rows.push({checked: cb.checked, item: tr.querySelector('[data-item]').textContent.trim(), status: status, note: note})
      })
      if (groups.length) out.push({tab: tab, groups: groups})
    })
    return out
  }
  function box(r) { return '- [' + (r.checked ? 'x' : ' ') + '] ' + r.item + ' (' + r.status + ')' }
  function copyText() {
    var out = []
    marked().forEach(function (t) {
      out.push('## ' + t.tab, '')
      t.groups.forEach(function (g) {
        if (g.group) out.push('### ' + g.group, '')
        g.rows.forEach(function (r) { out.push(box(r) + (r.note.trim() ? ' — ' + r.note.trim().replace(/\s*\n\s*/g, ' ') : '')) })
        out.push('')
      })
    })
    return out.join('\n')
  }
  function pad(n) { return (n < 10 ? '0' : '') + n }
  function saveText(d) {
    var stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    var out = ['Notes on the IAEA inventory sketch, saved ' + stamp, '']
    marked().forEach(function (t) {
      out.push('## ' + t.tab, '')
      t.groups.forEach(function (g) {
        if (g.group) out.push('### ' + g.group, '')
        g.rows.forEach(function (r) {
          out.push(box(r))
          if (r.note.trim()) out.push('', r.note.split('\n').map(function (l) { return '  ' + l }).join('\n'))
          out.push('')
        })
      })
    })
    return out.join('\n')
  }
  function flash(id, text, back) {
    var el = document.getElementById(id)
    el.textContent = text
    setTimeout(function () { el.textContent = back }, 1500)
  }
  document.getElementById('copy').addEventListener('click', function () {
    navigator.clipboard.writeText(copyText()).then(function () { flash('copy-label', 'Copied', 'Copy notes') },
                                                    function () { flash('copy-label', 'Copy failed', 'Copy notes') })
  })
  document.getElementById('save').addEventListener('click', function () {
    var d = new Date()
    var name = 'iaea-inventory-notes-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.md'
    var a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([saveText(d)], {type: 'text/markdown'}))
    a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(function () { URL.revokeObjectURL(a.href) }, 1000)
    flash('save-label', 'Saved', 'Save notes')
  })
</script>
</body>
</html>
JS
rm -rf "$T"
echo "wrote $OUT ($ALLN files)"
