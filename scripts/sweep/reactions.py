"""Brief 57: the EXFOR reaction field (projectile, process) to the evaluation's (sublibrary, MT), by ENDF-6's MT table
(ENDF-102, appendix B). The process is read as a sum of outgoing particles ("2N+A", "N+P", "3N"), counted, and looked up
in the MT list, so every combination ENDF-6 names maps the same way; the few processes that are not particle lists
(TOT, EL, NON, INL, F, ABS) are named directly. Anything else (X, SCT, THS, TCC, a lone particle equal to the projectile,
...) maps to nothing and is counted as "no MT".
"""
from collections import Counter

SUBLIBRARY = {"N": "neutrons", "P": "protons", "D": "deuterons", "T": "tritons", "HE3": "helium3s", "A": "alphas",
              "G": "gammas"}
PROJECTILE_ZA = {"N": 1, "P": 1001, "D": 1002, "T": 1003, "HE3": 2003, "A": 2004, "G": 0}
PARTICLE_ZA = {"N": 1, "P": 1001, "D": 1002, "T": 1003, "HE3": 2003, "A": 2004, "G": 0}
SYMBOL = {"N": "n", "P": "p", "D": "d", "T": "t", "HE3": "³He", "A": "α", "G": "γ"}

# ENDF-6 MT numbers by their outgoing particles (ENDF-102 appendix B). For incident neutrons MT 4 is inelastic (n,n');
# for any other projectile MT 4 is (z,n).
_MT_PARTICLES = {
    11: "2N+D", 16: "2N", 17: "3N", 22: "N+A", 23: "N+3A", 24: "2N+A", 25: "3N+A", 28: "N+P", 29: "N+2A", 30: "2N+2A",
    32: "N+D", 33: "N+T", 34: "N+HE3", 35: "N+D+2A", 36: "N+T+2A", 37: "4N", 41: "2N+P", 42: "3N+P", 44: "N+2P",
    45: "N+P+A", 102: "G", 103: "P", 104: "D", 105: "T", 106: "HE3", 107: "A", 108: "2A", 109: "3A", 111: "2P",
    112: "P+A", 113: "T+2A", 114: "D+2A", 115: "P+D", 116: "P+T", 117: "D+A", 152: "5N", 153: "6N", 154: "2N+T",
    155: "T+A", 156: "4N+P", 157: "3N+D", 158: "N+D+A", 159: "2N+P+A", 160: "7N", 161: "8N", 162: "5N+P", 163: "6N+P",
    164: "7N+P", 165: "4N+A", 166: "5N+A", 167: "6N+A", 168: "7N+A", 169: "4N+D", 170: "5N+D", 171: "6N+D",
    172: "3N+T", 173: "4N+T", 174: "5N+T", 175: "6N+T", 176: "2N+HE3", 177: "3N+HE3", 178: "4N+HE3", 179: "3N+2P",
    180: "3N+2A", 181: "3N+P+A", 182: "D+T", 183: "N+P+D", 184: "N+P+T", 185: "N+D+T", 186: "N+P+HE3",
    187: "N+D+HE3", 188: "N+T+HE3", 189: "N+T+A", 190: "2N+2P", 191: "P+HE3", 192: "D+HE3", 193: "HE3+A",
    194: "4N+2P", 195: "4N+2A", 196: "4N+P+A", 197: "3P", 198: "N+3P", 199: "3N+2P+A", 200: "5N+2P",
}
NAMED = {"TOT": 1, "EL": 2, "NON": 3, "F": 18, "ABS": 27}


def particles(process):
    """'2N+A' -> Counter({'N': 2, 'A': 1}); None when a token is not a particle with an optional count."""
    out = Counter()
    for tok in process.split("+"):
        tok = tok.strip()
        k = 0
        while k < len(tok) and tok[k].isdigit():
            k += 1
        n, p = (int(tok[:k]) if k else 1), tok[k:]
        if p not in PARTICLE_ZA or n < 1:
            return None
        out[p] += n
    return out


_BY_PARTICLES = {frozenset(particles(v).items()): mt for mt, v in _MT_PARTICLES.items()}


def map_reaction(projectile, process):
    """(sublibrary, mt, outgoing ZA sum or None, reason). mt None with the reason when nothing maps."""
    projectile, process = (projectile or "").strip().upper(), (process or "").strip().upper()
    sub = SUBLIBRARY.get(projectile)
    if not sub:
        return None, None, None, "projectile not held by the libraries"
    if process in NAMED:
        mt = NAMED[process]
        if mt == 27 and projectile != "N":
            return sub, None, None, "absorption is a neutron MT"
        return sub, mt, None, ""
    if process == "INL":
        return (sub, 4, 1, "") if projectile == "N" else (sub, None, None, "inelastic for charged particles has no MF3 MT")
    c = particles(process)
    if c is None:
        return sub, None, None, "process is not a list of particles (X, SCT, ...)"
    if c == Counter({projectile: 1}) and projectile != "N":
        return sub, None, None, "elastic or inelastic of a charged particle"
    if c == Counter({"N": 1}):
        return sub, 4, 1, ""  # inelastic for neutrons, (z,n) otherwise
    mt = _BY_PARTICLES.get(frozenset(c.items()))
    if mt is None:
        return sub, None, None, "no ENDF-6 MT for these outgoing particles"
    return sub, mt, sum(PARTICLE_ZA[p] * n for p, n in c.items()), ""


def label(projectile, process):
    """'(n,γ)', '(p,2n)', '(³He,n+α)'."""
    projectile, process = (projectile or "").upper(), (process or "").upper()
    names = {"TOT": "tot", "EL": "el", "NON": "non", "INL": "inl", "F": "f", "ABS": "abs"}
    if process in names:
        out = names[process]
    else:
        parts = []
        for tok in process.split("+"):
            k = 0
            while k < len(tok) and tok[k].isdigit():
                k += 1
            parts.append(tok[:k] + SYMBOL.get(tok[k:], tok[k:].lower()))
        out = "+".join(parts)
    return f"({SYMBOL.get(projectile, projectile.lower())},{out})"


ELEMENTS = ("n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y "
            "Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os "
            "Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh "
            "Fl Mc Lv Ts Og").split()


def nuclide(za, liso=0):
    """92235 -> 'U-235'; 26000 -> 'Fe-nat'; liso 1 -> 'Am-242m'."""
    z, a = divmod(int(za), 1000)
    sym = ELEMENTS[z] if 0 <= z < len(ELEMENTS) else str(z)
    return f"{sym}-{a if a else 'nat'}" + ({1: "m", 2: "m2"}.get(int(liso or 0), ""))


def za_of(name):
    """'U-235' -> (92235, 0); 'Am-242m' -> (95242, 1); 'Fe-nat' -> (26000, 0). None when not a nuclide name."""
    s = name.strip().replace("_", "-")
    liso = 0
    low = s.lower()
    if low.endswith("m2"):
        liso, s = 2, s[:-2]
    elif low.endswith("m"):
        liso, s = 1, s[:-1]
    if "-" not in s:
        i = 0
        while i < len(s) and s[i].isalpha():
            i += 1
        sym, a = s[:i], s[i:]
        if not sym:  # '235U'
            i = 0
            while i < len(s) and s[i].isdigit():
                i += 1
            a, sym = s[:i], s[i:]
    else:
        sym, a = s.split("-", 1)
    sym = sym.strip().capitalize()
    if sym not in ELEMENTS:
        return None
    a = 0 if a.strip().lower() in ("nat", "0", "") else int(a)
    return ELEMENTS.index(sym) * 1000 + a, liso
