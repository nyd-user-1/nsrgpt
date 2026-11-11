# nsr-api GET /counts (brief 56 Part C.2; every table, Brendan 2026-11-10): the lake's row counts for /about and the
# lake page. Every Parquet table in the Glue catalog nsr is counted from its files' Parquet footers (partitions too), each
# ENDF release from its manifest (materials, sections, points, File 2/8/32/33 tables), NSR's papers from the NSR export,
# the jobs table from DynamoDB. A refresh takes minutes, so it runs in the background: the route answers the last
# result (lake/serve/counts/latest.json) and, when that is over an hour old, invokes this function again
# asynchronously ({"counts_refresh": true}, lambda_function.py) to rebuild it.
#   {counts: {key: rows}, tables: {key: {rows, counted_at, source}}, total_records, total_records_of: [keys],
#    endf: {release: {...}}, endf_total, gnds: {converted, bytes}, counted_at, age_s, refreshing}
import calendar
import concurrent.futures as cf
import json
import os
import time

import boto3

import structure as S

TTL = 3600
B = S.BUCKET
KEY = "lake/serve/counts/latest.json"
FN = os.environ.get("AWS_LAMBDA_FUNCTION_NAME", "nsr-api")
s3 = boto3.client("s3")
NOT_PARQUET = (".json", ".txt", ".csv", ".gz.csv", ".md", ".crc", "_SUCCESS", ".sql", ".log", ".manifest", ".metadata")
# Not records: serving copies of other tables, search documents, and tables of raw text lines (every line of a file)
NOT_RECORDS_PREFIX = ("endf_serve_", "nuclide_serve_", "exfor_serve_", "search_", "nsr_serve_")
NOT_RECORDS = {"ensdf_cards", "xundl_cards", "endfb_records"}
# ... nor model data (vectors, evaluation and training tables), nor a snapshot a newer one replaces (X4Pro 2023 -> 2025)
NOT_RECORDS_PREFIX += ("nsr_embeddings", "nsr_eval_", "nsr_train_")
SUPERSEDED = ("lake/exfor/x4pro-2023-07-14/",)
# ENDF Files 4-15 (brief 64): one Parquet file per material per table (about 100,000 files), so their rows come from each
# release's manifest (mf4_15, Athena counts at collect time) instead of the footers. total_values comes from
# lake/endfb/_values/latest.json (nsr-endf-parse's "values" job: every non-null numeric value of the endfb_* tables).
MF4_15 = {"endfb_ang": "ang", "endfb_edist": "edist", "endfb_eang": "eang", "endfb_mult": "mult",
          "endfb_photon_xs": "photon_xs", "endfb_photon_ang": "photon_ang", "endfb_photon_edist": "photon_edist"}
VALUES_KEY = "lake/endfb/_values/latest.json"
_mem = {"at": 0.0, "body": None}


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def files_under(prefix):
    out = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=B, Prefix=prefix):
        for o in page.get("Contents", []):
            k = o["Key"]
            if o["Size"] > 0 and not k.endswith(NOT_PARQUET) and "/_" not in k[len(prefix):]:
                out.append(f"s3://{B}/{k}")
    return out


def footer_rows(files):
    if not files:
        return 0
    c = S.con().cursor()
    total = 0
    for i in range(0, len(files), 200):
        lst = ", ".join(f"'{f}'" for f in files[i:i + 200])
        total += c.execute(f"SELECT coalesce(sum(num_rows), 0) FROM parquet_file_metadata([{lst}])").fetchone()[0]
    return int(total)


def glue_tables():
    """Every table of the catalog nsr stored as Parquet under the lake: (name, [prefixes])."""
    g = boto3.client("glue")
    out = []
    for page in g.get_paginator("get_tables").paginate(DatabaseName="nsr"):
        for t in page["TableList"]:
            sd = t.get("StorageDescriptor") or {}
            loc, fmt = sd.get("Location") or "", (sd.get("InputFormat") or "") + (sd.get("SerdeInfo") or {}).get("SerializationLibrary", "")
            if t.get("TableType") == "VIRTUAL_VIEW" or "parquet" not in fmt.lower() or not loc.startswith(f"s3://{B}/"):
                continue
            prefixes = []
            if t.get("PartitionKeys"):
                for pp in g.get_paginator("get_partitions").paginate(DatabaseName="nsr", TableName=t["Name"]):
                    prefixes += [p["StorageDescriptor"]["Location"] for p in pp["Partitions"]]
            else:
                prefixes = [loc]
            out.append((t["Name"], [p.replace(f"s3://{B}/", "").rstrip("/") + "/" for p in prefixes]))
    return out


def endf():
    out, tot = {}, collections_total()
    for r in S.RELEASES + S.POINT_RELEASES:
        try:
            m = json.loads(s3.get_object(Bucket=B, Key=f"lake/endfb/{r}/manifest.json")["Body"].read())
        except Exception:  # noqa: BLE001
            continue
        def n(sec, k):
            t = (m.get(sec) or {}).get("tables", {}) if sec else m.get("tables", {})
            v = (t.get(k) or {})
            return v.get("athena_count") if v.get("athena_count") is not None else v.get("rows")
        row = {"materials": n(None, "endfb_materials"), "sections": n(None, "endfb_sections"), "points": n(None, "endfb_xs_points"),
               "fy": n("mf8_mf33", "endfb_fy"), "decay": n("mf8_mf33", "endfb_decay"), "decay_modes": n("mf8_mf33", "endfb_decay_modes"),
               "decay_lines": n("mf8_mf33", "endfb_decay_lines"), "cov": n("mf8_mf33", "endfb_cov"),
               "res_ranges": n("mf2_mf32", "endfb_res_ranges"), "res_params": n("mf2_mf32", "endfb_res_params"),
               "res_cov": n("mf2_mf32", "endfb_res_cov"),
               **{k: n("mf4_15", t) for t, k in MF4_15.items()},
               "counted_at": m.get("built_at") or (m.get("mf2_mf32") or {}).get("built_at")}
        out[r] = row
        for k in tot:
            tot[k] += row.get(k) or 0
    return out, tot


def collections_total():
    return {k: 0 for k in ("materials", "sections", "points", "fy", "decay", "decay_modes", "decay_lines", "cov",
                           "res_ranges", "res_params", "res_cov", *MF4_15.values())}


def refresh():
    """Count everything and write lake/serve/counts/latest.json (minutes; runs as an asynchronous invocation)."""
    t0 = time.time()
    tables = {}
    names = [(n, p) for n, p in glue_tables() if n not in MF4_15]

    def one(item):
        name, prefixes = item
        files = [f for p in prefixes for f in files_under(p)]
        return name, {"rows": footer_rows(files), "files": len(files), "counted_at": now(), "source": "Parquet footers",
                      "location": prefixes[0] if len(prefixes) == 1 else f"{len(prefixes)} partitions"}

    with cf.ThreadPoolExecutor(8) as ex:
        for name, v in ex.map(one, names):
            tables[name] = v
    try:  # the jobs table
        db = boto3.client("dynamodb")
        n, kw = 0, {"TableName": "nsrgpt-jobs", "Select": "COUNT"}
        while True:
            r = db.scan(**kw)
            n += r["Count"]
            if "LastEvaluatedKey" not in r:
                break
            kw["ExclusiveStartKey"] = r["LastEvaluatedKey"]
        tables["nsrgpt_jobs"] = {"rows": n, "counted_at": now(), "source": "DynamoDB nsrgpt-jobs, scan count"}
    except Exception as e:  # noqa: BLE001
        tables["nsrgpt_jobs"] = {"rows": None, "error": str(e)[:160], "counted_at": now()}
    endf_rows, endf_tot = endf()
    for t, k in MF4_15.items():  # from the manifests
        held = {r: v[k] for r, v in endf_rows.items() if v.get(k) is not None}
        if held:
            tables[t] = {"rows": sum(held.values()), "counted_at": now(), "source": "manifests (mf4_15, Athena count)",
                         "location": f"{len(held)} partitions", "by_release": held}
    try:
        values = json.loads(s3.get_object(Bucket=B, Key=VALUES_KEY)["Body"].read())
    except Exception as e:  # noqa: BLE001
        values = {"error": str(e)[:160]}
    gnds = {}
    try:
        files = [f for p in dict(names).get("gnds_files", []) for f in files_under(p)]
        lst = ", ".join(f"'{f}'" for f in files)
        conv, nbytes = S.con().cursor().execute(
            f"SELECT count(*) FILTER (WHERE ok), sum(coalesce(bytes, 0) + coalesce(cov_bytes, 0)) FROM read_parquet([{lst}])").fetchone()
        gnds = {"converted": int(conv or 0), "bytes": int(nbytes or 0), "counted_at": now()}
    except Exception as e:  # noqa: BLE001
        gnds = {"error": str(e)[:160]}
    of = sorted(k for k, v in tables.items() if v.get("rows") and k not in NOT_RECORDS and not k.startswith(NOT_RECORDS_PREFIX)
                and not str(v.get("location", "")).startswith(SUPERSEDED))
    t = lambda k: (tables.get(k) or {}).get("rows")  # noqa: E731
    legacy = {"nsr_papers": t("nsr_parquet"), "ensdf_datasets": t("ensdf_datasets"), "ensdf_nuclides": t("nuclide_serve_summary"),
              "xundl_datasets": t("xundl_datasets"), "exfor_entries": t("exfor_j4_entries"), "exfor_subentries": t("exfor_j4_subentries"),
              "exfor_datasets": t("exfor_serve_search_index"), "exfor_points": t("exfor_j4_data_points"),
              "icrp_nuclides": t("icrp107_nuclides"), "icrp_daughter_links": t("icrp107_daughters")}
    body = {"counts": {**legacy, **{k: v.get("rows") for k, v in sorted(tables.items())}},
            "tables": dict(sorted(tables.items())),
            "total_records": sum(tables[k]["rows"] for k in of), "total_records_of": of,
            "total_records_note": "the rows of every table in total_records_of: every Parquet table of the catalog nsr and "
                                  "the jobs table, without serving copies (endf_serve_*, nuclide_serve_*, exfor_serve_*), "
                                  "search documents (search_*), tables of raw text lines (ensdf_cards, xundl_cards, "
                                  "endfb_records), model data (nsr_embeddings*, nsr_eval_*, nsr_train_*) and the X4Pro "
                                  "2023 snapshot the 2025 one replaces",
            "total_values": values.get("total_values"), "total_values_of": values.get("total_values_of"),
            "total_values_note": values.get("note") or values.get("error"),
            "total_values_counted_at": values.get("counted_at"),
            "total_values_by_table": {x["table"]: x["values"] for x in values.get("tables", [])},
            "endf": endf_rows, "endf_total": endf_tot, "gnds": gnds,
            "counted_at": now(), "seconds": round(time.time() - t0, 1)}
    s3.put_object(Bucket=B, Key=KEY, Body=json.dumps(body, default=str).encode(), ContentType="application/json")
    s3.put_object(Bucket=B, Key=f"lake/serve/counts/{body['counted_at'][:10]}.json", Body=json.dumps(body, default=str).encode(),
                  ContentType="application/json")
    return body


def counts():
    """The last counts, refreshed in the background when over an hour old."""
    if _mem["body"] and time.time() - _mem["at"] < 300:
        body = _mem["body"]
    else:
        try:
            body = json.loads(s3.get_object(Bucket=B, Key=KEY)["Body"].read())
        except Exception:  # noqa: BLE001
            body = None
        _mem.update(at=time.time(), body=body)
    age = None
    if body:
        age = time.time() - calendar.timegm(time.strptime(body["counted_at"], "%Y-%m-%dT%H:%M:%SZ"))
    refreshing = False
    if body is None or age > TTL:
        marker = "lake/serve/counts/refreshing.json"
        try:
            started = json.loads(s3.get_object(Bucket=B, Key=marker)["Body"].read())["at"]
        except Exception:  # noqa: BLE001
            started = 0
        if time.time() - started > 600:  # one refresh at a time
            s3.put_object(Bucket=B, Key=marker, Body=json.dumps({"at": time.time()}).encode())
            boto3.client("lambda").invoke(FunctionName=FN, InvocationType="Event", Payload=json.dumps({"counts_refresh": True}).encode())
        refreshing = True
    if body is None:
        return 202, {"refreshing": True, "note": "counting now; ask again in a few minutes"}
    return 200, {**body, "age_s": round(age), "refreshing": refreshing}


def route(path, q):
    if path.rstrip("/") != "/counts":
        return 404, {"error": "routes: /counts"}
    return counts()
