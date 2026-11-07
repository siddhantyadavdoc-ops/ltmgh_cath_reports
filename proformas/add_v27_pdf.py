"""CAG proforma v2.7 (from v2.6): page 4 Plan block gains a "DCB" (drug coated balloon) box,
placed after CABG on the "with ☐ IVUS ☐ Rota ☐ CABG" line."""
import re, sys, pikepdf
SRC = sys.argv[1] if len(sys.argv) > 1 else "CAG_Proforma_v2_6.pdf"
DST = sys.argv[2] if len(sys.argv) > 2 else "CAG_Proforma_v2_7.pdf"
pdf = pikepdf.open(SRC); page = pdf.pages[3]
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
code = {}
for name in ("/F1", "/F2"):
    code[name] = {}
    for c, ch in sorted(tounicode(page.obj.Resources.Font[name]).items()): code[name].setdefault(ch, c)
def enc(font, t): return "".join("%02X" % code[font][ch] for ch in t)
anchor = "q 0 0 0 rg\nBT\n341.95 222.689 Td /F2 11 Tf<01>Tj\nET\nQ\n"
assert raw.count(anchor) == 1, raw.count(anchor)
new = ("q 0 0 0 rg\nBT\n344.75 222.689 Td /F1 11 Tf<%s>Tj\nET\nQ\n" % enc("/F1", "☐") +
       "q 0 0 0 rg\nBT\n354.6 222.689 Td /F2 11 Tf<%s>Tj\nET\nQ\n" % enc("/F2", " DCB"))
page.obj.Contents = pdf.make_stream(raw.replace(anchor, anchor + new).encode("latin-1"))
pdf.save(DST); print("wrote", DST)
