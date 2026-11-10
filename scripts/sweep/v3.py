"""Brief 57 follow-up 3: a predictor of "this section changes in the next release", trained on ENDF/B-VII.1 to VIII.0,
tested blind on VIII.0 to VIII.1, and frozen for VIII.1 to VIII.2. Runs on the sweep box after
  SWEEP_SET=v3 sweep.py load floors covs run      (VIII.1, VIII.0, VII.1 from POINT 293.6 K; VII.0, VI.8, JEFF-3.3,
                                                   JENDL-5 from MF3 above their floors; database /data/sweep/v3.duckdb)
  HOME=/root venv/bin/python -I v3.py
Universe per release step a to b: every (target, sublibrary, MT) pair with at least two EXFOR datasets of any year, flagged
EXFOR datasets (sweep_exfor_flags) left out, compared with both releases. Label: the change a to b measured at those
data, |weighted mean ln(sigma_b / sigma_a)| / sqrt(se^2 + MF33 sd^2) (the disagreement's units, v2's metric), changed
when above 1. Features, all from the lake and all known at release a:
 1. z_all (a's disagreement on every year's data), z_new (on data published between a and b; null when there is
    none) and n_new (the count of such datasets, zero allowed); n_datasets and n_points.
 2. a's distance from JEFF-3.3 and from JENDL-5 at the data (in the same units) and whether the data side with each.
    JEFF-3.3 (2017-11) and JENDL-5 (2021-12) postdate VII.1 and JENDL-5 postdates VIII.0, so in training they carry some
    knowledge of VIII.0; the test on VIII.0 to VIII.1 is clean (both predate VIII.1).
 3. the change history: the RMS of ln(sigma) differences at the data over the two prior steps (VI.8 to VII.0 and VII.0
    to VII.1 for training; VII.0 to VII.1 and VII.1 to VIII.0 for the test; VII.1 to VIII.0 and VIII.0 to VIII.1 for
    the forward ranking).
 4. NSR papers on the target nuclide published in the step's window whose keywords say evaluation, R-matrix, resonance
    analysis or ENDF.
 5. the material class (standard, actinide, structural, fission product, light, other) and the MT class.
Models: logistic regression (standardized, nulls as zero with an indicator) and gradient boosting (scikit-learn
HistGradientBoostingClassifier, nulls native, shallow trees). Test: AUC, precision at 50 and 200, Brier score,
calibration, the importance of each feature (standardized coefficients; permutation importance on the held-out AUC),
beside single-feature baselines.
"""
import hashlib
import json
import math
import os
import pickle
import sys
import time

os.environ["SWEEP_SET"] = "v3"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sweep as S  # noqa: E402
import numpy as np  # noqa: E402

q, one, B, PREFIX, DSE = S.q, S.one, S.B, S.PREFIX, S.DSE
NSR = f"{B}/lake/nsr-database/2026-10-15/nsr"
STEPS = {
    "train": {"a": "B-VII.1", "b": "B-VIII.0", "years": (2012, 2017), "h1": ("B-VII.0", "B-VII.1"), "h2": ("B-VI.8", "B-VII.0")},
    "test": {"a": "B-VIII.0", "b": "B-VIII.1", "years": (2018, 2023), "h1": ("B-VII.1", "B-VIII.0"), "h2": ("B-VII.0", "B-VII.1")},
    "forward": {"a": "B-VIII.1", "b": None, "years": (2025, 2026), "h1": ("B-VIII.0", "B-VIII.1"), "h2": ("B-VII.1", "B-VIII.0")},
}
STANDARDS = {1001, 2003, 3006, 5010, 6000, 6012, 79197, 92235, 92238}
STRUCTURAL = {12, 13, 14, 22, 23, 24, 25, 26, 27, 28, 29, 40, 41, 42, 72, 73, 74, 82, 83}
NUM = ["z_all", "z_new", "n_new", "log_datasets", "log_points", "d_jeff", "d_jendl", "sides_jeff", "sides_jendl",
       "hist1", "hist2", "nsr_papers"]
CLASSES = ["standard", "actinide", "structural", "fission_product", "light", "other"]
MTCLASSES = ["total", "elastic", "nonelastic", "inelastic", "capture", "fission", "multiplying", "charged_out", "other_mt"]
BIRGE = "CASE WHEN nd > 1 THEN greatest(1, sqrt(greatest({s2} - {s1} * {s1} / s0, 0) / (nd - 1))) ELSE 1 END"


def matclass(za):
    z = za // 1000
    if za in STANDARDS:
        return "standard"
    if z >= 89:
        return "actinide"
    if z in STRUCTURAL:
        return "structural"
    if z <= 9:
        return "light"
    if 30 <= z <= 66:
        return "fission_product"
    return "other"


def mtclass(mt):
    if mt == 1:
        return "total"
    if mt == 2:
        return "elastic"
    if mt in (3, 27):
        return "nonelastic"
    if mt == 4 or 51 <= mt <= 91:
        return "inelastic"
    if mt == 102:
        return "capture"
    if mt in (18, 19, 20, 21, 38):
        return "fission"
    if mt in (16, 17, 37, 152, 153, 160, 161):
        return "multiplying"
    if 103 <= mt <= 117 or mt in (22, 28, 32, 33, 34):
        return "charged_out"
    return "other_mt"


def base_tables():
    q(f"CREATE OR REPLACE TABLE xflag AS SELECT DISTINCT subentry FROM read_parquet('{B}/{PREFIX}/exfor_flags/*.parquet')")
    q("""CREATE OR REPLACE TABLE pf AS SELECT p.*, s.year FROM pr p JOIN si s USING (dataset)
         WHERE p.units = 'B' AND p.dataset NOT IN (SELECT subentry FROM xflag)""")
    q(f"""CREATE OR REPLACE TABLE dsa AS
          WITH a AS (SELECT rel, key, dataset, any_value(year) AS yr, count(*) nr, sum(npts) n, sum(w) sw, sum(w * lr) swl,
                            sum(w * lr * lr) swl2, median(sig) u FROM pf GROUP BY rel, key, dataset)
          SELECT *, swl / sw AS m, {DSE} AS se FROM a""")
    q("""CREATE OR REPLACE TABLE sdk AS SELECT p.rel, p.key, sum(p.npts * coalesce(b.rel_sd_eval, 0)) / sum(p.npts) sd
         FROM pf p LEFT JOIN bins b ON b.rel = p.rel AND b.key = p.key AND b.k = p.k GROUP BY ALL""")
    q(f"""CREATE OR REPLACE TABLE nsrp AS
          SELECT n.z, n.a, k.pub_year FROM read_parquet('{NSR}/public.nsr_nuclides/*/*.parquet') n
          JOIN read_parquet('{NSR}/public.nsr/*/*.parquet') k ON k.key_number = n.key_number
          WHERE coalesce(n.sub_type, 'TARGET') = 'TARGET'
            AND regexp_matches(k.keywords, '(?i)(evaluat|r-matrix|resonance analysis|endf)')""")


def single(a, name, cond="true"):
    """a's weighted mean log ratio and se per pair over the datasets meeting cond."""
    q(f"""CREATE OR REPLACE TABLE {name} AS
          WITH t AS (SELECT key, count(*) nd, sum(n) np, sum(1 / (se * se)) s0, sum(m / (se * se)) s1,
                            sum(m * m / (se * se)) s2 FROM dsa WHERE rel = '{a}' AND {cond} GROUP BY key)
          SELECT t.key, nd, np, s1 / s0 AS m, {BIRGE.format(s1='s1', s2='s2')} / sqrt(s0) AS se,
                 coalesce(sd.sd, 0) AS sd FROM t LEFT JOIN sdk sd ON sd.rel = '{a}' AND sd.key = t.key""")


def paired(a, b, name):
    """a and b on the same datasets: M_a, M_b, the larger Birge-scaled se, a's MF33 sd."""
    q(f"""CREATE OR REPLACE TABLE {name} AS
          WITH d AS (SELECT x.key, x.dataset, x.n, x.m ma, y.m mb, greatest(x.se, y.se) se FROM dsa x
                     JOIN dsa y ON y.key = x.key AND y.dataset = x.dataset AND y.rel = '{b}' WHERE x.rel = '{a}'),
          t AS (SELECT key, count(*) nd, sum(n) np, sum(1 / (se * se)) s0, sum(ma / (se * se)) s1a,
                       sum(ma * ma / (se * se)) s2a, sum(mb / (se * se)) s1b, sum(mb * mb / (se * se)) s2b FROM d GROUP BY key)
          SELECT t.key, nd, np, s1a / s0 AS ma, s1b / s0 AS mb,
                 greatest({BIRGE.format(s1='s1a', s2='s2a')}, {BIRGE.format(s1='s1b', s2='s2b')}) / sqrt(s0) AS se,
                 coalesce(sd.sd, 0) AS sd FROM t LEFT JOIN sdk sd ON sd.rel = '{a}' AND sd.key = t.key""")


def history(h, name):
    q(f"""CREATE OR REPLACE TABLE {name} AS SELECT x.key, sqrt(avg((x.lr - y.lr) * (x.lr - y.lr))) AS rms
          FROM pf x JOIN pf y ON y.key = x.key AND y.dataset = x.dataset AND y.e = x.e AND y.rel = '{h[1]}'
          WHERE x.rel = '{h[0]}' AND x.how = 'point' AND y.how = 'point' GROUP BY x.key""")


def features(tag):
    st = STEPS[tag]
    a, b, (y0, y1) = st["a"], st["b"], st["years"]
    single(a, "f_all")
    single(a, "f_new", f"yr BETWEEN {y0} AND {y1}")
    for lib, nm in (("JEFF-3.3", "f_jeff"), ("JENDL-5", "f_jendl")):
        paired(a, lib, nm)
    history(st["h1"], "f_h1")
    history(st["h2"], "f_h2")
    if b:
        paired(a, b, "f_lab")
        lab = "abs(l.mb - l.ma) / sqrt(l.se * l.se + l.sd * l.sd) AS change_z, abs(l.mb) < abs(l.ma) AS moved"
        labj = f"JOIN f_lab l ON l.key = u.key AND l.nd >= 2"
    else:
        lab, labj = "NULL::DOUBLE AS change_z, NULL::BOOLEAN AS moved", ""
    rows = q(f"""
        SELECT u.key, k.za, k.sub, k.mt, n.target, n.reaction,
               abs(u.m) / sqrt(u.se * u.se + u.sd * u.sd) AS z_all, exp(u.m) AS ratio_all,
               abs(nw.m) / sqrt(nw.se * nw.se + nw.sd * nw.sd) AS z_new, coalesce(nw.nd, 0) AS n_new,
               ln(u.nd) AS log_datasets, ln(u.np) AS log_points,
               abs(j.ma - j.mb) / sqrt(j.se * j.se + j.sd * j.sd) AS d_jeff, (abs(j.mb) < abs(j.ma))::INT AS sides_jeff,
               abs(d.ma - d.mb) / sqrt(d.se * d.se + d.sd * d.sd) AS d_jendl, (abs(d.mb) < abs(d.ma))::INT AS sides_jendl,
               h1.rms AS hist1, h2.rms AS hist2,
               (SELECT count(*) FROM nsrp p WHERE p.z = k.za // 1000 AND p.a = k.za % 1000
                  AND p.pub_year BETWEEN {y0} AND {y1}) AS nsr_papers,
               u.nd AS n_datasets, u.np AS n_points, {lab}
        FROM f_all u JOIN pairkeys k ON k.key = u.key LEFT JOIN pairnames n ON n.key = u.key {labj}
        LEFT JOIN f_new nw ON nw.key = u.key LEFT JOIN f_jeff j ON j.key = u.key LEFT JOIN f_jendl d ON d.key = u.key
        LEFT JOIN f_h1 h1 ON h1.key = u.key LEFT JOIN f_h2 h2 ON h2.key = u.key
        WHERE u.nd >= 2""").fetchall()
    cols = ["key", "za", "sub", "mt", "target", "reaction", "z_all", "ratio_all", "z_new", "n_new", "log_datasets",
            "log_points", "d_jeff", "sides_jeff", "d_jendl", "sides_jendl", "hist1", "hist2", "nsr_papers", "n_datasets",
            "n_points", "change_z", "moved"]
    out = [dict(zip(cols, r)) for r in rows]
    for r in out:
        r["matclass"], r["mtclass"] = matclass(r["za"]), mtclass(r["mt"])
        r["label"] = None if r["change_z"] is None else int(r["change_z"] > 1)
        if r["sides_jeff"] is not None and r["d_jeff"] is None:
            r["sides_jeff"] = None
        if r["sides_jendl"] is not None and r["d_jendl"] is None:
            r["sides_jendl"] = None
    return out


def matrix(rows, impute):
    """Numbers, with nulls as NaN (gradient boosting) or zero plus an indicator (logistic regression), then one-hots."""
    X, names = [], []
    for r in rows:
        v = []
        for f in NUM:
            x = r[f]
            x = float("nan") if x is None or (isinstance(x, float) and not math.isfinite(x)) else float(x)
            if f in ("hist1", "hist2") and math.isfinite(x):
                x = math.log10(x + 1e-6)
            if impute:
                v += [0.0 if math.isnan(x) else x, 1.0 if math.isnan(x) else 0.0]
            else:
                v.append(x)
        v += [1.0 if r["matclass"] == c else 0.0 for c in CLASSES]
        v += [1.0 if r["mtclass"] == c else 0.0 for c in MTCLASSES]
        v.append(1.0 if r["sub"] == "neutrons" else 0.0)
        X.append(v)
    for f in NUM:
        names += [f, f"{f}_missing"] if impute else [f]
    names += [f"class_{c}" for c in CLASSES] + [f"mt_{c}" for c in MTCLASSES] + ["neutrons"]
    return np.array(X), names


def prec_at(y, p, k):
    o = np.argsort(-p)[:k]
    return float(np.mean(y[o])) if len(o) else None


def main():
    from sklearn.calibration import calibration_curve
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.inspection import permutation_importance
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import brier_score_loss, roc_auc_score
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    t0 = time.time()
    base_tables()
    data = {tag: features(tag) for tag in STEPS}
    tr, te, fw = data["train"], data["test"], data["forward"]
    ytr, yte = np.array([r["label"] for r in tr]), np.array([r["label"] for r in te])
    Xtr_l, names_l = matrix(tr, True)
    Xte_l, _ = matrix(te, True)
    Xtr_g, names_g = matrix(tr, False)
    Xte_g, _ = matrix(te, False)
    cover = {f: {t: sum(1 for r in data[t] if r[f] is not None) for t in data} for f in NUM}
    print("non-null per feature:", json.dumps(cover), flush=True)
    ok = [i for i in range(Xtr_g.shape[1]) if len(np.unique(Xtr_g[np.isfinite(Xtr_g[:, i]), i])) > 1]
    dropped = [names_g[i] for i in range(Xtr_g.shape[1]) if i not in ok]
    Xtr_g, Xte_g, names_g = Xtr_g[:, ok], Xte_g[:, ok], [names_g[i] for i in ok]
    print("dropped from boosting (no spread in training):", dropped, flush=True)
    lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, C=0.5))
    lr.fit(Xtr_l, ytr)
    gb = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_depth=3, min_samples_leaf=20,
                                        l2_regularization=1.0, random_state=0)
    gb.fit(Xtr_g, ytr)
    res = {"n": {"train": len(tr), "test": len(te), "forward": len(fw)},
           "positives": {"train": int(ytr.sum()), "test": int(yte.sum())},
           "base_rate": {"train": float(ytr.mean()), "test": float(yte.mean())}, "models": {}, "baselines": {}}
    preds = {}
    for name, model, X in (("logistic", lr, Xte_l), ("boosting", gb, Xte_g)):
        p = model.predict_proba(X)[:, 1]
        preds[name] = p
        frac, mean = calibration_curve(yte, p, n_bins=5, strategy="quantile")
        res["models"][name] = {"auc": float(roc_auc_score(yte, p)), "precision_at_50": prec_at(yte, p, 50),
                               "precision_at_200": prec_at(yte, p, 200), "brier": float(brier_score_loss(yte, p)),
                               "calibration": [{"mean_predicted": float(m), "observed": float(f)} for m, f in zip(mean, frac)],
                               "train_auc": float(roc_auc_score(ytr, model.predict_proba(Xtr_l if name == "logistic" else Xtr_g)[:, 1]))}
    coefs = lr.named_steps["logisticregression"].coef_[0]
    res["models"]["logistic"]["coefficients"] = sorted(
        [{"feature": n, "standardized_coefficient": float(c)} for n, c in zip(names_l, coefs)],
        key=lambda d: -abs(d["standardized_coefficient"]))
    pi = permutation_importance(gb, Xte_g, yte, scoring="roc_auc", n_repeats=20, random_state=0)
    res["models"]["boosting"]["permutation_importance"] = sorted(
        [{"feature": n, "auc_drop": float(m), "sd": float(s)} for n, m, s in zip(names_g, pi.importances_mean, pi.importances_std)],
        key=lambda d: -d["auc_drop"])
    for f in ("z_all", "z_new", "hist1", "d_jeff", "nsr_papers", "n_new"):
        v = np.array([(r[f] if r[f] is not None else -1.0) for r in te], dtype=float)
        v = np.where(np.isfinite(v), v, -1.0)
        res["baselines"][f] = {"auc": float(roc_auc_score(yte, v)), "precision_at_50": prec_at(yte, v, 50)}
    best = max(("logistic", "boosting"), key=lambda k: res["models"][k]["auc"])
    res["best"] = best
    print(json.dumps({k: v for k, v in res.items() if k != "models"} | {"models": {
        k: {kk: vv for kk, vv in v.items() if kk in ("auc", "precision_at_50", "precision_at_200", "brier", "train_auc")}
        for k, v in res["models"].items()}}, indent=1), flush=True)
    # the held-out ranking and the training rows
    import pyarrow as pa
    import pyarrow.parquet as pq
    os.makedirs("/data/sweep/out", exist_ok=True)
    keep = ["key", "target", "reaction", "sub", "mt", "matclass", "mtclass"] + NUM + ["n_datasets", "n_points", "change_z",
                                                                                     "moved", "label"]
    for tag, rows, extra in (("test", te, preds), ("train", tr, None)):
        cols = {k: [r[k] for r in rows] for k in keep}
        if extra:
            cols["p_logistic"] = list(map(float, extra["logistic"]))
            cols["p_boosting"] = list(map(float, extra["boosting"]))
            cols["rank"] = list(map(int, np.argsort(np.argsort(-extra[best])) + 1))
        tbl = pa.table({k: pa.array([None if (isinstance(x, float) and not math.isfinite(x)) else x for x in v])
                        for k, v in cols.items()})
        path = f"/data/sweep/out/retrodiction_v3-{tag}.parquet"
        pq.write_table(tbl, path, compression="snappy")
        S.s3.upload_file(path, S.BUCKET, f"{PREFIX}/retrodiction_v3/{tag}.parquet")
    # the forward ranking: the best model refit on both steps, its hash and date
    Xfw = matrix(fw, best == "logistic")[0]
    if best != "logistic":
        Xfw = Xfw[:, ok]
    if best == "logistic":
        final = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, C=0.5))
        final.fit(np.vstack([Xtr_l, Xte_l]), np.concatenate([ytr, yte]))
    else:
        final = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_depth=3, min_samples_leaf=20,
                                               l2_regularization=1.0, random_state=0)
        final.fit(np.vstack([Xtr_g, Xte_g]), np.concatenate([ytr, yte]))
    blob = pickle.dumps(final)
    digest = hashlib.sha256(blob).hexdigest()
    S.s3.put_object(Bucket=S.BUCKET, Key=f"{PREFIX}/models/v3-{best}-{digest[:12]}.pkl", Body=blob)
    pf = final.predict_proba(Xfw)[:, 1]
    order = np.argsort(-pf)[:200]
    frozen = {"frozen_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "model": best, "sha256": digest,
              "pickle": f"s3://{S.BUCKET}/{PREFIX}/models/v3-{best}-{digest[:12]}.pkl",
              "trained_on": "B-VII.1 to B-VIII.0 and B-VIII.0 to B-VIII.1 (refit on both after the blind test)",
              "test_auc": res["models"][best]["auc"], "features": NUM + ["matclass", "mtclass", "neutrons"],
              "universe": f"{len(fw)} B-VIII.1 pairs with >= 2 datasets (flagged left out); new data 2025 to 2026",
              "top": [{"rank": i + 1, "target": fw[j]["target"], "reaction": fw[j]["reaction"], "sublibrary": fw[j]["sub"],
                       "mt": fw[j]["mt"], "probability": float(pf[j]), "z_all": fw[j]["z_all"], "n_new": fw[j]["n_new"]}
                      for i, j in enumerate(order)]}
    pred = json.loads(S.s3.get_object(Bucket=S.BUCKET, Key=f"{PREFIX}/prediction-viii2.json")["Body"].read())
    pred["v3"] = frozen
    S.s3.put_object(Bucket=S.BUCKET, Key=f"{PREFIX}/prediction-viii2.json",
                    Body=json.dumps(pred, indent=1, default=float).encode(), ContentType="application/json")
    res["forward"] = {k: v for k, v in frozen.items() if k != "top"} | {"top10": frozen["top"][:10]}
    res["seconds"] = round(time.time() - t0)
    res["caveat"] = ("JEFF-3.3 (2017-11) and JENDL-5 (2021-12) postdate VII.1 and JENDL-5 postdates VIII.0, so the "
                     "training rows' cross-library features carry some knowledge of VIII.0; the test on VIII.0 to VIII.1 "
                     "is clean, as both predate VIII.1.")
    main_s = json.loads(S.s3.get_object(Bucket=S.BUCKET, Key=f"{PREFIX}/retrodiction/summary.json")["Body"].read())
    main_s["v3"] = res
    S.s3.put_object(Bucket=S.BUCKET, Key=f"{PREFIX}/retrodiction/summary.json",
                    Body=json.dumps(main_s, indent=1, default=float).encode(), ContentType="application/json")
    print(json.dumps({"forward": res["forward"]["sha256"], "top5": frozen["top"][:5], "seconds": res["seconds"]}, indent=1,
                     default=float))




SMALL = ["z_all", "d_jeff", "d_jendl", "hist1", "log_datasets"]  # the one small logistic beside the score


def score():
    """The finding on its own: the prior release's disagreement score (z_all, every year's data, flagged datasets out,
    >= 2 datasets) against the change at the data by the v2 metric, on both release steps: AUC, precision at 50 against
    the base rate, the one-sided Mann-Whitney p; beside it one L2 logistic on five features; the VIII.2 ranking frozen."""
    from scipy.stats import mannwhitneyu
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    base_tables()
    data = {tag: features(tag) for tag in STEPS}
    out = {"metric": "change at the data = |weighted mean ln(sigma_b / sigma_a)| / sqrt(se^2 + MF33 sd^2), changed > 1 "
                     "(v2); score = the prior release's z on every year's data (flagged EXFOR datasets out, >= 2 datasets)",
           "steps": {}}
    for tag in ("train", "test"):
        rows = data[tag]
        y = np.array([r["label"] for r in rows])
        s = np.array([r["z_all"] if r["z_all"] is not None and math.isfinite(r["z_all"]) else 0.0 for r in rows])
        auc = float(roc_auc_score(y, s))
        u = mannwhitneyu(s[y == 1], s[y == 0], alternative="greater")
        st = STEPS[tag]
        out["steps"][f"{st['a']}:{st['b']}"] = {
            "n": len(rows), "changed": int(y.sum()), "base_rate": float(y.mean()), "auc": auc,
            "mann_whitney_p_one_sided": float(u.pvalue), "precision_at_50": prec_at(y, s, 50),
            "precision_at_200": prec_at(y, s, 200), "enrichment_at_50": prec_at(y, s, 50) / float(y.mean()),
            "direction_rate_changed_top50": float(np.mean([r["moved"] for i, r in enumerate(rows)
                                                           if r["label"] == 1 and i in set(np.argsort(-s)[:50])]))
            if any(r["label"] == 1 for i, r in enumerate(rows) if i in set(np.argsort(-s)[:50])) else None}
    # the small logistic, trained on VII.1 to VIII.0, tested on VIII.0 to VIII.1
    def mat(rows):
        X = []
        for r in rows:
            v = []
            for f in SMALL:
                x = r[f]
                x = 0.0 if x is None or not math.isfinite(float(x)) else float(x)
                v.append(math.log10(x + 1e-6) if f == "hist1" and x > 0 else x)
            X.append(v)
        return np.array(X)
    tr, te = data["train"], data["test"]
    ytr, yte = np.array([r["label"] for r in tr]), np.array([r["label"] for r in te])
    lr = make_pipeline(StandardScaler(), LogisticRegression(C=0.1, max_iter=2000))
    lr.fit(mat(tr), ytr)
    p = lr.predict_proba(mat(te))[:, 1]
    out["small_logistic"] = {"features": SMALL, "C": 0.1, "auc": float(roc_auc_score(yte, p)),
                             "precision_at_50": prec_at(yte, p, 50), "train_auc": float(roc_auc_score(ytr, lr.predict_proba(mat(tr))[:, 1])),
                             "coefficients": {f: float(c) for f, c in zip(SMALL, lr.named_steps["logisticregression"].coef_[0])}}
    # the VIII.2 ranking by the score
    fw = sorted([r for r in data["forward"] if r["z_all"] is not None], key=lambda r: -r["z_all"])
    pred = json.loads(S.s3.get_object(Bucket=S.BUCKET, Key=f"{PREFIX}/prediction-viii2.json")["Body"].read())
    pred["score"] = {"frozen_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "release": "B-VIII.1",
                     "score": out["metric"], "pairs": len(fw),
                     "replication": out["steps"],
                     "test": "when VIII.2 ships: label each pair changed when the v2 change at its data exceeds 1, and "
                             "compute this ranking's AUC (v3.py score with a VIII.1 to VIII.2 step)",
                     "top": [{"rank": i + 1, "target": r["target"], "reaction": r["reaction"], "sublibrary": r["sub"],
                              "mt": r["mt"], "z": r["z_all"], "ratio_measured_to_evaluated": r["ratio_all"],
                              "datasets": r["n_datasets"], "points": r["n_points"]} for i, r in enumerate(fw[:200])]}
    S.s3.put_object(Bucket=S.BUCKET, Key=f"{PREFIX}/prediction-viii2.json",
                    Body=json.dumps(pred, indent=1, default=float).encode(), ContentType="application/json")
    main_s = json.loads(S.s3.get_object(Bucket=S.BUCKET, Key=f"{PREFIX}/retrodiction/summary.json")["Body"].read())
    main_s["score_test"] = out
    S.s3.put_object(Bucket=S.BUCKET, Key=f"{PREFIX}/retrodiction/summary.json",
                    Body=json.dumps(main_s, indent=1, default=float).encode(), ContentType="application/json")
    print(json.dumps(out, indent=1, default=float))


if __name__ == "__main__":
    score() if sys.argv[1:] == ["score"] else main()
