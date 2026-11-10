"""Brief 56, Part C.1: the files no table parses yet, counted from endfb_sections. One Athena query over every release
counts sections and lines per MF (4, 5, 6: angular, energy and energy-angle distributions; 9 to 15: multiplicities,
production cross sections, photon production and photon distributions; and every other MF for completeness), written
into each release's manifest.json as sections_by_mf. Run after the release parses, so no manifest is being written.
  /opt/parse/bin/python -I sections_by_mf.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "box"))
import lake  # noqa: E402

RELEASES = ["B-VIII.1", "B-VIII.0", "B-VII.1", "B-VII.0", "B-VI.8", "B-V", "B-IV", "B-III", "B-II",
            "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2"]
WATCH = (4, 5, 6, 9, 10, 12, 13, 14, 15)  # MF11 does not exist in ENDF-6
NAMES = {1: "general information", 2: "resonance parameters", 3: "cross sections", 4: "angular distributions",
         5: "energy distributions", 6: "energy-angle distributions", 7: "thermal scattering", 8: "decay and fission yields",
         9: "multiplicities for radioactive production", 10: "production cross sections for radioactive nuclides",
         12: "photon production multiplicities", 13: "photon production cross sections",
         14: "photon angular distributions", 15: "photon energy distributions", 23: "photo-atomic cross sections",
         26: "electro-atomic distributions", 27: "atomic form factors", 28: "atomic relaxation",
         31: "nu-bar covariances", 32: "resonance parameter covariances", 33: "cross-section covariances",
         34: "angular distribution covariances", 35: "energy distribution covariances",
         40: "radioactive production covariances"}

rows, scanned = lake.rows("SELECT release, mf, count(*), sum(line_count), count(DISTINCT file_name || '/' || "
                          "CAST(mat AS varchar)) FROM endfb_sections GROUP BY release, mf ORDER BY release, mf")
by = {}
for rel, mf, n, lines, mats in rows:
    by.setdefault(rel, {})[int(mf)] = {"sections": int(n), "lines": int(lines or 0), "materials": int(mats)}
summary = {}
for rel in RELEASES:
    got = by.get(rel, {})
    block = {"built_at": lake.now(), "source": "endfb_sections (every section's MF, MT and line count)",
             "by_mf": {str(mf): {"name": NAMES.get(mf, ""), **v} for mf, v in sorted(got.items())},
             "watched_mfs_absent": [mf for mf in WATCH if mf not in got],
             "parsed_into_tables": {"1": "endfb_materials", "2": "endfb_res_ranges, endfb_res_params",
                                    "3": "endfb_xs_points", "8": "endfb_fy, endfb_decay*", "32": "endfb_res_cov",
                                    "33": "endfb_cov"},
             "note": "MF4, 5, 6 and 9 to 15 are held as sections and lines (endfb_sections, endfb_records), not yet as "
                     "tables of their own", "athena_bytes_scanned": scanned}
    key = f"lake/endfb/{rel}/manifest.json"
    try:
        m = json.loads(lake.s3.get_object(Bucket=lake.BUCKET, Key=key)["Body"].read())
    except Exception:  # noqa: BLE001
        m = {"dataset": "endfb", "release": rel}
    m["sections_by_mf"] = block
    lake.put_json(key, m)
    summary[rel] = {mf: got.get(mf, {}).get("sections", 0) for mf in WATCH}
print(json.dumps({"bytes_scanned": scanned, "sections_by_release": summary}))
