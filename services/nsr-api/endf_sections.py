# nsr-api routes for ENDF Files 4, 5, 6, 9, 10, 12, 13, 14 and 15 as numbers (brief 64, new-worker-2), read from the seven
# tables services/nsr-endf-parse writes: one Parquet file per material per table at lake/endfb/<release>/<table>/<id>.parquet,
# the material's section summary at lake/endfb/<release>/mf4_15/sections/<id>.json and the release's id list at
# lake/endfb/<release>/mf4_15/materials.json. lambda_function.py sends /endf/section here (before /endf, structure.py).
#   GET /endf/section?name=U-235&release=B-VIII.1&mf=4&mt=2&emin=&emax=&sub=neutrons
#       The rows of one section, long form (one value a row), cut to incident energies in [emin, emax] eV (rows without an
#       incident energy, such as an isotropic flag, are kept). At most 50,000 rows (truncated: true past that). Columns
#       that hold one value in every row come back once in "constant"; the rest as arrays in "columns".
#   GET /endf/section/laws?name=U-235&release=B-VIII.1[&mf=6&mt=5]
#       Every MF 4-15 section the material holds (rows, values, incident energies, laws and products), or with mf and mt
#       the incident energies held, per product for MF6.
#   GET /endf/section/production?name=Fe-56&sub=protons&zap=27055&release=TENDL-2023&compare=JEFF-3.3,JENDL-5[&lip=]
#       The cross section for producing one residual (zap = 1000 Z + A) through MT 5 (brief 69 follow-up, elpis-wire): File
#       10 MT 5's own production section for that product where the material gives one (summed over final states), else
#       MT 5's File 3 cross section times the product's File 6 yield (summed over its isomeric levels LIP, or one with lip),
#       on the union of the two energy grids where both are defined, both read lin-lin. One series per release, in
#       /endf/xs's shape (release, held, energy_ev, xs_barn, method, note), so a page reads both alike.
import bisect
import json
import os
import time

import boto3
import duckdb

import structure as S

TABLE_OF_MF = {4: "ang", 5: "edist", 6: "eang", 9: "mult", 10: "mult", 12: "photon_xs", 13: "photon_xs",
               14: "photon_ang", 15: "photon_edist"}
E_COL = {"ang": "e_ev", "edist": "e_in_ev", "eang": "e_in_ev", "mult": "e_ev", "photon_xs": "e_ev",
         "photon_ang": "e_ev", "photon_edist": "e_in_ev"}
DROP = ("release", "sublibrary", "file_name", "mat")  # the request names them
LIMIT = 50_000
MAX_BYTES = 5_500_000  # Lambda answers at most 6 MB
_ids = {}
s3 = boto3.client("s3")


def ids(release):
    """(file_name, mat) -> the material's key in the seven tables, from lake/endfb/<release>/mf4_15/materials.json."""
    if release not in _ids:
        try:
            rows = json.loads(s3.get_object(Bucket=S.BUCKET, Key=f"lake/endfb/{release}/mf4_15/materials.json")["Body"].read())
        except Exception:  # noqa: BLE001
            rows = []
        _ids[release] = {(r["file_name"], r["mat"]): r for r in rows}
    return _ids[release]


def material(q):
    """The request's release, name and sublibrary -> (release, name, sub, material row, id entry) or an error answer."""
    if not q.get("name"):
        return None, (400, {"error": "name is required, e.g. /endf/section?name=U-235&release=B-VIII.1&mf=4&mt=2"})
    r = S.release_of(q.get("release"))
    if not r or r not in S.RELEASES:
        return None, (404, {"error": f"release {q.get('release')} has no Files 4-15 here; held: {', '.join(S.RELEASES)}"})
    name, sub = S.material_name(q["name"]), (q.get("sub") or q.get("sublibrary") or S.DEFAULT_SUB).strip().lower()
    m = S.records(f"SELECT mat, file_name, sublibrary, name FROM {S.table('materials')} WHERE release = ? AND sublibrary = ? "
                  "AND upper(name) = upper(?) ORDER BY liso, mat LIMIT 1", [r, sub, name])
    if not m:
        return None, (404, {"error": f"no {name} in {r} {sub}"})
    entry = ids(r).get((m[0]["file_name"], m[0]["mat"]))
    if not entry:
        return None, (404, {"error": f"{name} in {r} {sub} holds no section of Files 4-15", "release": r, "name": name,
                            "sublibrary": sub, "mat": m[0]["mat"]})
    return (r, name, sub, m[0], entry), None


def whole(q, k):
    try:
        return int(q[k]) if q.get(k) not in (None, "") else None
    except ValueError:
        raise ValueError(f"{k} must be a whole number")


def section(q):
    found, err = material(q)
    if err:
        return err
    r, name, sub, m, entry = found
    mf, mt = whole(q, "mf"), whole(q, "mt")
    if mf not in TABLE_OF_MF or mt is None:
        return 400, {"error": "mf (4, 5, 6, 9, 10, 12, 13, 14 or 15) and mt are required"}
    emin, emax = S.ev_of(q, "emin"), S.ev_of(q, "emax")
    t = TABLE_OF_MF[mf]
    e = E_COL[t]
    where, params = ["mt = ?"], [mt]
    if t in ("mult", "photon_xs"):
        where.append("mf = ?"); params.append(mf)
    if emin is not None:
        where.append(f"({e} IS NULL OR {e} >= ?)"); params.append(emin)
    if emax is not None:
        where.append(f"({e} IS NULL OR {e} <= ?)"); params.append(emax)
    t0 = time.time()
    path = f"{S.ENDFB}/{r}/{t}/{entry['id']}*.parquet"
    try:
        rows = S.records(f"SELECT * EXCLUDE ({', '.join(DROP)}) FROM read_parquet('{path}') WHERE {' AND '.join(where)} "
                         f"LIMIT {LIMIT + 1}", params)
    except Exception as ex:  # noqa: BLE001  no file for this table: the material has no section of this MF
        if "No files found" in str(ex):
            rows = []
        else:
            raise
    truncated = len(rows) > LIMIT
    rows = rows[:LIMIT]
    out = {"release": r, "name": name, "sublibrary": sub, "mat": m["mat"], "mf": mf, "mt": mt, "table": f"endfb_{t}",
           "units": {"energy": "eV"}, "window": {"emin_ev": emin, "emax_ev": emax}, "n_rows": len(rows),
           "truncated": truncated, "limit": LIMIT, "read_ms": round((time.time() - t0) * 1000)}
    if not rows:
        out.update(constant={}, columns={}, note=f"{name} in {r} has no MF{mf} MT{mt} rows" + (" in the window" if
                                                                                            emin or emax else ""))
        return 200, out
    names = list(rows[0].keys())
    constant, columns = {}, {}
    for c in names:
        vals = [x[c] for x in rows]
        if all(v == vals[0] for v in vals):
            constant[c] = vals[0]
        else:
            columns[c] = vals
    out.update(constant=constant, columns=columns)
    body = json.dumps(out, default=str, separators=(",", ":"))
    if len(body) > MAX_BYTES:  # too large for one Lambda answer: keep the rows that fit
        keep = int(len(rows) * MAX_BYTES / len(body) * 0.95)
        out["columns"] = {c: v[:keep] for c, v in columns.items()}
        out.update(n_rows=keep, truncated=True, note=f"cut to {keep:,} rows to fit one answer; narrow emin/emax for the rest")
    return 200, out


def summaries(r, entry):
    """The material's section summaries (one, or one per chunk for a material parsed in parts)."""
    keys = [o["Key"] for o in s3.list_objects_v2(Bucket=S.BUCKET, Prefix=f"lake/endfb/{r}/mf4_15/sections/{entry['id']}")
            .get("Contents", []) if o["Key"].endswith(".json")]
    secs = []
    for k in keys:
        secs += json.loads(s3.get_object(Bucket=S.BUCKET, Key=k)["Body"].read())["sections"]
    return sorted(secs, key=lambda s: (s["mf"], s["mt"]))


def laws(q):
    found, err = material(q)
    if err:
        return err
    r, name, sub, m, entry = found
    mf, mt = whole(q, "mf"), whole(q, "mt")
    secs = summaries(r, entry)
    if mf is not None:
        secs = [s for s in secs if s["mf"] == mf]
    if mt is not None:
        secs = [s for s in secs if s["mt"] == mt]
    out = {"release": r, "name": name, "sublibrary": sub, "mat": m["mat"], "units": {"energy": "eV"},
           "sections": [{k: v for k, v in s.items() if k not in ("seconds", "lines")} for s in secs]}
    if mf in TABLE_OF_MF and mt is not None and secs:
        t = TABLE_OF_MF[mf]
        e = E_COL[t]
        path = f"{S.ENDFB}/{r}/{t}/{entry['id']}*.parquet"
        extra = " AND mf = ?" if t in ("mult", "photon_xs") else ""
        params = [mt, mf] if extra else [mt]
        if t == "eang":
            rows = S.records(f"SELECT product_seq, any_value(zap) AS zap, any_value(law) AS law, any_value(lang) AS lang, "
                             f"list(DISTINCT {e} ORDER BY {e}) FILTER (WHERE quantity <> 'yield' AND {e} IS NOT NULL) AS energies_ev "
                             f"FROM read_parquet('{path}') WHERE mt = ? GROUP BY product_seq ORDER BY product_seq", params)
            out["products"] = rows
        else:
            rows = S.records(f"SELECT DISTINCT {e} AS e FROM read_parquet('{path}') WHERE mt = ?{extra} AND {e} IS NOT NULL "
                             f"ORDER BY 1", params)
            out["energies_ev"] = [x["e"] for x in rows]
    return 200, out


def lin(xs, ys, x):
    """y at x on a lin-lin table (xs ascending; a repeated x, a step, takes its left value); 0 outside it."""
    if not xs or x < xs[0] or x > xs[-1]:
        return 0.0
    i = bisect.bisect_left(xs, x)
    if xs[i] == x:
        return ys[i]
    x0, x1, y0, y1 = xs[i - 1], xs[i], ys[i - 1], ys[i]
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0) if x1 > x0 else y0


def summed(tables):
    """Several lin-lin tables [(xs, ys)] summed on the union of their grids."""
    grid = sorted({x for xs, _ in tables for x in xs})
    return grid, [sum(lin(xs, ys, x) for xs, ys in tables) for x in grid]


def production(q):
    try:
        zap = int(float(q.get("zap") or ""))
    except ValueError:
        return 400, {"error": "zap (1000 Z + A of the residual, e.g. 27055 for Co-55) is required"}
    lip = whole(q, "lip")
    wanted = [q.get("release") or S.DEFAULT_RELEASE] + [c for c in (q.get("compare") or "").split(",") if c.strip()]
    series, name = [], None
    for w in wanted:
        found, err = material({**q, "release": w})
        if err:
            series.append({"release": w.strip(), "held": False, "note": err[1].get("error")})
            continue
        r, name, sub, m, entry = found
        tables, method = [], None
        try:
            rows = S.records(f"SELECT lfs, e_ev, value FROM read_parquet('{S.ENDFB}/{r}/mult/{entry['id']}*.parquet') "
                             "WHERE mf = 10 AND mt = 5 AND CAST(round(izap) AS INTEGER) = ? ORDER BY lfs, e_seq", [zap])
        except Exception:  # noqa: BLE001  no mult file: no MF9 or MF10 for this material
            rows = []
        if rows:
            for k in sorted({x["lfs"] for x in rows}):
                part = [x for x in rows if x["lfs"] == k]
                tables.append(([x["e_ev"] for x in part], [x["value"] for x in part]))
            grid, xs_b = summed(tables)
            method = "File 10 MT 5, the material's own production section"
        else:
            try:
                rows = S.records(f"SELECT lip, e_in_ev, value FROM read_parquet('{S.ENDFB}/{r}/eang/{entry['id']}*.parquet') "
                                 "WHERE mt = 5 AND quantity = 'yield' AND CAST(round(zap) AS INTEGER) = ?"
                                 + (" AND lip = ?" if lip is not None else "") + " ORDER BY lip, product_seq, e_seq",
                                 [zap] + ([lip] if lip is not None else []))
            except Exception:  # noqa: BLE001
                rows = []
            if not rows:
                series.append({"release": r, "held": True, "found": False, "mat": m["mat"],
                               "note": f"no MT 5 production of ZA {zap} in {name}, {r} {sub}"})
                continue
            for k in sorted({x["lip"] for x in rows}):
                part = [x for x in rows if x["lip"] == k]
                tables.append(([x["e_in_ev"] for x in part], [x["value"] for x in part]))
            ye, yv = summed(tables)
            st, body = S.xs({"name": name, "mt": "5", "sub": sub, "release": r})
            s5 = next((x for x in body.get("series", []) if x.get("energy_ev")), None)
            if not s5:
                series.append({"release": r, "held": True, "found": False, "mat": m["mat"],
                               "note": f"the File 6 yield is there but no MF3 MT 5 for {name} in {r} {sub}"})
                continue
            e5, x5 = s5["energy_ev"], s5["xs_barn"]
            lo, hi = max(e5[0], ye[0]), min(e5[-1], ye[-1])
            grid = sorted({x for x in e5 + ye if lo <= x <= hi})
            xs_b = [lin(e5, x5, x) * lin(ye, yv, x) for x in grid]
            method = "MT 5's File 3 cross section times the product's File 6 yield"
        series.append({"release": r, "held": True, "mat": m["mat"], "zap": zap, "energy_ev": grid, "xs_barn": xs_b,
                       "n_points": len(grid), "method": method, "note": f"production from MT 5: {method}"})
    found_any = any(x.get("energy_ev") for x in series)
    return (200 if found_any else 404), {"name": name, "zap": zap, "lip": lip, "mt": 5, "units": {"energy": "eV", "xs": "barn"},
                                         "series": series}


def route(path, q):
    q = q or {}
    p = path.rstrip("/")
    try:
        if p == "/endf/section":
            return section(q)
        if p == "/endf/section/laws":
            return laws(q)
        if p == "/endf/section/production":
            return production(q)
        return 404, {"error": "routes: /endf/section, /endf/section/laws, /endf/section/production"}
    except (ValueError, duckdb.Error) as ex:
        return 400, {"error": str(ex)[:500]}
