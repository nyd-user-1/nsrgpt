# nsr-api GET /counts (brief 56, Part C.2): the lake's live counts for /about and the lake page, counted from the
# Parquet footers (no data read) and each ENDF release's manifest, kept in memory for an hour (CloudFront also caches
# the answer for an hour).
import json
import time

import boto3

import structure as S

TTL = 3600
L = f"s3://{S.BUCKET}/lake"
SOURCES = {  # key -> (Parquet glob, what one row is)
    "nsr_papers": (f"{L}/nsr-database/2026-10-15/nsr/public.nsr/*/*.parquet", "NSR 2026-10-15, one row per paper"),
    "ensdf_datasets": (f"{L}/ensdf/2026-11-05/datasets/*.parquet", "ENSDF 2026-11-05, one row per dataset"),
    "ensdf_nuclides": (f"{L}/serve/nuclide/2026-11-05/summary/*", "ENSDF 2026-11-05, one row per nuclide"),
    "xundl_datasets": (f"{L}/xundl/2026-10-01/datasets/*.parquet", "XUNDL 2026-10-01, one row per dataset"),
    "exfor_entries": (f"{L}/exfor/j4-2026-10-28/entries/*.parquet", "EXFOR 2026-10-28, one row per entry"),
    "exfor_subentries": (f"{L}/exfor/j4-2026-10-28/subentries/*.parquet", "EXFOR 2026-10-28, one row per subentry"),
    "exfor_datasets": (f"{L}/serve/exfor/2026-10-28/search_index/*", "EXFOR 2026-10-28, one row per dataset"),
    "exfor_points": (f"{L}/exfor/j4-2026-10-28/data_points/*.parquet", "EXFOR 2026-10-28, one row per data point"),
    "icrp_nuclides": (f"{L}/icrp107/2008/nuclides/*", "ICRP 107, one row per nuclide"),
    "icrp_daughter_links": (f"{L}/icrp107/2008/daughters/*", "ICRP 107, one row per parent-daughter link"),
}
_cache = {"at": 0.0, "body": None}


def count(glob):
    try:
        return S.records(f"SELECT count(*) AS n FROM read_parquet('{glob}')")[0]["n"]
    except S.duckdb.Error as e:
        return {"error": str(e)[:160]}


def endf():
    s3 = boto3.client("s3")
    out, tot = {}, {"materials": 0, "sections": 0, "points": 0, "resonances": 0}
    for r in S.RELEASES:
        try:
            m = json.loads(s3.get_object(Bucket=S.BUCKET, Key=f"lake/endfb/{r}/manifest.json")["Body"].read())
        except Exception:  # noqa: BLE001
            out[r] = None
            continue
        t = m.get("tables", {})
        n = lambda k: (t.get(k) or {}).get("athena_count") or (t.get(k) or {}).get("rows")  # noqa: E731
        res = ((m.get("mf2_mf32") or {}).get("tables") or {}).get("endfb_res_params") or {}
        row = {"materials": n("endfb_materials"), "sections": n("endfb_sections"), "points": n("endfb_xs_points"),
               "resonances": res.get("athena_count") or res.get("rows")}
        out[r] = row
        for k in tot:
            tot[k] += row[k] or 0
    return out, tot


def counts():
    if _cache["body"] and time.time() - _cache["at"] < TTL:
        return _cache["body"]
    t0 = time.time()
    body = {"counts": {}, "about": {}}
    for k, (glob, what) in SOURCES.items():
        body["counts"][k] = count(glob)
        body["about"][k] = what
    try:
        body["counts"]["icrp_chains"] = S.records(
            f"SELECT count(DISTINCT parent) AS n FROM read_parquet('{SOURCES['icrp_daughter_links'][0]}')")[0]["n"]
        body["about"]["icrp_chains"] = "ICRP 107 nuclides with at least one radioactive or stable daughter"
    except S.duckdb.Error:
        pass
    body["endf"], body["endf_total"] = endf()
    body["counted_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    body["seconds"] = round(time.time() - t0, 2)
    _cache.update(at=time.time(), body=body)
    return body


def route(path, q):
    if path.rstrip("/") != "/counts":
        return 404, {"error": "routes: /counts"}
    return 200, counts()
