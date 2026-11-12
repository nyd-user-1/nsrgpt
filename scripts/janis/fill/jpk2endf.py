"""Brief 73: JANIS's packed ENDF (.jpk, NEA GitLab janis/data) back to ENDF-6 tapes that scripts/parse/endfb/parse.py reads.

The decoding is lane B's scripts/recon/jpk.py (format in its docstring; jpk.to_endf rebuilds a material with columns
67-80, SEND, FEND and MEND). This file only writes tapes: one per NSUB in the package, a TPID line naming the source,
every material in the package's order, a TEND line; streamed into a zip on the box's disk (one member, the tape), since
parse.py reads a zip member line by line but reads a bare tape whole. Note from lane B: neutron MF3 in these packages is
JANIS's processed pointwise data (resonances reconstructed, NJOY's MTs 203-207, 301-303, 442-447 added); MF1/451 is
the original evaluation's.

  python jpk2endf.py <jpk key> [<jpk key>…] --out=<S3 prefix>
  python jpk2endf.py <part keys…> --out=<S3 prefix> --group=<name>   # parts of one tape (TENDL-2013-n.part*of9) merged
Writes <prefix>/<jpk stem>.nsub<NSUB>.zip for each NSUB and prints its materials and sections.
"""
import io
import json
import os
import sys
import zipfile

import boto3

sys.path.insert(0, os.environ.get("NSR_RECON", "/opt/a73/scripts/recon"))
import jpk  # noqa: E402

B = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")
WORK = "/data/jpk"
ZERO = f"{0.0:11.4E}" * 2 + f"{0:11d}" * 4


def convert(key, out):
    os.makedirs(WORK, exist_ok=True)
    stem = key.rsplit("/", 1)[-1].rsplit(".jpk", 1)[0]
    local = os.path.join(WORK, stem + ".jpk")
    s3.download_file(B, key, local)
    report = {}
    with zipfile.ZipFile(local) as z:
        order = {}
        for name in z.namelist():
            try:
                nsub, mat, mf, mt = jpk.split(name)
            except Exception:  # noqa: BLE001  not a section member
                continue
            order.setdefault(nsub, {}).setdefault(mat, 0)
            order[nsub][mat] += 1
        for nsub, mats in order.items():
            tape = f"{stem}.nsub{nsub}"
            zpath = os.path.join(WORK, tape + ".zip")
            with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as zo, \
                    zo.open(tape + ".endf", "w", force_zip64=True) as raw:
                w = io.TextIOWrapper(raw, encoding="latin-1", errors="replace", newline="\n")
                w.write(f"{f' {stem} (JANIS packed ENDF, NEA GitLab janis/data) NSUB {nsub}':<66.66}{1:4d}{0:2d}{0:3d}{0:5d}\n")
                for mat in mats:  # the package's own order
                    for ln in jpk.to_endf(z, nsub, mat):
                        w.write(ln + "\n")
                w.write(ZERO + f"{-1:4d}{0:2d}{0:3d}{0:5d}\n")  # TEND
                w.flush()
                w.detach()
            okey = f"{out.rstrip('/')}/{tape}.zip"
            s3.upload_file(zpath, B, okey)
            os.remove(zpath)
            report[nsub] = {"key": okey, "materials": len(mats), "sections": sum(mats.values())}
            print(json.dumps({"jpk": key, "nsub": nsub, **report[nsub]}), flush=True)
    os.remove(local)
    return report


def convert_group(keys, out, name):
    """Several package files that are parts of one tape (TENDL-2013-n.part1of9 …, split at a fixed number of sections,
    so a material can straddle two parts): one tape, each material's sections gathered from every part."""
    os.makedirs(WORK, exist_ok=True)
    zips, where = [], {}
    for k in keys:
        local = os.path.join(WORK, k.rsplit("/", 1)[-1])
        s3.download_file(B, k, local)
        z = zipfile.ZipFile(local)
        zips.append((z, local))
        for m in z.namelist():
            try:
                nsub, mat, mf, mt = jpk.split(m)
            except Exception:  # noqa: BLE001
                continue
            where.setdefault(nsub, {}).setdefault(mat, []).append((mf, mt, z, m))
    report = {}
    for nsub, mats in where.items():
        tape = f"{name}.nsub{nsub}"
        zpath = os.path.join(WORK, tape + ".zip")
        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as zo, \
                zo.open(tape + ".endf", "w", force_zip64=True) as raw:
            w = io.TextIOWrapper(raw, encoding="latin-1", errors="replace", newline="\n")
            w.write(f"{f' {name} (JANIS packed ENDF, NEA GitLab janis/data) NSUB {nsub}':<66.66}{1:4d}{0:2d}{0:3d}{0:5d}\n")
            for mat, secs in mats.items():
                last_mf = None
                fend = ZERO + f"{mat:4d}{0:2d}{0:3d}{0:5d}"
                for mf, mt, z, m in sorted(secs, key=lambda s: (s[0], s[1])):
                    if last_mf is not None and mf != last_mf:
                        w.write(fend + "\n")
                    for k, ln in enumerate(jpk.lines(z.read(m)), 1):
                        w.write(ln.ljust(66) + f"{mat:4d}{mf:2d}{mt:3d}{k % 100000:5d}\n")
                    w.write(ZERO + f"{mat:4d}{mf:2d}{0:3d}{99999:5d}\n")
                    last_mf = mf
                w.write(fend + "\n" + ZERO + f"{0:4d}{0:2d}{0:3d}{0:5d}\n")
            w.write(ZERO + f"{-1:4d}{0:2d}{0:3d}{0:5d}\n")
            w.flush()
            w.detach()
        okey = f"{out.rstrip('/')}/{tape}.zip"
        s3.upload_file(zpath, B, okey)
        os.remove(zpath)
        report[nsub] = {"key": okey, "materials": len(mats), "sections": sum(len(v) for v in mats.values())}
        print(json.dumps({"group": name, "nsub": nsub, **report[nsub]}), flush=True)
    for z, local in zips:
        z.close()
        os.remove(local)
    return report


def main():
    out = next(a.split("=", 1)[1] for a in sys.argv if a.startswith("--out="))
    group = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--group=")), None)
    if group:  # the keys are parts of one tape
        convert_group([a for a in sys.argv[1:] if not a.startswith("--")], out, group)
        return
    for k in [a for a in sys.argv[1:] if not a.startswith("--")]:
        convert(k, out)


if __name__ == "__main__":
    main()
