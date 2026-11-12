"""Brief 73 (A7): FENDL-2.1 MG, which JANIS's package holds as GENDF (NJOY GROUPR output), to ENDF-6 group cross sections
in the form the lake already holds for IRDF-2002-MG and IRDFF-1.0-640g: per reaction an MF3 TAB1 with interpolation 1
(histogram), one point at each group's lower bound and a last point at the top bound.

GENDF, as read here: MF1/MT451 HEAD (ZA, AWR, 0, NZ, -1, NTW), then a LIST (TEMP, 0, NGN, NGG, NW, 0) of NTW title words,
NZ dilutions, NGN+1 neutron group bounds (eV) and NGG+1 photon bounds. MF3/MT: HEAD (ZA, AWR, NL, NZ, LRFLAG, NGN), then
one LIST per group with data (TEMP, 0, NG2, IG2LO, NW, IG): NL*NZ fluxes followed by NL*NZ cross sections; the infinite-
dilution P0 cross section (the first) is taken; a group with no LIST is 0. Other Files (transfer matrices, photon
production) are counted, not written. Each material gets a minimal MF1/451 (ZA, AWR, NSUB 10, TEMP, a description
naming the source and the group count, a directory) so parse.py reads it like any material.

  python gendf2endf.py <tape zip key from jpk2endf.py> <out key>
"""
import collections
import io
import json
import os
import sys
import zipfile

import boto3

B = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")
SYM = ("n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb "
       "Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl "
       "Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm").split()


def fnum(s):
    s = s.strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        for k in range(len(s) - 1, 0, -1):
            if s[k] in "+-" and s[k - 1] not in "eE":
                return float(s[:k] + "e" + s[k:])
        raise


def ef(x):
    if x == 0:
        return " 0.000000+0"
    for d in (6, 5, 4, 3):
        m, e = f"{abs(x):.{d}e}".split("e")
        e = int(e)
        t = f"{m}{'+' if e >= 0 else '-'}{abs(e)}"
        if len(t) <= 10:
            return (("-" if x < 0 else " ") + t).rjust(11)
    raise ValueError(x)


def ei(n):
    return f"{n:11d}"


def tag(mat, mf, mt, ns):
    return f"{mat:4d}{mf:2d}{mt:3d}{ns:5d}"


def fields(line):
    return [line[i:i + 11] for i in range(0, 66, 11)]


def sections(lines):
    """(mat, mf, mt) -> body lines (columns 1-66), from a tape with SEND/FEND/MEND/TEND lines."""
    out, cur, body = collections.OrderedDict(), None, []
    for ln in lines:
        if len(ln) < 75:
            continue
        mat, mf, mt = int(ln[66:70]), int(ln[70:72]), int(ln[72:75])
        if mat <= 0 or mf == 0 or mt == 0:
            if cur and body:
                out[cur] = body
            cur, body = None, []
            continue
        if (mat, mf, mt) != cur:
            if cur and body:
                out[cur] = body
            cur, body = (mat, mf, mt), []
        body.append(ln[:66])
    return out


def numbers(body, start):
    vals = []
    for ln in body[start:]:
        vals += [fnum(f) for f in fields(ln)]
    return vals


def material(mat, secs, title):
    h = fields(secs[(mat, 1, 451)][0])
    za, awr, nz, ntw = fnum(h[0]), fnum(h[1]), int(fnum(h[3])), int(fnum(h[5]))
    c = fields(secs[(mat, 1, 451)][1])
    temp, ngn = fnum(c[0]), int(fnum(c[2]))
    data = numbers(secs[(mat, 1, 451)], 2)
    egn = data[ntw + nz: ntw + nz + ngn + 1]
    mf3, other = {}, collections.Counter()
    for (m, mf, mt), body in secs.items():
        if m != mat or (mf, mt) == (1, 451):
            continue
        if mf != 3:
            other[mf] += 1
            continue
        hh = fields(body[0])
        nl, nzz = int(fnum(hh[2])), int(fnum(hh[3]))
        sig = [0.0] * ngn
        i = 1
        while i < len(body):
            cc = fields(body[i])
            nw, ig = int(fnum(cc[4])), int(fnum(cc[5]))
            nlines = (nw + 5) // 6
            vals = numbers(body[i + 1:i + 1 + nlines], 0)[:nw]
            if 1 <= ig <= ngn and len(vals) >= 2 * nl * nzz:
                sig[ig - 1] = vals[nl * nzz]
            i += 1 + nlines
        mf3[mt] = sig
    z, a = int(za) // 1000, int(za) % 1000
    zsym = f"{z:3d}-{SYM[z] if z < len(SYM) else '?':2s}-{a:3d}"
    text = [f"{zsym:11s}{'FENDL-2.1':11s}{'':10s}{'groupwise, via JANIS':33s}",
            f"{'':22s}{title:44s}",
            f" {ngn} neutron groups, {temp:g} K, infinite dilution (GENDF in JANIS)"]
    text = [t.ljust(66)[:66] for t in text]
    out = []
    nc3 = {mt: 3 + (ngn + 1 + 2) // 3 for mt in mf3}
    dirn = [(1, 451, 4 + len(text) + 1 + len(mf3), 0)] + [(3, mt, nc3[mt], 0) for mt in sorted(mf3)]
    head = [ef(za) + ef(awr) + ei(-1) + ei(0) + ei(0) + ei(0), ef(0) + ef(0) + ei(0) + ei(0) + ei(0) + ei(6),
            ef(1.0) + ef(egn[-1]) + ei(0) + ei(0) + ei(10) + ei(6), ef(temp) + ef(0) + ei(0) + ei(0) + ei(len(text)) + ei(len(dirn))]
    lines451 = head + text + [" " * 22 + ei(mf) + ei(mt) + ei(nc) + ei(mod) for mf, mt, nc, mod in dirn]
    for k, ln in enumerate(lines451, 1):
        out.append(ln.ljust(66) + tag(mat, 1, 451, k))
    out.append(" 0.000000+0 0.000000+0          0          0          0          0" + tag(mat, 1, 0, 99999))
    out.append(" 0.000000+0 0.000000+0          0          0          0          0" + tag(mat, 0, 0, 0))
    for mt in sorted(mf3):
        sig = mf3[mt]
        pts = [(egn[g], sig[g]) for g in range(ngn)] + [(egn[ngn], sig[ngn - 1])]
        body = [ef(za) + ef(awr) + ei(0) + ei(0) + ei(0) + ei(0), ef(0) + ef(0) + ei(0) + ei(0) + ei(1) + ei(len(pts)),
                ei(len(pts)) + ei(1)]
        for k in range(0, len(pts), 3):
            body.append("".join(ef(e) + ef(v) for e, v in pts[k:k + 3]))
        for k, ln in enumerate(body, 1):
            out.append(ln.ljust(66) + tag(mat, 3, mt, k))
        out.append(" 0.000000+0 0.000000+0          0          0          0          0" + tag(mat, 3, 0, 99999))
    if mf3:
        out.append(" 0.000000+0 0.000000+0          0          0          0          0" + tag(mat, 0, 0, 0))
    out.append(" 0.000000+0 0.000000+0          0          0          0          0" + tag(0, 0, 0, 0))
    return out, {"mat": mat, "za": za, "groups": ngn, "mf3": len(mf3), "other_sections": dict(other)}


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with zipfile.ZipFile(io.BytesIO(s3.get_object(Bucket=B, Key=src)["Body"].read())) as z:
        name = z.namelist()[0]
        lines = z.read(name).decode("latin-1").splitlines()
    secs = sections(lines[1:])
    mats = list(dict.fromkeys(m for m, mf, mt in secs))
    tape, rep = [f"{' FENDL-2.1 MG groupwise cross sections (ENDF-6 histograms from the GENDF in JANIS package)':<66.66}{1:4d}{0:2d}{0:3d}{0:5d}"], []
    for m in mats:
        t, r = material(m, secs, "FENDL-2.1 MG")
        tape += t
        rep.append(r)
    tape.append(" 0.000000+0 0.000000+0          0          0          0          0" + tag(-1, 0, 0, 0))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zo:
        zo.writestr(os.path.basename(dst).rsplit(".zip", 1)[0] + ".endf", "\n".join(tape) + "\n")
    s3.put_object(Bucket=B, Key=dst, Body=buf.getvalue())
    s3.put_object(Bucket=B, Key=dst.rsplit(".zip", 1)[0] + ".json", Body=json.dumps(rep, indent=1).encode())
    print(json.dumps({"materials": len(rep), "mf3_sections": sum(r["mf3"] for r in rep),
                      "groups": sorted({r["groups"] for r in rep}), "key": dst}))


if __name__ == "__main__":
    main()
