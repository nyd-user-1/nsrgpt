# nsr-api routes for ICRP Publication 107 (2008, with the 2022 corrigenda; brief 48's tables under lake/icrp107/2008/,
# Athena nsr.icrp107_*), brief 56 Part C.2. The tables are small and load into structure.py's DuckDB on first use.
#   GET /icrp/nuclide/{name}       the nuclide row (half-life, decay modes, mean energies, kerma) and its daughters
#   GET /icrp/radiations/{name}    every emission: type, yield per transformation, energy (MeV); &type=G,X,B-… filters
#   GET /icrp/chain/{name}         the chain walked through the daughters to stable nuclides, with branching fractions
#                                  and each member's probability of being reached
#   GET /icrp/vs-ensdf?sort=sigmas|rel_diff&note=&isomer=   ICRP 107's half-lives against ENSDF 2026-11-05's
#                                  (nsr.icrp107_vs_ensdf, 1,246 rows)
# {name}: Ac-225, ac225, 225Ac, Tc-99m.
import re

import structure as S

ICRP = f"s3://{S.BUCKET}/lake/icrp107/2008"
TABLES = ("nuclides", "daughters", "radiations", "vs_ensdf")
_loaded = set()


def table(t):
    if t not in _loaded:
        S.con().execute(f"CREATE OR REPLACE TABLE icrp_{t} AS SELECT * FROM read_parquet('{ICRP}/{t}/*')")
        _loaded.add(t)
    return f"icrp_{t}"


def canon(name):
    """Ac-225, ac225, 225Ac, 225-Ac, Tc-99m, 99mTc -> ICRP 107's own form (Ac-225, Tc-99m)."""
    t = re.sub(r"[\s_]", "", name or "")
    m = re.fullmatch(r"(\d{1,3})(m\d?)?-?([A-Za-z]{1,2})", t)
    if m:
        t = f"{m.group(3)}-{m.group(1)}{m.group(2) or ''}"
    return S.material_name(t)


def nuclide_row(name):
    rows = S.records(f"SELECT * FROM {table('nuclides')} WHERE upper(nuclide) = upper(?)", [canon(name)])
    return rows[0] if rows else None


def nuclide(name):
    n = nuclide_row(name)
    if not n:
        return 404, {"error": f"{canon(name)} is not one of ICRP 107's 1,252 nuclides"}
    d = S.records(f"SELECT slot, daughter, daughter_stable, branching_fraction, mode FROM {table('daughters')} "
                  "WHERE parent = ? ORDER BY slot", [n["nuclide"]])
    return 200, {"nuclide": n, "daughters": d, "source": "ICRP Publication 107 (2008), 2022 corrigenda"}


def radiations(name, q):
    n = nuclide_row(name)
    if not n:
        return 404, {"error": f"{canon(name)} is not one of ICRP 107's 1,252 nuclides"}
    where, params = ["nuclide = ?"], [n["nuclide"]]
    if q.get("type"):
        types = [t.strip().upper() for t in q["type"].split(",") if t.strip()]
        where.append(f"upper(type) IN ({', '.join('?' * len(types))})"); params += types
    rows = S.records(f"SELECT seq, code, type, type_name, yield_per_transformation, energy_mev, is_photon "
                     f"FROM {table('radiations')} WHERE {' AND '.join(where)} ORDER BY seq", params)
    return 200, {"nuclide": n["nuclide"], "half_life": n["half_life"], "half_life_unit": n["half_life_unit"],
                 "radiations": rows, "units": {"energy": "MeV", "yield": "per nuclear transformation"}}


def chain(name):
    n = nuclide_row(name)
    if not n:
        return 404, {"error": f"{canon(name)} is not one of ICRP 107's 1,252 nuclides"}
    edges = S.records(f"SELECT parent, daughter, daughter_stable, branching_fraction, mode FROM {table('daughters')}")
    by = {}
    for e in edges:
        by.setdefault(e["parent"], []).append(e)
    reach = {n["nuclide"]: 1.0}
    order, links, seen = [n["nuclide"]], [], {n["nuclide"]}
    i = 0
    while i < len(order):  # breadth first; a chain in ICRP 107 has no loops
        p = order[i]
        i += 1
        for e in by.get(p, []):
            bf = e["branching_fraction"] or 0.0
            links.append({"parent": p, "daughter": e["daughter"], "branching_fraction": bf, "mode": e["mode"],
                          "daughter_stable": e["daughter_stable"]})
            reach[e["daughter"]] = reach.get(e["daughter"], 0.0) + reach[p] * bf
            if e["daughter"] not in seen:
                seen.add(e["daughter"])
                order.append(e["daughter"])
    info = {x["nuclide"]: x for x in S.records(
        f"SELECT nuclide, half_life, half_life_unit, half_life_s, decay_modes FROM {table('nuclides')} "
        f"WHERE nuclide IN ({', '.join('?' * len(order))})", order)}
    stable = {l["daughter"] for l in links if l["daughter_stable"]}
    members = [{"nuclide": m, "probability": round(reach.get(m, 0.0), 8), "stable": m in stable,
                **{k: v for k, v in (info.get(m) or {}).items() if k != "nuclide"}} for m in order]
    return 200, {"head": n["nuclide"], "members": members, "links": links,
                 "note": "probability: the fraction of the head's decays that pass through the member, the branching "
                         "fractions multiplied along every path and added"}


SORTS = {"sigmas": "sigmas DESC NULLS LAST", "rel_diff": "abs(rel_diff) DESC NULLS LAST"}


def vs_ensdf(q):
    sort = SORTS.get(q.get("sort") or "sigmas")
    if not sort:
        return 400, {"error": "sort is sigmas or rel_diff"}
    where, params = [], []
    if q.get("note"):
        where.append("note = ?"); params.append(q["note"])
    if q.get("isomer") not in (None, ""):
        where.append("CAST(isomer AS varchar) = ?"); params.append(q["isomer"])
    w = ("WHERE " + " AND ".join(where)) if where else ""
    t = table("vs_ensdf")
    rows = S.records(f"SELECT * FROM {t} {w} ORDER BY {sort}, nuclide", params)
    counts = {c["note"]: c["n"] for c in S.records(f"SELECT note, count(*) AS n FROM {t} GROUP BY note ORDER BY note")}
    return 200, {"rows": rows, "counts_by_note": counts,
                 "units": {"half_life": "s", "rel_diff": "(ICRP - ENSDF) / ENSDF",
                           "sigmas": "|difference| over ENSDF's stated uncertainty"}}


def route(path, q):
    q = q or {}
    p = path.rstrip("/")
    try:
        if p == "/icrp/vs-ensdf":
            return vs_ensdf(q)
        m = re.fullmatch(r"/icrp/(nuclide|radiations|chain)/([^/]+)", p)
        if m:
            kind, name = m.group(1), m.group(2)
            return nuclide(name) if kind == "nuclide" else radiations(name, q) if kind == "radiations" else chain(name)
        return 404, {"error": "routes: /icrp/nuclide/{name}, /icrp/radiations/{name}, /icrp/chain/{name}, /icrp/vs-ensdf"}
    except (ValueError, S.duckdb.Error) as e:
        return 400, {"error": str(e)[:500]}
