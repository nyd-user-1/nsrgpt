# nsr-count: count the records inside the NSR lake's own files, next to them in us-east-2 (read-only; no downloads
# to the Mac). One job per invocation:
#   {"job": "ensdf", "key": "...zip"}     ENSDF or XUNDL release: datasets, nuclides, and records by type
#                                         (L levels, G gammas, B beta-, E EC/beta+, A alpha, D delayed particles, …)
#   {"job": "exfor", "key": "...tar.gz"}  EXFOR J4 archive: entries, subentries, subentries with data, data rows,
#                                         data values, reaction codes
#   {"job": "endf", "key": "...", "name": "B-VIII.1"}  ENDF library archive (.tar.gz, .zip, .gz, nested):
#                                         materials (distinct file+MAT), by folder; MF3 cross sections and their points
# Used by docs/sketches/2026-11-07-data-index.html.
import gzip, io, os, tarfile, zipfile, collections
import boto3

s3 = boto3.client("s3")
BUCKET = os.environ.get("BUCKET", "nsr-lake-613473203863")


def body(key):
    return s3.get_object(Bucket=BUCKET, Key=key)["Body"]


def to_tmp(key):
    path = "/tmp/" + key.rsplit("/", 1)[-1]
    s3.download_file(BUCKET, key, path)
    return path


# ---------- ENSDF / XUNDL (80-column cards; a blank card ends a dataset) ----------
def ensdf(key):
    path = to_tmp(key)
    rec = collections.Counter()
    datasets = 0
    nuclides = set()
    lines = 0
    z = zipfile.ZipFile(path)
    for name in z.namelist():
        if name.endswith("/"):
            continue
        start = True
        with z.open(name) as f:
            for raw in io.TextIOWrapper(f, encoding="latin-1"):
                line = raw.rstrip("\n").ljust(80)
                lines += 1
                if not line.strip():
                    start = True
                    continue
                if start:
                    datasets += 1
                    nuclides.add(line[0:5].strip())
                    start = False
                    continue
                # primary record: continuation column blank or "1", comment column blank
                if line[5] in " 1" and line[6] == " ":
                    rec[line[7] if line[7] != " " else "(blank)"] += 1
    os.remove(path)
    return {"key": key, "files": len(z.namelist()), "lines": lines, "datasets": datasets,
            "nuclide_ids": len(nuclides), "records": dict(rec.most_common())}


# ---------- EXFOR J4 ----------
def exfor(key):
    c = collections.Counter()
    reactions = set()
    with tarfile.open(fileobj=body(key), mode="r|gz") as t:
        import json
        for m in t:
            if not (m.isfile() and m.name.endswith(".json") and "/j4/" in m.name):
                continue
            d = json.load(t.extractfile(m))
            for e in d.get("entries", []):
                c["entries"] += 1
                for s in e.get("subentries", []):
                    c["subentries"] += 1
                    data = s.get("DATA")
                    if isinstance(data, dict):
                        c["subentries_with_data"] += 1
                        rows = data.get("N2") or 0
                        cols = data.get("N1") or 0
                        c["data_rows"] += rows
                        c["data_values"] += rows * cols
                    for r in s.get("REACTION") or []:
                        code = (r.get("coded_information") or {}).get("code")
                        if code:
                            reactions.add(code)
    return {"key": key, **c, "distinct_reaction_codes": len(reactions)}


# ---------- ENDF ----------
def endf_lines(name, data):
    """Yield (path, text-lines) for every ENDF file in data, opening nested archives."""
    n = name.lower()
    if n.endswith((".tar.gz", ".tgz", ".tar")):
        with tarfile.open(fileobj=io.BytesIO(data) if isinstance(data, bytes) else data,
                          mode="r|gz" if n.endswith(("gz", "tgz")) else "r|") as t:
            for m in t:
                if m.isfile():
                    yield from endf_lines(m.name, t.extractfile(m).read())
    elif n.endswith(".zip"):
        z = zipfile.ZipFile(io.BytesIO(data) if isinstance(data, bytes) else data)
        for zn in z.namelist():
            if not zn.endswith("/"):
                yield from endf_lines(zn, z.read(zn))
    elif n.endswith(".gz"):
        yield from endf_lines(name[:-3], gzip.decompress(data))
    elif isinstance(data, bytes) and data[257:262] == b"ustar":
        yield from endf_lines(name + ".tar", data)
    elif isinstance(data, bytes) and data[:4] == b"PK\x03\x04":
        yield from endf_lines(name + ".zip", data)
    elif isinstance(data, bytes):
        if n.endswith((".pdf", ".html", ".htm", ".png", ".jpg", ".md", ".py", ".json", ".xml")):
            return
        yield name, data.decode("latin-1").splitlines()


def endf(key, name):
    mats = set()
    by_folder = collections.Counter()
    mf3_sections = 0
    mf3_points = 0
    files = 0
    if key.lower().endswith(".zip"):
        src = open(to_tmp(key), "rb")
    elif key.lower().endswith((".tar.gz", ".tgz")):
        src = body(key)
    else:
        src = body(key).read()
    for path, lines in endf_lines(key.rsplit("/", 1)[-1], src):
        files += 1
        prev = None
        folder = path.rsplit("/", 2)[-2] if path.count("/") >= 1 else "(root)"
        for i, line in enumerate(lines):
            if len(line) < 75:
                continue
            mat, mf, mt = line[66:70].strip(), line[70:72].strip(), line[72:75].strip()
            if not mat.lstrip("-").isdigit() or int(mat) <= 0:
                prev = None
                continue
            if mf == "1" and mt == "451" and (path, mat) not in mats:
                mats.add((path, mat)); by_folder[folder] += 1
            if mf == "3" and mt not in ("", "0"):
                cur = (mat, mt)
                if cur != prev:  # first line of a section is HEAD; the next is the TAB1 header with NP
                    mf3_sections += 1
                    if i + 1 < len(lines):
                        np_field = lines[i + 1][55:66].strip()
                        if np_field.lstrip("-").isdigit():
                            mf3_points += int(np_field)
                prev = cur
            else:
                prev = None
    return {"key": key, "name": name, "files": files, "materials": len(mats), "materials_by_folder": dict(by_folder),
            "mf3_cross_sections": mf3_sections, "mf3_points": mf3_points}


def lambda_handler(event, context):
    job = event["job"]
    if job in ("ensdf", "xundl"):
        return ensdf(event["key"])
    if job == "exfor":
        return exfor(event["key"])
    if job == "endf":
        return endf(event["key"], event.get("name", ""))
    raise ValueError("job must be ensdf, xundl, exfor or endf")
