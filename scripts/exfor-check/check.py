#!/usr/bin/env python3
"""EXFOR TRANS checker (brief 71, elpis-check, 2026-11-11). Pure Python, no dependencies.

check(text) reads a TRANS file (EXFOR exchange format) and returns
  {"messages": [{line, entry, subent, severity: error|warning, rule, code, message}], "summary": {...}, ...}
where `rule` is a short id in RULES, whose text the page unfolds. The checks run in the brief's order: record structure
and numbering, keyword spelling and placement, dictionary codes, REACTION strings, units against quantities, the data
table, pointers, dates and the N1/N2 counts. Every check names its Formats Manual (IAEA-NDS-207) or LEXFOR
(IAEA-NDS-208) topic in its docstring. The dictionaries come from exfor_check_dicts.py (scripts/exfor-check/dicts.py).

  python3 scripts/exfor-check/check.py FILE [FILE ...]     # prints the report; exit 1 if any error
The Lambda imports it as exfor_check_core (services/nsr-api/exfor_check_core.py is a link to this file).
"""
import datetime, math, os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
try:
    from exfor_check_dicts import DICTS
except ImportError:
    sys.path.insert(0, os.path.join(HERE, "..", "..", "services", "nsr-api"))
    from exfor_check_dicts import DICTS

FM, LX = "Formats Manual", "LEXFOR"
RULES = {
    "FILE-EMPTY": (FM, "File", "The file is empty.", "A TRANS file holds at least the TRANS and ENDTRANS records with the entries between them."),
    "FILE-BINARY": (FM, "Character set", "Not a text file.", "A TRANS file is plain ASCII text, one 80-column record a line. This file holds binary bytes (a PDF, an image, a zip, a spreadsheet)."),
    "REC-LEN": (FM, "Record format", "Record longer than 80 columns.", "Every record is 80 columns: 1-11 keyword and pointer, 12-66 information, 67-79 the record identification (accession 67-71, subaccession 72-74, sequence 75-79), 80 the alteration flag."),
    "REC-CHAR": (FM, "Character set", "Character outside the EXFOR character set.", "Records use printable ASCII only: no tabs, control characters or non-ASCII letters (write accents out, e.g. Mueller)."),
    "REC-ID": (FM, "Record identification", "Record identification does not match.", "Columns 67-71 carry the entry's accession number and 72-74 the subaccession number of the subentry the record belongs to; ENTRY and ENDENTRY carry 000 and 999."),
    "REC-SEQ": (FM, "Record identification", "Sequence number out of order.", "Columns 75-79 number the records of a subentry 1, 2, 3, ... from the SUBENT record; ENDSUBENT and ENDENTRY carry 99999."),
    "SYS-ORDER": (FM, "System identifiers", "System identifier out of place.", "The order is TRANS, then per entry ENTRY, its subentries (SUBENT, the BIB, COMMON and DATA sections or NOBIB, NOCOMMON, NODATA, then ENDSUBENT; or NOSUBENT), ENDENTRY; ENDTRANS last. Every record lies inside a section."),
    "SYS-MISSING": (FM, "System identifiers", "System identifier missing.", "Each opening system identifier has its closing one: BIB/ENDBIB, COMMON/ENDCOMMON, DATA/ENDDATA, SUBENT/ENDSUBENT, ENTRY/ENDENTRY, TRANS/ENDTRANS; each subentry has a BIB (or NOBIB), a COMMON (or NOCOMMON) and a DATA (or NODATA) section, in that order."),
    "SYS-N": (FM, "System identifiers", "N1 or N2 count wrong.", "BIB: N1 keywords, N2 records. ENDBIB, ENDCOMMON, ENDDATA: N1 records in the section. COMMON: N1 fields, N2 records. DATA: N1 fields, N2 data lines (a data line spans N1/6 records, rounded up). ENDSUBENT: N1 records between SUBENT and ENDSUBENT. ENDENTRY: N1 subentries. ENDTRANS: N1 entries. N1 is right-justified in columns 12-22, N2 in 23-33."),
    "SYS-DATE": (FM, "System identifiers", "Date in the wrong form.", "N2 of TRANS, ENTRY and SUBENT is a date written yyyymmdd (8 digits, a real calendar date, not in the future)."),
    "SYS-ACC": (FM, "Accession numbers", "Accession or subaccession number wrong.", "ENTRY N1 is the 5-character accession number (area character and four digits); SUBENT N1 is 8 characters, the accession number followed by the 3-digit subaccession number."),
    "SYS-FLAG": (FM, "Alteration flags", "Alteration flag not allowed.", "Column 11 of ENTRY and SUBENT records may carry an alteration flag; a NOSUBENT record carries none. JANIS stops reading the entry at a flagged NOSUBENT and reports that the entry does not end with ENDENTRY."),
    "SUB-DUP": (FM, "Subentries", "Subentry number repeated.", "A subaccession number appears once in an entry."),
    "SUB-ORDER": (FM, "Subentries", "Subentries out of order.", "Subentries follow in increasing subaccession number."),
    "SUB-001": (FM, "Subentries", "Subentry 001 holds data.", "Subentry 001 carries the information common to the whole entry: BIB and COMMON only, with NODATA."),
    "KW-UNKNOWN": (FM, "Information identifiers (dictionary 2)", "Keyword not in dictionary 2.", "BIB keywords are left-justified in columns 1-10 and spelled as in dictionary 2."),
    "KW-OBS": (FM, "Information identifiers (dictionary 2)", "Obsolete keyword.", "The keyword is flagged obsolete in dictionary 2 and is not used on exchange files."),
    "KW-PLACE": (FM, "BIB section", "Text before the first keyword.", "A BIB section starts with a keyword record; continuation records have columns 1-10 blank."),
    "KW-DUP": (FM, "BIB section", "Keyword repeated in a BIB section.", "A keyword is given once in a BIB section; several codes or pointers under it continue on the following records with columns 1-10 blank."),
    "KW-REQ": (LX, "Required keywords", "Required keyword missing.", "Every data subentry needs, in its own BIB section or in subentry 001: TITLE, AUTHOR, INSTITUTE, REFERENCE, REACTION, HISTORY and at least one of FACILITY, METHOD, DETECTOR, ANALYSIS (dictionary 2's required flags)."),
    "CODE-PAREN": (FM, "Coded information", "Code not closed.", "Coded information starts with ( in column 12 and ends with the matching ); a code may continue over records, but not past the next keyword."),
    "CODE-MISSING": (FM, "Coded information", "Must have coded information.", "Dictionary 2 marks this keyword's code as required: the first record under it starts with a code in column 12."),
    "CODE-DICT": (FM, "Coded information", "Code not in the dictionary.", "Each code must exist in the dictionary named for its keyword (dictionary 2 gives the pointer: INSTITUTE 3, REFERENCE 4-7, STATUS 16, HISTORY 15, FACILITY 18, INC-SOURCE 19, METHOD 21, DETECTOR 22, ANALYSIS 23, PART-DET and RAD-DET 33, ...)."),
    "CODE-OBS": (FM, "Coded information", "Obsolete code.", "The code is flagged obsolete in its dictionary and is not used on exchange files."),
    "REACT-SYNTAX": (LX, "Reaction", "REACTION code malformed.", "A reaction unit reads SF1(SF2,SF3)SF4,SF5,SF6,SF7,SF8,SF9: target, incident projectile, process, product, branch, parameter, particle considered, modifiers, data type; SF6 is required, trailing empty fields are dropped. Units combine inside parentheses with +, -, *, /, // or =."),
    "REACT-NUC": (LX, "Reaction: nuclides", "Nuclide code wrong.", "Nuclides are written Z-SYMBOL-A (A=0 for the natural element), with -G, -M, -M1, -M2 for states, the symbol matching Z as in dictionary 8; the nuclide must exist in dictionary 227."),
    "REACT-SF": (LX, "Reaction: subfields", "Reaction subfield code not in its dictionary.", "SF2 and SF7 particles come from dictionary 33 (flags 2 and 7), SF3 processes from dictionary 30 or outgoing particles (flag 3), SF5 branches from 31, SF6 parameters from 32, SF8 modifiers from 34, SF9 data types from 35."),
    "REACT-QTY": (LX, "Reaction: quantities", "SF5-SF8 combination not in dictionary 236.", "The combination of branch, parameter, particle and modifiers must be listed in dictionary 236; general modifiers (dictionary 34, flag GENQ) and SF9 data types may be added to a listed quantity."),
    "REACT-COMB": (LX, "Reaction: quantities", "SF3 and SF6 do not go together.", "Fission yields and fission neutron multiplicities (SF6 FY, NU) need fission (F) in SF3; angular and energy distributions (DA, DE, ...) need an outgoing particle, so not SF3 TOT or ABS."),
    "REF-FORM": (FM, "REFERENCE", "REFERENCE code malformed.", "A reference code reads (type,source,...,date): J journal (dictionary 5), volume, (issue), page, date; R, P, S, X reports (dictionary 6); C conferences (7); B books (207); T theses; W private communications. The date is the last field."),
    "DATE-FORM": (FM, "Dates", "Date in a code in the wrong form.", "Dates in codes are yyyy, yyyymm or yyyymmdd (HISTORY: yyyymmdd followed by the dictionary 15 code); months 01-12, days valid for the month."),
    "HEAD-DICT": (FM, "Data headings (dictionary 24)", "Data heading not in dictionary 24.", "Each COMMON and DATA field's heading is left-justified in its 11-column field (column 11 the pointer) and spelled as in dictionary 24."),
    "HEAD-REPEAT": (FM, "Data headings", "Heading repeated in COMMON and DATA.", "A heading (with its pointer) is given in one section only: in the COMMON of subentry 001, the COMMON of the subentry, or its DATA table."),
    "HEAD-ADJ": (FM, "Data headings", "Repeated headings not side by side.", "Columns that share a heading (DATA with pointers 1 and 2, say) stand next to each other in the table."),
    "HEAD-DEF": (FM, "Data headings", "Heading not described.", "MISC headings are described under MISC-COL, ANG1, ANG2, ... under ANG-SEC, E1, E2, ... under EN-SEC and MOM1, MOM2, ... under MOM-SEC, with the same pointer; EN-SEC names energy headings only."),
    "TAB-DUP": (FM, "DATA section", "Duplicate data point.", "No data line repeats an earlier line of the same table value for value."),
    "SAMPLE-FORM": (LX, "Sample", "SAMPLE code malformed.", "A SAMPLE code reads (nuclide,abundance), the nuclide as Z-SYMBOL-A or a dictionary 209 compound; free text follows the code."),
    "UNIT-DICT": (FM, "Data units (dictionary 25)", "Unit not in dictionary 25.", "Each field's unit sits under its heading, left-justified, spelled as in dictionary 25."),
    "UNIT-QTY": (FM, "Data units", "Unit does not fit the heading or quantity.", "A unit's family (dictionary 25) must match its heading's family (dictionary 24); DATA and its errors take the family of the REACTION quantity (dictionary 236), errors may also be in per cent, relative data (REL, RAW, RAT) in arbitrary units."),
    "TAB-COUNT": (FM, "COMMON and DATA sections", "Headings, units and fields do not line up.", "N1 fields, six to a record: N1 headings, then N1 units under them, then the values; no heading without a unit, no unit or value outside the N1 fields."),
    "TAB-NUM": (FM, "COMMON and DATA sections", "Value is not a number.", "Each value is a number in its 11-column field (digits, a decimal point, an optional sign and exponent as 1.2E-3 or 1.2-3), or blank."),
    "TAB-EMPTY": (FM, "DATA section", "Empty data column.", "A DATA column holds at least one value; a heading with no values belongs nowhere."),
    "TAB-PAIR": (LX, "Data headings", "Paired headings do not agree.", "Where a table gives both EN-MIN and EN-MAX (or another -MIN/-MAX pair), the minimum is not above the maximum on any line; a MONIT or MONIT-ERR column needs the MONITOR keyword in the subentry or in subentry 001."),
    "ERR-CORR": (FM, "ERR-ANALYS", "Obsolete coding of ERR-ANALYS.", "ERR-ANALYS codes read (heading,minimum,maximum,correlation property code); a correlation coefficient written as a number in the fourth field is the old coding."),
    "TAB-ORDER": (LX, "Data ordering", "Incident energy out of order.", "A table whose one independent variable is the incident energy lists it in order, increasing (or decreasing) down the table."),
    "PTR-UNDEF": (FM, "Pointers", "Pointer not defined.", "A pointer (column 11 of a heading, or of a BIB record) must match a pointer given with a REACTION (or other keyword) in the subentry or in subentry 001; several REACTION codes in one subentry each need a pointer."),
    "PTR-REF": (FM, "Cross-references", "Cross-reference wrong.", "A subentry cross-reference (STATUS, REL-REF, MONIT-REF) is 8 characters, accession and subaccession number; a reference to this file's own entry must name a subentry the file holds."),
}

SYS = set(DICTS["d"]["001"])
D = DICTS["d"]
NUC = re.compile(r"^(\d{1,3})-([A-Z]{1,2})-(\d{1,3})((?:-[GMLT]\d?)*)$")
NUC_STATES = re.compile(r"^\d{1,3}-[A-Z]{1,2}-\d{1,3}-[GMLT]\d?([+/][GMLT]\d?)+$")  # 27-CO-58-M+G
NUM = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([EeDd]?[+-]?\d+)?$")
NUC_BASE = {re.sub(r"(-[GMLT]\d?)+$", "", c) for c in D["227"]}
INDEP_FAMILIES = {"E", "A", "L", "TIME", "TEM", "THK", "E/C", "EC2"}  # energy, angle, length, time, temperature, ...
HLUNIT = re.compile(r"^[\d.]+(E[+-]?\d+)?(NSEC|USEC|MSEC|SEC|MIN|HR|D|Y|YR)$")


def today():
    return datetime.date.today()


def is_date(s, old=True):
    """yyyy, yyyymm or yyyymmdd, a real calendar date; with `old`, also the pre-2000 forms yymm and yymmdd that entries
    untouched since the four-digit-year conversion still carry (JANIS accepts them). Formats Manual: Dates."""
    if not re.fullmatch(r"\d{4}|\d{6}|\d{8}", s or ""):
        return False
    if old and len(s) in (4, 6) and is_date("19" + s, old=False):
        return True
    y = int(s[:4])
    if y < 1890 or y > today().year + 1:
        return False
    if len(s) >= 6 and not 1 <= int(s[4:6]) <= 12:
        return False
    if len(s) == 8:
        try:
            datetime.date(y, int(s[4:6]), int(s[6:8]))
        except ValueError:
            return False
    return True


def split_top(s, sep=","):
    """Split on `sep` outside parentheses."""
    out, depth, cur = [], 0, ""
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == sep and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return out


def fnum(s):
    s = re.sub(r"(?<=[\d.])\s+(?=[EeDd+-])|(?<=[EeDd])\s+(?=[+-]?\d)", "", s.strip())  # 7.27   -05, 1.57  E-04
    if not s:
        return None
    m = NUM.match(s)
    if not m:
        return False
    mant, exp = m.group(1), m.group(2) or ""
    exp = exp.lstrip("EeDd")
    try:
        return float(mant) * (10 ** int(exp) if exp else 1)
    except (ValueError, OverflowError):
        return False


class Checker:
    def __init__(self, lines):
        self.lines = lines
        self.msgs = []
        self.entry = ""
        self.subent = ""

    # ---- messages
    def add(self, line, sev, rule, code, message, entry=None, subent=None):
        self.msgs.append({"line": line, "entry": self.entry if entry is None else entry,
                          "subent": self.subent if subent is None else subent, "severity": sev, "rule": rule,
                          "code": (code or "").strip()[:60], "message": message})

    def err(self, line, rule, code, message, **k):
        self.add(line, "error", rule, code, message, **k)

    def warn(self, line, rule, code, message, **k):
        self.add(line, "warning", rule, code, message, **k)

    def lookup(self, line, n, code, what, rule="CODE-DICT"):
        """A code against dictionary n: missing is an error, obsolete a warning. Formats Manual: Coded information."""
        v = D[n].get(code)
        if v is None:
            self.err(line, rule, code, f"{what} code {code} is not in dictionary {int(n)}")
            return False
        status = v if isinstance(v, str) else v[-1]
        if status == "OBS":
            self.warn(line, "CODE-OBS", code, f"{what} code {code} is obsolete (dictionary {int(n)})")
        return True

    # ---- 1. records and structure
    def records(self):
        """Every record: 80 columns at most, printable ASCII. Formats Manual: Record format, Character set."""
        recs = []
        for i, raw in enumerate(self.lines, 1):
            raw = raw.rstrip("\r")
            if len(raw.rstrip()) > 80:
                self.err(i, "REC-LEN", raw[80:].strip()[:20], f"record is {len(raw.rstrip())} columns long")
            bad = next((c for c in raw if not (32 <= ord(c) < 127)), None)
            if bad is not None:
                what = "tab" if bad == "\t" else f"U+{ord(bad):04X}"
                self.err(i, "REC-CHAR", bad if bad.isprintable() else what, f"character {what} outside the EXFOR set (column {raw.index(bad) + 1})")
            recs.append((i, raw.replace("\t", " ").ljust(80)[:80]))
        return recs

    def nfield(self, rec, k):
        """N1..N5 of a system identifier: right-justified integers in 11-column fields from column 12."""
        s = rec[11 + 11 * k: 22 + 11 * k].strip()
        if not s:
            return None
        return int(s) if re.fullmatch(r"[+-]?\d+", s) else s

    def structure(self, recs):
        """The system identifiers' order, the N1/N2 counts and the record identification. Formats Manual: System
        identifiers, Record identification."""
        T = {"entries": [], "line": None, "end": None}
        st = "top"
        E = S = sec = None
        seq_prev = 0
        no_id_warned = False
        for ln, rec in recs:
            kw = rec[:10].rstrip()
            word = kw.split(" ")[0] if kw else ""
            sysid = word in SYS and kw == word
            if sysid and st in ("common", "data") and word == "DATA":
                sysid = False  # a heading line starting with the DATA heading
            if not sysid:
                if st in ("bib", "common", "data"):
                    sec["recs"].append((ln, rec))
                    S["n"] += 1
                    self.recid(ln, rec, E, S, seq_prev)
                    seq_prev = self.seqno(rec, seq_prev)
                elif rec.strip():
                    self.err(ln, "SYS-ORDER", kw or rec[:20], "record outside any section")
                    if S is not None:
                        S["n"] += 1
                continue
            n1, n2 = self.nfield(rec, 0), self.nfield(rec, 1)
            # close what the identifier implies is closed
            if word in ("TRANS",):
                if st != "top":
                    self.err(ln, "SYS-ORDER", word, "TRANS must be the first record")
                T["line"], T["n1"], T["n2"] = ln, n1, n2
                if n2 is not None and not (isinstance(n2, int) and is_date(str(n2)) and len(str(n2)) == 8):
                    self.err(ln, "SYS-DATE", str(n2), "TRANS N2 must be the date yyyymmdd")
                st = "trans"
                continue
            if word in ("ENTRY", "NOENTRY"):
                if st == "top" and T["line"] is None:
                    self.warn(ln, "SYS-MISSING", "TRANS", "the file does not start with a TRANS record", entry="", subent="")
                elif st not in ("trans", "top"):
                    self.close(ln, st, "entry", E, S, sec)
                E = {"acc": "", "line": ln, "subs": [], "end": None, "nsub": 0}
                T["entries"].append(E)
                acc = str(n1 or "").strip()
                self.entry, self.subent = acc, "000"
                E["acc"] = acc
                if not re.fullmatch(r"[0-9A-Z]\d{4}", acc):
                    self.err(ln, "SYS-ACC", acc, "ENTRY N1 must be a 5-character accession number")
                self.date(ln, word, n2)
                self.recid(ln, rec, E, None, 0, sub="000")
                st = "entry" if word == "ENTRY" else "trans"
                S = sec = None
                continue
            if E is None and word not in ("ENDTRANS",):
                self.err(ln, "SYS-ORDER", word, f"{word} before any ENTRY")
                continue
            if word in ("SUBENT", "NOSUBENT"):
                if st in ("subent", "bib", "common", "data"):
                    self.close(ln, st, "sub", E, S, sec)
                elif st != "entry":
                    self.err(ln, "SYS-ORDER", word, f"{word} outside an entry")
                sa = str(n1 or "").strip()
                num = sa[5:8] if len(sa) == 8 else ""
                self.subent = num or "???"
                S = {"num": num, "line": ln, "bib": None, "common": None, "data": None, "no": set(), "n": 0,
                     "order": [], "empty": word == "NOSUBENT", "end": None}
                E["subs"].append(S)
                E["nsub"] += 1
                if not re.fullmatch(r"[0-9A-Z]\d{7}", sa):
                    self.err(ln, "SYS-ACC", sa, f"{word} N1 must be the 8-character subaccession number")
                elif sa[:5] != E["acc"]:
                    self.err(ln, "SYS-ACC", sa, f"subaccession number {sa} does not belong to entry {E['acc']}")
                nums = [s["num"] for s in E["subs"][:-1]]
                if num and num in nums:
                    self.err(ln, "SUB-DUP", sa, f"subentry {num} appears twice in entry {E['acc']}")
                elif num and nums and nums[-1] and num < nums[-1]:
                    self.err(ln, "SUB-ORDER", sa, f"subentry {num} follows subentry {nums[-1]}")
                if word == "NOSUBENT" and rec[10].strip():
                    self.err(ln, "SYS-FLAG", rec[10], "NOSUBENT carries no alteration flag in column 11")
                self.date(ln, word, n2)
                self.recid(ln, rec, E, S, 0)
                seq_prev = self.seqno(rec, 0)
                st = "entry" if word == "NOSUBENT" else "subent"
                sec = None
                continue
            if word in ("BIB", "NOBIB", "COMMON", "NOCOMMON", "DATA", "NODATA"):
                if st in ("bib", "common", "data"):
                    self.close(ln, st, "section", E, S, sec)
                    st = "subent"
                if st != "subent":
                    self.err(ln, "SYS-ORDER", word, f"{word} outside a subentry")
                    continue
                kind = word.replace("NO", "", 1).lower() if word.startswith("NO") else word.lower()
                want = ["bib", "common", "data"]
                done = S["order"]
                if kind in done:
                    self.err(ln, "SYS-ORDER", word, f"a second {kind.upper()} section in the subentry")
                for k in want[:want.index(kind)]:
                    if k not in done:
                        self.err(ln, "SYS-MISSING", k.upper(), f"{k.upper()} (or NO{k.upper()}) missing before {word}")
                        done.append(k)
                done.append(kind)
                S["n"] += 1
                self.recid(ln, rec, E, S, seq_prev)
                seq_prev = self.seqno(rec, seq_prev)
                if word.startswith("NO"):
                    S["no"].add(kind)
                    continue
                sec = {"kind": kind, "line": ln, "n1": n1, "n2": n2, "recs": [], "end": None}
                S[kind] = sec
                st = kind
                continue
            if word in ("ENDBIB", "ENDCOMMON", "ENDDATA"):
                kind = word[3:].lower()
                if st != kind:
                    self.err(ln, "SYS-ORDER", word, f"{word} without {kind.upper()}")
                    continue
                S["n"] += 1
                self.recid(ln, rec, E, S, seq_prev)
                seq_prev = self.seqno(rec, seq_prev)
                sec["end"] = (ln, n1)
                self.section_counts(sec)
                st = "subent"
                continue
            if word == "ENDSUBENT":
                if st in ("bib", "common", "data"):
                    self.close(ln, st, "section", E, S, sec)
                    st = "subent"
                if st != "subent":
                    self.err(ln, "SYS-ORDER", word, "ENDSUBENT without SUBENT")
                    continue
                for k in ("bib", "common", "data"):
                    if k not in S["order"] and not (k == "data" and S["num"] == "001"):  # 001 may omit NODATA
                        self.err(ln, "SYS-MISSING", k.upper(), f"{k.upper()} (or NO{k.upper()}) missing in subentry {S['num']}")
                S["end"] = ln
                if n1 != S["n"]:
                    self.err(ln, "SYS-N", str(n1), f"ENDSUBENT N1 is {n1}; the subentry has {S['n']} records")
                self.recid(ln, rec, E, S, seq_prev, end=True)
                st = "entry"
                S = sec = None
                continue
            if word == "ENDENTRY":
                if st in ("subent", "bib", "common", "data"):
                    self.close(ln, st, "sub", E, S, sec)
                    st = "entry"
                if st != "entry":
                    self.err(ln, "SYS-ORDER", word, "ENDENTRY without ENTRY")
                    continue
                E["end"] = ln
                self.subent = "999"
                if n1 != E["nsub"]:
                    self.err(ln, "SYS-N", str(n1), f"ENDENTRY N1 is {n1}; the entry has {E['nsub']} subentries")
                self.recid(ln, rec, E, None, 0, sub="999", end=True)
                st = "trans"
                S = sec = None
                continue
            if word == "ENDTRANS":
                if st != "trans":
                    self.close(ln, st, "entry", E, S, sec)
                self.entry, self.subent = "", ""
                T["end"] = ln
                n = len(T["entries"])
                if n1 != n:
                    self.err(ln, "SYS-N", str(n1), f"ENDTRANS N1 is {n1}; the file has {n} entries")
                st = "done"
                continue
            self.err(ln, "SYS-ORDER", word, f"{word} is not used on TRANS files")
        if st not in ("done",):
            last = recs[-1][0] if recs else 0
            if st != "top":
                self.close(last, st, "entry", E, S, sec, at_end=True)
            if T["end"] is None:
                self.err(last, "SYS-MISSING", "ENDTRANS", "the file does not end with ENDTRANS", entry="", subent="")
        if not no_id_warned:
            pass
        return T

    def close(self, ln, st, upto, E, S, sec, at_end=False):
        """Report the closing identifiers a record skipped over. Formats Manual: System identifiers."""
        where = "at the end of the file" if at_end else "before this record"
        if st in ("bib", "common", "data"):
            self.err(ln, "SYS-MISSING", "END" + st.upper(), f"END{st.upper()} missing {where}")
            if upto == "section":
                return
        if st in ("bib", "common", "data", "subent"):
            self.err(ln, "SYS-MISSING", "ENDSUBENT", f"ENDSUBENT of subentry {S['num'] if S else ''} missing {where}")
            if upto == "sub":
                return
        if st in ("bib", "common", "data", "subent", "entry"):
            self.err(ln, "SYS-MISSING", "ENDENTRY", f"ENDENTRY of entry {E['acc'] if E else ''} missing {where}")

    def section_counts(self, sec):
        """BIB N1 keywords and N2 records, COMMON N2 records, DATA N2 data lines; END* N1 records. Formats Manual:
        System identifiers."""
        ln, end_n1 = sec["end"]
        n = len(sec["recs"])
        k = sec["kind"]
        if end_n1 != n:
            self.err(ln, "SYS-N", str(end_n1), f"END{k.upper()} N1 is {end_n1}; the section has {n} records")
        if k == "bib":
            nk = sum(1 for _, r in sec["recs"] if r[:10].strip())
            if sec["n1"] != nk:
                self.err(sec["line"], "SYS-N", str(sec["n1"]), f"BIB N1 is {sec['n1']}; the section has {nk} keywords")
            if sec["n2"] != n:
                self.err(sec["line"], "SYS-N", str(sec["n2"]), f"BIB N2 is {sec['n2']}; the section has {n} records")
        elif k == "common":
            if sec["n2"] != n:
                self.err(sec["line"], "SYS-N", str(sec["n2"]), f"COMMON N2 is {sec['n2']}; the section has {n} records")
        elif k == "data" and isinstance(sec["n1"], int) and sec["n1"] > 0:
            per = math.ceil(sec["n1"] / 6)
            rows = (n - 2 * per) / per
            if rows != sec["n2"]:
                sec["broken"] = True
                got = f"{rows:g}" if rows == int(rows) else f"{n - 2 * per} records, not a whole number of"
                self.err(sec["line"], "SYS-N", str(sec["n2"]), f"DATA N2 is {sec['n2']}; the table has {got} data lines")

    def date(self, ln, word, n2):
        """N2 of ENTRY and SUBENT: yyyymmdd, not in the future. Formats Manual: System identifiers."""
        if word.startswith("NO") and n2 is None:
            return
        s = str(n2 if n2 is not None else "")
        if len(s) not in (6, 8) or not is_date(s if len(s) == 8 else "19" + s, old=False):
            self.err(ln, "SYS-DATE", s, f"{word} N2 must be the date yyyymmdd")
        elif (s if len(s) == 8 else "19" + s) > (today() + datetime.timedelta(days=1)).strftime("%Y%m%d"):
            self.err(ln, "SYS-DATE", s, f"{word} date {s} is in the future")

    def seqno(self, rec, prev):
        s = rec[74:79].strip()
        return int(s) if s.isdigit() else prev

    def recid(self, ln, rec, E, S, prev, sub=None, end=False):
        """Columns 67-79: accession, subaccession, sequence. Formats Manual: Record identification."""
        rid = rec[66:79]
        if not rid.strip():
            if not getattr(self, "_noid", False):
                self._noid = True
                self.warn(ln, "REC-ID", "", "records carry no identification in columns 67-79")
            return
        acc, sa, sq = rid[:5].strip(), rid[5:8].strip(), rid[8:13].strip()
        if E is not None and E["acc"] and acc != E["acc"]:
            self.err(ln, "REC-ID", rid.strip(), f"columns 67-71 read {acc}, the entry is {E['acc']}")
            return
        want = sub if sub is not None else (S["num"] if S else None)
        if want and want.isdigit() and sa.isdigit() and int(sa) != int(want):
            self.err(ln, "REC-ID", rid.strip(), f"columns 72-74 read {sa}, the subentry is {want}")
            return
        if not sq.isdigit():
            self.err(ln, "REC-ID", rid.strip(), "columns 75-79 must hold the sequence number")
            return
        q = int(sq)
        if end:
            if q != 99999:
                self.warn(ln, "REC-SEQ", sq, "the closing record's sequence number is 99999")
        elif S is not None and prev and q != prev + 1:
            self.warn(ln, "REC-SEQ", sq, f"sequence number {q} follows {prev}")

    # ---- 2-4. BIB: keywords, codes, REACTION
    def bib(self, S):
        """Keywords against dictionary 2, their placement, and each keyword's codes. Formats Manual: BIB section,
        Coded information."""
        sec = S["bib"]
        S["kw"], S["ptrs"], S["reactions"], S["monitor"] = {}, set(), [], False
        blocks = []
        for ln, rec in sec["recs"]:
            kw, ptr, txt = rec[:10].strip(), rec[10], rec[11:66].rstrip()
            if ptr.strip():
                S["ptrs"].add(ptr)
            if kw:
                if kw in S["kw"]:
                    self.warn(ln, "KW-DUP", kw, f"keyword {kw} given twice in the BIB section")
                info = D["002"].get(kw)
                if info is None:
                    self.err(ln, "KW-UNKNOWN", kw, f"keyword {kw} is not in dictionary 2")
                elif info[3] == "OBS":
                    self.warn(ln, "KW-OBS", kw, f"keyword {kw} is obsolete")
                S["kw"][kw] = ln
                blocks.append({"kw": kw, "line": ln, "items": [], "info": info})
            elif not blocks:
                self.err(ln, "KW-PLACE", txt[:20], "the BIB section must start with a keyword")
                continue
            b = blocks[-1]
            coded = b["info"] is not None and b["info"][0] in ("R", "O") or b["kw"] == "SAMPLE"
            open_item = b["items"][-1] if b["items"] and b["items"][-1]["depth"] > 0 else None
            if open_item:  # the code continues; free text may follow its closing parenthesis
                s = open_item["code"] + txt.strip()
                i = self.close_at(s)
                open_item["code"], open_item["depth"] = (s[:i + 1], 0) if i >= 0 else (s, self.depth(s))
                continue
            if coded and txt.startswith("("):
                i = self.close_at(txt)
                code, d = (txt[:i + 1], 0) if i >= 0 else (txt, max(self.depth(txt), 1))
                b["items"].append({"line": ln, "ptr": ptr if ptr.strip() else "", "code": code, "depth": d,
                                   "first": kw != ""})
        for b in blocks:
            for it in b["items"]:
                if it["depth"] > 0:
                    self.err(it["line"], "CODE-PAREN", it["code"][:30], f"{b['kw']} code is not closed")
            if b["info"] and b["info"][0] == "R" and b["kw"] not in ("MONITOR", "DECAY-DATA", "DECAY-MON") and not any(it["first"] for it in b["items"]):
                self.warn(b["line"], "CODE-MISSING", b["kw"], f"{b['kw']} must start with coded information")
            fn = getattr(self, "kw_" + b["kw"].replace("-", "_").lower(), None)
            for it in b["items"]:
                if it["depth"] == 0:
                    inner = it["code"][1:-1]
                    if fn:
                        fn(it["line"], inner, it, S)
                    elif b["info"] and b["info"][1]:
                        self.codes(it["line"], inner, "%03d" % b["info"][1], b["kw"])
            if b["kw"] == "REACTION":
                rs = [it for it in b["items"] if it["depth"] == 0]
                if len(rs) > 1 and any(not it["ptr"] for it in rs):
                    self.err(b["line"], "PTR-UNDEF", "REACTION", "several REACTION codes, each needs a pointer")

    @staticmethod
    def depth(s):
        return s.count("(") - s.count(")")

    @staticmethod
    def close_at(s):
        d = 0
        for i, ch in enumerate(s):
            d += ch == "("
            d -= ch == ")"
            if d == 0:
                return i
        return -1  # not closed on this text

    def codes(self, ln, inner, n, kw):
        for c in split_top(inner):
            c = c.strip()
            if c and n in D:
                self.lookup(ln, n, c, kw)

    def kw_institute(self, ln, inner, it, S):
        for c in split_top(inner):
            if c.strip():
                self.lookup(ln, "003", c.strip(), "INSTITUTE")

    def kw_facility(self, ln, inner, it, S):
        """FACILITY: dictionary 18 codes, then optionally an institute (3). Formats Manual: FACILITY."""
        for c in [x.strip() for x in split_top(inner) if x.strip()]:
            if c in D["018"] or c in D["003"]:
                self.lookup(ln, "018" if c in D["018"] else "003", c, "FACILITY")
            else:
                self.err(ln, "CODE-DICT", c, f"FACILITY code {c} is in neither dictionary 18 nor 3")

    def kw_part_det(self, ln, inner, it, S):
        for c in [x.strip() for x in split_top(inner) if x.strip()]:
            if not NUC.match(c):
                self.lookup(ln, "033", c, "PART-DET")

    def kw_rad_det(self, ln, inner, it, S):
        """RAD-DET: (nuclide,radiation[,radiation...]), optionally after a heading. LEXFOR: Decay data."""
        parts = [x.strip() for x in split_top(self.strip_head(inner))]
        if parts and parts[0]:
            self.nuclide(ln, parts[0], "RAD-DET")
        for c in parts[1:]:
            if c:
                self.lookup(ln, "033", c, "RAD-DET")

    def kw_decay_data(self, ln, inner, it, S):
        """DECAY-DATA, DECAY-MON: (nuclide,half-life,radiation,energy,abundance,...). LEXFOR: Decay data."""
        parts = [x.strip() for x in split_top(self.strip_head(inner))]
        if parts and parts[0]:
            self.nuclide(ln, parts[0], it.get("kw", "DECAY-DATA"))
        for c in parts[2:]:
            if c and re.fullmatch(r"[A-Z][A-Z0-9+\-]*", c):  # a radiation code, not a value such as 140./180.
                self.lookup(ln, "033", c, "DECAY-DATA")

    kw_decay_mon = kw_decay_data

    def strip_head(self, inner):
        """A leading (HEADING) inside a code, as in DECAY-DATA ((DG1)26-FE-59,...)."""
        m = re.match(r"^\(([A-Z0-9+.\-]+)\)", inner)
        if m and (self.heading_ok(m.group(1)) or fnum(m.group(1))):  # a heading, or a FLAG number as (1.)
            return inner[m.end():]
        return inner

    def kw_reference(self, ln, inner, it, S):
        """REFERENCE: (type,source,...,date) per dictionary 4; journals 5, reports 6, conferences 7, books 207; the
        date last. Several references join with =. Formats Manual: REFERENCE."""
        for one in split_top(inner, "="):
            one = one.strip()
            if one.startswith("(") and one.endswith(")"):
                one = one[1:-1]
            f = [x.strip() for x in split_top(one)]
            if len(f) < 2:
                self.err(ln, "REF-FORM", one, "a reference code has a type, a source and a date")
                continue
            self.ref(ln, f, "REFERENCE")

    FORMS = {"J": ((5, 6), "(J,journal,volume,(issue),page,date)"), "B": ((5, 6), "(B,book,volume,(issue),page,date)"),
             "C": ((5, 6), "(C,conference,volume,(issue),page,date)"), "R": ((3, 4), "(R,report-number,page,date)"),
             "P": ((3, 4, 5), "(P,report-number,volume,page,date)"), "S": ((4, 5), "(S,report-number,(volume),page,date)"),
             "X": ((3, 4), "(X,report-number,page,date)")}

    def ref(self, ln, f, kw):
        """One reference (type,source,...,date): the type in dictionary 4, the source in its dictionary (journals 5,
        reports 6, conferences 7, books 207), the subfield count of its type, the date last. Formats Manual: REFERENCE."""
        t = f[0]
        if t not in D["004"]:
            if kw == "REFERENCE":
                self.err(ln, "REF-FORM", t, f"reference type {t} is not in dictionary 4")
            else:
                self.warn(ln, "REF-FORM", ",".join(f)[:40], f"{kw}: no reference type (dictionary 4) where the reference starts")
            return
        if len(f) < 2:
            return
        if t == "J":
            self.lookup(ln, "005", f[1], "Journal")
        elif t in ("R", "P", "X", "S"):
            code = f[1]
            if not any(code.startswith(r) for r in D["006"] if r) and code not in D["006"]:
                self.err(ln, "CODE-DICT", code, f"report code {code} does not start with a dictionary 6 code")
        elif t == "C":
            self.lookup(ln, "007", f[1], "Conference")
        elif t == "B":
            self.lookup(ln, "207", f[1], "Book")
        form = self.FORMS.get(t)
        if form and len(f) not in form[0]:
            self.warn(ln, "REF-FORM", ",".join(f)[:40], f"{kw}: {len(f) - 1} subfields after {t}; the form is {form[1]}")
        elif form and t in ("R", "X") and len(f) == 4 and not f[2]:
            self.warn(ln, "REF-FORM", ",".join(f)[:40], f"{kw}: the page subfield of a report reference is empty")
        date = f[-1]
        if len(f) > 2 or t == "W":
            if not (is_date(date) or re.fullmatch(r"\d{2}", date)):
                self.err(ln, "DATE-FORM", date, "the reference date must be yyyy, yyyymm or yyyymmdd")

    def kw_status(self, ln, inner, it, S):
        """STATUS: a dictionary 16 code, with a subentry cross-reference where the code takes one. Formats Manual:
        STATUS."""
        f = [x.strip() for x in split_top(inner)]
        if not f[0]:
            return
        if self.lookup(ln, "016", f[0], "STATUS") and len(f) > 1 and f[1]:
            self.xref(ln, f[1], S)

    def xref(self, ln, ref, S):
        if not re.fullmatch(r"[0-9A-Z]\d{7}|[0-9A-Z]\d{4}", ref):
            if re.fullmatch(r"[0-9A-Z]\d{2,7}", ref) or re.fullmatch(r"\d+", ref):
                self.err(ln, "PTR-REF", ref, "a subentry cross-reference is 8 characters (accession and subaccession)")
            return
        self.xrefs.append((ln, ref, self.entry, self.subent))

    def kw_history(self, ln, inner, it, S):
        """HISTORY: (yyyymmddX) with X from dictionary 15. Formats Manual: HISTORY."""
        m = re.fullmatch(r"(\d+)([A-Z]?)", inner.strip())
        if not m:
            self.err(ln, "DATE-FORM", inner, "a HISTORY code is the date yyyymmdd and a dictionary 15 code")
            return
        d, c = m.groups()
        if len(d) not in (6, 8) or not is_date(d if len(d) == 8 else "19" + d, old=False):
            self.err(ln, "DATE-FORM", inner, "the HISTORY date must be yyyymmdd")
        if c:
            self.lookup(ln, "015", c, "HISTORY")

    def kw_exp_year(self, ln, inner, it, S):
        for c in [x.strip() for x in split_top(inner) if x.strip()]:
            if not is_date(c):
                self.err(ln, "DATE-FORM", c, "EXP-YEAR is a year, yyyy")

    def kw_rel_ref(self, ln, inner, it, S):
        """REL-REF: (code,subentry,author,reference...). Formats Manual: REL-REF."""
        f = [x.strip() for x in split_top(inner)]
        if f[0]:
            self.lookup(ln, "017", f[0], "REL-REF")
        if len(f) > 1 and f[1]:
            self.xref(ln, f[1], S)
        if len(f) > 3:
            self.ref(ln, f[3:], "REL-REF")

    def kw_monit_ref(self, ln, inner, it, S):
        """MONIT-REF: ((heading)subentry,author,reference...). Formats Manual: MONIT-REF."""
        f = [x.strip() for x in split_top(self.strip_head(inner))]
        if f and f[0]:
            self.xref(ln, f[0], S)
        if len(f) > 2:
            self.ref(ln, f[2:], "MONIT-REF")

    def kw_sample(self, ln, inner, it, S):
        """SAMPLE codes read (nuclide,abundance). LEXFOR: Sample."""
        f = [x.strip() for x in split_top(inner)]
        good = len(f) == 2 and (NUC.match(f[0]) or f[0] in D["209"] or f[0] in D["227"]) and \
            re.fullmatch(r"(ENR=|NAT=?)?[\d.]*(E[+-]?\d+)?|NAT", f[1])
        if not good:
            self.warn(ln, "SAMPLE-FORM", inner[:30], "a SAMPLE code reads (nuclide,abundance)")

    def heading_first(self, ln, inner, it, S, kw):
        f = [x.strip() for x in split_top(inner)]
        if f and f[0] and not self.heading_ok(f[0]):
            self.err(ln, "HEAD-DICT", f[0], f"{kw} heading {f[0]} is not in dictionary 24")
        if f and f[0]:
            S.setdefault("defs", set()).add((kw, f[0], it["ptr"]))
        if kw == "EN-SEC" and f and self.heading(f[0]) and self.heading(f[0])[0] not in (4, 5):
            self.warn(ln, "HEAD-DEF", f[0], f"EN-SEC names {f[0]}, which is not a secondary energy heading (data type {self.heading(f[0])[0]}{self.heading(f[0])[1]})")

    def kw_err_analys(self, ln, inner, it, S):
        """ERR-ANALYS: (heading,min,max,correlation code); a number in the fourth field is the old coding of a
        correlation coefficient. Formats Manual: ERR-ANALYS."""
        self.heading_first(ln, inner, it, S, "ERR-ANALYS")
        f = [x.strip() for x in split_top(inner)]
        if len(f) >= 4 and isinstance(fnum(f[3]), float):  # 0.0 counts too
            self.warn(ln, "ERR-CORR", f[3], "obsolete coding of ERR-ANALYS: a correlation coefficient in the fourth field")

    def kw_misc_col(self, ln, inner, it, S):
        self.heading_first(ln, inner, it, S, "MISC-COL")

    def kw_en_sec(self, ln, inner, it, S):
        self.heading_first(ln, inner, it, S, "EN-SEC")

    def kw_ang_sec(self, ln, inner, it, S):
        self.heading_first(ln, inner, it, S, "ANG-SEC")

    def kw_mom_sec(self, ln, inner, it, S):
        self.heading_first(ln, inner, it, S, "MOM-SEC")

    def kw_reaction(self, ln, inner, it, S):
        r = self.reaction(ln, inner)
        S["reactions"].append({"ptr": it["ptr"], "line": ln, "q": r})

    def kw_monitor(self, ln, inner, it, S):
        S["monitor"] = True
        self.reaction(ln, self.strip_head(inner), monitor=True)

    def kw_assumed(self, ln, inner, it, S):
        f = split_top(inner)
        if len(f) > 1:
            if not self.heading_ok(f[0].strip()):
                self.err(ln, "HEAD-DICT", f[0], f"ASSUMED heading {f[0].strip()} is not in dictionary 24")
            self.reaction(ln, ",".join(f[1:]))

    # ---- REACTION strings
    def reaction(self, ln, s, monitor=False):
        """A REACTION code, a unit or units combined with + - * / // =. Returns the quantity's unit family (or None).
        LEXFOR: Reaction; Formats Manual: REACTION."""
        s = s.strip()
        if not s:
            self.err(ln, "REACT-SYNTAX", s, "empty reaction code")
            return None
        if not s.startswith("("):
            return self.unit(ln, s, monitor)
        groups, ops, i, depth, start = [], [], 0, 0, 0
        while i < len(s):
            ch = s[i]
            if ch == "(":
                if depth == 0:
                    start = i
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    groups.append(s[start + 1:i])
            elif depth == 0:
                op = "//" if s[i:i + 2] == "//" else ch
                if op not in ("+", "-", "*", "/", "//", "="):
                    self.err(ln, "REACT-SYNTAX", s[i:i + 10], f"'{ch}' cannot join reaction units")
                    return None
                ops.append(op)
                i += len(op) - 1
            i += 1
        if depth != 0 or len(groups) != len(ops) + 1:
            self.err(ln, "REACT-SYNTAX", s[:30], "reaction units and operators do not alternate")
            return None
        fams = [self.reaction(ln, g, monitor) for g in groups]
        if any(op in ("/", "//") for op in ops):
            return "NO"
        if "*" in ops:
            return None
        return fams[0]

    def unit(self, ln, u, monitor=False):
        """One reaction unit SF1(SF2,SF3)SF4,SF5,SF6,SF7,SF8,SF9. LEXFOR: Reaction; dictionaries 30-35, 227, 236."""
        m = re.match(r"^([^(),]+)\(([^(),]+),([^()]*)\)(.*)$", u)
        if not m:
            self.err(ln, "REACT-SYNTAX", u[:30], "a reaction unit reads target(projectile,process)product,...")
            return None
        sf1, sf2, sf3, rest = m.groups()
        n0 = len(self.msgs)
        f = split_top(rest)
        if len(f) < 3:
            self.err(ln, "REACT-SYNTAX", u[:30], "SF6 (the parameter) is missing")
            return None
        if len(f) > 6:
            self.err(ln, "REACT-SYNTAX", u[:30], "more than nine subfields")
            return None
        sf4, sf5, sf6 = f[0], f[1], f[2]
        sf7 = f[3] if len(f) > 3 else ""
        sf8 = f[4] if len(f) > 4 else ""
        sf9 = f[5] if len(f) > 5 else ""
        if sf1 not in D["209"]:
            self.nuclide(ln, sf1, "SF1")
        if not NUC.match(sf2):
            self.particle(ln, sf2, "2", "SF2")
        else:
            self.nuclide(ln, sf2, "SF2")
        procs = []
        for tok in sf3.split("+"):
            p = re.sub(r"^\d+(?=[A-Z])", "", tok.strip())
            procs.append(p)
            if not p:
                self.err(ln, "REACT-SF", sf3, "empty process in SF3")
            elif p in D["030"]:
                self.lookup(ln, "030", p, "SF3", "REACT-SF")
            elif NUC.match(p):
                self.nuclide(ln, p, "SF3")
            else:
                self.particle(ln, p, "3", "SF3")
        if sf4 and NUC_STATES.match(sf4):
            self.nuclide(ln, re.sub(r"[+/][GMLT]\d?", "", sf4), "SF4")
        elif sf4 and sf4 not in ("ELEM", "MASS", "ELEM/MASS", "NPART"):
            for p in re.split(r"[+/]", sf4):
                if p and NUC.match(p):
                    self.nuclide(ln, p, "SF4")
                elif p and p not in D["209"] and p not in ("ELEM", "MASS"):
                    self.err(ln, "REACT-NUC", p, f"SF4 product {p} is not a nuclide code")
        for c in [x for x in sf5.split("/") if x]:
            self.lookup(ln, "031", c, "SF5 branch", "REACT-SF")
        if sf6 not in D["032"]:
            for c in sf6.split("/"):
                self.lookup(ln, "032", c, "SF6 parameter", "REACT-SF")
        else:
            self.lookup(ln, "032", sf6, "SF6 parameter", "REACT-SF")
        for c in [x for x in re.split(r"[/+]", sf7) if x]:
            if NUC.match(c):
                self.nuclide(ln, c, "SF7")
            else:
                self.particle(ln, c, "7", "SF7")
        mods = [x for x in sf8.split("/") if x]
        for c in mods:
            self.lookup(ln, "034", c, "SF8 modifier", "REACT-SF")
        if sf9:
            self.lookup(ln, "035", sf9, "SF9 data type", "REACT-SF")
        q = self.quantity(sf5, sf6, sf7, mods)
        key = ",".join([sf5, sf6, sf7, "/".join(mods)]).rstrip(",")
        if q is None:
            if not any(m["rule"] == "REACT-SF" and m["severity"] == "error" for m in self.msgs[n0:]):
                self.err(ln, "REACT-QTY", key, f"quantity {key} is not in dictionary 236")  # once per cause
            return None
        rtype, fam, genn, status, qkey = q
        if status == "OBS":
            self.warn(ln, "CODE-OBS", qkey, f"quantity {qkey} is obsolete (dictionary 236)")
        if sf3 == sf2:
            self.warn(ln, "REACT-COMB", f"{sf2},{sf3}", "SF3 repeats SF2; scattering is coded EL, INL or SCT")
        if monitor and (sf9 or rest.rstrip().endswith(",")):
            self.warn(ln, "REACT-SYNTAX", u[:30], "under MONITOR the data type (SF9) and trailing empty subfields are left out")
        if (rtype.startswith("FY") or sf6 in ("FY", "NU")) and "F" not in procs:
            self.err(ln, "REACT-COMB", f"{sf3},{sf6}", f"SF6 {sf6} needs fission (F) in SF3, not {sf3}")
        if (sf6.startswith(("DA", "DE", "D3", "D4")) or rtype in ("DA", "DE", "DAE", "DAP", "DP")) and set(procs) & {"TOT", "ABS"}:
            self.err(ln, "REACT-COMB", f"{sf3},{sf6}", f"SF6 {sf6} needs an outgoing particle; SF3 {sf3} has none")
        return "NO" if genn else fam

    def quantity(self, sf5, sf6, sf7, mods):
        """SF5-SF8 against dictionary 236; general modifiers (dictionary 34, GENQ*) may be added. Returns
        (reaction type, unit family, relative?) or None."""
        gen = [m for m in mods if D["034"].get(m, [""])[0].startswith("GENQ")]
        rel = any(D["034"].get(m, [""])[0] == "GENQN" for m in mods)
        own = [m for m in mods if m not in gen]
        # dictionary 236 writes SF7 particles as given (P/P/P/RSD) or as the wildcard * (*/*/*, *)
        star = re.sub(r"[^/+]+", lambda m: m.group(0) if m.group(0) == "RSD" else "*", sf7)
        for ms in (mods, own):
            for p7 in dict.fromkeys((sf7, star, re.sub(r"[^/+]+", "*", sf7), "")):
                key = ",".join([sf5, sf6, p7, "/".join(ms)]).rstrip(",")
                v = D["236"].get(key)
                if v:
                    return v[0], v[1], rel or v[1] == "NO", v[2], key
        return None

    def nuclide(self, ln, c, where):
        """Z-SYMBOL-A[-state], symbol matching Z (dictionary 8), present in dictionary 227. LEXFOR: Nuclides."""
        if c in D["227"]:  # includes particles written as nuclides, such as 0-G-0
            return
        m = NUC.match(c)
        if not m:
            self.err(ln, "REACT-NUC", c, f"{where} {c} is not a nuclide code (Z-SYMBOL-A)")
            return
        z, sym, a, st = m.groups()
        el = D["008"].get(str(int(z)))
        if not el or el[0] != sym:
            self.err(ln, "REACT-NUC", c, f"{where} {c}: element {int(z)} is {el[0] if el else 'unknown'}, not {sym}")
            return
        base = f"{int(z)}-{sym}-{int(a)}"
        if c not in D["227"] and base not in NUC_BASE:
            self.warn(ln, "REACT-NUC", c, f"{where} {c} is not in dictionary 227")

    def particle(self, ln, c, flag, where):
        v = D["033"].get(c)
        if v is None:
            self.err(ln, "REACT-SF", c, f"{where} code {c} is not in dictionary 33")
        elif flag not in v[0]:
            self.err(ln, "REACT-SF", c, f"{where} code {c} is not allowed in {where} (dictionary 33)")
        elif v[1] == "OBS":
            self.warn(ln, "CODE-OBS", c, f"{where} code {c} is obsolete (dictionary 33)")

    # ---- 5-6. COMMON and DATA tables, units against quantities
    def heading_ok(self, h):
        if h in D["024"]:
            return True
        b = re.sub(r"\d+$", "", h)
        return b != h and b in D["024"]

    def heading(self, h):
        return D["024"].get(h) or D["024"].get(re.sub(r"\d+$", "", h))

    def table(self, S, kind):
        """Headings (dictionary 24), units (25) and values of a COMMON or DATA section. Formats Manual: COMMON and
        DATA sections."""
        sec = S[kind]
        n1 = sec["n1"]
        out = {"heads": [], "rows": []}
        S[kind + "_t"] = out
        if not isinstance(n1, int) or n1 <= 0:
            if sec["recs"]:
                self.err(sec["line"], "SYS-N", str(n1), f"{kind.upper()} N1 must give the number of fields")
            return
        per = math.ceil(n1 / 6)
        recs = sec["recs"]
        if len(recs) < 2 * per:
            self.err(sec["line"], "TAB-COUNT", str(n1), f"{kind.upper()} has {n1} fields but no full heading and unit records")
            return
        for j in range(n1):
            ln, r = recs[j // 6]
            f = r[(j % 6) * 11:(j % 6) * 11 + 11]
            uln, ur = recs[per + j // 6]
            u = ur[(j % 6) * 11:(j % 6) * 11 + 11].strip()
            h, p = f[:10].strip(), f[10].strip()
            out["heads"].append({"h": h, "p": p, "u": u, "line": ln, "uline": uln, "col": j})
            if not h:
                self.err(ln, "TAB-COUNT", "", f"field {j + 1} of {n1} has no heading")
                continue
            if not self.heading_ok(h):
                self.err(ln, "HEAD-DICT", h, f"data heading {h} is not in dictionary 24")
            elif self.heading(h)[4] == "OBS":
                self.warn(ln, "CODE-OBS", h, f"data heading {h} is obsolete (dictionary 24)")
            if not u:
                self.err(uln, "TAB-COUNT", h, f"heading {h} has no unit (the units record is shorter than the headings)")
            elif u not in D["025"]:
                self.err(uln, "UNIT-DICT", u, f"unit {u} is not in dictionary 25")
            elif D["025"][u][1] == "OBS":
                self.warn(uln, "CODE-OBS", u, f"unit {u} is obsolete (dictionary 25)")
        last = n1 % 6 or 6
        for part, base in (("heading", 0), ("unit", per)):
            ln, r = recs[base + per - 1]
            extra = r[last * 11:66].strip()
            if extra:
                self.err(ln, "TAB-COUNT", extra[:20], f"{part} beyond the {n1} fields of N1")
        body = recs[2 * per:]
        for k in range(0, len(body) - per + 1, per):
            row, ln0 = [], body[k][0]
            for j in range(n1):
                ln, r = body[k + j // 6]
                v = r[(j % 6) * 11:(j % 6) * 11 + 11]
                x = fnum(v)
                if x is False:
                    self.err(ln, "TAB-NUM", v.strip(), f"value {v.strip()} under {out['heads'][j]['h']} is not a number")
                    x = None
                row.append(x)
            for q in range(per):
                ln, r = body[k + q]
                if q == per - 1 and r[last * 11:66].strip():
                    self.err(ln, "TAB-COUNT", r[last * 11:66].strip()[:20], f"value beyond the {n1} fields of N1")
            out["rows"].append((ln0, row))

    def cross(self, E, S, S1):
        """Units against quantities, pointers, -MIN/-MAX and MONIT pairs, the incident energy's order, repeated and
        empty columns. Formats Manual: Data units, Pointers; LEXFOR: Data headings, Data ordering."""
        bib_ptrs = set(S.get("ptrs", set())) | (set(S1.get("ptrs", set())) if S1 else set())
        reactions = S.get("reactions") or (S1.get("reactions") if S1 else []) or []
        fam_of = {r["ptr"]: r["q"] for r in reactions}
        common = []
        if S1 and S1 is not S and S1.get("common_t"):
            common += [(h, "001") for h in S1["common_t"]["heads"]]
        if S.get("common_t"):
            common += [(h, "own") for h in S["common_t"]["heads"]]
        data = S.get("data_t") or {"heads": [], "rows": []}
        allh = [h for h, _ in common if _ == "own"] + data["heads"]
        for h in allh:
            if not h["h"]:
                continue
            if h["p"] and h["p"] not in bib_ptrs:
                self.err(h["line"], "PTR-UNDEF", h["h"] + h["p"], f"pointer {h['p']} of {h['h']} is not defined in the BIB")
            self.unitcheck(h, fam_of)
        defs = S.get("defs", set()) | (S1.get("defs", set()) if S1 else set())
        need = (("MISC-COL", r"MISC\d*"), ("ANG-SEC", r"ANG\d+"), ("EN-SEC", r"E\d+"), ("MOM-SEC", r"MOM\d+"))
        for h in allh:
            for kw, pat in need:
                if re.fullmatch(pat, h["h"]) and not any(k == kw and d == h["h"] and (not p or not h["p"] or p == h["p"])
                                                         for k, d, p in defs):
                    ptr = f" (pointer {h['p']})" if h["p"] else ""
                    self.warn(h["line"], "HEAD-DEF", h["h"], f"heading {h['h']}{ptr} is not described under {kw}")
        in001 = {h["h"] for h, w in common if w == "001" and h["h"]}
        for h, w in common:
            if w == "own" and h["h"] in in001:
                self.warn(h["line"], "HEAD-REPEAT", h["h"], f"heading {h['h']} is in subentry 001's COMMON and the subentry's COMMON")
        if data["heads"]:
            seen = {h["h"]: w for h, w in common}
            for h in data["heads"]:
                if h["h"] in seen and h["h"]:
                    where = "subentry 001" if seen[h["h"]] == "001" else "the subentry's COMMON"
                    self.warn(h["line"], "HEAD-REPEAT", h["h"], f"heading {h['h']} is in {where} and in the DATA table")
            cols = {}  # the same heading and pointer twice; DATA 1 and DATA 2 interleaved with their errors is fine
            for j, h in enumerate(data["heads"]):
                cols.setdefault((h["h"], h["p"]), []).append(j)
            for (name, _), js in cols.items():
                if name and js[-1] - js[0] != len(js) - 1:
                    self.warn(data["heads"][js[0]]["line"], "HEAD-ADJ", name, f"the {len(js)} {name} columns are not side by side")
            broken = S["data"].get("broken")
            for j, h in enumerate(data["heads"]):
                if not broken and h["h"] and data["rows"] and all(r[j] is None for _, r in data["rows"]):
                    self.warn(h["line"], "TAB-EMPTY", h["h"], f"column {h['h']} holds no values")
            first = {}
            for ln, r in data["rows"]:
                key = tuple(r)
                if key in first and any(x is not None for x in r):
                    self.warn(ln, "TAB-DUP", "", f"this data line repeats line {first[key]}")
                first.setdefault(key, ln)
        names = {(h["h"], h["p"]) for h, _ in common} | {(h["h"], h["p"]) for h in data["heads"]}
        # EN-MIN or EN-MAX alone is legal (a threshold, an upper limit); when both are there they must be in order.
        idx ={(h["h"], h["p"]): j for j, h in enumerate(data["heads"])}
        for (h, p), j in idx.items():
            if h.endswith("-MIN") and (h[:-4] + "-MAX", p) in idx:
                k = idx[(h[:-4] + "-MAX", p)]
                for ln, r in data["rows"]:
                    if r[j] is not None and r[k] is not None and r[j] > r[k]:
                        self.err(ln, "TAB-PAIR", h, f"{h} {r[j]:g} is above {h[:-4]}-MAX {r[k]:g}")
                        break
        own = {(x["h"], x["p"]) for x in allh}  # 001's COMMON MONIT-ERR serves only the subentries with a monitor
        monit = [x for x in own if re.match(r"MONIT\d*$", x[0])]
        monit_err = [x for x in own if x[0].startswith("MONIT-ERR")]
        has_mon = "MONITOR" in S.get("kw", {}) or (S1 and "MONITOR" in S1.get("kw", {}))
        if (monit or monit_err) and not has_mon and S1:  # without 001 in the file, its BIB is unknown
            h = (monit or monit_err)[0][0]
            line = next((x["line"] for x in allh if x["h"] == h), S["line"])
            self.warn(line, "TAB-PAIR", h, f"{h} column without a MONITOR keyword")
        indep = [j for j, h in enumerate(data["heads"]) if h["h"] and (self.heading(h["h"]) or [0])[0] in (3, 4, 5, 6, 7, 8, 9)]
        if len(indep) == 1 and data["heads"][indep[0]]["h"] == "EN" and len(data["rows"]) > 2:
            j = indep[0]
            vals = [(ln, r[j]) for ln, r in data["rows"] if r[j] is not None]
            up = all(b[1] >= a[1] for a, b in zip(vals, vals[1:]))
            down = all(b[1] <= a[1] for a, b in zip(vals, vals[1:]))
            if not up and not down:
                d = 1 if sum(b[1] > a[1] for a, b in zip(vals, vals[1:])) >= len(vals) / 2 else -1
                bad = next(b for a, b in zip(vals, vals[1:]) if (b[1] - a[1]) * d < 0)
                self.warn(bad[0], "TAB-ORDER", f"{bad[1]:g}", f"EN {bad[1]:g} is out of order")

    def unitcheck(self, h, fam_of):
        """A unit's family against its heading's (dictionary 24/25), and DATA's against the quantity (236)."""
        u = D["025"].get(h["u"])
        hd = self.heading(h["h"])
        if not u or not hd:
            return
        uf, hf = u[0], hd[3]
        if not hf or hf in ("*S", "*A") or hf == uf:
            return
        name = h["h"]
        errish = "ERR" in name or "RSL" in name or name.endswith("-FW") or "UNC" in name
        if hf == "*":
            if h["p"] in fam_of:
                q = fam_of[h["p"]]
            elif len(fam_of) == 1:
                q = next(iter(fam_of.values()))
            else:
                q = fam_of.get("")
            # Dictionary 236's families and dictionary 25's do not map one to one (yields, multiplicities, spectra
            # share units across families), so only a unit of an independent variable's family under DATA is wrong.
            if not q or q == uf or uf not in INDEP_FAMILIES:
                return
            self.err(h["uline"], "UNIT-QTY", h["u"], f"unit {h['u']} (family {uf}) does not fit {name}'s quantity (family {q})")
            return
        if errish and uf == "PC":
            return
        self.err(h["uline"], "UNIT-QTY", h["u"], f"unit {h['u']} (family {uf}) does not fit heading {name} (family {hf})")

    # ---- 7. required keywords and cross-references
    def required(self, E, S, S1):
        """Dictionary 2's required keywords, in the subentry or in subentry 001. LEXFOR: Required keywords."""
        have = set(S.get("kw", {})) | set(S1.get("kw", {}))
        need = [k for k, v in D["002"].items() if v[2] == "R" and v[3] != "OBS" and k != "STATUS"]
        for k in need:
            if k not in have:
                self.warn(S["line"], "KW-REQ", k, f"keyword {k} is missing (subentry {S['num']} and 001)")
        either = [k for k, v in D["002"].items() if v[2] == "B"]
        if either and not have & set(either):
            self.warn(S["line"], "KW-REQ", "/".join(either), "one of " + ", ".join(either) + " is required")

    def run(self):
        self.xrefs = []
        recs = self.records()
        T = self.structure(recs)
        for E in T["entries"]:
            self.entry = E["acc"]
            S1 = next((s for s in E["subs"] if s["num"] == "001"), None)
            for S in E["subs"]:
                self.subent = S["num"]
                if S["empty"]:
                    continue
                if S.get("bib"):
                    self.bib(S)
                for k in ("common", "data"):
                    if S.get(k):
                        self.table(S, k)
                if S["num"] == "001" and S.get("data"):
                    self.err(S["data"]["line"], "SUB-001", "DATA", "subentry 001 has a DATA section")
            for S in E["subs"]:
                self.subent = S["num"]
                if S["empty"] or S["num"] == "001":
                    continue
                self.cross(E, S, S1 or {})
                if S1 is not None:
                    self.required(E, S, S1)
        # A cross-reference to a subentry the file leaves out is normal: a revision carries only the altered subentries.
        return T


def decode(data):
    """Bytes or text in; text out, or a one-line refusal for a file that is not text. Formats Manual: Character set."""
    if isinstance(data, str):
        return data, None
    if not data or not data.strip():
        return None, ("FILE-EMPTY", "the file is empty")
    head = data[:1024]
    if head.startswith(b"%PDF"):
        return None, ("FILE-BINARY", "this is a PDF, not a TRANS file")
    if head.startswith(b"PK\x03\x04"):
        return None, ("FILE-BINARY", "this is a zip archive (or a Word or Excel file), not a TRANS file")
    if b"\x00" in head or sum(b < 9 or 13 < b < 32 for b in head) > len(head) * 0.02:
        return None, ("FILE-BINARY", "this file holds binary data, not EXFOR text")
    try:
        return data.decode("utf-8"), None
    except UnicodeDecodeError:
        return data.decode("latin-1"), None


def check(data, name=None):
    t0 = time.time()
    text, refuse = decode(data)
    if refuse:
        return {"messages": [{"line": 0, "entry": "", "subent": "", "severity": "error", "rule": refuse[0], "code": "",
                              "message": refuse[1]}],
                "summary": {"entries": 0, "subentries": 0, "errors": 1, "warnings": 0, "lines": 0,
                            "bytes": len(data or b""), "seconds": round(time.time() - t0, 3)},
                "entries": [], "dictionary": DICTS["version"], "rules": {refuse[0]: rule(refuse[0])}}
    if not text.strip():
        return check(b"")
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    c = Checker(lines)
    T = c.run()
    msgs = sorted(c.msgs, key=lambda m: (m["line"], m["severity"] != "error"))
    ents = [{"entry": E["acc"], "line": E["line"], "subentries": [s["num"] for s in E["subs"]]} for E in T["entries"]]
    return {"messages": msgs,
            "summary": {"entries": len(ents), "subentries": sum(len(e["subentries"]) for e in ents),
                        "errors": sum(m["severity"] == "error" for m in msgs),
                        "warnings": sum(m["severity"] == "warning" for m in msgs), "lines": len(lines),
                        "bytes": len(text.encode("latin-1", "replace")), "seconds": round(time.time() - t0, 3)},
            "entries": ents, "dictionary": DICTS["version"],
            "rules": {r: rule(r) for r in sorted({m["rule"] for m in msgs})}}


def rule(rid):
    src, topic, title, text = RULES[rid]
    return {"id": rid, "source": src, "topic": topic, "title": title, "text": text}


def report(res, name="file"):
    """The checker's own text report: a header, the counts, one message a line."""
    s = res["summary"]
    out = [f"EXFOR TRANS check: {name} (dictionary {res['dictionary']})",
           f"{s['entries']} entries, {s['subentries']} subentries, {s['errors']} errors, {s['warnings']} warnings, "
           f"{s['seconds']} s", "",
           f"{'LINE':>6}  {'ENTRY':5}  {'SUB':3}  {'SEVERITY':8}  {'RULE':12}  {'CODE':16}  MESSAGE"]
    for m in res["messages"]:
        out.append(f"{m['line']:>6}  {m['entry']:5}  {m['subent']:3}  {m['severity']:8}  {m['rule']:12}  "
                   f"{m['code'][:16]:16}  {m['message']}")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    bad = 0
    for p in sys.argv[1:]:
        r = check(open(p, "rb").read())
        sys.stdout.write(report(r, os.path.basename(p)))
        bad += r["summary"]["errors"] > 0
    sys.exit(1 if bad else 0)
