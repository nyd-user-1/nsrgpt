#!/usr/bin/env python3
"""Build the checker's test corpus (brief 71); runs on the dev box.

clean/<entry>.x4  50 entries held in the lake (nsr-api /exfor/entry/<n>/text, X4Pro 2023-07-14), each written out as a
                  TRANS file with ENTRY/ENDENTRY records and the record identification in columns 67-79. Only entries
                  JANIS's own checker passes with no error and no warning are kept, so "clean" means clean to JANIS.
faults.json       one injected fault per copy, 50 in all (10 kinds x 5 entries): the edit, the line it lands on, the
                  rule that must report it. run.py applies them; the faulted files are not stored.
janis.json        JANIS's verdict on every candidate and every faulted copy.

  python3 scripts/exfor-check/tests/build.py
"""
import json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, ".."))
import janis  # noqa: E402
import check  # noqa: E402

API = "https://daw1qggkn69lv.cloudfront.net"
AREAS = "1234ACDEFGKLMOSTV"
PER_AREA, WANT, MAX_BYTES = 4, 50, 24000


def fetch(acc):
    try:
        with urllib.request.urlopen(f"{API}/exfor/entry/{acc}/text", timeout=60) as r:
            return r.read().decode("latin-1")
    except Exception:
        return None


def ident(acc, sub, seq):
    return f"{acc:>5}{sub:>3}{seq:>5} "


def wrap(acc, text, trans="9001"):
    """An entry's master text as a TRANS file: TRANS, ENTRY, its subentries, ENDENTRY, ENDTRANS; columns 67-80."""
    src = [l.rstrip() for l in text.replace("\r", "").split("\n") if l.strip()]
    dates = [l[22:33].strip() for l in src if l.startswith(("SUBENT", "NOSUBENT"))]
    date = max(d for d in dates if d.isdigit()) if dates else "20230714"
    out = [f"{'TRANS':<11}{trans:>11}{'20261111':>11}".ljust(66) + ident(acc[0] + "0000", 0, 0),
           f"{'ENTRY':<11}{acc:>11}{date:>11}".ljust(66) + ident(acc, 0, 1)]
    sub, seq, nsub = 0, 0, 0
    for l in src:
        kw = l[:10].strip()
        if kw in ("SUBENT", "NOSUBENT"):
            sub, seq = int(l[11:22].strip()[-3:]), 1
            nsub += 1
            out.append(l[:66].ljust(66) + ident(acc, sub, 1))
            continue
        if kw == "ENDSUBENT":
            out.append(l[:66].ljust(66) + ident(acc, sub, 99999))
            continue
        seq += 1
        out.append(l[:66].ljust(66) + ident(acc, sub, seq))
    out.append(f"{'ENDENTRY':<11}{nsub:>11}{0:>11}".ljust(66) + ident(acc, 999, 99999))
    out.append(f"{'ENDTRANS':<11}{1:>11}{0:>11}".ljust(66) + "Z999999999999 ")
    return "\n".join(out) + "\n"


def candidates():
    for a in AREAS:
        for k in (1, 7, 31, 97, 151, 233, 377, 499, 613, 811, 997, 1201, 1597, 2003, 2584, 3001):
            yield f"{a}{k:04d}"


def faults_for(name, lines):
    """The ten fault kinds this file can take: (kind, op, line index, new text, line reported, rule)."""
    out = []
    def first(pred, start=0):
        return next((i for i in range(start, len(lines)) if pred(lines[i])), None)
    i = first(lambda l: l.startswith("INSTITUTE  ("))
    if i is not None:
        out.append(("institute", "replace", i, re.sub(r"^INSTITUTE  \([^,)]+", "INSTITUTE  (1USAXYZ", lines[i]), i, "CODE-DICT"))
    i = first(lambda l: re.match(r"^REACTION  .\([0-9]+-[A-Z]+-[0-9]+\([A-Z]+,[A-Z0-9+]+\)[^,]*,,SIG\)", l) is not None)
    if i is not None:
        new = re.sub(r"\(([A-Z]+),[A-Z0-9+]+\)([^,]*),,SIG\)", r"(\1,TOT)\2,,DA)", lines[i], count=1)
        out.append(("sf3-sf6", "replace", i, new[:66].ljust(66) + lines[i][66:], i, "REACT-COMB"))
    d = first(lambda l: l.startswith("DATA ") and l[11:22].strip().isdigit())
    if d is not None:
        n1 = int(lines[d][11:22])
        per = -(-n1 // 6)
        u = d + 1 + per + per - 1  # last units record
        last = (n1 - 1) % 6
        if n1 > 1:
            row = lines[u][:last * 11] + " " * 11 + lines[u][last * 11 + 11:]
            out.append(("units-short", "replace", u, row, u, "TAB-COUNT"))
        v = d + 1 + 2 * per
        if v < len(lines) and lines[v][:11].strip():
            out.append(("non-numeric", "replace", v, "   1.2X-03 " + lines[v][11:], v, "TAB-NUM"))
    e = first(lambda l: l.startswith("ENDSUBENT"))
    if e is not None:
        n = int(lines[e][11:22])
        out.append(("endsubent-count", "replace", e, f"{'ENDSUBENT':<11}{n + 1:>11}" + lines[e][22:], e, "SYS-N"))
    b = first(lambda l: l.startswith("ENDBIB"), (first(lambda l: l.startswith("SUBENT"), 3) or 0) + 1)
    subs = [i for i, l in enumerate(lines) if l.startswith("SUBENT")]
    if len(subs) > 1:
        b = first(lambda l: l.startswith("ENDBIB"), subs[1])
        if b is not None:
            out.append(("missing-endbib", "delete", b, None, b, "SYS-MISSING"))
        s2 = lines[subs[1]]
        prev = lines[subs[0]][11:22]
        out.append(("duplicate-subentry", "replace", subs[1], s2[:11] + prev + s2[22:], subs[1], "SUB-DUP"))
    i = first(lambda l: re.search(r"\(J,[A-Z0-9/.\-]+,", l[11:]) is not None and l.startswith(("REFERENCE", "           (J")))
    if i is not None:
        new = re.sub(r"\(J,[A-Z0-9/.\-]+,", "(J,QQQJ,", lines[i], count=1)
        out.append(("journal", "replace", i, new[:66].ljust(66) + lines[i][66:], i, "CODE-DICT"))
    s = first(lambda l: l.startswith("SUBENT"))
    if s is not None:
        dt = lines[s][22:33].strip()
        bad = dt[:4] + "13" + dt[6:] if len(dt) == 8 else dt[:2] + "13" + dt[4:]  # month 13
        out.append(("date", "replace", s, lines[s][:22] + f"{bad:>11}" + lines[s][33:], s, "SYS-DATE"))
    en = order_fault(lines)
    if en:
        out.append(en)
    return out


def order_fault(lines):
    """Swap two incident energies in a table whose one independent variable is EN."""
    for d, l in enumerate(lines):
        if not (l.startswith("DATA ") and l[11:22].strip().isdigit()):
            continue
        n1, n2 = int(l[11:22]), int(l[22:33] or 0)
        if n1 > 6 or n2 < 4:
            continue
        heads = [lines[d + 1][j * 11:j * 11 + 10].strip() for j in range(n1)]
        indep = [h for h in heads if (check.D["024"].get(h) or [0])[0] in (3, 4, 5, 6, 7, 8, 9)]
        if indep != ["EN"]:
            continue
        j = heads.index("EN")
        r1, r2 = d + 3 + 1, d + 3 + 2
        a, b = lines[r1][j * 11:j * 11 + 11], lines[r2][j * 11:j * 11 + 11]
        x, y = check.fnum(a), check.fnum(b)
        if not x or not y or x == y:
            continue
        l1 = lines[r1][:j * 11] + b + lines[r1][j * 11 + 11:]
        return ("en-order", "swap", r1, l1, r2, "TAB-ORDER", r2, lines[r2][:j * 11] + a + lines[r2][j * 11 + 11:])
    return None


def main():
    os.makedirs(os.path.join(HERE, "clean"), exist_ok=True)
    jv, kept, per = {}, [], {}
    if "--faults" in sys.argv:  # keep clean/ as it is; remake the faults and ask JANIS about them again
        kept = sorted(p[:-3] for p in os.listdir(os.path.join(HERE, "clean")) if p.endswith(".x4"))
        jp = os.path.join(HERE, "janis.json")
        jv = {k: v for k, v in (json.load(open(jp)) if os.path.exists(jp) else {}).items() if ":" not in k}
    for acc in ([] if kept else candidates()):
        if len(kept) >= WANT:
            break
        if per.get(acc[0], 0) >= PER_AREA:
            continue
        t = fetch(acc)
        if not t or len(t) > MAX_BYTES or len(t) < 1500 or "\nDATA " not in "\n" + t:
            continue
        body = wrap(acc, t)
        path = os.path.join(HERE, "clean", f"{acc}.x4")
        open(path, "w").write(body)
        jr = janis.post(path)
        mine = check.check(body.encode())["summary"]
        jv[acc] = {"janis": [jr["errors"], jr["warnings"]], "mine": [mine["errors"], mine["warnings"]],
                   "janis_messages": jr["messages"][:20]}
        print(acc, len(body), "janis", jr["errors"], jr["warnings"], "mine", mine["errors"], mine["warnings"], flush=True)
        if jr["errors"] or jr["warnings"] or not jr["ok"]:
            os.remove(path)
            continue
        kept.append(acc)
        per[acc[0]] = per.get(acc[0], 0) + 1
    faults, kinds = [], {}
    for acc in kept:
        lines = open(os.path.join(HERE, "clean", f"{acc}.x4")).read().split("\n")
        for f in faults_for(acc, lines):
            if kinds.get(f[0], 0) >= 5 or any(x["file"] == acc and x["kind"] == f[0] for x in faults):
                continue
            if sum(1 for x in faults if x["file"] == acc) >= 2:
                break
            rec = {"file": acc, "kind": f[0], "op": f[1], "index": f[2], "text": f[3], "line": f[4] + 1, "rule": f[5]}
            if f[1] == "swap":
                rec["index2"], rec["text2"] = f[6], f[7]
            faults.append(rec)
            kinds[f[0]] = kinds.get(f[0], 0) + 1
    json.dump(faults, open(os.path.join(HERE, "faults.json"), "w"), indent=1)
    sys.path.insert(0, HERE)
    import run  # noqa: E402
    for f in faults:
        p = "/tmp/fault.x4"
        open(p, "w").write(run.apply(f))
        jr = janis.post(p)
        jv[f"{f['file']}:{f['kind']}"] = {"janis": [jr["errors"], jr["warnings"]], "janis_messages": jr["messages"][:20]}
        print(f["file"], f["kind"], "janis", jr["errors"], jr["warnings"], flush=True)
    json.dump(jv, open(os.path.join(HERE, "janis.json"), "w"), indent=1)
    print("kept", len(kept), "faults", len(faults), kinds)


if __name__ == "__main__":
    main()
