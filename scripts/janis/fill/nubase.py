"""Brief 73 (A6): the four older NUBASE tables JANIS lists (Nubase 1997, 2003, 2012, 2016; AMDC fixed-column text held in
lake/_raw/Nubase-<year>/) to one Parquet file each, lake/serve/nubase/release=Nubase-<year>/nubase.parquet, for the
Athena table nsr.nubase (partition release), and a ground-state file each, lake/serve/nubase/Nubase-<year>-ground.json,
in the columnar shape of public/viz-data/livechart-ground.json (how NUBASE2020 is served).

The four share AMDC's layout (NUBASE97 to NUBASE2016): A 1-3, ZZZi 5-8 (i: 0 ground state, 1-2 isomers, 3-4 levels,
5 resonance, 8-9 isobaric analogue), A El and isomer letter 12-18, mass excess 19-29 and its uncertainty 30-38 (keV;
'#' marks a value from systematics), excitation energy 40-48 and uncertainty 49-56 (keV), half-life 61-69 ('stbl',
'p-unst' or a number), unit 70-71, uncertainty 73-79, spin and parity 80-93, ENSDF year 94-95; NUBASE2012 and 2016 add
the discovery year at 106-109 and the decay modes from 111, NUBASE97 and 2003 a reference at 97-103 and the decay modes
from 106. One row a line; the line count is checked against JANIS's leaves (3,737; 4,468; 5,510; 5,624).

  python nubase.py
"""
import io
import json
import re

import boto3
import pyarrow as pa
import pyarrow.parquet as pq

B = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")
FILES = {"Nubase-1997": "lake/_raw/Nubase-1997/nubtab97.asc", "Nubase-2003": "lake/_raw/Nubase-2003/nubtab03.asc",
         "Nubase-2012": "lake/_raw/Nubase-2012/nubtab12.asc", "Nubase-2016": "lake/_raw/Nubase-2016/nubase2016.txt"}
JANIS = {"Nubase-1997": 3737, "Nubase-2003": 4468, "Nubase-2012": 5510, "Nubase-2016": 5624}
UNIT_S = {"ys": 1e-24, "zs": 1e-21, "as": 1e-18, "fs": 1e-15, "ps": 1e-12, "ns": 1e-9, "us": 1e-6, "ms": 1e-3, "s": 1.0,
          "m": 60.0, "h": 3600.0, "d": 86400.0, "y": 31556926.0, "ky": 3.1556926e10, "My": 3.1556926e13,
          "Gy": 3.1556926e16, "Ty": 3.1556926e19, "Py": 3.1556926e22, "Ey": 3.1556926e25, "Zy": 3.1556926e28,
          "Yy": 3.1556926e31}
SCHEMA = pa.schema([("a", pa.int32()), ("z", pa.int32()), ("i", pa.int32()), ("nuclide", pa.string()),
                    ("mass_excess_kev", pa.float64()), ("mass_excess_unc_kev", pa.float64()), ("mass_excess_systematics", pa.bool_()),
                    ("excitation_kev", pa.float64()), ("excitation_unc_kev", pa.float64()),
                    ("half_life", pa.string()), ("half_life_unit", pa.string()), ("half_life_unc", pa.string()),
                    ("half_life_s", pa.float64()), ("stable", pa.bool_()), ("jpi", pa.string()), ("ensdf_year", pa.string()),
                    ("discovery_year", pa.int32()), ("decay", pa.string()), ("line", pa.string())])


def num(s):
    s = s.strip().replace("#", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse(text, new):
    rows = []
    for ln in text.splitlines():
        if not re.match(r"^\d{3} \d{4}", ln):
            continue
        ln = ln.ljust(120)
        hl, unit = ln[60:69].strip(), ln[69:71].strip()
        v = num(hl.replace(">", "").replace("<", "").replace("~", ""))
        rows.append({"a": int(ln[0:3]), "z": int(ln[4:7]), "i": int(ln[7]), "nuclide": ln[11:18].strip(),
                     "mass_excess_kev": num(ln[18:29]), "mass_excess_unc_kev": num(ln[29:38]),
                     "mass_excess_systematics": "#" in ln[18:29], "excitation_kev": num(ln[39:48]),
                     "excitation_unc_kev": num(ln[48:56]), "half_life": hl or None, "half_life_unit": unit or None,
                     "half_life_unc": ln[72:79].strip() or None,
                     "half_life_s": v * UNIT_S[unit] if v is not None and unit in UNIT_S else None,
                     "stable": hl.startswith("stbl"), "jpi": ln[79:93].strip() or None, "ensdf_year": ln[93:95].strip() or None,
                     "discovery_year": int(ln[105:109]) if new and ln[105:109].strip().isdigit() else None,
                     "decay": (ln[110:] if new else ln[105:]).strip() or None, "line": ln.rstrip()})
    return rows


def main():
    out = {}
    for rel, key in FILES.items():
        rows = parse(s3.get_object(Bucket=B, Key=key)["Body"].read().decode("latin-1"), rel in ("Nubase-2012", "Nubase-2016"))
        t = pa.Table.from_pylist(rows, schema=SCHEMA)
        buf = io.BytesIO()
        pq.write_table(t, buf, compression="snappy")
        s3.put_object(Bucket=B, Key=f"lake/serve/nubase/release={rel}/nubase.parquet", Body=buf.getvalue())
        g = [r for r in rows if r["i"] == 0]
        ground = {"source": f"AMDC {rel.replace('-', '').upper()} ({key})", "columns": ["z", "a", "nuclide", "mass_excess_kev",
                  "mass_excess_unc_kev", "half_life_s", "stable", "jpi", "decay"],
                  "rows": [[r["z"], r["a"], r["nuclide"], r["mass_excess_kev"], r["mass_excess_unc_kev"], r["half_life_s"],
                            r["stable"], r["jpi"], r["decay"]] for r in g]}
        s3.put_object(Bucket=B, Key=f"lake/serve/nubase/{rel}-ground.json", Body=json.dumps(ground, separators=(",", ":")).encode(),
                      ContentType="application/json")
        out[rel] = {"rows": len(rows), "ground_states": len(g), "janis_leaves": JANIS[rel], "difference": len(rows) - JANIS[rel]}
        print(rel, out[rel], flush=True)
    s3.put_object(Bucket=B, Key="lake/serve/nubase/manifest.json", Body=json.dumps(out, indent=1).encode())


if __name__ == "__main__":
    main()
