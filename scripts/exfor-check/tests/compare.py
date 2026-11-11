#!/usr/bin/env python3
"""Mine against JANIS (brief 71): JANIS's verdict on every faulted copy (from janis.json) beside mine, and, for the
candidates JANIS rejected, both checkers' counts. With file arguments, also both checkers' messages on those files
by entry.subentry and severity, posting each file to JANIS once.

  python3 scripts/exfor-check/tests/compare.py [TRANS-file ...]
"""
import collections, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, ".."))
import build, check, janis  # noqa: E402


def main():
    jv = json.load(open(os.path.join(HERE, "janis.json"))) if len(sys.argv) == 1 else {}
    faults = json.load(open(os.path.join(HERE, "faults.json"))) if len(sys.argv) == 1 else []
    by = collections.defaultdict(lambda: [0, 0, 0])
    for f in faults:
        j = jv.get(f"{f['file']}:{f['kind']}", {})
        n = j.get("janis", [0, 0])
        b = by[f["kind"]]
        b[0] += 1
        b[1] += bool(n[0] or n[1])
        b[2] += any(m.get("line") == f["line"] for m in j.get("janis_messages", []))
        if not (n[0] or n[1]):
            print("JANIS silent:", f["kind"], f["file"], "line", f["line"])
    if faults:
        print("faults (copies, JANIS flagged, JANIS at the same line):", dict(by))
    for acc, v in jv.items():
        if ":" in acc or not (v["janis"][0] or v["janis"][1]):
            continue
        r = check.check(build.wrap(acc, build.fetch(acc)).encode())
        print("JANIS rejected", acc, "janis", v["janis"], "mine", [r["summary"]["errors"], r["summary"]["warnings"]])
        print("   janis:", [(m["message"][:50], m["detail"][:20], m["line"]) for m in v["janis_messages"]][:5])
        print("   mine: ", [(m["message"][:50], m["code"][:20], m["line"]) for m in r["messages"]][:5])
    for p in sys.argv[1:]:
        r = check.check(open(p, "rb").read())
        j = janis.post(p)
        mine = collections.Counter((m["entry"] + "." + m["subent"], m["severity"]) for m in r["messages"])
        jan = collections.Counter((m["id"], m["severity"]) for m in j["messages"])
        print(os.path.basename(p), "janis", j["errors"], j["warnings"], "mine", r["summary"]["errors"], r["summary"]["warnings"])
        jo, mo = jan - mine, mine - jan
        print("   JANIS only:", collections.Counter(m["message"][:55] for m in j["messages"] if jo[(m["id"], m["severity"])] > 0).most_common())
        print("   mine only: ", collections.Counter(m["message"][:55] for m in r["messages"] if mo[(m["entry"] + "." + m["subent"], m["severity"])] > 0).most_common())


if __name__ == "__main__":
    main()
