"""Brief 73 (A9, lead's ruling): TENDL's own TALYS fission tables (tables/xs/fission.tot on the publisher's site) as the
MT18 (z,fission) rows JANIS draws for TENDL releases whose ENDF files fold fission into MT5 (heavy targets under n, p, d,
t, He-3, alpha). No TENDL ENDF file holds these sections (not Imperial's tarballs, not IAEA's zips, not JANIS's own
offline package, whose MF1/451 directories list no MF3 MT18); JANIS's curve is the TALYS table itself.

JANIS's point rule, applied here so the drawn series equals JANIS's point for point: every nonzero point, the first
point, and the zeros on either side of each nonzero run (TALYS has interior zeros, e.g. alpha+Th-232 at 13 MeV), a value
below 1E-20 b counting as zero and a zero written as 1E-20 b; energies MeV -> eV, cross sections mb -> b.

Supplementary table nsr.tendl_talys_fission (not part of the nsr.endfb_* evaluation tables), one Parquet file a release:
  lake/serve/tendl_talys/release=<release>/fission.parquet
  columns: projectile (n, p, d, t, h, a), sublibrary, za, liso, nuclide, mt (18), point_seq, energy_ev, xs_barn,
           talys_points, source_url, raw_key
  python talys_fission.py <release> <raw prefix, e.g. lake/_raw/TENDL-2019-talys/>
The raw files are lake/_raw/<release>-talys/<projectile>/<El><A>[m]/fission.tot, as fetched by fill/direct.py.
"""
import io
import re
import sys

import boto3
import pyarrow as pa
import pyarrow.parquet as pq

B = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")
SYM = ("n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb "
       "Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl "
       "Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm").split()
SUB = {"n": "neutrons", "p": "protons", "d": "deuterons", "t": "tritons", "h": "helium3s", "a": "alphas"}
FOLDER = {"n": "neutron", "p": "proton", "d": "deuteron", "t": "triton", "h": "he3", "a": "alpha"}


def talys(text):
    pts = []
    for ln in text.splitlines():
        if ln.strip() and not ln.lstrip().startswith("#"):
            e, x = ln.split()[:2]
            pts.append((float(e) * 1e6, float(x) * 1e-3))
    return pts


def janis_rule(pts):
    pts = [(e, x if x >= 1e-20 else 0.0) for e, x in pts]  # JANIS: below 1E-20 b is zero
    out = []
    for i, (e, x) in enumerate(pts):
        if x != 0 or i == 0 or (i + 1 < len(pts) and pts[i + 1][1] != 0) or (i > 0 and pts[i - 1][1] != 0):
            out.append((e, x if x != 0 else 1e-20))
    return out


def main():
    release, raw = sys.argv[1], sys.argv[2].rstrip("/") + "/"
    year = release.split("-")[1]
    rows = {k: [] for k in ("projectile", "sublibrary", "za", "liso", "nuclide", "mt", "point_seq", "energy_ev", "xs_barn",
                            "talys_points", "source_url", "raw_key")}
    keys = [o["Key"] for p in s3.get_paginator("list_objects_v2").paginate(Bucket=B, Prefix=raw) for o in p.get("Contents", [])
            if o["Key"].endswith("/fission.tot")]
    n = 0
    for k in sorted(keys):
        proj, nuc = k[len(raw):].split("/")[:2]
        m = re.match(r"([A-Z][a-z]?)(\d+)(m?)$", nuc)
        el, a, iso = m.group(1), int(m.group(2)), m.group(3)
        z = SYM.index(el)
        pts = talys(s3.get_object(Bucket=B, Key=k)["Body"].read().decode("latin-1"))
        if not any(x for _, x in pts):  # a target with no fission: JANIS lists no row
            continue
        drawn = janis_rule(pts)
        url = f"https://tendl.imperial.ac.uk/tendl_{year}/{FOLDER[proj]}_file/{el}/{nuc}/tables/xs/fission.tot"
        for i, (e, x) in enumerate(drawn, 1):
            for col, v in (("projectile", proj), ("sublibrary", SUB[proj]), ("za", z * 1000 + a), ("liso", 1 if iso else 0),
                           ("nuclide", nuc), ("mt", 18), ("point_seq", i), ("energy_ev", e), ("xs_barn", x),
                           ("talys_points", len(pts)), ("source_url", url), ("raw_key", k)):
                rows[col].append(v)
        n += 1
    t = pa.table(rows, schema=pa.schema([("projectile", pa.string()), ("sublibrary", pa.string()), ("za", pa.int32()),
                                         ("liso", pa.int32()), ("nuclide", pa.string()), ("mt", pa.int32()),
                                         ("point_seq", pa.int32()), ("energy_ev", pa.float64()), ("xs_barn", pa.float64()),
                                         ("talys_points", pa.int32()), ("source_url", pa.string()), ("raw_key", pa.string())]))
    buf = io.BytesIO()
    pq.write_table(t, buf, compression="snappy")
    s3.put_object(Bucket=B, Key=f"lake/serve/tendl_talys/release={release}/fission.parquet", Body=buf.getvalue())
    print(release, "curves", n, "points", t.num_rows)


if __name__ == "__main__":
    main()
