"""The rail's 15 decay chains checked against ICRP Publication 107 (brief 48, Part C). Runs on the parse box after
parse.py. Ours: nsr.nuclide_serve_summary (ENSDF 2026-11-05 ground-state decay modes and half-lives), walked the way the
app's seriesFrom walks them (lib/viz-physics.ts): every branch of at least 0.001% whose daughter keeps A mod 4 and moves
Z by at most 2, down to stable. ICRP: nsr.icrp107_daughters and icrp107_nuclides (read from the parse's local Parquet),
walked with the same rule; isomers are collapsed onto their ground state for the comparison and listed on their own.
Writes lake/_work/parse/icrp107/crosscheck.md (docs/briefs/48-icrp-crosscheck.md in the repo).
  /opt/parse/bin/python crosscheck.py"""
import json
import math
import os
import sys
from collections import defaultdict

import pyarrow.parquet as pq

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "box"))
import lake  # noqa: E402
from parse import SYMBOLS, WORK, nuclide_parts  # noqa: E402

CHAINS = [  # id, title, head (Z, N): lib/diagram/library/series.ts
    ("thorium-series", "Thorium series (4n)", (90, 142)), ("neptunium-series", "Neptunium series (4n+1)", (93, 144)),
    ("uranium-series", "Uranium series (4n+2)", (92, 146)), ("actinium-series", "Actinium series (4n+3)", (92, 143)),
    ("pu241-chain", "Pu-241 chain", (94, 147)), ("u232-chain", "U-232 chain", (92, 140)),
    ("pu238-chain", "Pu-238 chain", (94, 144)), ("cm244-chain", "Cm-244 chain", (96, 148)),
    ("rn222-progeny", "Radon-222 progeny", (86, 136)), ("sr90-chain", "Sr-90 chain", (38, 52)),
    ("cs137-chain", "Cs-137 chain", (55, 82)), ("mo99-chain", "Mo-99 chain", (42, 57)),
    ("mass-131-chain", "Mass 131 fission chain", (50, 81)), ("mass-135-chain", "Mass 135 fission chain", (52, 83)),
    ("mass-140-chain", "Mass 140 fission chain", (54, 86)),
]
MIN_PCT = 0.001
YEAR = 365.2422 * 86400
# ENSDF decay modes as (dZ, dN); SF and anything unlisted has no single daughter.
ZN = {"A": (-2, -2), "B-": (1, -1), "EC": (-1, 1), "B+": (-1, 1), "EC+B+": (-1, 1), "ECB+": (-1, 1), "E": (-1, 1),
      "2B-": (2, -2), "2EC": (-2, 2), "IT": (0, 0), "B-N": (1, -2), "B-2N": (1, -3), "B-A": (-1, -3), "ECP": (-2, 1),
      "EP": (-2, 1), "B+P": (-2, 1), "ECA": (-3, -1), "P": (-1, 0), "N": (0, -1), "2P": (-2, 0)}
SHOW = {"A": "α", "B-": "β−", "IT": "IT", "B-N": "β−n", "2B-": "2β−"}


def show_mode(m):
    if m in ("EC", "B+", "EC+B+", "ECB+", "E", "EC/B+"):
        return "EC/β+"
    return SHOW.get(m, m)


def name(z, a):
    return f"{SYMBOLS[z - 1]}-{a}"


def rail_rule(dz, dn):
    return (dz + dn) % 4 == 0 and abs(dz) <= 2


def fmt_t(s):
    if s is None or (isinstance(s, float) and math.isinf(s)):
        return "stable"
    for unit, size in (("y", YEAR), ("d", 86400), ("h", 3600), ("m", 60), ("s", 1), ("ms", 1e-3), ("µs", 1e-6),
                       ("ns", 1e-9)):
        if s >= size or unit == "ns":
            v = s / size
            if v < 1e4:
                return f"{v:.4g} {unit}"
            m, e = f"{v:.3e}".split("e")
            return f"{m}E{int(e)} {unit}"


def fmt_pct(p):
    return "?" if p is None else f"{p:.4g}%"


def all_rows(sql):
    qid, _ = lake.query(sql)
    out, first = [], True
    for page in lake.athena.get_paginator("get_query_results").paginate(QueryExecutionId=qid):
        rows = page["ResultSet"]["Rows"]
        if first:
            rows, first = rows[1:], False
        out += [[c.get("VarCharValue") for c in r["Data"]] for r in rows]
    return out


def ours_graph():
    """(Z, A) -> {half_life_s, edges: [(mode, pct, (Z, A))]} for every ENSDF ground state."""
    g = {}
    for z, n, hl, modes in all_rows("SELECT z, n, half_life_s, decay_modes FROM nuclide_serve_summary"):
        z, n = int(z), int(n)
        edges, unknown = [], []
        for m in json.loads(modes or "[]"):
            zn = ZN.get(m["mode"])
            if zn is None:
                if m["mode"] != "SF":
                    unknown.append(m["mode"])
                continue
            edges.append((m["mode"], m.get("pct"), zn))
        g[(z, z + n)] = {"t": float(hl) if hl not in (None, "") else None, "edges": edges, "n": n, "unknown": unknown}
    return g


def walk_ours(g, head):
    z, n = head
    start = (z, z + n)
    order, seen, queue, steps = [start], {start}, [start], []
    while queue:
        za = queue.pop(0)
        x = g.get(za)
        if not x:
            continue
        for mode, pct, (dz, dn) in x["edges"]:
            if not rail_rule(dz, dn) or (pct is not None and pct < MIN_PCT):
                continue
            to = (za[0] + dz, za[1] + dz + dn)
            if to not in g:
                continue
            steps.append((za, mode, pct, to))
            if to not in seen:
                seen.add(to)
                order.append(to)
                queue.append(to)
    return order, steps


def icrp_graph():
    nuc = pq.read_table(os.path.join(WORK, "nuclides")).to_pylist()
    dau = pq.read_table(os.path.join(WORK, "daughters")).to_pylist()
    by = {r["nuclide"]: r for r in nuc}
    out = defaultdict(list)
    for d in dau:
        out[d["parent"]].append(d)
    return by, out


def walk_icrp(by, out, seeds):
    order, seen, queue, steps = list(seeds), set(seeds), list(seeds), []
    while queue:
        p = queue.pop(0)
        for d in out.get(p, []):
            if d["mode"] == "SF" or d["branching_fraction"] * 100 < MIN_PCT:
                continue
            pz, pa, dz, da = d["parent_z"], d["parent_a"], d["daughter_z"], d["daughter_a"]
            if not rail_rule(dz - pz, (da - dz) - (pa - pz)):
                continue
            steps.append((p, d["mode"], d["branching_fraction"] * 100, d["daughter"]))
            if d["daughter"] not in seen:
                seen.add(d["daughter"])
                order.append(d["daughter"])
                queue.append(d["daughter"])
    return order, steps


def za_of(icrp_name):
    _, z, a, iso = nuclide_parts(icrp_name)
    return (z, a), iso


def chain(cid, title, head, g, by, out):
    o_order, o_steps = walk_ours(g, head)
    ours_members = set(o_order)
    head_name = name(head[0], head[0] + head[1])
    if head_name in by:
        seeds = [head_name]
    else:  # the head isn't in ICRP: start from the first of our members it has
        seeds = [name(*za) for za in o_order if name(*za) in by][:1]
    i_order, i_steps = walk_icrp(by, out, seeds)
    icrp_ground = {}
    isomers = []
    for nm in i_order:
        za, iso = za_of(nm)
        if iso:
            isomers.append(nm)
        icrp_ground.setdefault(za, nm if not iso else None)
        if not iso:
            icrp_ground[za] = nm
    icrp_members = set(icrp_ground)
    # Collapsed ICRP branches: ground-state parent -> daughter ground state, summing branches into its isomers.
    i_edges = defaultdict(lambda: defaultdict(lambda: [0.0, set()]))
    for p, mode, pct, d in i_steps:
        pza, piso = za_of(p)
        dza, _ = za_of(d)
        if piso or pza == dza:
            continue
        e = i_edges[pza][dza]
        e[0] += pct
        e[1].add(mode)
    o_edges = defaultdict(dict)
    for p, mode, pct, d in o_steps:
        o_edges[p][d] = (mode, pct)

    rows, diffs = [], 0
    for za in o_order + [za for za in (za_of(n)[0] for n in i_order) if za not in ours_members]:
        if any(r[0] == za for r in rows):
            continue
        x = g.get(za)
        nm = name(*za)
        ours_txt, icrp_txt, notes = "—", "—", []
        if za in ours_members:
            br = "; ".join(f"{show_mode(m)} {fmt_pct(p)} → {name(*d)}" for d, (m, p) in o_edges[za].items())
            ours_txt = fmt_t(x["t"] if x else None) + (f"; {br}" if br else "")
        ip = icrp_ground.get(za)
        if za in icrp_members:
            ir = by.get(ip) if ip else None
            br = "; ".join(f"{'/'.join(sorted(show_mode(m) for m in e[1]))} {fmt_pct(e[0])} → {name(*d)}"
                           for d, e in i_edges[za].items())
            icrp_txt = (fmt_t(ir["half_life_s"]) if ir else "stable") + (f"; {br}" if br else "")
        if za not in icrp_members:
            notes.append("head not in ICRP" if nm == head_name and head_name not in by else "not in ICRP")
        elif za not in ours_members:
            notes.append("not in ours")
        else:
            ir = by.get(ip) if ip else None
            ot = x["t"] if x else None
            it = ir["half_life_s"] if ir else None
            if (ot is None) != (it is None):
                notes.append(f"stable in {'ours' if ot is None else 'ICRP'}")
            elif ot and it and abs(ot - it) / it > 0.01:
                notes.append(f"half-life {abs(ot - it) / it * 100:.3g}% apart")
            for d in set(o_edges[za]) | set(i_edges[za]):
                o, i = o_edges[za].get(d), i_edges[za].get(d)
                if o and not i:
                    notes.append(f"branch to {name(*d)} only in ours")
                elif i and not o:
                    notes.append(f"branch to {name(*d)} only in ICRP")
                else:
                    om, ip_ = show_mode(o[0]), {show_mode(m) for m in i[1]}
                    if om not in ip_:
                        notes.append(f"mode to {name(*d)}: {om} vs {'/'.join(sorted(ip_))}")
                    if o[1] is not None and abs(o[1] - i[0]) > 1:
                        notes.append(f"branch to {name(*d)} {abs(o[1] - i[0]):.3g} points apart")
        diffs += len(notes)
        rows.append((za, nm, ours_txt, icrp_txt, "; ".join(notes)))
    for nm in isomers:
        ir = by[nm]
        br = "; ".join(f"{show_mode(m)} {fmt_pct(p)} → {d}" for p_, m, p, d in i_steps if p_ == nm)
        rows.append((None, nm, "—", fmt_t(ir["half_life_s"]) + (f"; {br}" if br else ""),
                     "isomer, ours collapses to ground state"))
    unknown = sorted({m for za in o_order for m in (g.get(za) or {}).get("unknown", [])})
    return {"id": cid, "title": title, "head": head_name, "rows": rows, "ours": len(ours_members),
            "icrp": len(icrp_members), "isomers": len(isomers), "diffs": diffs, "unknown_modes": unknown}


def main():
    g = ours_graph()
    by, out = icrp_graph()
    results = [chain(cid, t, h, g, by, out) for cid, t, h in CHAINS]
    md = ["# ICRP Publication 107 cross-check of the 15 decay chains (2026-11-09)", "",
          "Ours: ENSDF 2026-11-05 ground states (`nsr.nuclide_serve_summary`). ICRP: Publication 107, the 2021 corrected "
          "NDX (`nsr.icrp107_daughters`, `icrp107_nuclides`). Both walked from the head the way the rail does: branches of "
          "at least 0.001% that keep A mod 4 and move Z by at most 2, down to stable. ICRP isomers are counted under "
          "their ground state. Flagged: a member in one source only, a different mode, branching over 1 percentage point "
          "apart, half-life over 1% apart. Script: `scripts/parse/icrp107/crosscheck.py`.", "",
          "| Chain | Head | Members, ours | Members, ICRP | ICRP isomers | Differences |", "| --- | --- | --- | --- | --- | --- |"]
    for r in results:
        md.append(f"| {r['title']} | {r['head']} | {r['ours']} | {r['icrp']} | {r['isomers']} | {r['diffs']} |")
    for r in results:
        md += ["", f"## {r['title']}", "", "| Nuclide | Ours | ICRP | Difference |", "| --- | --- | --- | --- |"]
        md += [f"| {nm} | {o} | {i} | {d} |" for _, nm, o, i, d in r["rows"]]
        if r["unknown_modes"]:
            md += ["", "ENSDF modes not followed: " + ", ".join(r["unknown_modes"])]
    text = "\n".join(md) + "\n"
    lake.s3.put_object(Bucket=lake.BUCKET, Key="lake/_work/parse/icrp107/crosscheck.md", Body=text.encode(),
                       ContentType="text/markdown")
    for r in results:
        print(f"{r['title']}: ours {r['ours']}, icrp {r['icrp']}, isomers {r['isomers']}, diffs {r['diffs']}")


if __name__ == "__main__":
    main()
