# nsr-api routes for nuclides (ENSDF 2026-11-05) and ENDF cross sections (brief 17, parsing-1; brief 43 added JEFF-3.3,
# JENDL-5, TENDL-2023 and CENDL-3.2), beside parsing-2's
# EXFOR routes. lambda_function.py sends every path starting /nuclide or /endf to route(path, query) -> (status, body).
# DuckDB (its own connection, so these routes never load the EXFOR index) reads the serving Parquet under
# s3://nsr-lake-613473203863/lake/serve/nuclide/2026-11-05/ and lake/serve/endf/. Tables load into memory on first use:
# nuclide summary, levels, gammas and decays (about 10 MB); ENDF materials and MT names; each release's cross sections.
#   GET /nuclide/{name}                summary, decay modes, adopted levels and gammas (?levels=200 caps both lists),
#                                      decays as parent and as daughter. {name}: 137Cs, Cs-137, cs137, CS-137, 137-Cs
#   GET /nuclide/{name}/levels         adopted levels, 500 a page (?page=)
#   GET /nuclide/{name}/gammas         adopted gammas, 500 a page (?page=)
#   GET /endf/materials?release=B-VIII.1&sublibrary=neutrons&z=92&name=U-235     the material index (release=all for every one)
#   GET /endf/xs?name=U-235&mt=18&release=B-VIII.1&sub=neutrons&compare=B-VIII.0,B-VII.1&temp=0K   energy and xs arrays
#                                      per release. Where a reconstructed POINT release holds the section (B-VIII.1 and
#                                      B-VIII.0, temp 0K or 293.6K) it is served instead of the bare MF3, which inside a
#                                      resonance range is only the background; release_served says which. point=0 forces MF3.
#   GET /endf/mt                       MT numbers present, with reaction and name (ENDF-102)
import array
import json
import os
import re

import duckdb

BUCKET = os.environ.get("BUCKET", "nsr-lake-613473203863")
NUC = f"s3://{BUCKET}/lake/serve/nuclide/2026-11-05"
ENDF = f"s3://{BUCKET}/lake/serve/endf"
RELEASES = ["B-VIII.1", "B-VIII.0", "B-VII.1", "B-VII.0", "B-VI.8", "B-V", "B-IV", "B-III", "B-II",
            "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2"]  # brief 43 added the last four; xs_<n> indexes this list
# Releases with too many MF3 rows to load into memory (brief 43): read like the POINT releases, through xs_index (held in
# memory) and xs_series/series.bin (one S3 byte-range request a section), built by serve.py point_files.
INDEXED = ["JEFF-3.3", "JENDL-5", "TENDL-2023"]
# NNDC's reconstructed, linearized libraries (POINT2025 for B-VIII.1, POINT2018 for B-VIII.0), one release per temperature
POINT_RELEASES = ["B-VIII.1-point-0K", "B-VIII.1-point-293.6K", "B-VIII.0-point-0K", "B-VIII.0-point-293.6K"]
DEFAULT_RELEASE, DEFAULT_SUB = "B-VIII.1", "neutrons"
PAGE = 500
HERE = os.path.dirname(os.path.abspath(__file__))
_con = None
_s3 = None
_loaded = set()


def con():
    """One DuckDB per container: httpfs from the package (DUCKDB_EXT_DIR overrides, for tests), Lambda's credentials."""
    global _con
    if _con is None:
        c = duckdb.connect(config={"home_directory": "/tmp",
                                   "extension_directory": os.environ.get("DUCKDB_EXT_DIR", f"{HERE}/duckdb_ext"),
                                   "temp_directory": "/tmp/duckdb-structure", "threads": 2})
        c.execute("LOAD httpfs")
        for s in ("enable_object_cache", "enable_http_metadata_cache"):  # keep Parquet footers and S3 metadata per container
            try:
                c.execute(f"SET {s} = true")
            except duckdb.Error:
                pass
        key, secret, token = (os.environ["AWS_ACCESS_KEY_ID"], os.environ["AWS_SECRET_ACCESS_KEY"],
                              os.environ.get("AWS_SESSION_TOKEN", ""))
        c.execute(f"CREATE SECRET lake (TYPE s3, KEY_ID '{key}', SECRET '{secret}', SESSION_TOKEN '{token}', "
                  "REGION 'us-east-2')")
        _con = c
    return _con


def table(name):
    """Load a serving table into memory the first time a route needs it."""
    if name not in _loaded:
        src = {"summary": f"{NUC}/summary/*", "levels": f"{NUC}/levels/*", "gammas": f"{NUC}/gammas/*",
               "decays": f"{NUC}/decays/*", "materials": f"{ENDF}/*/materials/*", "mt": f"{ENDF}/mt_names/*"}
        if name.startswith("xs_"):
            path = f"{ENDF}/{RELEASES[int(name[3:])]}/xs/*"
        elif name.startswith("pidx_"):  # a POINT or INDEXED release's xs_index: every column but the arrays, plus sid
            path = f"{ENDF}/{(POINT_RELEASES + INDEXED)[int(name[5:])]}/xs_index/part-00000.parquet"
        else:
            path = src[name]
        con().execute(f"CREATE OR REPLACE TABLE {name} AS SELECT * FROM read_parquet('{path}')")
        _loaded.add(name)
    return name


def records(sql, params=()):
    cur = con().cursor().execute(sql, list(params))
    names = [d[0] for d in cur.description]
    return [dict(zip(names, r)) for r in cur.fetchall()]


def nuclide_name(s):
    """137Cs, Cs-137, cs137, CS-137, 137-Cs, 137 cs -> 137Cs (None when it isn't a nuclide)."""
    s = re.sub(r"[\s_]", "", s or "")
    m = re.fullmatch(r"(\d{1,3})-?([A-Za-z]{1,3})", s) or re.fullmatch(r"([A-Za-z]{1,3})-?(\d{1,3})", s)
    if not m:
        return None
    a, sym = (m.group(1), m.group(2)) if m.group(1).isdigit() else (m.group(2), m.group(1))
    sym = "n" if sym.lower() == "n" and a == "1" else sym[0].upper() + sym[1:].lower()
    return f"{int(a)}{sym}"


def material_name(s):
    """U-235, u235, 235U, U235, Am-242m, Fe-nat -> Sym-A[m]; anything else (H(H2O)) is matched as written."""
    t = re.sub(r"[\s_]", "", s or "")
    m = re.fullmatch(r"([A-Za-z]{1,2})-?(\d{1,3}|nat)(m\d?)?", t, re.I) or None
    if m:
        sym, a, iso = m.group(1), m.group(2), m.group(3) or ""
    else:
        m = re.fullmatch(r"(\d{1,3})(m\d?)?-?([A-Za-z]{1,2})", t, re.I)
        if not m:
            return s.strip()
        a, iso, sym = m.group(1), m.group(2) or "", m.group(3)
    a = "nat" if a.lower() == "nat" or a == "0" else str(int(a))
    return f"{sym[0].upper()}{sym[1:].lower()}-{a}{iso.lower()}"


def page_of(q):
    try:
        return max(1, int(q.get("page") or 1))
    except ValueError:
        raise ValueError("page must be a whole number")


def nuclide(name, part, q):
    canon = nuclide_name(name)
    if not canon:
        return 400, {"error": f"'{name}' is not a nuclide name; try 137Cs or Cs-137"}
    s = records(f"SELECT * FROM {table('summary')} WHERE name = ?", [canon])
    if not s:
        return 404, {"error": f"ENSDF has no nuclide {canon}"}
    s = s[0]
    s["decay_modes"] = json.loads(s["decay_modes"]) if s["decay_modes"] else []
    z, n = s["z"], s["n"]
    if part in ("levels", "gammas"):
        t = table(part)
        order = "level_seq" if part == "levels" else "level_seq, e_gamma_kev DESC"
        total = con().execute(f"SELECT count(*) FROM {t} WHERE z = ? AND n = ?", [z, n]).fetchone()[0]
        page = page_of(q)
        rows = records(f"SELECT * EXCLUDE (z, n, a, name) FROM {t} WHERE z = ? AND n = ? ORDER BY {order} "
                       f"LIMIT {PAGE} OFFSET ?", [z, n, (page - 1) * PAGE])
        return 200, {"nuclide": canon, part: rows, "total": total, "page": page, "page_size": PAGE,
                     "pages": (total + PAGE - 1) // PAGE, "source": "ENSDF 2026-11-05, adopted levels"}
    try:
        cap = max(0, min(5000, int(q.get("levels") or 200)))
    except ValueError:
        return 400, {"error": "levels must be a whole number"}
    lv, gm = table("levels"), table("gammas")
    out = {"nuclide": s, "source": "ENSDF 2026-11-05"}
    out["levels"] = records(f"SELECT * EXCLUDE (z, n, a, name) FROM {lv} WHERE z = ? AND n = ? ORDER BY level_seq "
                            f"LIMIT {cap}", [z, n])
    out["gammas"] = records(f"SELECT * EXCLUDE (z, n, a, name) FROM {gm} WHERE z = ? AND n = ? "
                            f"ORDER BY level_seq, e_gamma_kev DESC LIMIT {cap}", [z, n])
    out["counts"] = {"levels": con().execute(f"SELECT count(*) FROM {lv} WHERE z = ? AND n = ?", [z, n]).fetchone()[0],
                     "gammas": con().execute(f"SELECT count(*) FROM {gm} WHERE z = ? AND n = ?", [z, n]).fetchone()[0],
                     "datasets": s["n_datasets"]}
    d = table("decays")
    out["decays"] = {"as_parent": records(f"SELECT * FROM {d} WHERE parent = ? ORDER BY parent_level_kev, dataset_seq",
                                          [canon]),
                     "as_daughter": records(f"SELECT * FROM {d} WHERE daughter = ? ORDER BY parent_z, parent_a",
                                            [canon])}
    return 200, out


def release_of(v):
    v = (v or DEFAULT_RELEASE).strip()
    v = v[5:] if v.upper().startswith("ENDF/") else v
    return next((r for r in RELEASES + POINT_RELEASES if r.lower() == v.lower()), None)


def materials(q):
    where, params = [], []
    rel = (q.get("release") or DEFAULT_RELEASE).strip()
    if rel.lower() != "all":
        r = release_of(rel)
        if not r:
            return 404, {"error": f"release {rel} is not held; held: {', '.join(RELEASES + POINT_RELEASES)}"}
        where.append("release = ?"); params.append(r)
    if q.get("sublibrary") or q.get("sub"):
        where.append("sublibrary = ?"); params.append((q.get("sublibrary") or q.get("sub")).strip().lower())
    if q.get("z"):
        where.append("z = ?"); params.append(int(q["z"]))
    if q.get("name"):
        where.append("upper(name) = upper(?)"); params.append(material_name(q["name"]))
    w = " AND ".join(where) or "TRUE"
    rows = records(f"SELECT * EXCLUDE (file_name) FROM {table('materials')} WHERE {w} "
                   "ORDER BY release, sublibrary, z, a, liso, mat", params)
    return 200, {"total": len(rows), "rows": rows}


def temp_of(v):
    """0, 0K -> 0K; 293.6, 293.6K, room -> 293.6K (the temperatures the POINT releases hold)."""
    v = (v or "0K").strip().lower().rstrip("k")
    if v in ("room", "293", "293.6", "300"):
        return "293.6K"
    return "0K" if v in ("0", "", "0.0") else None


def point_series(pr, name, sub, mt):
    """One section from a POINT or INDEXED release: its row from the in-memory xs_index, its arrays from
    xs_series/series.bin with one S3 byte-range request (energy then cross section, little-endian float64)."""
    global _s3
    rows = records(f"SELECT * FROM {table(f'pidx_{(POINT_RELEASES + INDEXED).index(pr)}')} WHERE sublibrary = ? AND upper(name) = upper(?) "
                   "AND mt = ? ORDER BY liso, mat LIMIT 1", [sub, name, mt])
    if not rows:
        return None
    row = rows[0]
    off, size = row.pop("byte_offset"), row.pop("n_bytes")
    row.pop("sid")
    if _s3 is None:
        import boto3  # only the POINT route needs it
        _s3 = boto3.client("s3", region_name="us-east-2")
    body = _s3.get_object(Bucket=BUCKET, Key=f"lake/serve/endf/{pr}/xs_series/series.bin",
                          Range=f"bytes={off}-{off + size - 1}")["Body"].read()
    v = array.array("d")
    v.frombytes(body)
    half = len(v) // 2
    row["energy_ev"], row["xs_barn"] = v[:half].tolist(), v[half:].tolist()
    return row


def xs(q):
    if not q.get("name") or not q.get("mt"):
        return 400, {"error": "name and mt are required, e.g. /endf/xs?name=U-235&mt=18"}
    name, sub = material_name(q["name"]), (q.get("sub") or q.get("sublibrary") or DEFAULT_SUB).strip().lower()
    try:
        mt = int(q["mt"])
    except ValueError:
        return 400, {"error": "mt must be a whole number"}
    temp = temp_of(q.get("temp"))
    if not temp:
        return 400, {"error": "temp is 0K or 293.6K, the temperatures of the reconstructed (POINT) releases"}
    use_point = (q.get("point") or "1").strip().lower() not in ("0", "false", "no")
    wanted = [q.get("release") or DEFAULT_RELEASE] + [c for c in (q.get("compare") or "").split(",") if c.strip()]
    mtrow = records(f"SELECT reaction, name FROM {table('mt')} WHERE mt = ?", [mt])
    series = []
    for w in wanted:
        r = release_of(w)
        if not r:
            series.append({"release": w.strip(), "held": False,
                           "note": f"not parsed into the lake; held releases: {', '.join(RELEASES + POINT_RELEASES)}"})
            continue
        row, served = None, r
        pr = r if r in POINT_RELEASES else f"{r}-point-{temp}"
        if (use_point or r in POINT_RELEASES) and pr in POINT_RELEASES:
            try:
                row = point_series(pr, name, sub, mt)
                served = pr if row else r
            except Exception:  # noqa: BLE001 (a missing or unreadable POINT file falls back to the MF3)
                row = None
        if row is None and r in INDEXED:
            row, served = point_series(r, name, sub, mt), r
        elif row is None and r in RELEASES:
            t = table(f"xs_{RELEASES.index(r)}")
            rows = records(f"SELECT * FROM {t} WHERE sublibrary = ? AND upper(name) = upper(?) AND mt = ? "
                           "ORDER BY liso, mat", [sub, name, mt])
            row, served = (rows[0] if rows else None), r
        if row is None:
            series.append({"release": r, "release_served": None, "held": True, "found": False,
                           "note": f"no MF3 MT {mt} for {name} in {r} {sub}"})
            continue
        item = {**row, "release": r, "release_served": served, "held": True}
        if served == r and r in RELEASES:
            lrp = records(f"SELECT lrp FROM {table('materials')} WHERE release = ? AND mat = ? AND sublibrary = ? LIMIT 1",
                          [r, row["mat"], sub])  # one MAT can sit in several sublibraries (JEFF-3.3 Fe-56: five)
            if lrp and lrp[0]["lrp"] == 1:
                item["note"] = ("MF3 as evaluated: inside the resonance range it is only the background to the MF2 "
                                "resonances; no reconstructed (POINT) release holds this section")
        elif served != r or r in POINT_RELEASES:
            item["note"] = (f"reconstructed pointwise data (NNDC POINT, {served.rsplit('-', 1)[-1]})"
                            + (f"; thinned for charting to {row['n_served']:,} of {row['n_points']:,} points (lowest "
                               "and highest in each log-energy step)" if row.get("thinned") else ""))
        series.append(item)
    found = [s for s in series if s.get("energy_ev") is not None]
    return (200 if found else 404), {
        "name": name, "mt": mt, "sublibrary": sub, "temp": temp, "release_served": found[0]["release_served"] if found else None,
        "reaction": mtrow[0]["reaction"] if mtrow else None, "mt_name": mtrow[0]["name"] if mtrow else None,
        "units": {"energy": "eV", "xs": "barn"}, "series": series}


def route(path, q):
    q = q or {}
    p = path.rstrip("/")
    try:
        m = re.fullmatch(r"/nuclide/([^/]+)(?:/(levels|gammas))?", p)
        if m:
            return nuclide(m.group(1), m.group(2), q)
        if p == "/endf/materials":
            return materials(q)
        if p == "/endf/xs":
            return xs(q)
        if p == "/endf/mt":
            return 200, {"rows": records(f"SELECT * FROM {table('mt')} ORDER BY mt")}
        return 404, {"error": "routes: /nuclide/{name}, /nuclide/{name}/levels, /nuclide/{name}/gammas, "
                              "/endf/materials, /endf/xs, /endf/mt"}
    except (ValueError, duckdb.Error) as e:
        return 400, {"error": str(e)[:500]}
