"""Brief 57 follow-up 3, the rest: the evaluators' public mentions, the material level, File 1 and NSR features, and the
orphan list. Runs on the sweep box after v3.py (the v3 database /data/sweep/v3.duckdb):
  HOME=/root venv/bin/python -I v3_more.py mentions material orphans
- mentions: sweep_public_mentions (source, year, za, liso, context) from what the evaluators published that the lake
  holds: IAEA INDEN's pages, data files and reports and IAEA CIELO's pages (the lake's mirror of 2026-11-07; the live
  sites answer the boxes with HTTP 403, a browser user agent included), NNDC's ENDF/B-VIII.1 descriptions and metadata
  and the GitHub issues (sweep_public_list). A mention's year is the nearest year (2005 to 2026) within 200 characters,
  else none (counted only as "ever mentioned"). CSEWG publishes no minutes at nndc.bnl.gov/csewg/ (404) and its GitLab
  needs a login; the NEA WPEC pages answer 403.
- material: the unit is (release, neutron material); revised when any of its supported sections was revised (v2's
  metric); the score is the largest section score; beside it one L2 logistic on five features (the score, years since
  the evaluation date, MF33 held, NSR evaluation papers in the window, public mentions in the window); the section score
  within revised materials; the VIII.2 material ranking frozen.
- orphans: sections in the VIII.1 ranking's top 300 (the score) with no public mention, no NSR evaluation or comparison
  paper since 2018 and no change at the data in the last two steps, with their receipts: sweep_orphans,
  /sweep/flags?kind=orphan.
"""
import io
import json
import math
import os
import re
import subprocess
import sys
import time

os.environ["SWEEP_SET"] = "v3"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import v3 as V  # noqa: E402
import sweep as S  # noqa: E402
from public import PATTERNS, ELEMENTS, text_of  # noqa: E402
import numpy as np  # noqa: E402

q, one, B, PREFIX = S.q, S.one, S.B, S.PREFIX
YEARS = {"B-VII.1": 2011, "B-VIII.0": 2018, "B-VIII.1": 2024}
MIRROR = ["raw/iaea/2026-11-07/INDEN/", "raw/iaea/2026-11-07/CIELO/", "raw/iaea/2026-11-07/CIELO",
          "raw/iaea/2026-11-07/CIELO.rendered.html"]
YEAR_RE = re.compile(r"(?<!\d)(20(0[5-9]|1\d|2[0-6]))(?!\d)")


def find(text):
    """Every nuclide named in text: (za, liso, position)."""
    out = []
    for i, p in enumerate(PATTERNS):
        for m in p.finditer(text):
            try:
                if i == 0:
                    z, sym, a, iso = int(m.group(1)), m.group(2), int(m.group(3)), m.group(4)
                    if ELEMENTS.index(sym) != z:
                        continue
                elif i == 1:
                    sym, a, iso = m.group(1), int(m.group(2)), m.group(3) or ""
                else:
                    a, iso, sym = int(m.group(1)), m.group(2) or "", m.group(3)
            except (ValueError, IndexError):
                continue
            z = ELEMENTS.index(sym)
            if z and z <= a <= 3 * z + 12:
                out.append((z * 1000 + a, 1 if iso.startswith("m") else 0, m.start()))
    return out


def year_near(text, pos):
    best = None
    for m in YEAR_RE.finditer(text, max(0, pos - 200), pos + 200):
        d = abs(m.start() - pos)
        if best is None or d < best[0]:
            best = (d, int(m.group(1)))
    return best[1] if best else None


def mentions():
    rows = []
    keys = []
    for pre in MIRROR:
        for pg in S.s3.get_paginator("list_objects_v2").paginate(Bucket=S.BUCKET, Prefix=pre):
            keys += [o["Key"] for o in pg.get("Contents", []) if not o["Key"].endswith("/")]
    keys = sorted(set(k for k in keys if "/_work/" not in k))
    for k in keys:
        low = k.lower()
        name = k.rsplit("/", 1)[-1]
        src = f"s3://{S.BUCKET}/{k}"
        # a data file's name names its material (cr52-v2.3.4c_ENDF.zip, La139_ACE.zip, 05B10_ENDF.zip)
        if low.endswith((".zip", ".tgz", ".ace", ".png", ".ps")):
            nm = re.sub(r"^(\d{2})([A-Z][a-z]?)(\d+)", r"\2-\3", name)
            for za, liso, _ in find(nm.replace("_", " ").replace("-v", " v")):
                rows.append((src, None, za, liso, f"file {name}"))
            continue
        body = S.s3.get_object(Bucket=S.BUCKET, Key=k)["Body"].read()
        if low.endswith(".pdf") or body[:4] == b"%PDF":
            try:
                text = subprocess.run(["pdftotext", "-layout", "-", "-"], input=body, capture_output=True,
                                      timeout=120).stdout.decode("utf-8", "replace")
            except Exception:  # noqa: BLE001
                continue
        else:
            text = text_of(body, "text/html") or ""
        text = re.sub(r"\s+", " ", text)
        seen = set()
        for za, liso, pos in find(text):
            y = year_near(text, pos)
            if (za, liso, y) in seen:
                continue
            seen.add((za, liso, y))
            rows.append((src, y, za, liso, text[max(0, pos - 100): pos + 100]))
    # NNDC's VIII.1 notes (dated 2024-10-21) and the GitHub issues (undated) from sweep_public_list
    pl = q(f"SELECT source_url, za, liso, note FROM read_parquet('{B}/{PREFIX}/public_list/*.parquet')").fetchall()
    for url, za, liso, note in pl:
        rows.append((url, 2024 if "nndc.bnl.gov" in url else None, za, liso, (note or "")[:200]))
    q("CREATE OR REPLACE TABLE public_mentions (source VARCHAR, year INTEGER, za INTEGER, liso INTEGER, context VARCHAR)")
    S.insert("public_mentions", rows)
    path = "/data/sweep/out/public_mentions.parquet"
    q(f"COPY public_mentions TO '{path}' (FORMAT PARQUET, COMPRESSION SNAPPY)")
    S.s3.upload_file(path, S.BUCKET, f"{PREFIX}/public_mentions/part-0.parquet")
    register("public_mentions", [("source", "string"), ("year", "int"), ("za", "int"), ("liso", "int"), ("context", "string")])
    st = {"rows": len(rows), "documents": len(keys), "by_source": dict(q(
        "SELECT regexp_extract(source, '(INDEN|CIELO|nndc|github)', 1) s, count(*) FROM public_mentions GROUP BY 1").fetchall()),
          "dated": one("SELECT count(*) FROM public_mentions WHERE year IS NOT NULL"),
          "unreachable": ["https://www.nndc.bnl.gov/csewg/meetings/ (404: CSEWG publishes no minutes there)",
                          "https://git.nndc.bnl.gov/endf (login)", "https://www.oecd-nea.org/jcms/pl_20541/wpec-subgroups (403)",
                          "https://www-nds.iaea.org/INDEN/ and /CIELO/ live (403; the lake's mirror of 2026-11-07 used)"]}
    print(json.dumps(st, indent=1, default=str), flush=True)
    S.state(mentions=st)


def register(name, cols):
    import boto3
    ath = boto3.client("athena", region_name="us-east-2")
    ddl = (f"CREATE EXTERNAL TABLE `sweep_{name}` (\n  " + ",\n  ".join(f"`{c}` {t}" for c, t in cols) +
           f"\n)\nSTORED AS PARQUET\nLOCATION 's3://{S.BUCKET}/{PREFIX}/{name}/'\nTBLPROPERTIES ('parquet.compression'='SNAPPY')")
    S.s3.put_object(Bucket=S.BUCKET, Key=f"lake/_work/sweep/ddl/sweep_{name}.sql", Body=(ddl + ";\n").encode())
    for stmt in (f"DROP TABLE IF EXISTS `sweep_{name}`", ddl):
        qid = ath.start_query_execution(QueryString=stmt, QueryExecutionContext={"Database": "nsr"},
                                        WorkGroup="nsrgpt")["QueryExecutionId"]
        while ath.get_query_execution(QueryExecutionId=qid)["QueryExecution"]["Status"]["State"] in ("QUEUED", "RUNNING"):
            time.sleep(1)


def file1(rel):
    rows = q(f"""WITH m AS (SELECT round(za)::INT za, regexp_replace(sublibrary, '-version[.].*$', '') sub, mat, file_name,
                                   alab, edate, rdate, nmod, auth, description
                            FROM read_parquet('{B}/lake/endfb/{rel}/materials/*.parquet')),
                  s AS (SELECT file_name, mat, max((mf = 33)::INT) mf33, max((mf = 32)::INT) mf32
                        FROM read_parquet('{B}/lake/endfb/{rel}/sections/*.parquet') GROUP BY ALL)
                 SELECT m.za, m.alab, m.edate, m.rdate, m.nmod, m.auth, m.description, coalesce(s.mf33, 0), coalesce(s.mf32, 0)
                 FROM m LEFT JOIN s USING (file_name, mat) WHERE m.sub = 'neutrons'""").fetchall()

    def yr(s):
        d = re.findall(r"(\d{2,4})\s*$", s or "")
        if not d:
            return None
        y = int(d[0])
        return y if y > 1900 else (2000 + y if y < 50 else 1900 + y)
    out = {}
    for za, alab, edate, rdate, nmod, auth, desc, mf33, mf32 in rows:
        t = (desc or "").lower()
        ey, ry = yr(edate), yr(rdate)
        out[za] = {"eval_year": ey, "rev_year": ry, "years_since_eval": (YEARS[rel] - max(x for x in (ey, ry) if x)) if (ey or ry) else None,
                   "nmod": nmod, "lab": re.split(r"[,+/ ]", (alab or "").strip().upper())[0] or None,
                   "n_authors": len(re.split(r",| and ", auth or "")) if auth else 0,
                   "w_preliminary": t.count("preliminar"), "w_revised": t.count("revis"), "w_adopted": t.count("adopt"),
                   "w_pending": t.count("pending"), "w_to_be": t.count("to be "), "mf33": int(mf33), "mf32": int(mf32)}
    return out


def nsr_counts(y0, y1):
    q(f"""CREATE OR REPLACE TABLE nsrk AS
          SELECT n.z, n.a, k.pub_year,
                 regexp_matches(k.keywords, '(?i)(evaluat|r-matrix|resonance analysis|endf)') AS ev,
                 regexp_matches(k.keywords, '(?i)(compared with|disagree)') AS cmp
          FROM read_parquet('{V.NSR}/public.nsr_nuclides/*/*.parquet') n
          JOIN read_parquet('{V.NSR}/public.nsr/*/*.parquet') k ON k.key_number = n.key_number
          WHERE coalesce(n.sub_type, 'TARGET') = 'TARGET'""")
    return {(z * 1000 + a): (ev, cmp) for z, a, ev, cmp in q(
        f"SELECT z, a, sum(ev::INT), sum(cmp::INT) FROM nsrk WHERE a IS NOT NULL AND z IS NOT NULL "
        f"AND pub_year BETWEEN {y0} AND {y1} GROUP BY ALL").fetchall()}


def mention_counts(y0, y1):
    got = {za: (w, l2, e) for za, w, l2, e in q(f"""SELECT za, count(*) FILTER (WHERE year BETWEEN {y0} AND {y1}),
                count(*) FILTER (WHERE year BETWEEN {y1 - 1} AND {y1}), count(*) FROM public_mentions GROUP BY za""").fetchall()}
    return got


def material():
    from scipy.stats import mannwhitneyu
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    V.base_tables()
    have_m = one("SELECT count(*) FROM information_schema.tables WHERE table_name = 'public_mentions'")
    if not have_m:
        q("CREATE TABLE public_mentions (source VARCHAR, year INTEGER, za INTEGER, liso INTEGER, context VARCHAR)")
    out = {"unit": "(release, neutron material); revised when any supported section's change at the data exceeds 1 (v2)",
           "steps": {}}
    mats = {}
    for tag in ("train", "test", "forward"):
        st = V.STEPS[tag]
        rows = [r for r in V.features(tag) if r["sub"] == "neutrons"]
        f1 = file1(st["a"])
        y0, y1 = st["years"]
        nsr, men = nsr_counts(y0, y1), mention_counts(y0, y1)
        by = {}
        for r in rows:
            by.setdefault(r["za"], []).append(r)
        ms = []
        for za, rs in by.items():
            sc = [r["z_all"] for r in rs if r["z_all"] is not None]
            f = f1.get(za, {})
            m = {"za": za, "target": rs[0]["target"], "sections": len(rs), "score": max(sc) if sc else 0.0,
                 "label": None if rs[0]["label"] is None else int(any(r["label"] for r in rs)),
                 "nsr_eval": (nsr.get(za) or (0, 0))[0], "nsr_compare": (nsr.get(za) or (0, 0))[1],
                 "mentions_window": (men.get(za) or (0, 0, 0))[0], "mentions_last2": (men.get(za) or (0, 0, 0))[1],
                 "mentions_ever": (men.get(za) or (0, 0, 0))[2], "matclass": V.matclass(za), **f}
            ms.append(m)
        mats[tag] = ms
        if tag != "forward":
            y = np.array([m["label"] for m in ms])
            s = np.array([m["score"] for m in ms])
            u = mannwhitneyu(s[y == 1], s[y == 0], alternative="greater")
            within = [r for r in rows if r["label"] is not None and any(x["label"] for x in by[r["za"]])]
            yw = np.array([r["label"] for r in within])
            sw = np.array([r["z_all"] or 0 for r in within])
            out["steps"][f"{st['a']}:{st['b']}"] = {
                "materials": len(ms), "revised": int(y.sum()), "base_rate": float(y.mean()), "auc_score": float(roc_auc_score(y, s)),
                "mann_whitney_p_one_sided": float(u.pvalue), "precision_at_50": V.prec_at(y, s, 50),
                "single_feature_auc": {f: float(roc_auc_score(y, np.array([(m.get(f) if m.get(f) is not None else -1) for m in ms], float)))
                                       for f in ("nsr_eval", "nsr_compare", "mentions_window", "mentions_last2", "mentions_ever",
                                                 "years_since_eval", "mf33", "nmod", "w_preliminary", "w_revised")
                                       if len(set(m.get(f) for m in ms)) > 1},
                "sections_within_revised_materials": {"sections": len(within), "revised": int(yw.sum()),
                                                      "auc_score": float(roc_auc_score(yw, sw)) if 0 < yw.sum() < len(yw) else None}}
    small = ["score", "years_since_eval", "mf33", "nsr_eval", "mentions_window"]

    def mat(ms):
        return np.array([[float(m.get(f)) if m.get(f) is not None else 0.0 for f in small] for m in ms])
    ytr, yte = np.array([m["label"] for m in mats["train"]]), np.array([m["label"] for m in mats["test"]])
    lr = make_pipeline(StandardScaler(), LogisticRegression(C=0.1, max_iter=2000))
    lr.fit(mat(mats["train"]), ytr)
    p = lr.predict_proba(mat(mats["test"]))[:, 1]
    out["small_logistic"] = {"features": small, "auc": float(roc_auc_score(yte, p)), "precision_at_50": V.prec_at(yte, p, 50),
                             "coefficients": dict(zip(small, map(float, lr.named_steps["logisticregression"].coef_[0])))}
    fw = sorted(mats["forward"], key=lambda m: -m["score"])
    lr.fit(np.vstack([mat(mats["train"]), mat(mats["test"])]), np.concatenate([ytr, yte]))
    pf = dict(zip([m["za"] for m in mats["forward"]], lr.predict_proba(mat(mats["forward"]))[:, 1]))
    pred = json.loads(S.s3.get_object(Bucket=S.BUCKET, Key=f"{PREFIX}/prediction-viii2.json")["Body"].read())
    pred["materials"] = {"frozen_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "unit": out["unit"],
                         "ranking": "by the score (the largest section score of the material), with the small logistic's probability",
                         "materials": len(fw), "top": [{"rank": i + 1, "target": m["target"], "za": m["za"], "score": m["score"],
                                                        "sections": m["sections"], "p_small_logistic": float(pf[m["za"]]),
                                                        "nsr_eval_2025_26": m["nsr_eval"], "mentions_ever": m["mentions_ever"]}
                                                       for i, m in enumerate(fw[:200])]}
    S.s3.put_object(Bucket=S.BUCKET, Key=f"{PREFIX}/prediction-viii2.json", Body=json.dumps(pred, indent=1, default=float).encode(),
                    ContentType="application/json")
    main_s = json.loads(S.s3.get_object(Bucket=S.BUCKET, Key=f"{PREFIX}/retrodiction/summary.json")["Body"].read())
    main_s["material"] = out
    S.s3.put_object(Bucket=S.BUCKET, Key=f"{PREFIX}/retrodiction/summary.json",
                    Body=json.dumps(main_s, indent=1, default=float).encode(), ContentType="application/json")
    print(json.dumps(out, indent=1, default=float), flush=True)


def orphans():
    V.base_tables()
    rows = sorted([r for r in V.features("forward") if r["z_all"] is not None], key=lambda r: -r["z_all"])[:300]
    nsr = nsr_counts(2018, 2026)
    # for the orphans an evaluation paper is one that does an evaluation, not one that compares with evaluated data:
    # its keywords say R-matrix, resonance (parameter) analysis, evaluated sigma, cross section or resonance parameters,
    # or a new evaluation
    tight = {(z * 1000 + a): n for z, a, n in q("""SELECT n.z, n.a, count(*) FROM read_parquet('""" + V.NSR + """/public.nsr_nuclides/*/*.parquet') n
        JOIN read_parquet('""" + V.NSR + """/public.nsr/*/*.parquet') k ON k.key_number = n.key_number
        WHERE coalesce(n.sub_type, 'TARGET') = 'TARGET' AND n.a IS NOT NULL AND k.pub_year BETWEEN 2018 AND 2026
          AND regexp_matches(k.keywords, '(?i)(r-matrix|resonance (parameter )?analysis|evaluated (σ|sigma|cross section|resonance)|new evaluation)')
        GROUP BY ALL""").fetchall()}
    nsr = {za: (tight.get(za, 0), v[1]) for za, v in nsr.items()} | {za: (n, 0) for za, n in tight.items() if za not in nsr}
    men = {za for (za,) in q("SELECT DISTINCT za FROM public_mentions").fetchall()}
    out, why = [], {"mentioned": 0, "evaluation_paper": 0, "comparison_paper": 0, "changed_before": 0, "all_four_absent": 0}
    for i, r in enumerate(rows, 1):
        ev, cmp = nsr.get(r["za"], (0, 0))
        h = [x for x in (r["hist1"], r["hist2"]) if x is not None]
        ch = bool(h and max(h) > 0.005)
        why["mentioned"] += r["za"] in men
        why["evaluation_paper"] += bool(ev)
        why["comparison_paper"] += bool(cmp)
        why["changed_before"] += ch
        why["all_four_absent"] += not (r["za"] in men or ev or cmp or ch)
        # every candidate has an NSR paper whose keywords say "compared with" or "disagree", so the list asks only that
        # no evaluation-type paper exists (evaluation, R-matrix, resonance analysis, ENDF); the comparison count is a receipt
        if r["za"] in men or ev or ch:
            continue
        ds = q("""SELECT d.dataset, s.first_author, s.year, d.n, exp(d.m) FROM dsa d LEFT JOIN si s USING (dataset)
                  WHERE d.rel = 'B-VIII.1' AND d.key = ? ORDER BY d.n DESC""", [r["key"]]).fetchall()
        out.append({"rank_in_viii1": i, "target": r["target"], "reaction": r["reaction"], "sublibrary": r["sub"], "mt": r["mt"],
                    "z": r["z_all"], "ratio_measured_to_evaluated": r["ratio_all"], "n_datasets": r["n_datasets"],
                    "n_points": r["n_points"], "change_viii0_viii1": r["hist1"], "change_vii1_viii0": r["hist2"],
                    "nsr_comparison_papers_since_2018": cmp,
                    "datasets": "; ".join(f"{d[0]} {d[1] or '?'} {d[2] or '?'} n={d[3]} ratio={d[4]:.4f}" for d in ds),
                    "why": "no public mention, no NSR paper since 2018 that does an evaluation (R-matrix, resonance analysis, "
                           "evaluated sigma or resonance parameters, a new evaluation), no change at the data in the last two releases"})
    import pyarrow as pa
    import pyarrow.parquet as pq
    tbl = pa.table({k: [o[k] for o in out] for k in (out[0].keys() if out else ["target"])})
    path = "/data/sweep/out/orphans.parquet"
    pq.write_table(tbl, path, compression="snappy")
    S.s3.upload_file(path, S.BUCKET, f"{PREFIX}/orphans/part-0.parquet")
    if out:
        register("orphans", [(f.name, {"double": "double", "int64": "bigint", "string": "string"}.get(str(f.type), "string"))
                             for f in tbl.schema])
    print(json.dumps({"orphans": len(out), "of_top": len(rows), "conditions_met_among_top": why, "first": out[:5]}, indent=1,
                     default=float), flush=True)
    S.state(orphans={"orphans": len(out), "of_top": len(rows), "conditions_met_among_top": why})
    main_s = json.loads(S.s3.get_object(Bucket=S.BUCKET, Key=f"{PREFIX}/retrodiction/summary.json")["Body"].read())
    main_s["orphans"] = {"orphans": len(out), "of_top": len(rows), "conditions_met_among_top": why}
    S.s3.put_object(Bucket=S.BUCKET, Key=f"{PREFIX}/retrodiction/summary.json",
                    Body=json.dumps(main_s, indent=1, default=float).encode(), ContentType="application/json")


if __name__ == "__main__":
    for step in sys.argv[1:]:
        print("==", step, flush=True)
        {"mentions": mentions, "material": material, "orphans": orphans}[step]()
