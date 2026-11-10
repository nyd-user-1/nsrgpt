"""Brief 60 Part A: one converted material checked on the box.
  /opt/gnds/venv/bin/python -I check.py <reactionSuite.xml[.gz]> <release> <sublibrary> <mat> [<mt> <energy eV>]
1. Both XML files (the reactionSuite and its covarianceSuite beside it, if any) parse whole (ElementTree iterparse).
2. The root is <reactionSuite ... format="2.0">.
3. MT <mt> (default 18, fission) read back through FUDGE at <energy> (default 1 MeV) equals the ENDF-6 value from
   lake/endfb/<release>/xs_points/ (nsr.endfb_xs_points), interpolated by its own law, within 1e-6 relative.
Prints one JSON line."""
import gzip
import json
import math
import os
import shutil
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, "/opt/gnds/fudge")
import pyarrow.dataset as ds  # noqa: E402
import pyarrow.fs as pafs  # noqa: E402

BUCKET, REGION = "nsr-lake-613473203863", "us-east-2"


def plain(path):
    if not path.endswith(".gz"):
        return path
    out = path[:-3]
    with gzip.open(path, "rb") as fi, open(out, "wb") as fo:
        shutil.copyfileobj(fi, fo, 1 << 20)
    return out


def parses(path):
    n, root = 0, None
    for ev, el in ET.iterparse(path, events=("start",)):
        if root is None:
            root = (el.tag, dict(el.attrib))
        n += 1
    return n, root


def endf_value(release, sub, mat, mt, e0):
    t = ds.dataset(f"{BUCKET}/lake/endfb/{release}/xs_points/", filesystem=pafs.S3FileSystem(region=REGION),
                   format="parquet").to_table(
        columns=["sublibrary", "point_seq", "energy_ev", "xs_barn", "interpolation"],
        filter=(ds.field("mat") == mat) & (ds.field("mt") == mt)).sort_by("point_seq").to_pylist()
    t = [r for r in t if r["sublibrary"].split("-version")[0] == sub]  # ENDF/B: neutrons-version.VIII.1
    e, x, law = ([r[c] for r in t] for c in ("energy_ev", "xs_barn", "interpolation"))
    for i in range(len(e) - 1):
        if e[i] <= e0 <= e[i + 1]:
            if e0 == e[i]:
                return x[i], e[i], e[i], "grid point"
            if e0 == e[i + 1]:
                continue
            a, b, ya, yb, k = e[i], e[i + 1], x[i], x[i + 1], law[i + 1] or 2
            if k == 1:
                y = ya
            elif k == 3:
                y = ya + (yb - ya) * math.log(e0 / a) / math.log(b / a)
            elif k == 4:
                y = ya * math.exp(math.log(yb / ya) * (e0 - a) / (b - a))
            elif k == 5:
                y = ya * math.exp(math.log(yb / ya) * math.log(e0 / a) / math.log(b / a))
            else:
                y = ya + (yb - ya) * (e0 - a) / (b - a)
            return y, a, b, f"law {k}"
    raise SystemExit(f"{e0} eV outside MT {mt}'s grid")


def fudge_value(path, mt, e0):
    from fudge import GNDS_file
    rs = GNDS_file.read(path)
    r = [r for r in rs.reactions if getattr(r, "ENDF_MT", None) == mt][0]
    ev = r.crossSection.evaluated
    try:
        return float(ev.evaluate(e0)), type(ev).__name__
    except Exception:  # noqa: BLE001  resonancesWithBackground: the background region holding e0
        bg = ev.background
        for reg in (bg.fastRegion, bg.unresolvedRegion, bg.resolvedRegion):
            if reg is not None and reg.data.domainMin <= e0 <= reg.data.domainMax:
                return float(reg.data.evaluate(e0)), f"{type(ev).__name__}/{type(reg).__name__}"
    raise SystemExit("no region holds the energy")


def main():
    path, release, sub, mat = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    mt = int(sys.argv[5]) if len(sys.argv) > 5 else 18
    e0 = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0e6
    xml = plain(path)
    out = {"file": os.path.basename(path)}
    out["elements"], (tag, attrib) = parses(xml)
    out["root"], out["format"] = tag, attrib.get("format")
    d, stem = os.path.dirname(xml), os.path.basename(xml)[:-4]
    for c in (path.replace(".xml.gz", ".cov.xml.gz"), f"{d}/Covariances/{stem}-covar.xml"):
        if os.path.exists(c) and c != path:
            n, (ctag, cattr) = parses(plain(c))
            out["cov"] = {"file": os.path.basename(c), "elements": n, "root": ctag, "format": cattr.get("format")}
            break
    g, how = fudge_value(xml, mt, e0)
    v, a, b, law = endf_value(release, sub, mat, mt, e0)
    rel = abs(g - v) / abs(v)
    out.update(mt=mt, energy_ev=e0, gnds_b=g, gnds_form=how, endf6_b=v, endf6_between=[a, b], endf6_interp=law,
               rel_diff=rel, within_1e6=rel <= 1e-6, reactionSuite=tag == "reactionSuite", gnds_2_0=attrib.get("format") == "2.0")
    print(json.dumps(out))


if __name__ == "__main__":
    main()
