# nsr-api routes for the evaluated libraries' MF8 tables (brief 56, Part C.2), read per material from the Parquet that
# scripts/parse/endfb/parse.py --mf=8,33 wrote under lake/endfb/<release>/{fy,decay,decay_modes,decay_lines}/, and the
# decay sublibraries' half-lives against ENSDF (nsr.endf_decay_vs_ensdf, lake/endfb/_compare/decay_vs_ensdf/).
# Uses structure.py's DuckDB connection and material index (name -> MAT per release and sublibrary).
#   GET /endf/fy?name=U-235&release=B-VIII.1&mt=454&energy_ev=0.0253   fission product yields (MT 454 independent,
#                                     459 cumulative; nfy, or &sub=sfy for spontaneous fission) at the incident energy
#                                     nearest energy_ev (the first when not given), with every energy the file holds
#   GET /endf/decay?name=Co-60&release=B-VIII.1     MT457: the decay row, its modes and its lines (at most 5,000)
#   GET /endf/decay-vs-ensdf?release=B-VIII.1&sort=sigmas|rel_diff&note=   each library half-life against ENSDF's
import structure as S

ENDF_RELEASES = [r for r in S.RELEASES]
CMP = f"{S.ENDFB}/_compare/decay_vs_ensdf"
MAX_LINES = 5000
MAX_ROWS = 5000
SYM = ("n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr "
       "Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt "
       "Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc "
       "Lv Ts Og").split()


def za_name(za, state=0):
    """ZA (and isomeric state) -> Sym-A[m]."""
    try:
        za = int(round(float(za)))
    except (TypeError, ValueError):
        return None
    z, a = divmod(za, 1000)
    s = SYM[z] if 0 <= z < len(SYM) else str(z)
    st = int(round(float(state or 0)))
    return f"{s}-{a}" + ("m" if st == 1 else f"m{st}" if st > 1 else "")


def find(q, default_sub):
    if not q.get("name"):
        return 400, {"error": "name is required"}
    name = S.material_name(q["name"])
    sub = (q.get("sub") or q.get("sublibrary") or default_sub).strip().lower()
    r = S.release_of(q.get("release"))
    if not r or r not in ENDF_RELEASES:
        return 404, {"error": f"release {q.get('release')} is not held; held: {', '.join(ENDF_RELEASES)}"}
    m = S.records(f"SELECT mat, file_name FROM {S.table('materials')} WHERE release = ? AND sublibrary = ? "
                  "AND upper(name) = upper(?) ORDER BY liso, mat LIMIT 1", [r, sub, name])
    if not m:
        return 404, {"error": f"no {name} in {r} {sub}"}
    return r, sub, name, m[0]["mat"], m[0]["file_name"]


def fy(q):
    f = find(q, "nfy")
    if len(f) == 2:
        return f
    r, sub, name, mat, fname = f
    try:
        mt = int(q.get("mt") or 454)
    except ValueError:
        return 400, {"error": "mt is 454 (independent) or 459 (cumulative)"}
    if mt not in (454, 459):
        return 400, {"error": "mt is 454 (independent) or 459 (cumulative)"}
    src = f"read_parquet('{S.ENDFB}/{r}/fy/*.parquet')"
    es = S.records(f"SELECT DISTINCT energy_seq, energy_ev FROM {src} WHERE mat = ? AND file_name = ? AND mt = ? "
                   "ORDER BY energy_seq", [mat, fname, mt])
    out = {"name": name, "release": r, "sublibrary": sub, "mat": mat, "mt": mt,
           "kind": "independent" if mt == 454 else "cumulative", "energies": [e["energy_ev"] for e in es], "products": []}
    if not es:
        out["note"] = f"{r} {sub} holds no MT {mt} for {name}"
        return 200, out
    pick = es[0]
    if q.get("energy_ev") not in (None, ""):
        target = S.ev_of(q, "energy_ev")
        pick = min(es, key=lambda e: abs((e["energy_ev"] or 0) - target))
    out["energy_ev"] = pick["energy_ev"]
    rows = S.records(f"SELECT zafp, fps, yield, yield_unc FROM {src} WHERE mat = ? AND file_name = ? AND mt = ? "
                     "AND energy_seq = ? ORDER BY zafp, fps", [mat, fname, mt, pick["energy_seq"]])
    for x in rows:
        x["product"] = za_name(x["zafp"], x["fps"])
    out["products"] = rows
    out["sum_yield"] = sum(x["yield"] or 0 for x in rows)
    return 200, out


def decay(q):
    f = find(q, "decay")
    if len(f) == 2:
        return f
    r, sub, name, mat, fname = f
    base = f"{S.ENDFB}/{r}"
    d = S.records(f"SELECT * EXCLUDE (release, sublibrary, file_name) FROM read_parquet('{base}/decay/*.parquet') "
                  "WHERE mat = ? AND file_name = ?", [mat, fname])
    out = {"name": name, "release": r, "sublibrary": sub, "mat": mat, "decay": d[0] if d else None, "modes": [], "lines": []}
    if not d:
        out["note"] = f"{r} {sub} holds no MT457 for {name}"
        return 200, out
    out["modes"] = S.records(f"SELECT mode_seq, rtyp, rfs, q_ev, q_unc, br, br_unc FROM read_parquet('{base}/decay_modes/*.parquet') "
                             "WHERE mat = ? AND file_name = ? ORDER BY mode_seq", [mat, fname])
    lines = S.records(f"SELECT * EXCLUDE (release, sublibrary, file_name, mat) FROM read_parquet('{base}/decay_lines/*.parquet') "
                      f"WHERE mat = ? AND file_name = ? ORDER BY spectrum_seq, line_seq LIMIT {MAX_LINES + 1}", [mat, fname])
    out["lines_truncated"] = len(lines) > MAX_LINES
    out["lines"] = [{k: v for k, v in x.items() if v is not None} for x in lines[:MAX_LINES]]
    out["units"] = {"half_life": "s", "energy": "eV"}
    return 200, out


SORTS = {"sigmas": "sigmas DESC NULLS LAST", "rel_diff": "abs(rel_diff) DESC NULLS LAST"}


def vs_ensdf(q):
    sort = SORTS.get(q.get("sort") or "sigmas")
    if not sort:
        return 400, {"error": "sort is sigmas or rel_diff"}
    src = f"read_parquet('{CMP}/*')"
    where, params = [], []
    if q.get("release"):
        r = S.release_of(q["release"])
        if not r:
            return 404, {"error": f"release {q['release']} is not held"}
        where.append("release = ?"); params.append(r)
    if q.get("note"):
        where.append("note = ?"); params.append(q["note"])
    w = ("WHERE " + " AND ".join(where)) if where else ""
    rows = S.records(f"SELECT * FROM {src} {w} ORDER BY {sort}, release, za, liso LIMIT {MAX_ROWS + 1}", params)
    for x in rows:
        x["name"] = za_name(x.get("za"), x.get("liso"))
    counts = S.records(f"SELECT release, note, count(*) AS n FROM {src} GROUP BY release, note ORDER BY release, note")
    by = {}
    for c in counts:
        by.setdefault(c["release"], {})[c["note"]] = c["n"]
    return 200, {"rows": rows[:MAX_ROWS], "truncated": len(rows) > MAX_ROWS, "counts_by_release_and_note": by,
                 "units": {"half_life": "s", "rel_diff": "(library - ENSDF) / ENSDF", "sigmas": "|difference| over the "
                           "two stated uncertainties added in quadrature"}}


def route(path, q):
    q = q or {}
    p = path.rstrip("/")
    try:
        if p == "/endf/fy":
            return fy(q)
        if p == "/endf/decay":
            return decay(q)
        if p == "/endf/decay-vs-ensdf":
            return vs_ensdf(q)
        return 404, {"error": "routes: /endf/fy, /endf/decay, /endf/decay-vs-ensdf"}
    except (ValueError, S.duckdb.Error) as e:
        return 400, {"error": str(e)[:500]}
