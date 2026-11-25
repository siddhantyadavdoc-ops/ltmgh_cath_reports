import sys, copy
sys.argv = ["x", "/home/claude/ltmgh_cath_reports/proformas/PPM_Proforma_v1.docx"]
sys.path.insert(0, "/home/claude/ltmgh_cath_reports/proformas")
import make_ppm_bmv as M
from docx import Document
from docx.shared import Pt, Cm
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH

U = Document("user.docx")
W = qn("w:p")

def scratch():
    T = Document("user.docx")
    b = T.element.body
    fin = b.find(qn("w:sectPr"))
    for el in list(b):
        if el is not fin: b.remove(el)
    return T

def take(T):
    b = T.element.body
    return [el for el in b if el.tag != qn("w:sectPr")]

def label_value_table(T, rows, size=9, h=0.55, lw=None):
    """rows of (label, label, label…) — each label followed by an empty value cell"""
    n = max(len(r) for r in rows)
    t = T.add_table(rows=len(rows), cols=n * 2); M.borders(t)
    for ri, r in enumerate(rows):
        t.rows[ri].height = Cm(h)
        for k, lab in enumerate(r):
            p = t.rows[ri].cells[k * 2].paragraphs[0]; p.paragraph_format.space_after = Pt(0)
            if lab: M.run(p, lab, size=size)
    return t

# ---------- page 1: Examination, as on the CAG proforma ----------
T = scratch()
M.para(T, [("u", "Examination :")], before=4, after=2)
M.para(T, ["Pulse : ", ("_", 8), " /min        BP : ", ("_", 10), " mm/Hg"], after=2)
M.para(T, ["Peripheral pulses : All  ", ("x", "Yes"), ("x", "No"), "      Allen’s Test :  ", ("x", "(+)"), ("x", "(−)")], after=2)
M.para(T, ["CVS : S1 S2 (+) ", ("_", 22), "      RS : Clear ", ("_", 22)], after=2)
exam = take(T)

cell = U.tables[0].rows[0].cells[1]
ps = cell.paragraphs
risk = [p for p in ps if p.text.startswith("Procedural Risk")][0]
anchor = risk._p
for el in exam:
    anchor.addnext(el); anchor = el
# the empty lines and the note of the "Latest values" strip that was taken out
for p in cell.paragraphs:
    if p.text.startswith("Latest values"):
        prev = p._p.getprevious()
        p._p.getparent().remove(p._p)
        while prev is not None and prev.tag == W and not "".join(prev.itertext()).strip() and prev is not anchor:
            pp = prev.getprevious(); prev.getparent().remove(prev); prev = pp
        break

# ---------- page 2: ECG, echo and bloods, CAG layout merged with the PPM points ----------
T = scratch()
M.para(T, [("u", "ECG :"), "   HR ", ("_", 6), " /min   PR ", ("_", 6), " ms"], after=2)
M.para(T, [("b", "Rhythm :  "), ("x", "NSR", "a"), ("x", "Sinus tachy", "b"), ("x", "Sinus brady", "c"), ("x", "Sinus arrest / pauses", "d"), ("x", "AFib / flutter", "e"), ("x", "AT", "f"), ("x", "SVT", "g"), ("x", "NSVT", "h"), ("x", "Junctional", "i")], after=2)
M.para(T, [("b", "Block :  "), ("x", "1° HB", "j"), ("x", "2° HB — Mobitz I", "k"), ("x", "Mobitz II", "l"), ("x", "2:1", "m"), ("x", "High-grade", "n"), ("x", "CHB", "o"), "   escape ", ("_", 5), " /min  ", ("x", "narrow", "p"), ("x", "wide", "q")], after=2)
M.para(T, [("b", "Conduction :  "), ("x", "RBBB", "r"), ("x", "LBBB", "s"), ("x", "LAFB", "t"), ("x", "LPFB", "u"), ("x", "Alternating BBB", "v")], after=2)
M.para(T, [("b", "QRS / ST-T changes :  "), ("x", "ST ↑", "w"), ("_", 7), "  ", ("x", "Q waves", "x"), ("_", 7), "  ", ("x", "ST depression", "y"), ("_", 7), "  ", ("x", "T ↓", "z"), ("_", 7), "  ", ("x", "Normal", "zz")], after=2)
M.para(T, [("_", 92)], after=3)
M.para(T, [("b", "Holter / event monitor : "), ("_", 66)], after=5)

M.para(T, [("u", "Echocardiogram :")], after=2)
label_value_table(T, [("LA", "IVSDd", "LVIDd"), ("Aorta", "PWDd", "LVIDs"), ("PASP", "RA/RV", "LVEF  %")], size=10, h=0.5)
M.spacer(T, 3)
vt = T.add_table(rows=4, cols=7); M.borders(vt)
for i, h in enumerate(["", "MR", "MS", "MVA", "AS", "AR", "TR"]):
    p = vt.rows[0].cells[i].paragraphs[0]; p.paragraph_format.space_after = Pt(0); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    M.run(p, h, size=10)
for ri, lab in enumerate(["Mild", "Moderate", "Severe"]):
    vt.rows[ri + 1].height = Cm(0.45)
    p = vt.rows[ri + 1].cells[0].paragraphs[0]; p.paragraph_format.space_after = Pt(0); M.run(p, lab, size=10)
a = vt.cell(1, 3).merge(vt.cell(3, 3)); p = a.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.RIGHT; M.run(p, "Sq cm", size=9)
for row in vt.rows:
    for ci, w in enumerate([2.4, 1.6, 1.6, 2.6, 1.6, 1.6, 1.6]): row.cells[ci].width = Cm(w)
M.spacer(T, 3)
M.para(T, [("b", "RWMA :  "), ("x", "No", "r1"), ("x", "A / AL / AS", "r2"), ("x", "I / IL / IS", "r3"), ("x", "GLVH", "r4"), ("x", "Apical", "r5"), ("x", "Global", "r6")], after=2)
M.para(T, [("b", "2D Echo & Doppler : "), ("_", 70)], after=5)

M.para(T, [("u", "Blood Investigation :")], after=2)
label_value_table(T, [("Hb", "Bun", "HIV"), ("TLC", "Sr. Creat", "HBsAg"), ("Platelets", "Sr. Na/K", "HCV"),
                      ("TC", "TG", "RBS/FBS"), ("PT / INR", "APTT", "LDL"), ("TSH", "Blood group", "")], size=10, h=0.5)
M.spacer(T, 5)
block = take(T)

body = U.element.body
start = [p for p in U.paragraphs if p.text.startswith("ECG :")][0]._p
stop = [p for p in U.paragraphs if p.text.startswith("Device plan")][0]._p
el = start
while el is not stop:
    nx = el.getnext(); body.remove(el); el = nx
for e in block: stop.addprevious(e)

# "Subcutaneous Subpectoral" written beside Planned side: tick boxes for them
ps = [p for p in U.paragraphs if p.text.startswith("Planned side")][0]
for r in ps.runs:
    if "Subcutaneous" in r.text or "Subpectoral" in r.text:
        r.text = r.text.replace("Subcutaneous", "").replace("Subpectoral", "")
M.run(ps, "   Pocket :  ", bold=True)
M.emit(ps, ("x", "Subcutaneous", "pk1")); M.emit(ps, ("x", "Subpectoral", "pk2"))

U.save("PPM_Proforma_v2.docx")
print("saved")
