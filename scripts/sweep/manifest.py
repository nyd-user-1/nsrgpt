"""Brief 57, Part E: lake/sweep/2026-11-10/manifest.json, from the run's state (lake/_work/sweep/state.json and
medical-state.json), the public-list sources (lake/sweep/2026-11-10/public-lists/sources.json), each table's objects and
the box's launch time. Runs on the sweep box last:  HOME=/root venv/bin/python -I manifest.py
"""
import datetime
import json
import urllib.request

import boto3

BUCKET = "nsr-lake-613473203863"
PREFIX = "lake/sweep/2026-11-10"
s3 = boto3.client("s3", region_name="us-east-2")
RATE_BOX = 0.0958 + 100 * 0.08 / 730  # m7i-flex.large on demand plus 100 GB gp3, per hour
METHOD = {
    "A_sweep": (
        "Every EXFOR dataset whose quantity is exactly ',SIG' (no SF5, SF7 or SF8 modifier), whose reaction maps to an ENDF-6 "
        "MT (scripts/sweep/reactions.py), whose product is absent or the reaction's own residual (a level or isomer in the "
        "product makes it state_specific, not compared: the evaluations' isomeric splits are MF8/MF10, not parsed), in barns, "
        "outside EXFOR's V area (evaluated compilations such as Mughabghab's Atlas and the KADoNiS MACS table, not "
        "measurements), is divided point by point by each evaluation at its energy, interpolated by the section's own ENDF "
        "law. ENDF/B-VIII.1 and VIII.0 neutrons come from NNDC's POINT 293.6 K releases (File 2 reconstructed and broadened); "
        "inside a POINT material's resolved resonance range a dataset is compared as an average (its trapezoid integral over "
        "its own span in the bin against the evaluation's exact integral over the same span; a single energy against the "
        "evaluation averaged over its stated resolution, else +-5%), since resolution broadening and averaged measurements "
        "keep the area, not the value at an energy. JEFF-3.3, JENDL-5, TENDL-2023 and CENDL-3.2 neutrons are compared from "
        "MF3 only above each material's resonance range (the largest upper energy of its MF2 resolved ranges, and of its "
        "unresolved ranges unless LSSF = 1); every other sublibrary at every energy. Point weight 1/sigma^2 with sigma the "
        "point's relative uncertainty, else the dataset's median, else 10%, at least 1%. A dataset's mean log ratio has a "
        "standard error no smaller than its median point uncertainty (its points share a normalization); datasets combine "
        "by inverse variance with the PDG scale factor. Bins 4 a decade on round powers of ten. z = |weighted mean log "
        "ratio| / sqrt(se^2 + rel_sd_eval^2), rel_sd_eval the MF33 relative sd (structure.py's /endf/cov conversion) "
        "averaged over the bins, 0 where absent (mf33 false). The driver is the dataset whose removal moves the mean most; "
        "support is what remains without it."),
    "B_retrodiction": (
        "For every pair held by both ENDF/B-VIII.0 and VIII.1, the two evaluations (POINT 293.6 K for neutrons, MF3 for the "
        "rest) on a common grid of 20 points a decade over the pair's EXFOR energy span: the RMS and the largest |log(VIII.1 "
        "/ VIII.0)|; 'changed' when the RMS exceeds 0.005 (the RMS is stored so a reader can move the threshold). The sweep "
        "on VIII.0, pairs with support (>= 2 datasets and >= 20 points after removing the driver), ranked by z (and by "
        "|mean log ratio| and by the largest bin z): for the top 10, 20, 50, 100 and 200, the fraction changed against the "
        "base rate over all supported pairs, the enrichment, and among the changed the fraction where VIII.1's |mean log "
        "ratio| is smaller than VIII.0's (moved toward the data)."),
    "C_lists_and_flags": (
        "The VIII.1 list: the sweep on VIII.1, supported pairs ranked by z. The single-dataset list: pairs that fail support "
        "but where one dataset alone disagrees by more than 3 z (its own se and the MF33 sd); the page cannot tell a bad "
        "evaluation from a bad dataset there. Flags: the VIII.1 list's top 200 not named by any public statement fetched "
        "(a page naming a material covers all its reactions unless a reaction stands beside the name; an element named "
        "alone covers all its isotopes), with receipts. EXFOR flags: (a) quantity ',SIG' in units other than barns; (b) "
        "a dataset whose median ratio to every evaluation held is outside [0.1, 10] while every other dataset of the pair "
        "sits inside [0.5, 2] (the factor is the nearest power of ten); (c) a dataset whose energies all lie a decade or "
        "more outside every evaluation's span for that section."),
    "D_medical": (
        "See scripts/sweep/medical.py's docstring and each route's 'assumptions' column: reactor routes at a 293.6 K "
        "Maxwellian below 0.5 eV plus 1/E above, 1e13 n/cm2/s thermal, thermal:epithermal 40; cyclotron thick-target "
        "yields with Bethe stopping powers (ICRU 37 I values, no shell or density corrections; the lake holds no SRIM or "
        "PSTAR table); photon routes over a flat spectrum from threshold to 30 and 40 MeV. JEFF-3.3, JENDL-5, TENDL-2023 "
        "and CENDL-3.2 capture and fission come from nsr-jobs PREPRO reconstructions at 293.6 K. The data-derived yield "
        "is the reference curve's (the IAEA recommended where held, else the evaluation nearest the data) times the "
        "datasets' inverse-variance weighted ratio; the verdict compares the evaluations' spread with the datasets' spread."),
}


def obj(key):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    except Exception:  # noqa: BLE001
        return None


def main():
    st = obj("lake/_work/sweep/state.json") or {}
    med = obj("lake/_work/sweep/medical-state.json") or {}
    srcs = obj(f"{PREFIX}/public-lists/sources.json") or []
    tables = {}
    for pg in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=PREFIX + "/"):
        for o in pg.get("Contents", []):
            parts = o["Key"][len(PREFIX) + 1:].split("/")
            if len(parts) == 2 and parts[1].endswith(".parquet"):
                tables.setdefault(parts[0], {"bytes": 0, "objects": 0})
                tables[parts[0]]["bytes"] += o["Size"]
                tables[parts[0]]["objects"] += 1
    for t, v in (st.get("tables") or {}).items():
        tables.setdefault(t, {}).update(rows=v.get("rows"), athena=v.get("athena"))
    for t, v in (med.get("tables") or {}).items():
        tables.setdefault(t, {}).update(rows=v.get("rows"))
    now = datetime.datetime.now(datetime.timezone.utc)
    launch = None
    try:  # the box itself: its uptime (the role may not describe instances)
        launch = now - datetime.timedelta(seconds=float(open("/proc/uptime").read().split()[0]) + 60)
    except OSError:
        pass
    hours = (now - launch).total_seconds() / 3600 if launch else None
    m = {
        "run_date": "2026-11-10", "written_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "brief": "docs/briefs/57-sweep-retrodiction-flags-medical.md",
        "releases": {"B-VIII.1": "B-VIII.1-point-293.6K neutrons; B-VIII.1 MF3 other sublibraries",
                     "B-VIII.0": "B-VIII.0-point-293.6K neutrons; B-VIII.0 MF3 other sublibraries",
                     "JEFF-3.3": "MF3 (neutrons above the resonance range)", "JENDL-5": "MF3 (neutrons above the resonance range)",
                     "TENDL-2023": "MF3 (neutrons above the resonance range)", "CENDL-3.2": "MF3 (neutrons above the resonance range)"},
        "sublibraries_compared": (st.get("load") or {}).get("sublibraries"),
        "counts": {"load": {k: v for k, v in (st.get("load") or {}).items() if k != "sublibraries"}, "run": st.get("run"),
                   "changes": st.get("changes"), "flags": st.get("flags")},
        "check": st.get("check"), "retrodiction": st.get("retrodiction"), "method": METHOD, "tables": tables,
        "public_lists": [{k: s.get(k) for k in ("name", "url", "status", "outcome", "nuclides_named", "fetched_at", "saved")}
                         for s in srcs],
        "iaea_pages": "the lake's mirror of www-nds.iaea.org/medical/ (raw/iaea/2026-11-07/medical/, fetched 2026-11-07); "
                      "www-nds.iaea.org answers the sweep box with HTTP 403, so nothing was fetched live; the tables used "
                      "are copied to lake/sweep/2026-11-10/iaea-medical/",
        "timings": {**(st.get("timings") or {}), "medical_seconds": med.get("seconds")},
        "box": {"name": "nsr-sweep-1", "type": "m7i-flex.large (the account allows Free Tier instance types only; the brief's "
                "c7i.4xlarge was refused)", "launched": launch.isoformat() if launch else None, "hours": hours},
        "spend": {"box_usd": round(hours * RATE_BOX, 2) if hours else None, "rate_usd_per_hour": round(RATE_BOX, 4),
                  "jobs_box_usd": "about 0.05 (nsr-jobs-1, m7i-flex.large, about 30 minutes of PREPRO for 44 jobs)",
                  "s3_athena_usd": "under 0.01", "cap_usd": 15},
        "left_out": [
            "Isomer-specific EXFOR data (state_specific): the evaluations' isomeric splits (MF8/MF9/MF10) are not parsed.",
            "Residual production (X, MT 5 with MF6 yields): not held as cross sections.",
            "Quantities with modifiers (spectrum-averaged, Maxwellian, relative, partial): not point cross sections.",
            "JEFF-3.3, JENDL-5, TENDL-2023 and CENDL-3.2 neutrons below each material's resonance range in the sweep "
            "(their MF3 lacks the resonances there); the medical reactor routes use PREPRO reconstructions instead.",
            "EXFOR's V area (evaluated compilations).",
            "NNDC's changelog links (404), the endf-b8.1 pages (404), git.nndc.bnl.gov (login), IAEA and NEA pages (403 to "
            "the box): not reached; their contents are not guessed.",
        ],
    }
    s3.put_object(Bucket=BUCKET, Key=f"{PREFIX}/manifest.json", Body=json.dumps(m, indent=1, default=str).encode(),
                  ContentType="application/json")
    print(json.dumps({"tables": tables, "spend": m["spend"]}, indent=1, default=str))


if __name__ == "__main__":
    main()
