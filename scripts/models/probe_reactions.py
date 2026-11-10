"""Brief 61: why reaction triples drop out of build_pairs.py (projectile, process and target forms)."""
import collections
import re
import sys

sys.path.insert(0, "/opt/models")
from lakeduck import con, L  # noqa: E402

c = con()
rows = c.execute(f"SELECT target_sym, reaction, sf6, count(*) FROM read_parquet('{L}/serve/exfor/2026-10-28/search_index/*') "
                 "GROUP BY ALL").fetchall()
why = collections.Counter()
proj = collections.Counter()
ex = collections.defaultdict(list)
for tsym, reac, sf6, n in rows:
    if not tsym or not reac:
        why["no target or reaction"] += 1
        continue
    m = re.fullmatch(r"([A-Za-z]{1,2})-(\d{1,3})", tsym)
    if not m:
        why["target form"] += 1
        ex["target form"].append(tsym)
        continue
    if "," not in reac:
        why["no comma"] += 1
        ex["no comma"].append(reac)
        continue
    p = reac.split(",", 1)[0]
    proj[p] += 1
    why["ok form"] += 1
print(why)
print(proj.most_common(25))
for k, v in ex.items():
    print(k, collections.Counter(v).most_common(15))
