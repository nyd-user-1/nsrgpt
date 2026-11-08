# Shared helpers for the EXFOR parse scripts (brief 16). Run on the parse box with /opt/parse/bin/python -I.
# S3 transfers, Athena DDL, Parquet-to-Athena types, manifests.
import json, os, time, datetime
import boto3
from boto3.s3.transfer import TransferConfig
import pyarrow as pa
import pyarrow.parquet as pq

BUCKET = "nsr-lake-613473203863"
REGION = "us-east-2"
WORKGROUP = "nsrgpt"
DATABASE = "nsr"
WORK = "lake/_work/parse/exfor"
s3 = boto3.client("s3", region_name=REGION)
athena = boto3.client("athena", region_name=REGION)
glue = boto3.client("glue", region_name=REGION)
XFER = TransferConfig(multipart_threshold=64 * 2**20, multipart_chunksize=64 * 2**20, max_concurrency=8)


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(*a):
    print(now(), *a, flush=True)


def get(key, path):
    if os.path.exists(path) and os.path.getsize(path) == s3.head_object(Bucket=BUCKET, Key=key)["ContentLength"]:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    s3.download_file(BUCKET, key, path, Config=XFER)
    return path


def size(key):
    return s3.head_object(Bucket=BUCKET, Key=key)["ContentLength"]


def clear(prefix):
    """Delete every object under prefix (so a rerun leaves no stale part files)."""
    keys = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=prefix):
        keys += [{"Key": o["Key"]} for o in page.get("Contents", [])]
    for i in range(0, len(keys), 1000):
        s3.delete_objects(Bucket=BUCKET, Delete={"Objects": keys[i:i + 1000]})


def put_dir(local, prefix):
    """Upload every file in local (recursively) under prefix; returns total bytes."""
    clear(prefix.rstrip("/") + "/")
    total = 0
    for root, _, files in os.walk(local):
        for f in sorted(files):
            p = os.path.join(root, f)
            rel = os.path.relpath(p, local)
            s3.upload_file(p, BUCKET, prefix.rstrip("/") + "/" + rel, Config=XFER)
            total += os.path.getsize(p)
    return total


def put_json(key, obj):
    s3.put_object(Bucket=BUCKET, Key=key, Body=json.dumps(obj, indent=1, default=str).encode(), ContentType="application/json")


def put_text(key, text):
    s3.put_object(Bucket=BUCKET, Key=key, Body=text.encode(), ContentType="text/plain")


def query(sql, timeout=1800):
    """Run one Athena statement in workgroup nsrgpt, database nsr; returns (state, rows, stats)."""
    qid = athena.start_query_execution(QueryString=sql, QueryExecutionContext={"Database": DATABASE},
                                       WorkGroup=WORKGROUP)["QueryExecutionId"]
    t0 = time.time()
    while True:
        time.sleep(1.5)
        ex = athena.get_query_execution(QueryExecutionId=qid)["QueryExecution"]
        st = ex["Status"]["State"]
        if st in ("SUCCEEDED", "FAILED", "CANCELLED"):
            break
        if time.time() - t0 > timeout:
            athena.stop_query_execution(QueryExecutionId=qid)
            raise TimeoutError(sql[:200])
    if st != "SUCCEEDED":
        raise RuntimeError(f"{st}: {ex['Status'].get('StateChangeReason')} :: {sql[:300]}")
    rows = []
    if ex.get("StatementType") == "DML" and not sql.lstrip().upper().startswith("UNLOAD"):
        for page in athena.get_paginator("get_query_results").paginate(QueryExecutionId=qid):
            for r in page["ResultSet"]["Rows"]:
                rows.append([d.get("VarCharValue") for d in r["Data"]])
        rows = rows[1:]
    return st, rows, ex.get("Statistics", {})


def athena_type(t):
    if pa.types.is_int8(t) or pa.types.is_int16(t):
        return "smallint" if pa.types.is_int16(t) else "tinyint"
    if pa.types.is_int32(t) or pa.types.is_uint16(t) or pa.types.is_uint8(t):
        return "int"
    if pa.types.is_integer(t):
        return "bigint"
    if pa.types.is_float32(t):
        return "float"
    if pa.types.is_floating(t):
        return "double"
    if pa.types.is_boolean(t):
        return "boolean"
    if pa.types.is_string(t) or pa.types.is_large_string(t):
        return "string"
    if pa.types.is_binary(t) or pa.types.is_large_binary(t):
        return "binary"
    if pa.types.is_date(t):
        return "date"
    if pa.types.is_timestamp(t):
        return "timestamp"
    if pa.types.is_decimal(t):
        return f"decimal({t.precision},{t.scale})"
    if pa.types.is_list(t) or pa.types.is_large_list(t):
        return f"array<{athena_type(t.value_type)}>"
    if pa.types.is_struct(t):
        return "struct<" + ",".join(f"{f.name}:{athena_type(f.type)}" for f in t) + ">"
    if pa.types.is_map(t):
        return f"map<{athena_type(t.key_type)},{athena_type(t.item_type)}>"
    raise ValueError(f"no Athena type for {t}")


def ddl(table, location, schema, comment=""):
    cols = ",\n".join(f"  `{f.name.lower()}` {athena_type(f.type)}" for f in schema)
    c = f"\nCOMMENT '{comment}'" if comment else ""
    return (f"CREATE EXTERNAL TABLE `{table}` (\n{cols}\n){c}\nSTORED AS PARQUET\n"
            f"LOCATION 's3://{BUCKET}/{location.rstrip('/')}/'\nTBLPROPERTIES ('parquet.compression'='SNAPPY')")


def register(table, location, schema, comment=""):
    """Drop and create one external table; refuses to drop a table that lives outside lake/exfor or lake/serve."""
    try:
        cur = glue.get_table(DatabaseName=DATABASE, Name=table)["Table"]["StorageDescriptor"]["Location"]
        if not ("/lake/exfor/" in cur or "/lake/serve/exfor/" in cur):
            raise RuntimeError(f"{table} already exists at {cur}; not replacing it")
        query(f"DROP TABLE IF EXISTS `{table}`")
    except glue.exceptions.EntityNotFoundException:
        pass
    sql = ddl(table, location, schema, comment)
    query(sql)
    put_text(f"{WORK}/ddl/{table}.sql", sql + ";\n")
    return sql


def schema_of(local_dir):
    for root, _, files in os.walk(local_dir):
        for f in sorted(files):
            if f.endswith(".parquet"):
                return pq.read_schema(os.path.join(root, f))
    raise FileNotFoundError(local_dir)
