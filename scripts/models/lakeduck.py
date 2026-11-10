"""DuckDB over the lake's Parquet with the box's own credentials (brief 61). L is the lake's S3 root."""
import os

import boto3
import duckdb

BUCKET = "nsr-lake-613473203863"
L = f"s3://{BUCKET}/lake"
s3 = boto3.client("s3", region_name="us-east-2")


def con(mem="5GB", threads=2):
    c = duckdb.connect(config={"memory_limit": mem, "threads": threads, "temp_directory": "/data/duck-tmp",
                               "extension_directory": "/opt/duckdb_ext", "home_directory": "/root"})
    try:
        c.execute("LOAD httpfs")
    except duckdb.Error:
        c.execute("INSTALL httpfs")
        c.execute("LOAD httpfs")
    cr = boto3.Session().get_credentials().get_frozen_credentials()
    c.execute(f"CREATE SECRET lake (TYPE s3, KEY_ID '{cr.access_key}', SECRET '{cr.secret_key}', "
              f"SESSION_TOKEN '{cr.token or ''}', REGION 'us-east-2')")
    os.makedirs("/data/duck-tmp", exist_ok=True)
    return c
