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


def route(path, q):
    q = q or {}
    p = path.rstrip("/")
    try:
        if p == "/endf/section":
            return section(q)
        if p == "/endf/section/laws":
            return laws(q)
        return 404, {"error": "routes: /endf/section, /endf/section/laws"}
    except (ValueError, duckdb.Error) as ex:
        return 400, {"error": str(ex)[:500]}
