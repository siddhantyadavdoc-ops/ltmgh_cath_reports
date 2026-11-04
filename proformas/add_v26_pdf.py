"""CAG proforma v2.6 (from v2.5): the single "IPD/OPD No." comb on page 1 becomes two
rows — an upper IPD No. comb and a lower OPD No. comb (7 boxes each).
Old header: v2.5 (from v2.3): room for Past History on page 1; bigger date\nboxes; a Non-anginal chest pain box on the Final Diagnosis line (page 4).
 - The Clinical Diagnosis block is laid out in three rows (AWMI / IW / PW;
   RV MI / UA / CSA / NSTEMI; Non-anginal) with the date boxes in one row
   (DD/MM/YY side by side) instead of stacked.
 - The pre-printed "CVS : S1 S2 (+)   RS : Clear" line is dropped.
 - Past History gains three full-width ruled lines.
Everything below moves by whole bands; text and table borders alike."""
import re, sys, pikepdf
SRC = sys.argv[1] if len(sys.argv) > 1 else "CAG_Proforma_v2_5.pdf"
DST = sys.argv[2] if len(sys.argv) > 2 else "CAG_Proforma_v2_6.pdf"
pdf = pikepdf.open(SRC); page = pdf.pages[0]
H = float(page.obj.MediaBox[3])
raw = page.obj.Contents.read_bytes().decode("latin-1")
def tounicode(font):
    s = font["/ToUnicode"].read_bytes().decode("latin-1"); m = {}
    for blk in re.findall(r"beginbfchar(.*?)endbfchar", s, re.S):
        for a, b in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", blk): m[int(a, 16)] = bytes.fromhex(b).decode("utf-16-be")
    for blk in re.findall(r"beginbfrange(.*?)endbfrange", s, re.S):
        for a, b, c in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", blk):
            a, b, base = int(a, 16), int(b, 16), int(c, 16)
            for i in range(a, b + 1): m[i] = chr(base + i - a)
    return m
F = {}
for name in ("/F1", "/F2", "/F3"):
    f = page.obj.Resources.Font[name]; uni = tounicode(f); code = {}
    for c, ch in sorted(uni.items()): code.setdefault(ch, c)
    F[name] = (code, int(f["/FirstChar"]), [float(w) for w in f["/Widths"]], uni)
def enc(font, t): return "".join("%02X" % F[font][0][ch] for ch in t)
def width(font, t, size): code, fc, widths, _ = F[font]; return sum(widths[code[ch] - fc] for ch in t) * size / 1000.0
def dec(font, hexs): uni = F[font][3]; return "".join(uni.get(int(hexs[i:i+2], 16), "?") for i in range(0, len(hexs), 2))
def fmt(v): return ("%.3f" % v).rstrip("0").rstrip(".")
def unit(x, ytop, font, t, size): return "q 0 0 0 rg\nBT\n%s %s Td %s %s Tf<%s>Tj\nET\nQ\n" % (fmt(x), fmt(H - ytop), font, size, enc(font, t))


# ---- drop the old label and comb (x 390.2; label at ytop 123.4, boxes at 155.4)
UNIT = re.compile(r"q 0 0 0 rg\nBT\n([-\d.]+) ([-\d.]+) Td (/\S+) ([\d.]+) Tf<([0-9A-Fa-f]+)>Tj\nET\nQ\n")
m = re.search(r"ET\nQ\n(Q \nQ\n|\nQ\n)\n", raw)
lo, tail = raw[:m.start() + 5], raw[m.start() + 5:]
dropped = []
def keep(u):
    x, y, font, size, hexs = float(u.group(1)), float(u.group(2)), u.group(3), u.group(4), u.group(5)
    ytop = H - y
    if abs(x - 390.2) < 0.5 and (abs(ytop - 123.4) < 1 or abs(ytop - 155.4) < 1):
        dropped.append(dec(font, hexs)); return ""
    return u.group(0)
lo = UNIT.sub(keep, lo)
assert len(dropped) == 2, dropped
new = []
X = 390.2; BOX = 22; N = 7
new.append(unit(X, 115.0, "/F2", "IPD No.  :", 9.5))
new.append(unit(X, 137.5, "/F1", "☐" * N, BOX))
new.append(unit(X, 155.5, "/F2", "OPD No.  :", 9.5))
new.append(unit(X, 178.0, "/F1", "☐" * N, BOX))
right = X + width("/F1", "☐" * N, BOX)
assert right < 552, right
page.obj.Contents = pdf.make_stream((lo + "".join(new) + tail).encode("latin-1"))
pdf.save(DST)
print("dropped:", dropped, "| combs end at x=%.1f" % right, "| wrote", DST)
