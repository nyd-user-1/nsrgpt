"""Brief 57, Parts A to C: every measured cross section in EXFOR against every evaluation the lake holds, the retrodiction
(the ranking on ENDF/B-VIII.0 against what VIII.1 changed), the VIII.1 list and the flags. Runs on the sweep box
(scripts/sweep/box/), DuckDB 2.0.0 over the lake's Parquet, its working database at /data/sweep/sweep.duckdb so each step
can be rerun alone:
  cd /opt/sweep && HOME=/root venv/bin/python -I sweep.py load check run changes retro flags write
Method (the manifest carries the same text):
- Points: nsr.exfor_serve_points joined to the EXFOR search index; the quantity exactly ",SIG" (no SF5, SF7 or SF8
  modifier), the reaction field mapped to (sublibrary, MT) by reactions.py, a product either absent or the reaction's own
  residual (a product with a level or isomer flag is "state_specific": the evaluations' isomeric splits are MF8/MF10, not
  parsed), units "B" for the comparison (other units are kept for the EXFOR flags), cross section and energy positive.
- Comparators: ENDF/B-VIII.1 and VIII.0 neutrons from NNDC's POINT 293.6 K releases (File 2 reconstructed and broadened),
  their charged-particle and photon sublibraries from MF3; JEFF-3.3, JENDL-5, TENDL-2023 and CENDL-3.2 from MF3, neutrons
  only above each material's resonance range (the largest upper energy of its MF2 resolved ranges, and of its unresolved
  ranges unless LSSF = 1, where MF3 already holds the unresolved average), every other sublibrary at every energy.
- Each point divided by the comparator at its energy, interpolated by the section's own ENDF law (1 to 5; POINT is law 2
  throughout, so linear, as the Lab's compare.ts); null outside the comparator's grid. log(ratio) per point.
- Point weight 1/sigma^2, sigma the point's relative uncertainty (dxs/xs), else the dataset's median, else 10%; at least 1%.
- A dataset's mean log ratio is its points' weighted mean; its standard error is the larger of the weighted mean's (scaled
  by the Birge ratio where its points scatter more than stated) and its median point uncertainty: a dataset's points share
  its normalization, so its mean is known no better than its typical point (the conservative choice).
- Datasets combine by inverse variance, the standard error scaled by the PDG factor sqrt(chi2/(N-1)) where they disagree.
  Bins: 4 a decade, edges on 10^(k/4). z = |weighted mean log ratio| / sqrt(se^2 + rel_sd_eval^2), rel_sd_eval the MF33
  relative sd (structure.py's /endf/cov conversion) averaged over the bins (0 where the evaluation has none, mf33 false).
- Driver: the dataset whose removal moves the weighted mean most; support: points and datasets without it.
"""
import json
import math
import os
import sys
import time

import boto3
import duckdb

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reactions import PROJECTILE_ZA, label, map_reaction, nuclide  # noqa: E402

BUCKET = "nsr-lake-613473203863"
B = f"s3://{BUCKET}"
DATE = "2026-11-10"
PREFIX = f"lake/sweep/{DATE}"
WORK = "/data/sweep"
DB = f"{WORK}/sweep.duckdb"
ENDFB = f"{B}/lake/endfb"
POINTS = f"{B}/lake/serve/exfor/2026-10-28/points/*/*.parquet"
SI = f"{B}/lake/serve/exfor/2026-10-28/search_index/*"
# (reported as, release read for neutrons, release read for the other sublibraries, MF33 from, resonance floor applies)
COMPARATORS = [
    ("B-VIII.1", "B-VIII.1-point-293.6K", "B-VIII.1", "B-VIII.1", False),
    ("B-VIII.0", "B-VIII.0-point-293.6K", "B-VIII.0", "B-VIII.0", False),
    ("JEFF-3.3", "JEFF-3.3", "JEFF-3.3", "JEFF-3.3", True),
    ("JENDL-5", "JENDL-5", "JENDL-5", "JENDL-5", True),
    ("TENDL-2023", "TENDL-2023", "TENDL-2023", "TENDL-2023", True),
    ("CENDL-3.2", "CENDL-3.2", "CENDL-3.2", "CENDL-3.2", True),
]
RELEASES = [c[0] for c in COMPARATORS]
PER_DECADE = 4
REL_FLOOR, REL_DEFAULT = 0.01, 0.10
SUPPORT_DATASETS, SUPPORT_POINTS = 2, 20
CHANGE_RMS, GRID_PER_DECADE = 0.005, 20
SINGLE_Z = 3.0
STATE = f"{WORK}/state.json"
STATE_KEY = "lake/_work/sweep/state.json"
# Pair mode, the retrodiction on another release pair: SWEEP_PAIR="B-VII.1,B-VIII.0" compares both releases from MF3 above a
# common floor (each neutron material's larger MF2 resonance range of the two; no POINT exists before VIII.0), in its own
# database, and writes only the retrodiction (lake/sweep/2026-11-10/retrodiction_pairs/, and summary.json's pairs).
PAIR = [x.strip() for x in os.environ.get("SWEEP_PAIR", "").split(",") if x.strip()]
FROM_REL, TO_REL = (PAIR[0], PAIR[1]) if PAIR else ("B-VIII.0", "B-VIII.1")
# SWEEP_METHOD=point: both releases from their POINT 293.6 K release (B-VII.1-point-293.6K is reconstructed by point.py),
# averaged inside the resolved range, as the main pair is; mf3 (the default in pair mode): MF3 above the common floor
METHOD = os.environ.get("SWEEP_METHOD", "mf3") if PAIR else "point"
if PAIR:
    COMPARATORS = ([(r, f"{r}-point-293.6K", r, r, False) for r in PAIR] if METHOD == "point"
                   else [(r, r, r, r, True) for r in PAIR])
    RELEASES = PAIR
    DB = f"{WORK}/pair-{PAIR[0]}-{PAIR[1]}-{METHOD}.duckdb"
    STATE = f"{WORK}/state-pair-{PAIR[0]}-{PAIR[1]}-{METHOD}.json"
    STATE_KEY = f"lake/_work/sweep/state-pair-{PAIR[0]}-{PAIR[1]}-{METHOD}.json"


def held_col(r):
    return "held_" + r.lower().replace("-", "_").replace(".", "_")
s3 = boto3.client("s3", region_name="us-east-2")
_c = None


def con():
    global _c
    if _c is None:
        os.makedirs(f"{WORK}/tmp", exist_ok=True)
        cr = boto3.Session().get_credentials().get_frozen_credentials()
        c = duckdb.connect(DB, config={"temp_directory": f"{WORK}/tmp", "memory_limit": "5GB", "threads": 2,
                                       "extension_directory": "/opt/duckdb_ext", "preserve_insertion_order": False})
        c.execute("LOAD httpfs")
        c.execute(f"CREATE OR REPLACE SECRET lake (TYPE s3, KEY_ID '{cr.access_key}', SECRET '{cr.secret_key}', "
                  f"SESSION_TOKEN '{cr.token}', REGION 'us-east-2')")
        c.execute("""CREATE OR REPLACE MACRO subcode(s) AS CASE s WHEN 'neutrons' THEN 0 WHEN 'protons' THEN 1
                     WHEN 'deuterons' THEN 2 WHEN 'tritons' THEN 3 WHEN 'helium3s' THEN 4 WHEN 'alphas' THEN 5
                     WHEN 'gammas' THEN 6 ELSE 9 END""")
        c.execute("CREATE OR REPLACE MACRO pkey(za, liso, sub, mt) AS "
                  "((za::BIGINT * 10 + liso) * 10 + subcode(sub)) * 1000 + mt")
        _c = c
    return _c


def q(sql, params=None):
    t = time.time()
    r = con().execute(sql, params) if params is not None else con().execute(sql)
    dt = time.time() - t
    if dt > 5:
        print(f"  {dt:6.1f}s  {' '.join(sql.split())[:110]}", flush=True)
    return r


def one(sql):
    return q(sql).fetchone()[0]


def insert(table, rows):
    """Bulk insert through an Arrow table (executemany is one statement and one WAL write a row)."""
    rows = list(rows)
    if not rows:
        return
    import pyarrow as pa
    cols = [r[0] for r in q(f"DESCRIBE {table}").fetchall()]
    con().register("_ins", pa.table({c: [r[i] for r in rows] for i, c in enumerate(cols)}))
    q(f"INSERT INTO {table} SELECT * FROM _ins")
    con().unregister("_ins")


def state(**kw):
    s = json.load(open(STATE)) if os.path.exists(STATE) else {}
    for k, v in kw.items():
        if isinstance(v, dict) and isinstance(s.get(k), dict):
            s[k].update(v)
        else:
            s[k] = v
    json.dump(s, open(STATE, "w"), indent=1, default=str)
    s3.put_object(Bucket=BUCKET, Key=STATE_KEY, Body=json.dumps(s, indent=1, default=str).encode())
    return s


def endf_float(s):
    s = s.strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        pass
    for i in range(len(s) - 1, 0, -1):
        if s[i] in "+-" and s[i - 1] not in "eE":
            return float(s[:i] + "e" + s[i:])
    return float(s)


# ── load ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
def load(exfor_only=False):
    t0 = time.time()
    q(f"""CREATE OR REPLACE TABLE si AS SELECT dataset, entry, subent, target_za, coalesce(target_state, '') target_state,
          upper(projectile) projectile, upper(process) process, coalesce(product, '') product, product_za, quantity,
          sf6, year, first_author, institute, reference, code FROM read_parquet('{SI}')""")
    q(f"""CREATE OR REPLACE TABLE px AS SELECT dataset, e_ev, de_ev, xs_b, dxs_b, units, source
          FROM read_parquet('{POINTS}') WHERE sf6 IN ('SIG', 'RI')""")
    vals = []
    for p, pr in q("SELECT DISTINCT projectile, process FROM si WHERE projectile IS NOT NULL AND process IS NOT NULL").fetchall():
        sub, mt, ej, why = map_reaction(p, pr)
        vals.append((p, pr, sub, mt, ej, PROJECTILE_ZA.get(p), why, label(p, pr)))
    q("CREATE OR REPLACE TABLE rx (projectile VARCHAR, process VARCHAR, sub VARCHAR, mt INTEGER, ejz INTEGER, pza INTEGER, "
      "why VARCHAR, reaction VARCHAR)")
    insert("rx", vals)
    q("""CREATE OR REPLACE TABLE dsx AS
         SELECT s.*, r.sub, r.mt, r.reaction, r.why,
           CASE s.target_state WHEN '' THEN 0 WHEN 'M' THEN 1 WHEN 'M1' THEN 1 WHEN 'M2' THEN 2 ELSE -1 END AS liso,
           CASE WHEN s.sf6 <> 'SIG' THEN 'other_quantity'
                WHEN s.dataset LIKE 'V%' THEN 'evaluated_compilation'
                WHEN s.quantity <> ',SIG' THEN 'quantity_modifier'
                -- the index's quantity can drop SF7 to SF9 (MXW, SPA, FIS, BRS, RAW, DERIV): read them from the code itself
                WHEN coalesce(string_split(regexp_extract(s.code, '\)([^)]*)$', 1), ',')[4], '') <> ''
                  OR coalesce(string_split(regexp_extract(s.code, '\)([^)]*)$', 1), ',')[5], '') NOT IN ('', 'AV')
                  OR coalesce(string_split(regexp_extract(s.code, '\)([^)]*)$', 1), ',')[6], '') NOT IN ('', 'EXP')
                  THEN 'quantity_modifier'
                WHEN r.mt IS NULL THEN 'no_mt'
                WHEN s.target_za IS NULL OR s.target_za <= 0 THEN 'no_target'
                WHEN s.target_state NOT IN ('', 'M', 'M1', 'M2') THEN 'target_state'
                WHEN regexp_matches(s.product, '^[0-9]+-[A-Z]+-[0-9]+-') THEN 'state_specific'
                WHEN s.product = '' THEN 'ok'
                WHEN s.target_za % 1000 = 0 THEN 'product_other'
                WHEN r.mt = 2 AND s.product_za = s.target_za THEN 'ok'
                WHEN r.ejz IS NOT NULL AND s.product_za = s.target_za + r.pza - r.ejz THEN 'ok'
                ELSE 'product_other' END AS cls
         FROM si s LEFT JOIN rx r USING (projectile, process)""")
    q(f"""CREATE OR REPLACE TABLE ex AS
          WITH p AS (
            SELECT p.dataset, d.target_za::INTEGER za, d.liso, d.sub, d.mt, p.e_ev e, p.de_ev, p.xs_b xs, p.dxs_b dxs, p.units,
                   CASE WHEN p.dxs_b > 0 AND isfinite(p.dxs_b) THEN p.dxs_b / p.xs_b END rel0
            FROM px p JOIN dsx d USING (dataset)
            WHERE d.cls = 'ok' AND p.xs_b > 0 AND isfinite(p.xs_b) AND p.e_ev > 0 AND isfinite(p.e_ev)),
          m AS (SELECT dataset, median(rel0) med FROM p GROUP BY 1)
          SELECT row_number() OVER () AS pid, pkey(za, liso, sub, mt) AS key, p.*,
                 greatest(coalesce(rel0, m.med, {REL_DEFAULT}), {REL_FLOOR}) AS sig,
                 CASE WHEN rel0 IS NOT NULL THEN 'point' WHEN m.med IS NOT NULL THEN 'dataset_median'
                      ELSE 'default_10pct' END AS weight_source,
                 floor(log10(e) * {PER_DECADE} + 1e-9)::INTEGER AS k
          FROM p LEFT JOIN m USING (dataset)""")
    q("CREATE OR REPLACE TABLE pairkeys AS SELECT DISTINCT key, za, liso, sub, mt FROM ex")
    if not exfor_only:
        load_evals(t0)


NS = "regexp_replace(CASE WHEN sublibrary = '293.6K' THEN 'neutrons' ELSE sublibrary END, '-version[.].*$', '')"


def load_evals(t0=None):
    """The comparators: materials (sublibrary names normalized: B-VIII.1 writes neutrons-version.VIII.1), grids, spans."""
    t0 = t0 or time.time()
    # materials per comparator, one per (sublibrary, za, liso)
    q("CREATE OR REPLACE TABLE mats (rel VARCHAR, src VARCHAR, sub VARCHAR, src_sub VARCHAR, file_name VARCHAR, mat INTEGER, "
      "za INTEGER, liso INTEGER, role VARCHAR)")
    subs = {}
    for R, srcn, srco, covrel, _ in COMPARATORS:
        reads = [(srcn, f"{NS} = 'neutrons'", "xs"), (srco, f"{NS} <> 'neutrons'", "xs"),
                 (covrel, "true", "cov")]
        for src, cond, role in reads:
            q(f"""INSERT INTO mats SELECT '{R}', '{src}', {NS},
                  sublibrary, file_name, mat, round(za)::INTEGER, coalesce(liso, 0)::INTEGER, '{role}'
                  FROM read_parquet('{ENDFB}/{src}/materials/*.parquet') WHERE {cond}""")
        subs[R] = [r[0] for r in q(f"SELECT DISTINCT sub FROM mats WHERE rel = '{R}' AND role = 'xs' ORDER BY 1").fetchall()]
    q("""CREATE OR REPLACE TABLE mats1 AS SELECT *, pkey(za, liso, sub, 0) AS kb FROM mats
         QUALIFY row_number() OVER (PARTITION BY rel, role, sub, za, liso ORDER BY mat) = 1""")
    q("CREATE OR REPLACE TABLE ev (rel VARCHAR, key BIGINT, seq INTEGER, e DOUBLE, y DOUBLE, law INTEGER)")
    for R, srcn, srco, _, _ in COMPARATORS:
        for src in sorted({srcn, srco}):
            q(f"""INSERT INTO ev SELECT m.rel, m.kb + x.mt, x.point_seq, x.energy_ev, x.xs_barn, x.interpolation
                  FROM read_parquet('{ENDFB}/{src}/xs_points/*.parquet') x
                  JOIN mats1 m ON m.rel = '{R}' AND m.role = 'xs' AND m.src = '{src}' AND m.src_sub = x.sublibrary
                   AND m.file_name = x.file_name AND m.mat = x.mat
                  WHERE m.kb + x.mt IN (SELECT key FROM pairkeys)
                     OR (x.mt = 5 AND m.kb IN (SELECT key - key % 1000 FROM pairkeys))""")
    q("""CREATE OR REPLACE TABLE evg AS SELECT rel, key, e, y, lead(e) OVER w AS e1, lead(y) OVER w AS y1,
         lead(law) OVER w AS law1 FROM ev WINDOW w AS (PARTITION BY rel, key ORDER BY seq)""")
    # MT 5 ("anything", product yields in MF6, not parsed): where it is non-zero, a specific MT other than 1, 2, 3, 18 and
    # 102 may hold only part of its channel (the continuum lumped into MT 5), so it is not compared there
    q("""CREATE OR REPLACE TABLE mt5 AS SELECT rel, key - 5 AS kb, min(e) FILTER (WHERE y > 0) AS onset_ev FROM ev
         WHERE key % 1000 = 5 GROUP BY ALL""")
    q("CREATE OR REPLACE TABLE espan AS SELECT rel, key, min(e) emin, max(e) emax, count(*) n FROM ev GROUP BY ALL")
    state(load={"seconds": round(time.time() - t0), "sublibraries": subs})


def loadstate():
    counts = dict(q("SELECT cls, count(*) FROM dsx WHERE sf6 = 'SIG' GROUP BY 1").fetchall())
    state(load={"datasets_sig_by_class": counts,
                "points_compared_candidates": one("SELECT count(*) FROM ex"),
                "points_barns": one("SELECT count(*) FROM ex WHERE units = 'B'"),
                "pair_keys": one("SELECT count(*) FROM pairkeys"),
                "ev_rows": dict(q("SELECT rel, count(*) FROM ev GROUP BY 1").fetchall()),
                "floors": one("SELECT count(*) FROM floors"), "cov_groups": one("SELECT count(*) FROM covg")})


def floors():
    """Each neutron material's resonance range from its MF2 MT151 range records (JEFF-3.3, JENDL-5, TENDL-2023, CENDL-3.2),
    for the materials EXFOR has a pair on."""
    q("""CREATE OR REPLACE TABLE fmats AS SELECT DISTINCT rel, file_name, mat, src_sub FROM mats1
         WHERE role = 'cov' AND sub = 'neutrons' AND kb IN (SELECT key - key % 1000 FROM pairkeys)""")
    q("CREATE OR REPLACE TABLE mf2 (rel VARCHAR, file_name VARCHAR, mat INTEGER, line_no INTEGER, text VARCHAR)")
    for R, _, _, src, fl in COMPARATORS:  # the plain release's MF2 (for ENDF/B: the resolved range inside POINT)
        if True:
            q(f"""INSERT INTO mf2 SELECT '{R}', r.file_name, r.mat, r.line_no, r.text
                  FROM read_parquet('{ENDFB}/{src}/records/*.parquet') r
                  JOIN (SELECT file_name, mat, src_sub FROM fmats WHERE rel = '{R}') m ON m.file_name = r.file_name AND m.mat = r.mat
                   AND m.src_sub = r.sublibrary
                  WHERE r.mf = 2 AND r.mt = 151""")
    q(r"""CREATE OR REPLACE TABLE mf2c AS SELECT rel, file_name, mat, line_no, substr(text, 1, 11) a, substr(text, 12, 11) b,
            TRY_CAST(trim(substr(text, 23, 11)) AS INTEGER) lru, TRY_CAST(trim(substr(text, 34, 11)) AS INTEGER) lrf,
            TRY_CAST(trim(substr(text, 45, 11)) AS INTEGER) nro
          FROM mf2 WHERE trim(substr(text, 23, 11)) IN ('1', '2') AND trim(substr(text, 34, 11)) IN ('1', '2', '3', '4', '5', '6', '7')
            AND trim(substr(text, 45, 11)) IN ('0', '1') AND trim(substr(text, 56, 11)) IN ('0', '1', '2')""")
    cand = q("""SELECT c.rel, c.file_name, c.mat, c.a, c.b, c.lru, c.lrf, c.nro, trim(substr(n.text, 23, 11)) AS next3
                FROM mf2c c LEFT JOIN mf2 n ON n.rel = c.rel AND n.file_name = c.file_name AND n.line_no = c.line_no + 1""").fetchall()
    per = {}
    for rel, fn, mat, a, b, lru, lrf, nro, nxt in cand:
        try:
            el, eh = endf_float(a), endf_float(b)
        except ValueError:
            continue
        if not (1e-6 <= el < eh <= 2e8):
            continue
        d = per.setdefault((rel, fn, mat), {"rrr": 0.0, "urr": 0.0, "urr_lssf1": 0.0, "lssf": None})
        if lru == 1:
            d["rrr"] = max(d["rrr"], eh)
        else:
            lssf = int(nxt) if nro == 0 and nxt is not None and nxt.strip() in ("0", "1") else 0
            d["lssf"] = lssf
            if lssf == 1:
                d["urr_lssf1"] = max(d["urr_lssf1"], eh)
            else:
                d["urr"] = max(d["urr"], eh)
    rows = [(rel, fn, mat, max(d["rrr"], d["urr"]), d["rrr"], max(d["urr"], d["urr_lssf1"]), d["lssf"])
            for (rel, fn, mat), d in per.items()]
    q("CREATE OR REPLACE TABLE floors0 (rel VARCHAR, file_name VARCHAR, mat INTEGER, floor_ev DOUBLE, rrr_eh DOUBLE, "
      "urr_eh DOUBLE, lssf INTEGER)")
    if rows:
        insert("floors0", rows)
    floored = ", ".join(f"'{c[0]}'" for c in COMPARATORS if c[4])
    q(f"""CREATE OR REPLACE TABLE floors AS SELECT m.rel, m.kb, f.floor_ev, f.rrr_eh, f.urr_eh, f.lssf,
          m.rel IN ({floored}) AS applies
          FROM mats1 m JOIN floors0 f ON f.rel = m.rel AND f.file_name = m.file_name AND f.mat = m.mat
          WHERE m.role = 'cov' AND m.sub = 'neutrons'""")
    if PAIR and METHOD == "mf3":  # one floor per material for both releases: the larger of their two resonance ranges
        q("""CREATE OR REPLACE TABLE floors AS
             WITH k AS (SELECT kb, max(floor_ev) floor_ev, max(rrr_eh) rrr_eh, max(urr_eh) urr_eh FROM floors GROUP BY kb)
             SELECT r.rel, k.kb, k.floor_ev, k.rrr_eh, k.urr_eh, NULL::INTEGER lssf, true AS applies
             FROM k CROSS JOIN (SELECT DISTINCT rel FROM mats1) r""")


COV_LB = (1, 2, 5, 6, 8)


def covs():
    """MF33 relative sd per energy group for each pair key, ported from services/nsr-api/structure.py cov_release."""
    q("CREATE OR REPLACE TABLE covg (rel VARCHAR, key BIGINT, e_lo DOUBLE, e_hi DOUBLE, rel_sd DOUBLE)")
    q("CREATE OR REPLACE TABLE covlumped (rel VARCHAR, key BIGINT, mtl INTEGER)")
    for R, _, _, covrel, _ in COMPARATORS:
        rows = q(f"""SELECT m.kb + c.mt AS key, c.block, c.mtl, c.ni_index, c.lb, c.pair_set, c.row_energy_ev,
                     c.row_energy_hi_ev, c.value
                     FROM read_parquet('{ENDFB}/{covrel}/cov/*.parquet') c
                     JOIN mats1 m ON m.rel = '{R}' AND m.role = 'cov' AND m.src_sub = c.sublibrary
                      AND m.file_name = c.file_name AND m.mat = c.mat
                     WHERE m.kb + c.mt IN (SELECT key FROM pairkeys)
                       AND (c.block = 'lumped' OR (c.block = 'NI' AND c.mt1 = c.mt AND (c.mat1 = 0 OR c.mat1 = c.mat)
                       AND (c.lb NOT IN (5, 6) OR (c.row_energy_ev = c.col_energy_ev
                            AND c.row_energy_hi_ev = c.col_energy_hi_ev))))""").fetchall()
        by = {}
        for r in rows:
            by.setdefault(r[0], []).append(r)
        out, lumped = [], []
        for key, rs in by.items():
            lm = [r[2] for r in rs if r[1] == "lumped"]
            if lm:
                lumped.append((R, key, lm[0]))
                continue
            blocks = {}
            for r in rs:
                blocks.setdefault(r[3], []).append(r)
            parts = []
            for i in sorted(blocks):
                b = blocks[i]
                lb = b[0][4]
                if lb not in COV_LB:
                    continue
                if lb in (5, 6):
                    parts.append(sorted((x[6], x[7], x[8]) for x in b))
                else:
                    pts = sorted((x[6], x[8]) for x in b if x[5] == 1)
                    parts.append([(e0, e1, f * f if lb == 2 else f) for (e0, f), (e1, _) in zip(pts, pts[1:])])
            edges = sorted({e for p in parts for g in p for e in g[:2] if e is not None})
            starts = [[g[0] for g in p] for p in parts]
            import bisect
            for lo, hi in zip(edges, edges[1:]):
                mid, var = (lo + hi) / 2, 0.0
                for p, st in zip(parts, starts):
                    k = bisect.bisect_right(st, mid) - 1
                    if k >= 0 and p[k][0] <= mid < p[k][1]:
                        var += p[k][2]
                if var > 0 and hi > lo > 0:
                    out.append((R, key, lo, hi, math.sqrt(var)))
        if out:
            insert("covg", out)
        if lumped:
            insert("covlumped", lumped)


# ── interpolation (one release) ──────────────────────────────────────────────────────────────────────────────────────
INTERP = """CASE WHEN g.e1 IS NULL THEN CASE WHEN x.e = g.e THEN g.y END
     WHEN g.e1 <= g.e THEN g.y
     WHEN g.law1 = 1 THEN g.y
     WHEN g.law1 = 3 AND g.e > 0 THEN g.y + (g.y1 - g.y) * ln(x.e / g.e) / ln(g.e1 / g.e)
     WHEN g.law1 = 4 AND g.y > 0 AND g.y1 > 0 THEN g.y * exp(ln(g.y1 / g.y) * (x.e - g.e) / (g.e1 - g.e))
     WHEN g.law1 = 5 AND g.y > 0 AND g.y1 > 0 AND g.e > 0 THEN g.y * exp(ln(g.y1 / g.y) * ln(x.e / g.e) / ln(g.e1 / g.e))
     ELSE g.y + (g.y1 - g.y) * (x.e - g.e) / (g.e1 - g.e) END"""


def interp_into(table, source, rel, idcol="pid"):
    """INSERT INTO table (id, rel, yev) the comparator at each source row's (key, e)."""
    q(f"""INSERT INTO {table} SELECT x.{idcol}, '{rel}', {INTERP}
          FROM {source} x ASOF JOIN (SELECT * FROM evg WHERE rel = '{rel}') g ON x.key = g.key AND x.e >= g.e""")


# ── the U-235 check ──────────────────────────────────────────────────────────────────────────────────────────────────
def check():
    """U-235 (n,f) 9 to 18 keV against the Lab's demo numbers (B-VIII.1 0.995, JEFF-3.3 0.976, JENDL-5 0.985; 4,140 points,
    69 datasets). Two selections: the Lab's (sf6 SIG, units B, every quantity) and the sweep's (quantity ',SIG')."""
    key = one("SELECT pkey(92235, 0, 'neutrons', 18)")
    q(f"""CREATE OR REPLACE TABLE chk_pts AS
          SELECT row_number() OVER () AS cid, {key}::BIGINT AS key, p.dataset, p.e_ev e, p.xs_b xs, p.dxs_b dxs,
                 (d.quantity = ',SIG') AS sweep_sel
          FROM px p JOIN dsx d USING (dataset)
          WHERE d.target_za = 92235 AND d.projectile = 'N' AND d.process = 'F' AND d.sf6 = 'SIG' AND d.target_state = ''
            AND d.product = '' AND p.units = 'B' AND p.e_ev BETWEEN 9000 AND 18000 AND p.xs_b > 0""")
    q("CREATE OR REPLACE TABLE chk_r (cid BIGINT, rel VARCHAR, yev DOUBLE)")
    for R in ("B-VIII.1", "JEFF-3.3", "JENDL-5", "B-VIII.0", "TENDL-2023", "CENDL-3.2"):
        interp_into("chk_r", "chk_pts", R, "cid")
    out = {"lab": {"B-VIII.1": 0.995, "JEFF-3.3": 0.976, "JENDL-5": 0.985, "points": 4140, "datasets": 69}}
    for sel, cond in (("lab_selection", "true"), ("sweep_selection", "p.sweep_sel")):
        rows = q(f"""SELECT r.rel, count(*) n, count(DISTINCT p.dataset) nd, avg(p.xs / r.yev) mean_ratio,
                     sum(CASE WHEN p.dxs > 0 THEN (p.xs / r.yev) / pow((p.xs / r.yev) * p.dxs / p.xs, 2) END)
                       / sum(CASE WHEN p.dxs > 0 THEN 1 / pow((p.xs / r.yev) * p.dxs / p.xs, 2) END) weighted
                     FROM chk_pts p JOIN chk_r r USING (cid) WHERE r.yev > 0 AND {cond} GROUP BY 1 ORDER BY 1""").fetchall()
        out[sel] = {r[0]: {"points": r[1], "datasets": r[2], "mean_ratio": round(r[3], 4), "weighted_ratio": round(r[4], 4)
                           if r[4] else None} for r in rows}
    fl = q(f"""SELECT rel, floor_ev, rrr_eh, urr_eh, lssf FROM floors WHERE kb = {key} - 18""").fetchall()
    out["floors_u235"] = {r[0]: {"floor_ev": r[1], "rrr_eh": r[2], "urr_eh": r[3], "lssf": r[4]} for r in fl}
    labd = out["lab_selection"]
    out["pass"] = all(R in labd and abs(labd[R]["mean_ratio"] - out["lab"][R]) <= 0.002 for R in ("B-VIII.1", "JEFF-3.3", "JENDL-5"))
    print(json.dumps(out, indent=1))
    state(check=out)
    return out


# ── the sweep ────────────────────────────────────────────────────────────────────────────────────────────────────────
DSE = f"""greatest(sqrt(1 / sw) * CASE WHEN nr > 1 THEN greatest(1, sqrt(greatest(swl2 - swl * swl / sw, 0) / (nr - 1)))
          ELSE 1 END, u)"""


def run():
    t0 = time.time()
    q("CREATE OR REPLACE TABLE ratio (pid BIGINT, rel VARCHAR, yev DOUBLE)")
    for R in RELEASES:
        interp_into("ratio", "ex", R)
    # Inside a POINT material's resolved resonance range a measurement is compared as an average, not point by point:
    # resolution broadening (and averaged measurements) preserve the area, not the value at an energy. Per release,
    # pair, dataset and bin: the trapezoid integral of the data over its own span against the comparator's exact
    # integral over the same span (a running integral of the linearized POINT grid); a dataset with one energy in the bin
    # is compared with the comparator averaged over its stated resolution (EN-RSL or EN-ERR), else +-5%.
    q("""CREATE OR REPLACE TABLE rrr AS SELECT rel, kb, rrr_eh FROM floors WHERE NOT applies AND rrr_eh > 0""")
    q("""CREATE OR REPLACE TABLE rpts AS
         SELECT r.rel, x.pid, x.key, x.dataset, x.k, x.e, x.xs, x.de_ev, x.sig, x.units, x.weight_source
         FROM ratio r JOIN ex x USING (pid) JOIN rrr ON rrr.rel = r.rel AND rrr.kb = x.key - x.key % 1000
         WHERE x.sub = 'neutrons' AND x.e < rrr.rrr_eh AND r.yev IS NOT NULL""")
    q("""CREATE OR REPLACE TABLE evc AS
         SELECT rel, key, e, y, e1, y1,
                coalesce(sum(CASE WHEN e1 > e THEN 0.5 * (y + y1) * (e1 - e) ELSE 0 END)
                         OVER (PARTITION BY rel, key ORDER BY e, e1 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) cum
         FROM evg WHERE (rel, key) IN (SELECT DISTINCT rel, key FROM rpts)""")
    q("""CREATE OR REPLACE TABLE rgrp AS
         WITH s AS (SELECT *, lead(e) OVER w e_n, lead(xs) OVER w xs_n FROM rpts
                    WINDOW w AS (PARTITION BY rel, key, dataset, k ORDER BY e, pid)),
         g AS (SELECT rel, key, dataset, k, any_value(units) units, count(*) npts, count(DISTINCT e) ne, min(e) e_lo,
                      max(e) e_hi, median(sig) sig, any_value(weight_source) weight_source, avg(xs) xs_avg,
                      sum(CASE WHEN e_n > e THEN 0.5 * (xs + xs_n) * (e_n - e) ELSE 0 END) trap,
                      median(CASE WHEN de_ev > 0 THEN de_ev / e END) rres
               FROM s GROUP BY ALL)
         SELECT row_number() OVER () gid, *,
                CASE WHEN ne > 1 THEN e_lo ELSE e_lo / (1 + CASE WHEN rres BETWEEN 0.001 AND 0.5 THEN rres ELSE 0.05 END) END a,
                CASE WHEN ne > 1 THEN e_hi ELSE e_lo * (1 + CASE WHEN rres BETWEEN 0.001 AND 0.5 THEN rres ELSE 0.05 END) END b,
                CASE WHEN ne > 1 THEN trap / (e_hi - e_lo) ELSE xs_avg END data_avg
         FROM g""")
    q("CREATE OR REPLACE TABLE ends AS SELECT gid, rel, key, a AS e, 'a' side FROM rgrp UNION ALL "
      "SELECT gid, rel, key, b, 'b' FROM rgrp")
    q("""CREATE OR REPLACE TABLE endi AS
         SELECT x.gid, x.side, c.cum + 0.5 * (c.y + CASE WHEN c.e1 > c.e AND x.e <= c.e1
                  THEN c.y + (c.y1 - c.y) * (x.e - c.e) / (c.e1 - c.e) ELSE c.y END) * (least(x.e, coalesce(c.e1, c.e)) - c.e) AS I
         FROM ends x ASOF JOIN evc c ON x.rel = c.rel AND x.key = c.key AND x.e >= c.e""")
    q("""CREATE OR REPLACE TABLE rcmp AS
         SELECT g.*, (ib.I - ia.I) / (g.b - g.a) AS eval_avg FROM rgrp g
         JOIN endi ia ON ia.gid = g.gid AND ia.side = 'a' JOIN endi ib ON ib.gid = g.gid AND ib.side = 'b'""")
    q("""CREATE OR REPLACE TABLE pr AS
         SELECT r.rel, x.key, x.dataset, x.e, x.k, x.sig, 1 / (x.sig * x.sig) AS w, ln(x.xs / r.yev) AS lr, x.units,
                x.weight_source, 1 AS npts, 'point' AS how
         FROM ratio r JOIN ex x USING (pid)
         LEFT JOIN floors f ON f.rel = r.rel AND f.kb = x.key - x.key % 1000 AND f.applies
         LEFT JOIN mt5 ON mt5.rel = r.rel AND mt5.kb = x.key - x.key % 1000
         WHERE r.yev > 0 AND (f.floor_ev IS NULL OR x.e >= f.floor_ev)
           AND (mt5.onset_ev IS NULL OR x.mt IN (1, 2, 3, 18, 102) OR x.e < mt5.onset_ev)
           AND NOT EXISTS (SELECT 1 FROM rpts p WHERE p.rel = r.rel AND p.pid = r.pid)
         UNION ALL
         SELECT rel, key, dataset, sqrt(a * b), k, sig, 1 / (sig * sig), ln(data_avg / eval_avg), units, weight_source, npts,
                CASE WHEN ne > 1 THEN 'average over the dataset''s span in the bin' ELSE 'average over the resolution' END
         FROM rcmp WHERE data_avg > 0 AND eval_avg > 0""")
    below = dict(q("""SELECT r.rel, count(*) FROM ratio r JOIN ex x USING (pid)
                      JOIN floors f ON f.rel = r.rel AND f.kb = x.key - x.key % 1000 AND f.applies
                      WHERE r.yev > 0 AND x.e < f.floor_ev GROUP BY 1""").fetchall())
    averaged = dict(q("SELECT rel, count(*) FROM rpts GROUP BY 1").fetchall())
    partial = dict(q("""SELECT r.rel, count(*) FROM ratio r JOIN ex x USING (pid) JOIN mt5 ON mt5.rel = r.rel
                        AND mt5.kb = x.key - x.key % 1000 WHERE r.yev > 0 AND x.mt NOT IN (1, 2, 3, 18, 102)
                        AND x.e >= mt5.onset_ev GROUP BY 1""").fetchall())
    # per dataset and pair
    q(f"""CREATE OR REPLACE TABLE dstat AS
          WITH a AS (SELECT rel, key, dataset, count(*) nr, sum(npts) n, sum(w) sw, sum(w * lr) swl, sum(w * lr * lr) swl2,
                            median(sig) u, min(e) emin, max(e) emax, median(exp(lr)) med_ratio
                     FROM pr WHERE units = 'B' GROUP BY ALL)
          SELECT *, swl / sw AS m, {DSE} AS se FROM a""")
    q("""CREATE OR REPLACE TABLE pcomb AS
         WITH t AS (SELECT rel, key, count(*) nd, sum(n) np, sum(1 / (se * se)) s0, sum(m / (se * se)) s1,
                           sum(m * m / (se * se)) s2 FROM dstat GROUP BY ALL)
         SELECT *, s1 / s0 AS wm,
                CASE WHEN nd > 1 THEN greatest(1, sqrt(greatest(s2 - s1 * s1 / s0, 0) / (nd - 1))) ELSE 1 END
                  / sqrt(s0) AS wse FROM t""")
    q("""CREATE OR REPLACE TABLE loo AS
         SELECT d.rel, d.key, d.dataset, d.n, t.nd, t.np,
                (t.s1 - d.m / (d.se * d.se)) / nullif(t.s0 - 1 / (d.se * d.se), 0) AS wm_wo,
                t.s0 - 1 / (d.se * d.se) AS s0_wo, t.s1 - d.m / (d.se * d.se) AS s1_wo,
                t.s2 - d.m * d.m / (d.se * d.se) AS s2_wo, t.wm
         FROM dstat d JOIN pcomb t USING (rel, key) WHERE t.nd > 1""")
    q("""CREATE OR REPLACE TABLE driver AS
         SELECT rel, key, dataset AS driver_dataset, wm_wo - wm AS driver_effect, n AS driver_points,
                np - n AS support_points, nd - 1 AS support_datasets, wm_wo,
                CASE WHEN nd > 2 THEN greatest(1, sqrt(greatest(s2_wo - s1_wo * s1_wo / s0_wo, 0) / (nd - 2))) ELSE 1 END
                  / sqrt(s0_wo) AS wse_wo
         FROM loo QUALIFY row_number() OVER (PARTITION BY rel, key ORDER BY abs(wm_wo - wm) DESC, dataset) = 1""")
    # bins
    q(f"""CREATE OR REPLACE TABLE bd AS
          WITH a AS (SELECT rel, key, k, dataset, count(*) nr, sum(npts) n, sum(w) sw, sum(w * lr) swl, sum(w * lr * lr) swl2,
                            median(sig) u FROM pr WHERE units = 'B' GROUP BY ALL)
          SELECT *, swl / sw AS m, {DSE} AS se FROM a""")
    q(f"""CREATE OR REPLACE TABLE bins AS
          WITH t AS (SELECT rel, key, k, sum(n) n_points, count(*) n_datasets, sum(1 / (se * se)) s0,
                            sum(m / (se * se)) s1, sum(m * m / (se * se)) s2, sum(swl) / sum(sw) mean_log_ratio_points
                     FROM bd GROUP BY ALL),
          b AS (SELECT *, pow(10, k / {PER_DECADE}) e_lo, pow(10, (k + 1) / {PER_DECADE}) e_hi, s1 / s0 mean_log_ratio,
                       CASE WHEN n_datasets > 1 THEN greatest(1, sqrt(greatest(s2 - s1 * s1 / s0, 0) / (n_datasets - 1)))
                            ELSE 1 END / sqrt(s0) se FROM t),
          c AS (SELECT b.rel, b.key, b.k, sum(c.rel_sd * ln(least(b.e_hi, c.e_hi) / greatest(b.e_lo, c.e_lo)))
                       / sum(ln(least(b.e_hi, c.e_hi) / greatest(b.e_lo, c.e_lo))) rel_sd_eval
                FROM b JOIN covg c ON c.rel = b.rel AND c.key = b.key AND c.e_hi > b.e_lo AND c.e_lo < b.e_hi
                GROUP BY ALL)
          SELECT b.rel, b.key, b.k, b.e_lo, b.e_hi, b.n_points, b.n_datasets, b.mean_log_ratio, b.se,
                 b.mean_log_ratio_points, exp(b.mean_log_ratio) mean_ratio, c.rel_sd_eval,
                 abs(b.mean_log_ratio) / sqrt(b.se * b.se + pow(coalesce(c.rel_sd_eval, 0), 2)) AS z
          FROM b LEFT JOIN c USING (rel, key, k)""")
    names()
    q("""CREATE OR REPLACE TABLE summary AS
         WITH bb AS (SELECT rel, key, count(*) n_bins, sum(n_points * mean_log_ratio) / sum(n_points) mean_log_ratio,
                            sum(CASE WHEN rel_sd_eval IS NOT NULL THEN n_points * rel_sd_eval END)
                              / sum(CASE WHEN rel_sd_eval IS NOT NULL THEN n_points END) rel_sd_eval,
                            max(z) max_bin_z FROM bins GROUP BY ALL),
         mx AS (SELECT rel, key, mean_log_ratio max_bin_dev, sqrt(e_lo * e_hi) max_bin_e_ev FROM bins
                QUALIFY row_number() OVER (PARTITION BY rel, key ORDER BY (n_points >= 3) DESC, abs(mean_log_ratio) DESC) = 1)
         SELECT p.rel AS release, p.key, k.za AS target_za, k.liso, k.sub AS sublibrary, k.mt, nm.target, nm.reaction,
                nm.exfor_reaction, p.np AS n_points, p.nd AS n_datasets, bb.n_bins, bb.mean_log_ratio,
                exp(bb.mean_log_ratio) AS mean_ratio, p.wm AS weighted_log_ratio, p.wse AS se,
                coalesce(bb.rel_sd_eval, 0) AS rel_sd_eval, bb.rel_sd_eval IS NOT NULL AS mf33,
                abs(p.wm) / sqrt(p.wse * p.wse + pow(coalesce(bb.rel_sd_eval, 0), 2)) AS z,
                mx.max_bin_dev, mx.max_bin_e_ev, bb.max_bin_z,
                d.driver_dataset, d.driver_effect, coalesce(d.driver_points, p.np) AS driver_points,
                coalesce(d.support_points, 0) AS support_points, coalesce(d.support_datasets, 0) AS support_datasets,
                abs(d.wm_wo) / sqrt(d.wse_wo * d.wse_wo + pow(coalesce(bb.rel_sd_eval, 0), 2)) AS z_without_driver,
                cmp.comparator, f.floor_ev AS comparator_floor_ev,
                CASE WHEN cmp.floor_applies AND k.sub = 'neutrons' THEN
                       CASE WHEN f.floor_ev IS NULL THEN 'no MF2 resonance ranges: MF3 is the whole cross section'
                            ELSE 'MF2 MT151 range records: largest upper energy of the resolved ranges, and of the '
                                 || 'unresolved unless LSSF = 1' END
                     WHEN k.sub = 'neutrons' AND cmp.comparator LIKE '%point%' THEN 'none: POINT 293.6 K holds File 2 reconstructed'
                     ELSE 'none: no resonance parameters for this sublibrary' END AS floor_method,
                ce.emin AS e_min_ev, ce.emax AS e_max_ev, cl.mtl IS NOT NULL AS cov_lumped
         FROM pcomb p JOIN pairkeys k USING (key) JOIN bb USING (rel, key) LEFT JOIN mx USING (rel, key)
         LEFT JOIN driver d USING (rel, key) LEFT JOIN pairnames nm USING (key)
         LEFT JOIN comparators cmp ON cmp.rel = p.rel AND cmp.sub = k.sub
         LEFT JOIN floors f ON f.rel = p.rel AND f.kb = p.key - p.key % 1000 AND k.sub = 'neutrons' AND f.applies
         LEFT JOIN (SELECT rel, key, min(e) emin, max(e) emax FROM pr WHERE units = 'B' GROUP BY ALL) ce USING (rel, key)
         LEFT JOIN covlumped cl USING (rel, key)""")
    cols = [f"held_{R.lower().replace('-', '_').replace('.', '_')}" for R in RELEASES]
    q("CREATE OR REPLACE TABLE held AS SELECT key, " + ", ".join(f"bool_or(rel = '{R}') AS {c}" for R, c in zip(RELEASES, cols))
      + " FROM espan GROUP BY key")
    q("""CREATE OR REPLACE TABLE pairs_all AS
         WITH a AS (SELECT key, count(DISTINCT dataset) n_datasets, count(*) n_points, min(e) e_min_ev, max(e) e_max_ev
                    FROM ex WHERE units = 'B' GROUP BY key)
         SELECT k.key, k.za AS target_za, k.liso, k.sub AS sublibrary, k.mt, nm.target, nm.reaction, nm.exfor_reaction,
                a.n_datasets, a.n_points, a.e_min_ev, a.e_max_ev, """
      + ", ".join(f"coalesce(h.{c}, false) AS {c}" for c in cols) + """
         FROM pairkeys k JOIN a USING (key) LEFT JOIN pairnames nm USING (key) LEFT JOIN held h USING (key)""")
    st = {"seconds": round(time.time() - t0), "points_below_floor": below, "points_averaged_in_resolved_range": averaged, "points_left_out_mt5_partial": partial,
          "pairs_with_data": one("SELECT count(*) FROM pairs_all"),
          "pairs_held": {R: one(f"SELECT count(*) FROM pairs_all WHERE {held_col(R)}") for R in RELEASES},
          "pairs_with_all": one("SELECT count(*) FROM pairs_all WHERE " + " AND ".join(cols)),
          "summary_rows": dict(q("SELECT release, count(*) FROM summary GROUP BY 1").fetchall()),
          "bins_rows": one("SELECT count(*) FROM bins"), "dataset_rows": one("SELECT count(*) FROM dstat")}
    print(json.dumps(st, indent=1))
    state(run=st)


def names():
    """Each pair key's display names: the target, the reaction label and the EXFOR reaction field most of its datasets use."""
    q("""CREATE OR REPLACE TABLE pairnames AS
         SELECT pkey(target_za::INTEGER, liso, sub, mt) AS key, mode(reaction) AS reaction,
                mode(projectile || ',' || process) AS exfor_reaction
         FROM dsx WHERE cls = 'ok' GROUP BY ALL""")
    keys = q("SELECT key, za, liso FROM pairkeys").fetchall()
    q("CREATE OR REPLACE TABLE knames (key BIGINT, target VARCHAR)")
    insert("knames", [(k, nuclide(za, liso)) for k, za, liso in keys])
    q("CREATE OR REPLACE TABLE pairnames AS SELECT p.key, n.target, p.reaction, p.exfor_reaction FROM pairnames p "
      "JOIN knames n USING (key)")
    rows = []
    for R, srcn, srco, _, fl in COMPARATORS:
        for sub in ("neutrons", "protons", "deuterons", "tritons", "helium3s", "alphas", "gammas"):
            rows.append((R, sub, srcn if sub == "neutrons" else srco, fl and sub == "neutrons"))
    q("CREATE OR REPLACE TABLE comparators (rel VARCHAR, sub VARCHAR, comparator VARCHAR, floor_applies BOOLEAN)")
    insert("comparators", rows)


# ── Part B: what changed VIII.0 to VIII.1, and the retrodiction ─────────────────────────────────────────────────────
def changes():
    t0 = time.time()
    hf, ht = held_col(FROM_REL), held_col(TO_REL)
    # in pair mode the grid starts at the material's common floor (MF3 is the whole cross section only above it)
    q(f"""CREATE OR REPLACE TABLE grid AS
          WITH f AS (SELECT kb, max(floor_ev) floor_ev FROM floors WHERE applies AND rel IN ('{FROM_REL}', '{TO_REL}')
                     GROUP BY kb),
          s AS (SELECT p.key, greatest(p.e_min_ev, CASE WHEN p.sublibrary = 'neutrons' THEN coalesce(f.floor_ev, 0)
                                                        ELSE 0 END) e_min_ev, p.e_max_ev
                FROM pairs_all p LEFT JOIN f ON f.kb = p.key - p.key % 1000 WHERE p.{hf} AND p.{ht}),
          s2 AS (SELECT * FROM s WHERE e_min_ev <= e_max_ev),
          g AS (SELECT s2.key, pow(10, r.k / {GRID_PER_DECADE}) e FROM s2,
                       LATERAL (SELECT unnest(range(ceil(log10(s2.e_min_ev) * {GRID_PER_DECADE})::BIGINT,
                                                    floor(log10(s2.e_max_ev) * {GRID_PER_DECADE})::BIGINT + 1)) k) r
                UNION SELECT key, e_min_ev FROM s2 UNION SELECT key, e_max_ev FROM s2)
          SELECT row_number() OVER () gid, key, e FROM g""")
    q("CREATE OR REPLACE TABLE grid_r (gid BIGINT, rel VARCHAR, yev DOUBLE)")
    for R in (FROM_REL, TO_REL):
        interp_into("grid_r", "grid", R, "gid")
    how = ("'MF3 above the common resonance floor'" if METHOD == "mf3" else
           "CASE WHEN p.sublibrary = 'neutrons' THEN 'POINT 293.6 K (File 2 reconstructed and broadened)' ELSE 'MF3' END")
    q(f"""CREATE OR REPLACE TABLE changes AS
          WITH a AS (SELECT g.key, g.e, ln(b.yev / a.yev) lr FROM grid g
                     JOIN grid_r a ON a.gid = g.gid AND a.rel = '{FROM_REL}' JOIN grid_r b ON b.gid = g.gid AND b.rel = '{TO_REL}'
                     WHERE a.yev > 0 AND b.yev > 0)
          SELECT p.key, p.target_za, p.liso, p.sublibrary, p.mt, p.target, p.reaction, p.e_min_ev AS span_lo_ev,
                 p.e_max_ev AS span_hi_ev, count(a.lr) n_grid, sqrt(avg(a.lr * a.lr)) rms_log, max(abs(a.lr)) max_log,
                 coalesce(sqrt(avg(a.lr * a.lr)) > {CHANGE_RMS}, false) AS changed, {how} AS compared_from
          FROM pairs_all p LEFT JOIN a USING (key) WHERE p.{hf} AND p.{ht} GROUP BY ALL""")
    st = {"seconds": round(time.time() - t0), "pairs": one("SELECT count(*) FROM changes"),
          "changed": one("SELECT count(*) FROM changes WHERE changed"),
          "no_common_grid": one("SELECT count(*) FROM changes WHERE n_grid = 0"), "threshold_rms_log": CHANGE_RMS,
          "from": FROM_REL, "to": TO_REL}
    print(json.dumps(st))
    state(changes=st)


def retro():
    supported = f"support_datasets >= {SUPPORT_DATASETS} AND support_points >= {SUPPORT_POINTS}"
    q(f"""CREATE OR REPLACE TABLE retro_base AS
          SELECT s.key, s.target, s.reaction, s.sublibrary, s.mt, s.z, s.max_bin_z, s.mean_log_ratio AS mean_log_ratio_v80,
                 s.weighted_log_ratio AS weighted_log_ratio_v80, s1.mean_log_ratio AS mean_log_ratio_v81,
                 s1.weighted_log_ratio AS weighted_log_ratio_v81, s1.z AS z_v81, c.changed, c.rms_log, c.max_log,
                 s.n_points, s.n_datasets, s.support_points, s.support_datasets,
                 abs(s1.mean_log_ratio) < abs(s.mean_log_ratio) AS moved_toward_data
          FROM summary s JOIN changes c USING (key)
          LEFT JOIN summary s1 ON s1.key = s.key AND s1.release = '{TO_REL}'
          WHERE s.release = '{FROM_REL}' AND {supported.replace('support_', 's.support_')} AND c.n_grid > 0""")
    base_n = one("SELECT count(*) FROM retro_base")
    base_changed = one("SELECT count(*) FROM retro_base WHERE changed")
    base = base_changed / base_n if base_n else None
    summ = {"supported_pairs": base_n, "changed_pairs": base_changed, "base_rate": base,
            "support_rule": f">= {SUPPORT_DATASETS} datasets and >= {SUPPORT_POINTS} points after removing the driver",
            "change_rule": f"rms of log(sigma_{TO_REL} / sigma_{FROM_REL}) over the pair's EXFOR span > {CHANGE_RMS}", "from": FROM_REL, "to": TO_REL, "method": ("MF3 above the common resonance floor" if METHOD == "mf3" else "POINT 293.6 K for neutrons, averaged inside the resolved range"),
            "rankings": {}}
    for name, order in (("z", "z DESC"), ("abs_mean_log_ratio", "abs(mean_log_ratio_v80) DESC"),
                        ("max_bin_z", "max_bin_z DESC")):
        q(f"CREATE OR REPLACE TABLE rk_{name} AS SELECT row_number() OVER (ORDER BY {order}, key) AS rank, * FROM retro_base")
        tops = {}
        for n in (10, 20, 50, 100, 200):
            hit, dirn, nch = q(f"""SELECT avg(changed::INTEGER), avg(CASE WHEN changed THEN moved_toward_data::INTEGER END),
                                   sum(changed::INTEGER) FROM rk_{name} WHERE rank <= {n}""").fetchone()
            tops[str(n)] = {"hit_rate": hit, "enrichment": (hit / base) if base and hit is not None else None,
                            "changed": nch, "direction_rate": dirn}
        med, dec = q(f"""SELECT median(rank), avg((rank <= {base_n} / 10.0)::INTEGER) FROM rk_{name} WHERE changed""").fetchone()
        summ["rankings"][name] = {"top": tops, "changed_median_rank": med, "changed_in_top_decile": dec}
    # the same test at stricter definitions of "changed" (0.5% counts grid and format changes; 2, 5 and 10% are
    # re-evaluations), on the z ranking
    byt = {}
    for t in (0.005, 0.02, 0.05, 0.10):
        bn, bc = q(f"SELECT count(*), sum((coalesce(rms_log, 0) > {t})::INT) FROM rk_z").fetchone()
        base_t = bc / bn if bn else None
        tops = {}
        for n in (10, 20, 50, 100, 200):
            hit, dirn, nch = q(f"""SELECT avg((coalesce(rms_log, 0) > {t})::INT),
                                   avg(CASE WHEN rms_log > {t} THEN moved_toward_data::INT END),
                                   sum((coalesce(rms_log, 0) > {t})::INT) FROM rk_z WHERE rank <= {n}""").fetchone()
            tops[str(n)] = {"hit_rate": hit, "enrichment": hit / base_t if base_t else None, "changed": nch,
                            "direction_rate": dirn}
        byt[str(t)] = {"changed_pairs": bc, "base_rate": base_t, "top": tops,
                       "direction_rate_all_changed": one(f"SELECT avg(moved_toward_data::INT) FROM rk_z WHERE rms_log > {t}")}
    summ["by_threshold"] = byt
    summ["direction_rate_all_changed"] = one("SELECT avg(moved_toward_data::INT) FROM retro_base WHERE changed")
    q("""CREATE OR REPLACE TABLE retrodiction AS SELECT rank, key, target, reaction, sublibrary, mt, z, max_bin_z,
         mean_log_ratio_v80, mean_log_ratio_v81, weighted_log_ratio_v80, weighted_log_ratio_v81, z_v81, changed, rms_log,
         max_log, moved_toward_data, n_points, n_datasets, support_points, support_datasets FROM rk_z ORDER BY rank""")
    print(json.dumps(summ, indent=1))
    state(retrodiction=summ)
    os.makedirs(f"{WORK}/out", exist_ok=True)
    key = f"{FROM_REL}:{TO_REL}" + (" (MF3)" if METHOD == "mf3" and (FROM_REL, TO_REL) == ("B-VIII.0", "B-VIII.1") else
                                    " (POINT)" if PAIR and METHOD == "point" else "")
    try:
        main = json.loads(s3.get_object(Bucket=BUCKET, Key=f"{PREFIX}/retrodiction/summary.json")["Body"].read())
    except Exception:  # noqa: BLE001
        main = {}
    pairs = main.get("pairs") or {}
    pairs[key] = {k: v for k, v in summ.items() if k != "pairs"}
    if PAIR:
        # the rows, with the pair named, beside the main table (the _v80 columns are the earlier release, _v81 the later)
        path = f"{WORK}/out/retrodiction_pairs-{FROM_REL}_{TO_REL}_{METHOD}.parquet"
        q(f"""COPY (SELECT '{FROM_REL}' AS release_from, '{TO_REL}' AS release_to, '{key}' AS pair, * FROM rk_z ORDER BY rank)
              TO '{path}' (FORMAT PARQUET, COMPRESSION SNAPPY)""")
        s3.upload_file(path, BUCKET, f"{PREFIX}/retrodiction_pairs/{FROM_REL}_{TO_REL}" + ("_point" if METHOD == "point" else "") + ".parquet")
        main["pairs"] = pairs
    else:
        main = {**summ, "pairs": pairs}
    json.dump(main, open(f"{WORK}/out/retrodiction-summary.json", "w"), indent=1)
    s3.put_object(Bucket=BUCKET, Key=f"{PREFIX}/retrodiction/summary.json", Body=json.dumps(main, indent=1).encode(),
                  ContentType="application/json")


# ── Part C: the lists and the flags ──────────────────────────────────────────────────────────────────────────────────
def flags():
    supported = f"support_datasets >= {SUPPORT_DATASETS} AND support_points >= {SUPPORT_POINTS}"
    q(f"""CREATE OR REPLACE TABLE list81 AS SELECT row_number() OVER (ORDER BY z DESC, key) AS rank, * FROM summary
          WHERE release = 'B-VIII.1' AND {supported}""")
    # single-dataset driven: support fails, one dataset alone disagrees by more than 3 z (its own se and the MF33 sd)
    q(f"""CREATE OR REPLACE TABLE single81 AS
          SELECT row_number() OVER (ORDER BY abs(d.m) / sqrt(d.se * d.se + s.rel_sd_eval * s.rel_sd_eval) DESC, s.key) rank,
                 s.*, d.dataset AS single_dataset, d.n AS single_points, d.m AS single_log_ratio, d.se AS single_se,
                 abs(d.m) / sqrt(d.se * d.se + s.rel_sd_eval * s.rel_sd_eval) AS single_z
          FROM summary s JOIN dstat d ON d.rel = s.release AND d.key = s.key
          WHERE s.release = 'B-VIII.1' AND NOT ({supported.replace('support_', 's.support_')})
            AND abs(d.m) / sqrt(d.se * d.se + s.rel_sd_eval * s.rel_sd_eval) > {SINGLE_Z}
          QUALIFY row_number() OVER (PARTITION BY s.key ORDER BY abs(d.m) / sqrt(d.se * d.se + s.rel_sd_eval * s.rel_sd_eval)
                  DESC) = 1""")
    # EXFOR flags
    q("""CREATE OR REPLACE TABLE dsmed AS SELECT dataset, key, rel, units, median(exp(lr)) med_ratio, sum(npts) n
         FROM pr GROUP BY ALL""")
    q("""CREATE OR REPLACE TABLE exflags AS
         -- (a) a cross section (',SIG') in units that are not barns
         SELECT 'a' AS rule, x.dataset, any_value(x.key) key, any_value(x.units) units, count(*) n_points,
                NULL::DOUBLE AS factor,
                'quantity ,SIG with units ' || any_value(x.units) || ' (not barns)' AS note
         FROM ex x WHERE x.units <> 'B' GROUP BY x.dataset
         UNION ALL
         -- (b) the dataset's median ratio to every evaluation held is outside [0.1, 10] while the pair's other datasets
         --     sit inside [0.5, 2]
         SELECT 'b', d.dataset, d.key, 'B', max(d.n), pow(10, round(log10(median(d.med_ratio)))),
                'median ratio to every evaluation held ' || printf('%.3g', min(d.med_ratio)) || ' to '
                || printf('%.3g', max(d.med_ratio)) || '; the pair''s other datasets inside [0.5, 2]'
         FROM dsmed d WHERE d.units = 'B'
         GROUP BY d.dataset, d.key
         HAVING (min(d.med_ratio) > 10 OR max(d.med_ratio) < 0.1)
            AND NOT EXISTS (SELECT 1 FROM dsmed o WHERE o.key = d.key AND o.dataset <> d.dataset AND o.units = 'B'
                            AND (o.med_ratio < 0.5 OR o.med_ratio > 2))
            AND EXISTS (SELECT 1 FROM dsmed o WHERE o.key = d.key AND o.dataset <> d.dataset AND o.units = 'B')
         UNION ALL
         -- (c) every energy a decade or more outside every evaluation's span for the section
         SELECT 'c', x.dataset, x.key, 'B', count(*), NULL,
                'energies ' || printf('%.3g', min(x.e)) || ' to ' || printf('%.3g', max(x.e)) || ' eV; evaluations span '
                || printf('%.3g', min(s.emin)) || ' to ' || printf('%.3g', max(s.emax)) || ' eV'
         FROM ex x JOIN espan s ON s.key = x.key WHERE x.units = 'B'
         GROUP BY x.dataset, x.key
         HAVING max(x.e) < min(s.emin) / 10 OR min(x.e) > max(s.emax) * 10""")
    q("""CREATE OR REPLACE TABLE exfor_flags AS
         SELECT f.rule, f.dataset AS subentry, s.entry, s.first_author AS author, s.year, s.institute, s.reference, s.code,
                k.target, k.reaction, pk.sub AS sublibrary, pk.mt, f.units, f.n_points, f.factor, f.note,
                (SELECT string_agg(rel || ' ' || printf('%.4g', med_ratio), '; ' ORDER BY rel) FROM dsmed m
                 WHERE m.dataset = f.dataset) AS median_ratio_by_release,
                'https://www-nds.iaea.org/EXFOR/' || substr(f.dataset, 1, 5) || '.' || substr(f.dataset, 6, 3) AS exfor_url
         FROM exflags f LEFT JOIN si s ON s.dataset = f.dataset LEFT JOIN pairnames k ON k.key = f.key
         LEFT JOIN pairkeys pk ON pk.key = f.key""")
    st = {"list81": one("SELECT count(*) FROM list81"), "single81": one("SELECT count(*) FROM single81"),
          "exfor_flags_by_rule": dict(q("SELECT rule, count(*) FROM exfor_flags GROUP BY 1 ORDER BY 1").fetchall())}
    print(json.dumps(st))
    state(flags=st)


def eval_flags():
    """sweep_flags: the VIII.1 list's top 200 not named by any public list (sweep_public_list, built by public.py), with
    their receipts: z, the datasets (subentry, author, year), the largest deviation's bin, the MF33 sd."""
    pl = f"{WORK}/public_list.json"
    q("CREATE OR REPLACE TABLE public_list (source_url VARCHAR, za INTEGER, liso INTEGER, mt VARCHAR, note VARCHAR)")
    if os.path.exists(pl):
        insert("public_list", [(r["source_url"], r["za"], r["liso"], r["mt"], r["note"]) for r in json.load(open(pl))])
    q("""CREATE OR REPLACE TABLE eval_flags AS
         SELECT l.rank, l.key, l.target, l.reaction, l.sublibrary, l.mt, l.z, l.mean_log_ratio, l.mean_ratio,
                l.weighted_log_ratio, l.se, l.rel_sd_eval, l.mf33, l.max_bin_dev, l.max_bin_e_ev, l.n_points, l.n_datasets,
                l.driver_dataset, l.driver_effect,
                (SELECT string_agg(d.dataset || ' ' || coalesce(s.first_author, '?') || ' ' || coalesce(s.year::VARCHAR, '?')
                             || ' n=' || d.n || ' ratio=' || printf('%.4f', exp(d.m)), '; ' ORDER BY d.n DESC)
                 FROM dstat d LEFT JOIN si s ON s.dataset = d.dataset WHERE d.rel = 'B-VIII.1' AND d.key = l.key) AS datasets
         FROM list81 l
         WHERE l.rank <= 200 AND NOT EXISTS (SELECT 1 FROM public_list p WHERE ((p.za = l.target_za AND p.liso = l.liso)
               OR (p.za % 1000 = 0 AND p.za // 1000 = l.target_za // 1000))
               AND (p.mt = 'all' OR p.mt = l.mt::VARCHAR))""")
    st = {"eval_flags": one("SELECT count(*) FROM eval_flags"), "public_list_rows": one("SELECT count(*) FROM public_list")}
    print(json.dumps(st))
    state(flags=st)


# ── write and register ───────────────────────────────────────────────────────────────────────────────────────────────
TABLES = {
    "pairs_all": "SELECT * FROM pairs_all ORDER BY target_za, liso, sublibrary, mt",
    "summary": "SELECT * FROM summary ORDER BY release, z DESC",
    "bins": """SELECT b.rel AS release, b.key, k.za AS target_za, k.liso, k.sub AS sublibrary, k.mt, n.target, n.reaction,
               b.k AS bin, b.e_lo AS e_lo_ev, b.e_hi AS e_hi_ev, b.n_points, b.n_datasets, b.mean_log_ratio, b.se,
               b.mean_log_ratio_points, b.mean_ratio, b.rel_sd_eval, b.z
               FROM bins b JOIN pairkeys k USING (key) LEFT JOIN pairnames n USING (key) ORDER BY release, key, bin""",
    "datasets": """SELECT d.rel AS release, d.key, k.za AS target_za, k.liso, k.sub AS sublibrary, k.mt, n.target, n.reaction,
                   d.dataset, s.entry, s.first_author AS author, s.year, d.n AS n_points, d.m AS mean_log_ratio, d.se,
                   d.u AS median_rel_unc, d.med_ratio AS median_ratio, d.emin AS e_min_ev, d.emax AS e_max_ev
                   FROM dstat d JOIN pairkeys k USING (key) LEFT JOIN pairnames n USING (key)
                   LEFT JOIN si s ON s.dataset = d.dataset ORDER BY release, key, dataset""",
    "changes": "SELECT * FROM changes ORDER BY rms_log DESC NULLS LAST",
    "retrodiction": "SELECT * FROM retrodiction ORDER BY rank",
    "flags": "SELECT * FROM eval_flags ORDER BY rank",
    "exfor_flags": "SELECT * FROM exfor_flags ORDER BY rule, subentry",
    "single": "SELECT * FROM single81 ORDER BY rank",
    "public_list": "SELECT * FROM public_list",
    "points": """SELECT rel AS release, key, dataset, e AS e_ev, exp(lr) AS ratio, how FROM pr WHERE units = 'B'
                 ORDER BY release, key, dataset, e""",
}
ATHENA = {"VARCHAR": "string", "DOUBLE": "double", "BIGINT": "bigint", "INTEGER": "int", "BOOLEAN": "boolean",
          "FLOAT": "float", "HUGEINT": "bigint", "VARCHAR[]": "array<string>", "SMALLINT": "int", "UBIGINT": "bigint"}


def write(names=None):
    ath = boto3.client("athena", region_name="us-east-2")
    out = {}
    os.makedirs(f"{WORK}/out/ddl", exist_ok=True)
    for t, sql in TABLES.items():
        if names and t not in names:
            continue
        src = {"flags": "eval_flags", "single": "single81", "datasets": "dstat", "points": "pr"}.get(t, t)
        exists = one(f"SELECT count(*) FROM information_schema.tables WHERE table_name = '{src}'")
        if not exists:
            print("skip", t)
            continue
        d = f"{WORK}/out/{t}"
        os.makedirs(d, exist_ok=True)
        path = f"{d}/part-0.parquet"
        desc = q(f"DESCRIBE {sql}").fetchall()
        sel = ", ".join(f'"{c[0]}"' if ATHENA.get(c[1]) else f'CAST("{c[0]}" AS VARCHAR) AS "{c[0]}"' for c in desc)
        q(f"COPY (SELECT {sel} FROM ({sql})) TO '{path}' (FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 50000)")
        rows = one(f"SELECT count(*) FROM read_parquet('{path}')")
        key = f"{PREFIX}/{t}/part-0.parquet"
        s3.upload_file(path, BUCKET, key)
        cols = ",\n  ".join(f"`{c[0]}` {ATHENA.get(c[1], 'string')}" for c in desc)
        ddl = (f"CREATE EXTERNAL TABLE `sweep_{t}` (\n  {cols}\n)\nSTORED AS PARQUET\n"
               f"LOCATION 's3://{BUCKET}/{PREFIX}/{t}/'\nTBLPROPERTIES ('parquet.compression'='SNAPPY')")
        open(f"{WORK}/out/ddl/sweep_{t}.sql", "w").write(ddl + ";\n")
        s3.put_object(Bucket=BUCKET, Key=f"lake/_work/sweep/ddl/sweep_{t}.sql", Body=(ddl + ";\n").encode())
        for stmt in (f"DROP TABLE IF EXISTS `sweep_{t}`", ddl):
            qid = ath.start_query_execution(QueryString=stmt, QueryExecutionContext={"Database": "nsr"},
                                            WorkGroup="nsrgpt")["QueryExecutionId"]
            while True:
                e = ath.get_query_execution(QueryExecutionId=qid)["QueryExecution"]["Status"]
                if e["State"] in ("SUCCEEDED", "FAILED", "CANCELLED"):
                    break
                time.sleep(1)
            if e["State"] != "SUCCEEDED":
                print("athena", t, e)
        out[t] = {"rows": rows, "bytes": os.path.getsize(path), "location": f"s3://{BUCKET}/{PREFIX}/{t}/",
                  "athena": f"nsr.sweep_{t}"}
        print(t, out[t], flush=True)
    state(tables=out)


STEPS = {"load": load, "exfor": lambda: load(True), "evals": load_evals, "floors": floors, "covs": covs, "loadstate": loadstate, "check": check, "run": run, "changes": changes, "retro": retro, "flags": flags,
         "eval_flags": eval_flags, "write": write}

if __name__ == "__main__":
    args = sys.argv[1:]
    for a in args:
        if a.startswith("write="):
            write(a.split("=", 1)[1].split(","))
            continue
        t = time.time()
        print(f"== {a}", flush=True)
        STEPS[a]()
        print(f"== {a} {time.time() - t:.0f}s", flush=True)
        state(timings={a: round(time.time() - t)})
