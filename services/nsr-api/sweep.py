# nsr-api routes for the sweep (brief 57): every measured cross section in EXFOR against every evaluation, the
# retrodiction, the ENDF/B-VIII.1 list, the flags and the medical-isotope routes. lambda_function.py sends every path
# starting /sweep here (MODULES). The tables are small, so each loads into memory from
# s3://nsr-lake-613473203863/lake/sweep/2026-11-10/<table>/ the first time a route needs it (structure.py's DuckDB).
#   GET /sweep?release=B-VIII.1&sort=z|mean|support|bin&dir=desc&nuclide=U-235&mt=18&sub=neutrons&min_datasets=2&page=1
#            the ranked list: pairs with support (>= 2 datasets and >= 20 points without the driver), 100 a page;
#            &all=1 every pair compared; &single=1 the pairs one dataset drives (support fails, it disagrees by > 3 z)
#   GET /sweep/pair?target=U-235&mt=18&sub=neutrons&release=B-VIII.1,JEFF-3.3    the bins and datasets per release
#   GET /sweep/releases                the releases, sublibraries and counts, the run date, the method
#   GET /sweep/retrodiction            { summary, rows }: the VIII.0 ranking against what VIII.1 changed (500 rows)
#   GET /sweep/flags?kind=exfor&rule=b { evaluation, exfor }: VIII.1 entries no public list names; mislabelled EXFOR
#   GET /sweep/medical                 the medical-isotope production routes, a yield and a verdict each
#   GET /sweep/medical/{route}         one route: its points by source, the yield table, the bins, the verdict
import json
import math
import os

from structure import con, material_name

BUCKET = os.environ.get("BUCKET", "nsr-lake-613473203863")
SWEEP_DATE = os.environ.get("SWEEP_DATE", "2026-11-10")
SWEEP = f"s3://{BUCKET}/lake/sweep/{SWEEP_DATE}"
PAGE = 100
RELEASES = ["B-VIII.1", "B-VIII.0", "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2"]
SUBS = ["neutrons", "protons", "deuterons", "tritons", "helium3s", "alphas", "gammas"]
SORTS = {"z": "z", "mean": "abs(mean_log_ratio)", "support": "support_points", "bin": "max_bin_z",
         "points": "n_points", "datasets": "n_datasets"}
_loaded = set()
_json = {}


def table(name):
    """Load lake/sweep/<date>/<name>/ into memory once per container, as sweep_<name>."""
    t = f"sweep_{name}"
    if t not in _loaded:
        con().execute(f"CREATE OR REPLACE TABLE {t} AS SELECT * FROM read_parquet('{SWEEP}/{name}/*.parquet')")
        _loaded.add(t)
    return t


def s3json(key):
    if key not in _json:
        import boto3
        body = boto3.client("s3").get_object(Bucket=BUCKET, Key=f"lake/sweep/{SWEEP_DATE}/{key}")["Body"].read()
        _json[key] = json.loads(body)
    return _json[key]


def clean(v):
    if isinstance(v, float):
        return v if math.isfinite(v) else None
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    if isinstance(v, list):
        return [clean(x) for x in v]
    return v


def rows(sql, params=()):
    cur = con().cursor().execute(sql, list(params))
    names = [d[0] for d in cur.description]
    return [clean(dict(zip(names, r))) for r in cur.fetchall()]


def lab_of(r, releases):
    lo, hi = r.get("e_min_ev"), r.get("e_max_ev")
    return {"target": r["target"], "reaction": r.get("exfor_reaction"), "label": r.get("reaction"), "mt": r["mt"],
            "sub": r["sublibrary"], "emin": lo, "emax": hi, "releases": releases}


def target_filter(q, where, params):
    n = q.get("nuclide") or q.get("target")
    if n:
        where.append("lower(target) = lower(?)")
        params.append(material_name(n))
    if q.get("mt"):
        where.append("mt = ?")
        params.append(int(q["mt"]))
    sub = (q.get("sub") or q.get("sublibrary") or "").strip().lower()
    if sub:
        if sub not in SUBS:
            raise ValueError(f"sub is one of {', '.join(SUBS)}")
        where.append("sublibrary = ?")
        params.append(sub)


def ranked(q):
    rel = (q.get("release") or "B-VIII.1").strip()
    if rel not in RELEASES:
        return 400, {"error": f"release is one of {', '.join(RELEASES)}"}
    single = q.get("single") in ("1", "true")
    src = table("single") if single else table("summary")
    where, params = (["release = ?"], [rel]) if not single else ([], [])
    if single and rel != "B-VIII.1":
        return 400, {"error": "the single-dataset list is for B-VIII.1"}
    supported = "support_datasets >= 2 AND support_points >= 20"
    if not single and q.get("all") not in ("1", "true"):
        where.append(supported)
    target_filter(q, where, params)
    if q.get("min_datasets"):
        where.append("n_datasets >= ?")
        params.append(int(q["min_datasets"]))
    if q.get("driver"):
        where.append("driver_dataset = ?")
        params.append(q["driver"])
    sort = SORTS.get(q.get("sort") or "z")
    if single and (q.get("sort") or "z") == "z":
        sort = "single_z"
    if not sort:
        return 400, {"error": f"sort is one of {', '.join(SORTS)}"}
    d = "ASC" if (q.get("dir") or "desc").lower() == "asc" else "DESC"
    page = max(1, int(q.get("page") or 1))
    w = " AND ".join(where) or "true"
    total = rows(f"SELECT count(*) n FROM {src} WHERE {w}", params)[0]["n"]
    # rank: the place in the list (support rule, by z) whatever the sort and filter
    rank = ("row_number() OVER (ORDER BY single_z DESC, key)" if single else
            f"CASE WHEN {supported} THEN row_number() OVER (PARTITION BY ({supported}) ORDER BY z DESC, key) END")
    base = f"SELECT *, {rank} AS rank FROM {src}" + ("" if single else " WHERE release = ?")
    out = rows(f"SELECT * FROM ({base}) WHERE {w} ORDER BY {sort} {d} NULLS LAST, key LIMIT {PAGE} OFFSET {(page - 1) * PAGE}",
               ([] if single else [rel]) + params)
    keep = ["rank", "target_za", "liso", "target", "sublibrary", "mt", "reaction", "exfor_reaction", "n_points",
            "n_datasets", "n_bins", "mean_log_ratio", "mean_ratio", "weighted_log_ratio", "se", "z", "max_bin_dev",
            "max_bin_e_ev", "max_bin_z", "rel_sd_eval", "mf33", "cov_lumped", "driver_dataset", "driver_effect",
            "driver_points", "support_points", "support_datasets", "z_without_driver", "comparator",
            "comparator_floor_ev", "floor_method", "e_min_ev", "e_max_ev", "single_dataset", "single_points",
            "single_log_ratio", "single_se", "single_z"]
    res = []
    for r in out:
        x = {k: r[k] for k in keep if k in r}
        x["supported"] = bool(r["support_datasets"] >= 2 and r["support_points"] >= 20)
        x["lab"] = lab_of(r, [rel] + [o for o in ("JEFF-3.3", "JENDL-5", "TENDL-2023") if o != rel][:2])
        res.append(x)
    return 200, {"release": rel, "list": "single" if single else ("all" if q.get("all") in ("1", "true") else "supported"),
                 "total": total, "page": page, "page_size": PAGE, "sort": q.get("sort") or "z", "dir": d.lower(),
                 "rows": res}


def pair(q):
    if not (q.get("target") or q.get("nuclide")) or not q.get("mt"):
        return 400, {"error": "target and mt are required, e.g. /sweep/pair?target=U-235&mt=18&sub=neutrons"}
    where, params = [], []
    target_filter({**q, "sub": q.get("sub") or "neutrons"}, where, params)
    want = [r.strip() for r in (q.get("release") or ",".join(RELEASES)).split(",") if r.strip()]
    bad = [r for r in want if r not in RELEASES]
    if bad:
        return 400, {"error": f"release is one or more of {', '.join(RELEASES)}"}
    w = " AND ".join(where)
    pa = rows(f"SELECT * FROM {table('pairs_all')} WHERE {w}", params)
    if not pa:
        return 404, {"error": "no EXFOR cross sections compared for this pair", "hint": "try /sweep?nuclide=" +
                     material_name(q.get("target") or q.get("nuclide"))}
    p = pa[0]
    out = []
    for rel in want:
        s = rows(f"SELECT * FROM {table('summary')} WHERE release = ? AND key = ?", [rel, p["key"]])
        b = rows(f"SELECT bin, e_lo_ev, e_hi_ev, n_points, n_datasets, mean_log_ratio, se, mean_ratio, rel_sd_eval, z "
                 f"FROM {table('bins')} WHERE release = ? AND key = ? ORDER BY bin", [rel, p["key"]])
        d = rows(f"SELECT dataset, entry, author, year, n_points, mean_log_ratio, se, median_rel_unc, median_ratio, "
                 f"e_min_ev, e_max_ev FROM {table('datasets')} WHERE release = ? AND key = ? ORDER BY n_points DESC",
                 [rel, p["key"]])
        out.append({"release": rel, "held": bool(s), "summary": s[0] if s else None, "bins": b, "datasets": d})
    held = {k[5:]: v for k, v in p.items() if k.startswith("held_")}
    return 200, {"target": p["target"], "target_za": p["target_za"], "sublibrary": p["sublibrary"], "mt": p["mt"],
                 "reaction": p["reaction"], "exfor_reaction": p["exfor_reaction"], "n_points": p["n_points"],
                 "n_datasets": p["n_datasets"], "e_min_ev": p["e_min_ev"], "e_max_ev": p["e_max_ev"], "held": held,
                 "lab": lab_of(p, want), "releases": out}


def releases():
    m = s3json("manifest.json")
    return 200, {k: m.get(k) for k in ("run_date", "releases", "counts", "method", "check", "tables", "spend",
                                         "public_lists", "iaea_pages", "timings", "left_out")}


def retrodiction():
    summ = s3json("retrodiction/summary.json")
    return 200, {"summary": summ, "rows": rows(f"SELECT * FROM {table('retrodiction')} ORDER BY rank LIMIT 500")}


def flags(q):
    kind = (q.get("kind") or "").lower()
    out = {}
    if kind in ("", "evaluation"):
        out["evaluation"] = rows(f"SELECT * FROM {table('flags')} ORDER BY rank")
        out["public_list"] = rows(f"SELECT source_url, count(*) n FROM {table('public_list')} GROUP BY 1 ORDER BY 1")
    if kind in ("", "exfor"):
        where, params = [], []
        if q.get("rule"):
            where.append("rule = ?")
            params.append(q["rule"].lower())
        out["exfor"] = rows(f"SELECT * FROM {table('exfor_flags')} WHERE {' AND '.join(where) or 'true'} "
                            "ORDER BY rule, subentry", params)
    return 200, out


def medical(name):
    t = table("medical_routes")
    if not name:
        return 200, {"rows": rows(f"SELECT * FROM {t} ORDER BY product, route")}
    r = rows(f"SELECT * FROM {t} WHERE route = ?", [name])
    if not r:
        return 404, {"error": f"no route {name}; GET /sweep/medical lists them"}
    pts = rows(f"SELECT source, dataset, e_ev, xs_b, dxs_b FROM {table('medical_points')} WHERE route = ? "
               "ORDER BY source, dataset, e_ev", [name])
    by = {}
    for p in pts:
        by.setdefault(p["source"], []).append(p)
    series = [{"source": s, "points": len(v), "e_ev": [p["e_ev"] for p in v], "xs_b": [p["xs_b"] for p in v],
               "dxs_b": [p["dxs_b"] for p in v], "dataset": [p["dataset"] for p in v] if s == "EXFOR" else None}
              for s, v in by.items()]
    return 200, {"route": r[0], "series": series}


def route(path, q):
    q = q or {}
    p = path.rstrip("/")
    try:
        if p == "/sweep":
            return ranked(q)
        if p == "/sweep/pair":
            return pair(q)
        if p == "/sweep/releases":
            return releases()
        if p == "/sweep/retrodiction":
            return retrodiction()
        if p == "/sweep/flags":
            return flags(q)
        if p == "/sweep/medical":
            return medical(None)
        if p.startswith("/sweep/medical/"):
            return medical(p[len("/sweep/medical/"):])
        return 404, {"error": "routes: /sweep, /sweep/pair, /sweep/releases, /sweep/retrodiction, /sweep/flags, "
                              "/sweep/medical, /sweep/medical/{route}"}
    except ValueError as e:
        return 400, {"error": str(e)[:500]}
    except Exception as e:  # noqa: BLE001 — a missing table answers plainly rather than 500
        msg = str(e)
        if "No files found" in msg or "NoSuchKey" in msg or "does not exist" in msg:
            return 404, {"error": "that part of the sweep is not published yet", "detail": msg[:300]}
        raise
