"""Shared helpers for the parse box (brief 15): buffered Parquet tables, upload to the lake, Athena registration,
manifests. Runs on the box only (/opt/parse/bin/python), never on the Mac."""
import datetime
import json
import os
import subprocess
import time

import boto3
import pyarrow as pa
import pyarrow.parquet as pq

BUCKET = "nsr-lake-613473203863"
REGION = "us-east-2"
WORKGROUP = "nsrgpt"
DATABASE = "nsr"
AWS = "/snap/bin/aws"
s3 = boto3.client("s3", region_name=REGION)
athena = boto3.client("athena", region_name=REGION)

S, D, I, L, B = pa.string(), pa.float64(), pa.int32(), pa.int64(), pa.bool_()
ATHENA_TYPE = {S: "string", D: "double", I: "int", L: "bigint", B: "boolean"}


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def download(key, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not (os.path.exists(path) and os.path.getsize(path) == s3.head_object(Bucket=BUCKET, Key=key)["ContentLength"]):
        s3.download_file(BUCKET, key, path)
    return path


class Table:
    """One table = one folder of Parquet parts (Snappy). Rows are buffered per column and written as row groups of
    `row_group` rows; a new part starts after `rows_per_file` rows. add(dict) or append(values in schema order)."""

    def __init__(self, root, name, schema, row_group=500_000, rows_per_file=10_000_000):
        self.name, self.schema = name, schema
        self.dir = os.path.join(root, name)
        os.makedirs(self.dir, exist_ok=True)
        for f in os.listdir(self.dir):
            os.remove(os.path.join(self.dir, f))
        self.names = schema.names
        self.lists = [[] for _ in self.names]
        self.row_group, self.rows_per_file = row_group, rows_per_file
        self.n = self.rows = self.part = self.file_rows = 0
        self.writer = None

    def add(self, row):
        for k, col in zip(self.names, self.lists):
            col.append(row.get(k))
        self.n += 1
        if self.n >= self.row_group:
            self.flush()

    def append(self, values):
        for v, col in zip(values, self.lists):
            col.append(v)
        self.n += 1
        if self.n >= self.row_group:
            self.flush()

    def extend(self, cols, n):
        """Append n rows at once: {column: list of n values, or one value for every row}; missing columns are null."""
        for k, col in zip(self.names, self.lists):
            v = cols.get(k)
            col.extend(v if isinstance(v, list) else [v] * n)
        self.n += n
        if self.n >= self.row_group:
            self.flush()

    def _open(self):
        if self.writer:
            self.writer.close()
        path = os.path.join(self.dir, f"part-{self.part:05d}.parquet")
        self.part += 1
        self.file_rows = 0
        self.writer = pq.ParquetWriter(path, self.schema, compression="snappy")

    def flush(self):
        if not self.n:
            return
        if self.writer is None or self.file_rows >= self.rows_per_file:
            self._open()
        arrays = [pa.array(col, type=f.type) for col, f in zip(self.lists, self.schema)]
        self.writer.write_table(pa.Table.from_arrays(arrays, schema=self.schema), row_group_size=self.n)
        self.rows += self.n
        self.file_rows += self.n
        self.n = 0
        for col in self.lists:
            col.clear()

    def close(self):
        self.flush()
        if self.writer:
            self.writer.close()
        else:  # empty table: one empty part so the folder and schema exist
            pq.write_table(self.schema.empty_table(), os.path.join(self.dir, "part-00000.parquet"), compression="snappy")
        return {"rows": self.rows, "bytes": sum(os.path.getsize(os.path.join(self.dir, f)) for f in os.listdir(self.dir)),
                "columns": [f"{f.name} {ATHENA_TYPE[f.type]}" for f in self.schema]}


def sync(local_dir, prefix):
    """One `aws s3 sync` per table folder; --delete clears parts left by an earlier run."""
    subprocess.run([AWS, "s3", "sync", local_dir, f"s3://{BUCKET}/{prefix}", "--delete", "--only-show-errors",
                    "--region", REGION], check=True)


def query(sql):
    qid = athena.start_query_execution(QueryString=sql, QueryExecutionContext={"Database": DATABASE},
                                       WorkGroup=WORKGROUP)["QueryExecutionId"]
    while True:
        e = athena.get_query_execution(QueryExecutionId=qid)["QueryExecution"]
        state = e["Status"]["State"]
        if state in ("SUCCEEDED", "FAILED", "CANCELLED"):
            break
        time.sleep(1)
    if state != "SUCCEEDED":
        raise RuntimeError(f"{state}: {e['Status'].get('StateChangeReason')}\n{sql}")
    return qid, e.get("Statistics", {}).get("DataScannedInBytes", 0)


def rows(sql):
    qid, scanned = query(sql)
    out = athena.get_query_results(QueryExecutionId=qid)["ResultSet"]["Rows"]
    return [[c.get("VarCharValue") for c in r["Data"]] for r in out[1:]], scanned


def ddl(table, schema, location, partitions=None):
    partitions = partitions or {}
    cols = ",\n  ".join(f"`{f.name}` {ATHENA_TYPE[f.type]}" for f in schema if f.name not in partitions)
    part = ("\nPARTITIONED BY (" + ", ".join(f"`{k}` {v}" for k, v in partitions.items()) + ")") if partitions else ""
    return (f"CREATE EXTERNAL TABLE `{table}` (\n  {cols}\n){part}\nSTORED AS PARQUET\n"
            f"LOCATION '{location}'\nTBLPROPERTIES ('parquet.compression'='SNAPPY')")


def register(table, schema, location, ddl_dir, partitions=None, partition_locations=None, drop=True, where=""):
    """Create one Athena table (drop first when drop=True; otherwise keep it and its partitions), add explicit
    partitions, COUNT(*) it (filtered by `where`). Saves the DDL as <ddl_dir>/<table>.sql, keeping partition lines
    from earlier runs. Returns (athena count, bytes scanned)."""
    sql = ddl(table, schema, location, partitions)
    if not drop:
        sql = sql.replace("CREATE EXTERNAL TABLE", "CREATE EXTERNAL TABLE IF NOT EXISTS", 1)
    adds = []
    for spec, loc in (partition_locations or {}).items():
        kv = ", ".join(f"{k}='{v}'" for k, v in spec)
        adds.append(f"ALTER TABLE `{table}` ADD IF NOT EXISTS PARTITION ({kv}) LOCATION '{loc}'")
    os.makedirs(ddl_dir, exist_ok=True)
    path = os.path.join(ddl_dir, f"{table}.sql")
    old = []
    if not drop and os.path.exists(path):
        old = [ln.rstrip(";\n") for ln in open(path) if ln.startswith("ALTER TABLE")]
    with open(path, "w") as f:
        f.write(sql + ";\n" + "".join(a + ";\n" for a in dict.fromkeys(old + adds)))
    scanned = query(f"DROP TABLE IF EXISTS `{table}`")[1] if drop else 0
    scanned += query(sql)[1]
    for a in adds:
        scanned += query(a)[1]
    out, s = rows(f'SELECT COUNT(*) FROM "{table}" {where}')
    return int(out[0][0]), scanned + s


def put_json(key, obj):
    s3.put_object(Bucket=BUCKET, Key=key, Body=json.dumps(obj, indent=1, ensure_ascii=False).encode(),
                  ContentType="application/json")
