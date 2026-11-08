# Which linked files are inside the collection zips (brief 14, CONDERC): reads each zip's file list straight from S3 with
# ranged GETs (no full download), then checks every linked file path against it. Writes <out> as JSON.
#   /opt/pw/bin/python zipcheck.py <links-key> <out-key>
# links-key: JSON {"zips": {"<collection>": "<zip key>"}, "links": {"<collection>": ["<path inside the collection>", ...]}}
import io, json, sys, zipfile
import boto3

B = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")


class S3File(io.RawIOBase):
    # a seekable read-only file over one S3 object, so zipfile can read the central directory at the end
    def __init__(self, key):
        self.key, self.pos = key, 0
        self.size = s3.head_object(Bucket=B, Key=key)["ContentLength"]

    def seekable(self):
        return True

    def readable(self):
        return True

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def tell(self):
        return self.pos

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        if n == 0 or self.pos >= self.size:
            return b""
        end = min(self.pos + n, self.size) - 1
        b = s3.get_object(Bucket=B, Key=self.key, Range=f"bytes={self.pos}-{end}")["Body"].read()
        self.pos += len(b)
        return b

    def readinto(self, buf):
        b = self.read(len(buf))
        buf[:len(b)] = b
        return len(b)


spec = json.loads(s3.get_object(Bucket=B, Key=sys.argv[1])["Body"].read())
out = {}
for col, key in spec["zips"].items():
    try:
        names = [n for n in zipfile.ZipFile(io.BufferedReader(S3File(key), 1 << 20)).namelist() if not n.endswith("/")]
    except Exception as e:
        out[col] = {"zip": key, "error": str(e)[:200]}
        continue
    links = spec["links"].get(col, [])
    missing = [p for p in links if not any(n == p or n.endswith("/" + p) for n in names)]
    out[col] = {"zip": key, "members": len(names), "links": len(links), "inside": len(links) - len(missing), "missing": missing[:200],
                "missing_count": len(missing)}
s3.put_object(Bucket=B, Key=sys.argv[2], Body=json.dumps(out, indent=1).encode())
print(json.dumps({c: {k: v for k, v in r.items() if k != "missing"} for c, r in out.items()}))
