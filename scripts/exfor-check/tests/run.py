#!/usr/bin/env python3
"""Run the checker over the test corpus (brief 71): every clean file must give no message; every faulted copy must be
reported at the fault's line with the fault's rule. Prints one line per failure and the counts; exit 1 on any failure.

  python3 scripts/exfor-check/tests/run.py [-v]
"""
import json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import check  # noqa: E402


def apply(f):
    lines = open(os.path.join(HERE, "clean", f"{f['file']}.x4")).read().split("\n")
    if f["op"] == "delete":
        del lines[f["index"]]
    else:
        lines[f["index"]] = f["text"]
        if f["op"] == "swap":
            lines[f["index2"]] = f["text2"]
    return "\n".join(lines)


def main():
    verbose = "-v" in sys.argv
    clean = sorted(p for p in os.listdir(os.path.join(HERE, "clean")) if p.endswith(".x4"))
    faults = json.load(open(os.path.join(HERE, "faults.json")))
    ok_clean = ok_fault = 0
    t0, size = time.time(), 0
    for p in clean:
        body = open(os.path.join(HERE, "clean", p), "rb").read()
        size += len(body)
        r = check.check(body)
        if r["messages"]:
            print(f"CLEAN FAIL {p}: " + "; ".join(f"{m['line']} {m['rule']} {m['code']} {m['message']}" for m in r["messages"][:6]))
        else:
            ok_clean += 1
    for f in faults:
        body = apply(f).encode()
        size += len(body)
        r = check.check(body)
        hit = [m for m in r["messages"] if m["line"] == f["line"] and m["rule"] == f["rule"]]
        if hit:
            ok_fault += 1
            if verbose:
                print(f"fault ok {f['file']} {f['kind']}: {hit[0]['message']}"
                      + (f" (+{len(r['messages']) - 1} more)" if len(r["messages"]) > 1 else ""))
        else:
            print(f"FAULT MISS {f['file']} {f['kind']} line {f['line']} {f['rule']}: got "
                  + "; ".join(f"{m['line']} {m['rule']} {m['message']}" for m in r["messages"][:5]))
    dt = time.time() - t0
    print(f"clean {ok_clean}/{len(clean)}, faults {ok_fault}/{len(faults)}, {size / 1e6:.2f} MB in {dt:.2f} s")
    sys.exit(0 if ok_clean == len(clean) and ok_fault == len(faults) else 1)


if __name__ == "__main__":
    main()
