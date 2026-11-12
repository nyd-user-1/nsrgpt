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
#                                      B-VIII.0, temp 0K, 293.6K, 600K, 900K, 1200K, 1500K or 1800K) it is served instead of the bare MF3, which inside a
#                                      resonance range is only the background; release_served says which. point=0 forces MF3.
#                                      &janis=1 (Elpis's book, brief 74): JANIS Web's own curve where its package holds the
#                                      section (<release>-janis, 293.6 K), unless another temp is asked for.
#                                      &emin=&emax= (eV) cut each series to the window, keeping the point on each side.
#   GET /endf/cov?name=U-235&mt=18&release=B-VIII.1,JEFF-3.3&emin=&emax=   the MF33 self-covariance as relative standard
#                                      deviation per energy group, per release (brief 51), read from lake/endfb/<release>/cov/;
#                                      for MT 2, 18 and 102 each series also has "resolved": the File 32 band per decade
#                                      inside the resolved ranges (brief 56, resonances.resolved_band; &resolved=0 drops it)
#   GET /endf/mt                       MT numbers present, with reaction and name (ENDF-102)
import array
import bisect
import json
import math
import os
import re

import duckdb

BUCKET = os.environ.get("BUCKET", "nsr-lake-613473203863")
NUC = f"s3://{BUCKET}/lake/serve/nuclide/2026-11-05"
ENDF = f"s3://{BUCKET}/lake/serve/endf"
ENDFB = f"s3://{BUCKET}/lake/endfb"
RELEASES = ["B-VIII.1", "B-VIII.0", "B-VII.1", "B-VII.0", "B-VI.8", "B-V", "B-IV", "B-III", "B-II",
            "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2",  # brief 43 added these four; xs_<n> indexes this list
            # brief 70 (elpis-fill): the libraries JANIS lists that the lake lacked, every one served INDEXED
            "JEFF-4.0", "JEFF-3.1.1", "JEF-2.2", "B-VI.8-HE", "JENDL-4.0-HE", "JENDL-AD-2017", "JENDL-DEU-2020",
            "JENDL-PD-2016", "IAEA-PD-2019", "PADF-2007", "RUSFOND-2010", "BROND-3.1", "BROND-2.2", "CENDL-2.1", "FENDL-2.1",
            "IRDFF-II", "IRDFF-1.05", "IRDFF-1.0", "IRDF-2002",
            "JEFF-3.2", "JEFF-3.1.2", "JEFF-3.1", "JEFF-3.0", "JENDL-4.0", "JENDL-4.0u", "JENDL-3.3", "JENDL-HE-2007", "JENDL-AC-2008",
            "JENDL-PD-2016.1", "JENDL-PD-2004", "JENDL-AN-2005", "CENDL-3.1", "EAF-2010", "IRDF-2002-MG",
            # brief 73 (Elpis lane A): from JANIS's own packages (MF3 processed by JANIS; nsr.endfb_release_sources says so)
            "FENDL-3.1b", "IRDFF-1.0-640g"]
# Releases with too many MF3 rows to load into memory (brief 43): read like the POINT releases, through xs_index (held in
# memory) and xs_series/series.bin (one S3 byte-range request a section), built by serve.py point_files.
INDEXED = ["JEFF-3.3", "JENDL-5", "TENDL-2023"] + RELEASES[RELEASES.index("CENDL-3.2") + 1:]
# NNDC's reconstructed, linearized libraries (POINT2025 for B-VIII.1, POINT2018 for B-VIII.0), one release per temperature;
# 600 to 1800 K since brief 56 (scripts/parse/serve-structure/point_hot.sh)
HOT = ["600K", "900K", "1200K", "1500K", "1800K"]
POINT_RELEASES = (["B-VIII.1-point-0K", "B-VIII.1-point-293.6K", "B-VIII.0-point-0K", "B-VIII.0-point-293.6K"]
                  + [f"B-VIII.1-point-{t}" for t in HOT] + [f"B-VIII.0-point-{t}" for t in HOT])
# Brief 74 (Elpis lane B): JANIS Web's own pointwise cross sections (resonances reconstructed, broadened to 293.6 K),
# decoded unchanged from its packages (NEA GitLab janis/data; scripts/recon/janis_serve.py), one <release>-janis release
# each, read like the POINT releases. /endf/xs serves them with janis=1.
JANIS = ["B-VIII.0", "B-VII.1", "B-VII.0", "B-VI.8", "B-VI.8-HE", "JEFF-4.0", "JEFF-3.3", "JEFF-3.2", "JEFF-3.1.2",
         "JEFF-3.1.1", "JEFF-3.1", "JEFF-3.0", "JEF-2.2", "JENDL-5", "JENDL-4.0", "JENDL-4.0u", "JENDL-4.0-HE", "JENDL-3.3",
         "JENDL-HE-2007", "JENDL-AC-2008", "JENDL-AD-2017", "JENDL-AN-2005", "JENDL-DEU-2020", "JENDL-PD-2004",
         "JENDL-PD-2016", "JENDL-PD-2016.1", "CENDL-3.2", "CENDL-3.1", "CENDL-2.1", "BROND-3.1", "BROND-2.2",
         "RUSFOND-2010", "FENDL-2.1", "EAF-2010", "EAF-2007", "IAEA-PD-2019", "PADF-2007", "IRDFF-II", "IRDFF-1.05",
         "IRDFF-1.0", "IRDF-2002", "IRDF-2002-MG"]
POINT_RELEASES += [f"{r}-janis" for r in JANIS]
# Releases JANIS Web draws whose package lacks the sublibrary (JEFF-3.1's holds protons only): reconstructed in advance
# from their own MF2 with brief 74 B1's settings (NJOY2016 reconr 0.05%, broadr 293.6 K; scripts/recon/recon.py), as
# <release>-recon-0K and -recon-293.6K, served with janis=1 after the -janis release.
RECON = []
POINT_RELEASES += [f"{r}-recon-{t}" for r in RECON for t in ("0K", "293.6K")]
TEMPS = ["0K", "293.6K"] + HOT
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
    out.update(links_for(s))
    return 200, out


def links_for(s):
    """For the card (brief 56): the releases whose fission-yield (nfy) or decay sublibraries hold this nuclide as a
    material, and whether ICRP 107 lists it, so the card can link /endf/fy, /endf/decay and /icrp/nuclide."""
    sym_a = material_name(f"{s['name']}")  # 137Cs -> Cs-137
    rows = records(f"SELECT DISTINCT release, sublibrary FROM {table('materials')} WHERE upper(name) = upper(?) "
                   "AND sublibrary IN ('nfy', 'decay')", [sym_a])
    rel = lambda sub: [r for r in RELEASES if any(x["release"] == r and x["sublibrary"] == sub for x in rows)]  # noqa: E731
    try:
        import icrp
        in_icrp = icrp.nuclide_row(sym_a) is not None
    except Exception:  # noqa: BLE001  ICRP tables unreadable: say unknown rather than fail the card
        in_icrp = None
    return {"fy_releases": rel("nfy"), "decay_releases": rel("decay"), "icrp": in_icrp}


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
    """0, 0K -> 0K; 293.6, 293.6K, room -> 293.6K; 600, 900, 1200, 1500, 1800 (K) -> themselves (the temperatures the
    POINT releases hold)."""
    v = (v or "0K").strip().lower().rstrip("k")
    if v in ("room", "293", "293.6", "300"):
        return "293.6K"
    if v in ("0", "", "0.0"):
        return "0K"
    try:
        t = f"{int(float(v))}K"
    except ValueError:
        return None
    return t if t in HOT else None


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
        return 400, {"error": f"temp is one of {', '.join(TEMPS)}, the temperatures of the reconstructed (POINT) releases"}
    use_point = (q.get("point") or "1").strip().lower() not in ("0", "false", "no")
    janis = (q.get("janis") or "").strip().lower() in ("1", "true", "yes")
    temp_in = temp if q.get("temp") else None
    emin, emax = ev_of(q, "emin"), ev_of(q, "emax")
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
        if r in POINT_RELEASES:
            cands = [r]
        else:  # JANIS's curve first when asked for (at its own 293.6 K), then NNDC's POINT, then the MF3
            cands = [f"{r}-janis", f"{r}-recon-293.6K"] if janis and temp_in in (None, "293.6K") else []
            cands += [f"{r}-recon-{temp}"] if janis else []
            cands += [f"{r}-point-{temp}"] if use_point else []
        for pr in (c for c in cands if c in POINT_RELEASES):
            try:
                row = point_series(pr, name, sub, mt)
            except Exception:  # noqa: BLE001 (a missing or unreadable POINT file falls back to the next)
                row = None
            if row:
                served = pr
                break
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
        if emin is not None or emax is not None:
            window(item, emin, emax)
        if served == r and r in RELEASES:
            lrp = records(f"SELECT lrp FROM {table('materials')} WHERE release = ? AND mat = ? AND sublibrary = ? LIMIT 1",
                          [r, row["mat"], sub])  # one MAT can sit in several sublibraries (JEFF-3.3 Fe-56: five)
            if lrp and lrp[0]["lrp"] == 1:
                item["note"] = ("MF3 as evaluated: inside the resonance range it is only the background to the MF2 "
                                "resonances; no reconstructed (POINT) release holds this section")
        elif served != r or r in POINT_RELEASES:
            if served.endswith("-janis"):
                item["temp_served"] = "293.6K"
            elif "-recon-" in served:
                item["temp_served"] = served.rsplit("-", 1)[-1]
            item["note"] = ((f"{row['computed']} of JANIS Web's own pointwise data, as JANIS computes it (293.6 K)"
                             if served.endswith("-janis") and row.get("computed")
                             else "JANIS Web's own pointwise data (NEA janis/data package, 293.6 K)" if served.endswith("-janis")
                             else (f"reconstructed in advance from the File 2 resonance parameters (NJOY2016 reconr and broadr, "
                                   f"{served.rsplit('-', 1)[-1]})") if "-recon-" in served
                             else f"reconstructed pointwise data (NNDC POINT, {served.rsplit('-', 1)[-1]})")
                            + (f"; thinned for charting to {row['n_served']:,} of {row['n_points']:,} points (lowest "
                               "and highest in each log-energy step)" if row.get("thinned") else ""))
        series.append(item)
    found = [s for s in series if s.get("energy_ev") is not None]
    return (200 if found else 404), {
        "name": name, "mt": mt, "sublibrary": sub, "temp": temp, "release_served": found[0]["release_served"] if found else None,
        "reaction": mtrow[0]["reaction"] if mtrow else None, "mt_name": mtrow[0]["name"] if mtrow else None,
        "units": {"energy": "eV", "xs": "barn"}, "series": series}


def ev_of(q, k):
    try:
        return float(q[k]) if q.get(k) not in (None, "") else None
    except ValueError:
        raise ValueError(f"{k} is an energy in eV, e.g. 9e3")


def window(row, emin, emax):
    """Cut a series to [emin, emax] eV, keeping the point on each side so the curve spans the window; the TAB1
    interpolation regions (last point of each region, 1-based) are renumbered for the cut."""
    e, x = row["energy_ev"], row["xs_barn"]
    lo = bisect.bisect_left(e, emin) if emin is not None else 0
    hi = bisect.bisect_right(e, emax) if emax is not None else len(e)
    lo, hi = max(0, lo - 1), min(len(e), hi + 1)
    nbt, law = [], []
    for b, l in zip(row.get("interp_nbt") or [], row.get("interp_law") or []):
        if b <= lo:
            continue
        nbt.append(min(b, hi) - lo)
        law.append(l)
        if b >= hi:
            break
    row.update(energy_ev=list(e[lo:hi]), xs_barn=list(x[lo:hi]), interp_nbt=nbt, interp_law=law, n_window=hi - lo,
               window={"emin_ev": emin, "emax_ev": emax})


# MF33 representations (ENDF-6 manual, section 33.2) and the variance each contributes to its own energy group:
# LB=1 and 8: F_k is a relative variance for [E_k, E_k+1); LB=2: relative, fully correlated, variance F_k^2;
# LB=5 and 6: a relative covariance matrix, its diagonal F_kk. LB=0 (absolute, b^2), 3, 4 and 9 are not converted.
COV_LB = (1, 2, 5, 6, 8)


def cov_release(r, name, sub, mt, emin, emax):
    m = records(f"SELECT mat, file_name FROM {table('materials')} WHERE release = ? AND sublibrary = ? "
                "AND upper(name) = upper(?) ORDER BY liso, mat LIMIT 1", [r, sub, name])
    if not m:
        return {"release": r, "held": True, "mat": None, "mt": mt, "lb": [], "groups": [],
                "note": f"no {name} in {r} {sub}"}
    mat, fname = m[0]["mat"], m[0]["file_name"]
    rows = records(f"SELECT block, mtl, ni_index, lb, pair_set, row_energy_ev AS e, row_energy_hi_ev AS e_hi, value "
                   f"FROM read_parquet('{ENDFB}/{r}/cov/*.parquet') WHERE mat = ? AND mt = ? AND file_name = ? "
                   "AND (block = 'lumped' OR (mt1 = ? AND (mat1 = 0 OR mat1 = ?) AND block = 'NI' "
                   "AND (lb NOT IN (5, 6) OR (row_energy_ev = col_energy_ev AND row_energy_hi_ev = col_energy_hi_ev))))",
                   [mat, mt, fname, mt, mat])
    out = {"release": r, "held": True, "mat": mat, "mt": mt, "lb": [], "groups": []}
    lumped = [x["mtl"] for x in rows if x["block"] == "lumped"]
    if lumped:
        out["note"] = f"MT {mt} is part of the lumped reaction MT {lumped[0]}; its covariance is given there"
        return out
    if not rows:
        out["note"] = f"{r} has no MF33 self-covariance for {name} MT {mt}"
        return out
    blocks, skipped = {}, []
    for x in rows:
        blocks.setdefault(x["ni_index"], []).append(x)
    parts = []  # per block: sorted (e_lo, e_hi, variance)
    for i in sorted(blocks):
        b = blocks[i]
        lb = b[0]["lb"]
        if lb not in COV_LB:
            skipped.append(lb)
            continue
        out["lb"].append(lb)
        if lb in (5, 6):
            parts.append(sorted((x["e"], x["e_hi"], x["value"]) for x in b))
        else:
            pts = sorted((x["e"], x["value"]) for x in b if x["pair_set"] == 1)
            parts.append([(e0, e1, f * f if lb == 2 else f) for (e0, f), (e1, _) in zip(pts, pts[1:])])
    edges = sorted({e for p in parts for g in p for e in g[:2]})
    for lo, hi in zip(edges, edges[1:]):
        if (emax is not None and lo >= emax) or (emin is not None and hi <= emin):
            continue
        mid, var = (lo + hi) / 2, 0.0
        for p in parts:
            k = bisect.bisect_right([g[0] for g in p], mid) - 1
            if k >= 0 and p[k][0] <= mid < p[k][1]:
                var += p[k][2]
        out["groups"].append({"e_lo_ev": lo, "e_hi_ev": hi, "rel_sd": math.sqrt(var) if var > 0 else 0.0})
    if skipped:
        out["note"] = f"LB {sorted(set(skipped))} not converted (absolute or cross-reaction forms)"
    return out


def cov(q):
    if not q.get("name") or not q.get("mt"):
        return 400, {"error": "name and mt are required, e.g. /endf/cov?name=U-235&mt=18&release=B-VIII.1"}
    name, sub = material_name(q["name"]), (q.get("sub") or q.get("sublibrary") or DEFAULT_SUB).strip().lower()
    try:
        mt = int(q["mt"])
    except ValueError:
        return 400, {"error": "mt must be a whole number"}
    emin, emax = ev_of(q, "emin"), ev_of(q, "emax")
    series = []
    for w in [x for x in (q.get("release") or DEFAULT_RELEASE).split(",") if x.strip()]:
        r = release_of(w)
        if not r or r not in RELEASES:
            series.append({"release": w.strip(), "held": False, "groups": [],
                           "note": f"no MF33 here; releases with covariances: {', '.join(RELEASES)}"})
            continue
        s = cov_release(r, name, sub, mt, emin, emax)
        if mt in (2, 18, 102) and q.get("resolved") != "0":  # MF33 often has nothing in the resolved range; MF32 does
            import resonances
            s["resolved"] = resonances.resolved_band(r, name, sub, mt, emin, emax)
        series.append(s)
    return 200, {"name": name, "mt": mt, "sublibrary": sub, "units": {"energy": "eV", "rel_sd": "fraction"},
                 "series": series}


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
        if p == "/endf/cov":
            return cov(q)
        if p == "/endf/mt":
            return 200, {"rows": records(f"SELECT * FROM {table('mt')} ORDER BY mt")}
        return 404, {"error": "routes: /nuclide/{name}, /nuclide/{name}/levels, /nuclide/{name}/gammas, "
                              "/endf/materials, /endf/xs, /endf/cov, /endf/mt"}
    except (ValueError, duckdb.Error) as e:
        return 400, {"error": str(e)[:500]}
