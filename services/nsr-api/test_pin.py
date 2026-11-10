# keyword_search.bare_nuclide (brief 56): which queries pin ENSDF's and ICRP 107's nuclide records. Pure, no index.
#   python test_pin.py <folder holding keyword_search.py>
import sys

sys.path.insert(0, sys.argv[1])
import keyword_search as K

for q, want in [("Ac-225", ["225Ac", "icrp:Ac-225"]), ("225Ac", ["225Ac", "icrp:Ac-225"]), ("ac225", ["225Ac", "icrp:Ac-225"]),
                ("60Co", ["60Co", "icrp:Co-60"]), ("U-235", ["235U", "icrp:U-235"]), ("Tc-99m", ["icrp:Tc-99m"]),
                ("99mTc", ["icrp:Tc-99m"]), ("U-235 fission", []), ("60Co gammas", []), ("10001002", []),
                ("JEFF-3.3", []), ("Xx-12", []), ("Cs-137 half-life", [])]:
    got = K.bare_nuclide(q)
    print("ok " if got == want else "BAD", repr(q), got)
