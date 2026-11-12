"""JANIS's own data packages (.jpk, NEA GitLab project janis/data; brief 74): decode a section to ENDF text lines.

A .jpk is a zip ("JANIS Packed ENDF") of one member per ENDF section, nsub<NSUB>/mat<MAT>/mf<MF>/mt<MT>. A member is
the section's lines without columns 67-80, one record a line:
- a numeric line is the byte 0x01, then 33 bytes holding 66 characters at four bits each, high nibble first:
  1-9 the digits, a "0", b ".", c "+", d "-", e "E", f " " (0 does not occur inside a line);
- a text line (MF1 MT451's description) is the line's own characters, ended by a newline (0x0a).
Neutron MF3 in these packages is JANIS's pointwise data as JANIS draws it (resonances reconstructed and broadened; NJOY
reactions such as heating MT 301-303, gas production MT 203-207 and damage MT 444 added): ENDF/B-VIII.0 Fe-56 MT 102
decodes to the same 40,561 points, every one identical, as JANIS Web's Tabler prints.

  jpk.py <file.jpk> [member...]          prints the decoded lines (no member: lists the members)
"""
import sys
import zipfile

LINE = 34  # 0x01 and 33 bytes of 66 nibbles
HEX = str.maketrans("0123456789abcdef", "?123456789" + "0.+-E ")


def lines(data):
    """The section's lines (66 characters each)."""
    n = len(data)
    if n % LINE == 0 and data[::LINE] == b"\x01" * (n // LINE):  # every line numeric (MF3 and most sections)
        h = data.hex().translate(HEX)
        return [h[k + 2:k + 2 * LINE] for k in range(0, len(h), 2 * LINE)]
    out, i = [], 0
    while i < n:
        b = data[i]
        if b == 0x01:
            if i + LINE > n:
                raise ValueError(f"short numeric record at byte {i}")
            out.append(data[i + 1:i + LINE].hex().translate(HEX))
            i += LINE
        elif b == 0x0A:
            i += 1
        else:
            j = data.find(b"\n", i)
            j = n if j < 0 else j
            out.append(data[i:j].decode("latin-1").ljust(66)[:66])
            i = j + 1
    return out


def member(z, name):
    return lines(z.read(name))


def split(name):
    """nsub10/mat2631/mf3/mt102 -> (10, 2631, 3, 102)."""
    a, b, c, d = name.split("/")
    return int(a[4:]), int(b[3:]), int(c[2:]), int(d[2:])


def to_endf(z, nsub, mat):
    """A whole material back to ENDF-6 text (columns 67-80 added, SEND/FEND/MEND), the way lane A rebuilds tapes."""
    secs = sorted(split(m)[2:] for m in z.namelist() if m.startswith(f"nsub{nsub}/mat{mat}/"))
    out, last_mf = [], None
    zero = f"{0.0:11.4E}" * 2 + f"{0:11d}" * 4

    def tag(mf, mt, seq):
        return f"{mat:4d}{mf:2d}{mt:3d}{seq:5d}"
    fend = zero + f"{mat:4d}{0:2d}{0:3d}{0:5d}"
    for mf, mt in secs:
        if last_mf is not None and mf != last_mf:
            out.append(fend)
        for k, ln in enumerate(member(z, f"nsub{nsub}/mat{mat}/mf{mf}/mt{mt}"), 1):
            out.append(ln.ljust(66) + tag(mf, mt, k % 100000))
        out.append(zero + tag(mf, 0, 99999))
        last_mf = mf
    if last_mf is not None:
        out.append(fend)
    out.append(zero + f"{0:4d}{0:2d}{0:3d}{0:5d}")  # MEND
    return out


if __name__ == "__main__":
    with zipfile.ZipFile(sys.argv[1]) as z:
        if len(sys.argv) == 2:
            for m in z.namelist():
                print(m)
        for m in sys.argv[2:]:
            for ln in member(z, m):
                print(ln)
