# nsr-api routes for ENDF resonance parameters, File 2 and File 32 MT151 (brief 56), read per material from the Parquet
# that scripts/parse/endfb/parse.py --mf=2,32 writes under lake/endfb/<release>/{res_ranges,res_params,res_cov}/. Uses
# structure.py's DuckDB connection and its material index (lake/serve/endf/*/materials) for name -> MAT.
#   GET /endf/resonances?name=U-235&release=B-VIII.1&range=1   the energy ranges, the resolved resonances (at most
#                                     5,000 rows; &range= picks one range) and the unresolved averages
#   GET /endf/resonances/cov?name=Pu-240&release=B-VIII.1&matrix=1&range=1   MF32: per range the LCOMP and header, each
#                                     parameter's value and standard deviation, and with &matrix=1 the correlation
#                                     triples (LCOMP 2 as stored; LCOMP 0 and 1 converted from the covariance)
# resolved_band() answers /endf/cov's "resolved" section: the relative uncertainty of the elastic, capture or fission
# cross section per decade inside the resolved ranges, first order, from MF32's diagonal only.
import bisect
import json
import math

import structure as S

MAX_RES = 5000
MAX_UNC = 20000
MAX_MATRIX = 200000
FORMALISM = {(0, 0): "scattering radius only", (1, 1): "SLBW", (1, 2): "MLBW", (1, 3): "Reich-Moore",
             (1, 4): "Adler-Adler", (1, 7): "R-matrix limited", (2, 1): "unresolved", (2, 2): "unresolved"}


def lake(r, t):
    return f"read_parquet('{S.ENDFB}/{r}/{t}/*.parquet')"


def material(q):
    """(release, sublibrary, name, mat, file_name) from ?name=&release=&sub=, or (status, body) for an error."""
    if not q.get("name"):
        return 400, {"error": "name is required, e.g. /endf/resonances?name=U-235&release=B-VIII.1"}
    name = S.material_name(q["name"])
    sub = (q.get("sub") or q.get("sublibrary") or S.DEFAULT_SUB).strip().lower()
    r = S.release_of(q.get("release"))
    if not r or r not in S.RELEASES:
        return 404, {"error": f"release {q.get('release')} is not held; held: {', '.join(S.RELEASES)}"}
    m = S.records(f"SELECT mat, file_name FROM {S.table('materials')} WHERE release = ? AND sublibrary = ? "
                  "AND upper(name) = upper(?) ORDER BY liso, mat LIMIT 1", [r, sub, name])
    if not m:
        return 404, {"error": f"no {name} in {r} {sub}"}
    return r, sub, name, m[0]["mat"], m[0]["file_name"]


def range_of(q):
    try:
        return int(q["range"]) if q.get("range") not in (None, "") else None
    except ValueError:
        raise ValueError("range is a whole number, the range_index from ranges")


def jload(s):
    try:
        return json.loads(s) if s else None
    except ValueError:
        return None


def rml_sums(widths, pairs):
    """LRF 7: (gn, gg, gf, other) summed over the spin group's channels by their particle pair's MT (2 elastic, 102
    capture, 18 or 19 fission), from the channel widths in eV."""
    w = jload(widths) or {}
    mts = (pairs or {}).get("MT") or []
    out = {"gn": 0.0, "gg": 0.0, "gf": 0.0, "gx": 0.0}
    for g, ch in zip(w.get("gam") or [], w.get("ch") or []):
        if g is None or not ch:
            continue
        ppi = int(ch[0]) if ch[0] is not None else 0
        mt = mts[ppi - 1] if 0 < ppi <= len(mts) else None
        k = "gn" if mt == 2 else "gg" if mt == 102 else "gf" if mt in (18, 19) else "gx"
        out[k] += abs(g)
    return out


def resonances(q):
    m = material(q)
    if len(m) == 2:
        return m
    r, sub, name, mat, fname = m
    pick = range_of(q)
    ranges = S.records(f"SELECT * EXCLUDE (release, sublibrary, file_name) FROM {lake(r, 'res_ranges')} "
                       "WHERE mat = ? AND file_name = ? ORDER BY range_index", [mat, fname])
    out = {"name": name, "release": r, "sublibrary": sub, "mat": mat, "ranges": [], "resonances": [], "unresolved": []}
    if not ranges:
        out["note"] = f"{r} has no File 2 for {name}"
        return 200, out
    pairs = {}
    for x in ranges:
        p = jload(x.pop("params")) or {}
        if x["lrf"] == 7:
            pairs[x["range_index"]] = {k: p.get(k) for k in ("MA", "MB", "ZA", "ZB", "IA", "IB", "Q", "PNT", "SHF", "MT", "PA", "PB")}
            x["particle_pairs"] = pairs[x["range_index"]]
            x["spin_groups"] = p.get("spin_groups")
        x["formalism"] = FORMALISM.get((x["lru"], x["lrf"]), f"LRU {x['lru']} LRF {x['lrf']}")
        x["ap_table"] = jload(x["ap_table"])
        out["ranges"].append({k: v for k, v in x.items() if v is not None})
    where, params = ["mat = ?", "file_name = ?"], [mat, fname]
    if pick is not None:
        where.append("range_index = ?"); params.append(pick)
    w = " AND ".join(where)
    res = S.records(f"SELECT range_index, lrf, l, j, er_ev, gt_ev, gn_ev, gg_ev, gf_ev, gfa_ev, gfb_ev, widths, params "
                    f"FROM {lake(r, 'res_params')} WHERE {w} AND NOT unresolved ORDER BY range_index, er_ev "
                    f"LIMIT {MAX_RES + 1}", params)
    out["truncated"] = len(res) > MAX_RES
    for x in res[:MAX_RES]:
        if x["lrf"] == 3 and x["gf_ev"] is None and (x["gfa_ev"] is not None or x["gfb_ev"] is not None):
            x["gf_ev"] = abs(x["gfa_ev"] or 0) + abs(x["gfb_ev"] or 0)  # Reich-Moore's two fission channels
        if x["lrf"] == 7:
            s = rml_sums(x["widths"], pairs.get(x["range_index"]))
            x.update(gn_ev=s["gn"], gg_ev=s["gg"], gf_ev=s["gf"] or None, gx_ev=s["gx"] or None, widths=jload(x["widths"]))
        x["params"] = jload(x["params"])
        out["resonances"].append({k: v for k, v in x.items() if v is not None})
    out["unresolved"] = [{k: v for k, v in x.items() if v is not None} for x in S.records(
        f"SELECT range_index, lrf, l, j, es_ev, d_ev, amun, amux, amug, amuf, gn0_ev, gg_ev, gf_ev, gx_ev "
        f"FROM {lake(r, 'res_params')} WHERE {w} AND unresolved ORDER BY range_index, l, j, es_ev", params)]
    out["units"] = {"energy": "eV", "widths": "eV", "ap": "10^-12 cm"}
    return 200, out


def cov(q):
    m = material(q)
    if len(m) == 2:
        return m
    r, sub, name, mat, fname = m
    pick = range_of(q)
    where, params = ["mat = ?", "file_name = ?"], [mat, fname]
    if pick is not None:
        where.append("range_index = ?"); params.append(pick)
    w = " AND ".join(where)
    heads = S.records(f"SELECT range_index, el_ev, eh_ev, lru, lrf, lcomp, isr, dap, params FROM {lake(r, 'res_cov')} "
                      f"WHERE {w} AND block = 'range' ORDER BY range_index", params)
    out = {"name": name, "release": r, "sublibrary": sub, "mat": mat, "ranges": [], "uncertainties": []}
    if not heads:
        out["note"] = f"{r} has no File 32 for {name}"
        return 200, out
    for h in heads:
        h["header"] = jload(h.pop("params"))
        h["formalism"] = FORMALISM.get((h["lru"], h["lrf"]), f"LRU {h['lru']} LRF {h['lrf']}")
        out["ranges"].append({k: v for k, v in h.items() if v is not None})
    unc = S.records(f"SELECT range_index, row_param AS param, row_name AS name, row_er_ev AS er_ev, l, j, "
                    f"row_value AS value, value AS sd FROM {lake(r, 'res_cov')} WHERE {w} AND block = 'unc' "
                    f"ORDER BY range_index, row_param LIMIT {MAX_UNC + 1}", params)
    out["uncertainties_truncated"] = len(unc) > MAX_UNC
    for x in unc[:MAX_UNC]:
        x["rel"] = abs(x["sd"] / x["value"]) if x["sd"] is not None and x["value"] else None
        out["uncertainties"].append({k: v for k, v in x.items() if v is not None})
    if q.get("matrix") in ("1", "true", "yes"):
        sd = {(x["range_index"], x["param"]): x["sd"] for x in unc}
        rows = S.records(f"SELECT range_index, block, row_param, col_param, value FROM {lake(r, 'res_cov')} "
                         f"WHERE {w} AND block IN ('corr', 'cov') AND row_param <> col_param "
                         f"ORDER BY range_index, row_param, col_param LIMIT {MAX_MATRIX + 1}", params)
        trip = []
        for x in rows[:MAX_MATRIX]:
            if x["block"] == "corr":
                trip.append([x["range_index"], x["row_param"], x["col_param"], x["value"]])
                continue
            a, b = sd.get((x["range_index"], x["row_param"])), sd.get((x["range_index"], x["col_param"]))
            if a and b:
                trip.append([x["range_index"], x["row_param"], x["col_param"], round(x["value"] / (a * b), 6)])
        out["matrix"] = {"columns": ["range_index", "i", "j", "corr"], "rows": trip, "truncated": len(rows) > MAX_MATRIX,
                         "note": "off-diagonal correlations, the diagonal being 1; LCOMP 2 as stored (NDIGIT digits), "
                                 "LCOMP 0 and 1 divided by the two standard deviations"}
    out["units"] = {"energy": "eV", "sd": "the parameter's own unit", "rel": "fraction"}
    return 200, out


# ---------- /endf/cov's resolved-range band (brief 56, Part B.5) ----------
BAND_MTS = {2: "elastic", 18: "fission", 102: "capture"}


def peak_rel(mt, er, gn, gg, gf, d_er, d_gn, d_gg, d_gf, gt=None):
    """The relative standard deviation of the cross section at the resonance's peak, first order, the parameters taken
    as uncorrelated: Breit-Wigner at E = Er, sigma ~ g/Er * Gn*Gx / G^2 (capture x = gamma, fission x = f) and
    Gn^2 / G^2 for the resonance part of elastic, G = Gn + Gg + Gf (GT where the file gives it). Also its weight, the
    resonance's area ~ g/Er * Gn*Gx / G, for adding resonances within a group. None when the cross section is zero."""
    G = gt if gt else gn + gg + gf
    if G <= 0 or er <= 0 or gn <= 0:
        return None
    if mt == 102:
        if gg <= 0:
            return None
        s = [(d_gn, 1 / gn - 2 / G), (d_gg, 1 / gg - 2 / G), (d_gf, -2 / G)]
        area = gn * gg / G
    elif mt == 18:
        if gf <= 0:
            return None
        s = [(d_gn, 1 / gn - 2 / G), (d_gf, 1 / gf - 2 / G), (d_gg, -2 / G)]
        area = gn * gf / G
    else:
        s = [(d_gn, 2 / gn - 2 / G), (d_gg, -2 / G), (d_gf, -2 / G)]
        area = gn * gn / G
    var = sum((d * k) ** 2 for d, k in s if d) + ((d_er or 0) / er) ** 2
    return math.sqrt(var), area / er


def resolved_band(r, name, sub, mt, emin, emax):
    """For /endf/cov: per decade inside each resolved range with MF32, the relative uncertainty of the MT's cross
    section: each resonance's peak uncertainty, averaged over the group weighted by the resonances' areas (rel_sd, the
    bound for resonances fully correlated with each other), and added in quadrature (rel_sd_uncorrelated, the bound for
    independent resonances, which shrinks as 1/sqrt(N))."""
    out = {"method": "mf32-diagonal-first-order", "mt": mt, "groups": [], "ranges": []}
    if mt not in BAND_MTS:
        out["note"] = f"MT {mt} is not one of elastic (2), fission (18) or capture (102)"
        return out
    m = S.records(f"SELECT mat, file_name FROM {S.table('materials')} WHERE release = ? AND sublibrary = ? "
                  "AND upper(name) = upper(?) ORDER BY liso, mat LIMIT 1", [r, sub, name])
    if not m:
        out["note"] = f"no {name} in {r} {sub}"
        return out
    mat, fname = m[0]["mat"], m[0]["file_name"]
    try:
        unc = S.records(f"SELECT range_index, el_ev, eh_ev, lrf, lcomp, row_param, row_name, row_er_ev, j, row_value, value "
                        f"FROM {lake(r, 'res_cov')} WHERE mat = ? AND file_name = ? AND lru = 1 AND block = 'unc' "
                        "ORDER BY range_index, row_param", [mat, fname])
        spi = S.records(f"SELECT el_ev, eh_ev, spi FROM {lake(r, 'res_ranges')} WHERE mat = ? AND file_name = ? AND lru = 1",
                        [mat, fname])
    except Exception as e:  # noqa: BLE001  a release whose File 32 tables are not built yet
        out["note"] = f"{r}: File 32 tables not readable ({str(e)[:120]})"
        return out
    if not unc:
        out["note"] = f"{r} has no File 32 resolved-range uncertainties for {name}"
        return out
    spins = {(round(x["el_ev"], 6), round(x["eh_ev"], 6)): x["spi"] for x in spi}
    res, skipped = [], set()
    cur = None
    for x in unc:  # one resonance = the run of parameters from an ER to the next
        if x["lrf"] == 7 or x["lrf"] == 4:
            skipped.add(x["lrf"])
            continue
        if x["row_name"] == "ER" or cur is None or cur["range_index"] != x["range_index"]:
            cur = {"range_index": x["range_index"], "el": x["el_ev"], "eh": x["eh_ev"], "er": x["row_er_ev"], "j": x["j"],
                   "v": {}, "d": {}}
            res.append(cur)
        cur["v"][x["row_name"]] = x["row_value"]
        cur["d"][x["row_name"]] = x["value"]
    edges_by_range = {}
    for c in res:
        key = (c["range_index"], c["el"], c["eh"])
        if key not in edges_by_range:
            lo, hi = max(c["el"] or 1e-5, 1e-5), c["eh"]
            if emin is not None:
                lo = max(lo, emin)
            if emax is not None:
                hi = min(hi, emax)
            dec = [lo] + [10.0 ** k for k in range(math.floor(math.log10(lo)) + 1, math.ceil(math.log10(hi)))] + [hi]
            edges_by_range[key] = [e for i, e in enumerate(dec) if i == 0 or e > dec[i - 1]] if hi > lo else []
            out["ranges"].append({"range_index": c["range_index"], "el_ev": c["el"], "eh_ev": c["eh"],
                                  "spi": spins.get((round(c["el"], 6), round(c["eh"], 6)))})
    bins = {}
    for c in res:
        key = (c["range_index"], c["el"], c["eh"])
        edges = edges_by_range[key]
        er = c["er"]
        if not edges or er is None or er < edges[0] or er >= edges[-1]:
            continue
        v, d = c["v"], c["d"]
        gf = v.get("GF")
        gf = abs(gf) if gf is not None else abs(v.get("GFA") or 0) + abs(v.get("GFB") or 0)
        dgf = d.get("GF") if "GF" in d else math.hypot(d.get("GFA") or 0, d.get("GFB") or 0)
        p = peak_rel(mt, er, abs(v.get("GN") or 0), abs(v.get("GG") or 0), gf, d.get("ER"), d.get("GN"), d.get("GG"), dgf)
        if p is None:
            continue
        sp = spins.get((round(c["el"], 6), round(c["eh"], 6)))
        g = (2 * abs(c["j"]) + 1) / (2 * (2 * sp + 1)) if c["j"] is not None and sp is not None else 1.0
        k = bisect.bisect_right(edges, er) - 1
        b = bins.setdefault((edges[k], edges[k + 1]), {"num": 0.0, "lin": 0.0, "den": 0.0, "rels": []})
        w = p[1] * g
        b["num"] += (w * p[0]) ** 2
        b["lin"] += w * p[0]
        b["den"] += w
        b["rels"].append(p[0])
    for (lo, hi), b in sorted(bins.items()):
        rels = sorted(b["rels"])
        out["groups"].append({"e_lo_ev": lo, "e_hi_ev": hi, "rel_sd": b["lin"] / b["den"] if b["den"] else None,
                              "rel_sd_uncorrelated": math.sqrt(b["num"]) / b["den"] if b["den"] else None,
                              "n_resonances": len(rels), "rel_sd_median": rels[len(rels) // 2]})
    notes = ["the diagonal of the parameter covariance only, no correlations; each resonance's cross section at its "
             "peak (Breit-Wigner); rel_sd averages them over the group weighted by the resonances' areas, "
             "rel_sd_uncorrelated adds them in quadrature; a zero uncertainty in the file counts as zero"]
    if skipped:
        notes.append(f"LRF {sorted(skipped)} ranges not converted")
    out["note"] = "; ".join(notes)
    return out


def route(path, q):
    q = q or {}
    p = path.rstrip("/")
    try:
        if p == "/endf/resonances":
            return resonances(q)
        if p == "/endf/resonances/cov":
            return cov(q)
        return 404, {"error": "routes: /endf/resonances, /endf/resonances/cov"}
    except (ValueError, S.duckdb.Error) as e:
        return 400, {"error": str(e)[:500]}
