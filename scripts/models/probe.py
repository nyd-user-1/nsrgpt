"""Brief 61, Part A: print the columns and a sample row of every table the pairs come from."""
import sys

sys.path.insert(0, "/opt/models")
from lakeduck import con, L  # noqa: E402

c = con()
T = {
    "search_docs": f"{L}/serve/search/2026-11-08/docs/*",
    "search_docs_structure": f"{L}/serve/search/2026-11-08/docs_structure/*",
    "nsr": f"{L}/nsr-database/2026-10-15/nsr/public.nsr/*/*.parquet",
    "nsr_exfor": f"{L}/nsr-database/2026-10-15/nsr/public.nsr_exfor/*/*.parquet",
    "nsr_nuclides": f"{L}/nsr-database/2026-10-15/nsr/public.nsr_nuclides/*/*.parquet",
    "nsr_authors": f"{L}/nsr-database/2026-10-15/nsr/public.nsr_authors/*/*.parquet",
    "exfor_subentries": f"{L}/exfor/j4-2026-10-28/subentries/*",
    "exfor_entries": f"{L}/exfor/j4-2026-10-28/entries/*",
    "exfor_reactions": f"{L}/exfor/j4-2026-10-28/reactions/*",
    "exfor_search_index": f"{L}/serve/exfor/2026-10-28/search_index/*",
    "ensdf_datasets": f"{L}/ensdf/2026-11-05/datasets/*",
    "ensdf_references": f"{L}/ensdf/2026-11-05/references/*",
    "ensdf_xrefs": f"{L}/ensdf/2026-11-05/xrefs/*",
    "dict_quantities": f"{L}/exfor/dictionary/quantities/*",
    "dict_processes": f"{L}/exfor/dictionary/processes/*",
    "dict_particles": f"{L}/exfor/dictionary/particles/*",
    "endfb_materials": f"{L}/endfb/B-VIII.1/materials/*",
}
for name, glob in T.items():
    try:
        r = c.execute(f"SELECT * FROM read_parquet('{glob}') LIMIT 2").fetchall()
        cols = [d[0] for d in c.description]
        n = c.execute(f"SELECT count(*) FROM read_parquet('{glob}')").fetchone()[0]
        print(f"== {name} ({n:,} rows): {cols}")
        for row in r[:2]:
            print("   ", {k: (str(v)[:120] if v is not None else None) for k, v in zip(cols, row)})
    except Exception as e:  # noqa: BLE001
        print(f"== {name}: ERROR {str(e)[:200]}")
