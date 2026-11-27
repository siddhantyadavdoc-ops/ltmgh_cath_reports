"""CAG proforma v3.0 DRAFT — the coronary angiography proforma rebuilt as
tables, in the style of PTCA v2.7, with the same content on the same pages
as v2.7/v2.8:
  page 1  patient, diagnosis, history, examination, ECG, echo, bloods
  page 2  angiogram header, LM, LAD (+ diagonal)
  page 3  LCx (+ OM), RCA
  page 4  PDA, PLV, ramus, collaterals, grafts, renals, final diagnosis, plan
Each vessel is one grid: segments down the side, the lesion and stent
findings across (one box per cell). Boxes are as big as each page allows.

  python3 make_cag_v30.py   → CAG_Proforma_v3_0.docx
  soffice --headless --convert-to pdf CAG_Proforma_v3_0.docx
  python3 add_markers.py CAG_Proforma_v3_0.pdf CAG_Proforma_v3_0.pdf 11   (corner markers, ids 44–59)

The left-margin checklist of v2.x (RG, R, DP, PT, Local, Consent) becomes a
row of the patient table on page 1.
"""
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_ROW_HEIGHT_RULE, WD_TABLE_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, "cag_logo.jpg")
BOX = "☐"
FONT = "Times New Roman"
GREY = "EDEDED"
BOX1 = 20        # page 1's echo part (below the original top half)
BOXV = 22        # the vessel grids and pages 2–4 (22 pt ≈ 5.6 mm, each in a cell of ≈ 9 mm)
DIGIT = 22       # the CAG No / IPD / OPD / date digit boxes
W = 18.6         # text width, cm

# ---------- low-level helpers ----------
def run(p, text, size=9.5, bold=False, italic=False, font=FONT, color=None):
    r = p.add_run(text); r.font.size = Pt(size); r.bold = bold; r.italic = italic
    r.font.name = font; r._element.rPr.rFonts.set(qn("w:eastAsia"), font); r._element.rPr.rFonts.set(qn("w:hAnsi"), font)
    if color: r.font.color.rgb = RGBColor.from_string(color)
    return r

def para(cell_or_doc, first=False):
    if first and hasattr(cell_or_doc, "paragraphs") and cell_or_doc.paragraphs and not cell_or_doc.paragraphs[0].text:
        p = cell_or_doc.paragraphs[0]
    else:
        p = cell_or_doc.add_paragraph()
    pf = p.paragraph_format; pf.space_before = Pt(0); pf.space_after = Pt(0); pf.line_spacing = 1.0
    return p

def borders(t, sz=6):
    tblPr = t._tbl.tblPr; b = OxmlElement("w:tblBorders")
    for e in ("top", "left", "bottom", "right", "insideH", "insideV"):
        x = OxmlElement("w:" + e); x.set(qn("w:val"), "single"); x.set(qn("w:sz"), str(sz)); x.set(qn("w:color"), "000000"); b.append(x)
    tblPr.append(b)

def no_borders(t):
    tblPr = t._tbl.tblPr; b = OxmlElement("w:tblBorders")
    for e in ("top", "left", "bottom", "right", "insideH", "insideV"):
        x = OxmlElement("w:" + e); x.set(qn("w:val"), "nil"); b.append(x)
    tblPr.append(b)

def cell_margins(t, lr=0.08, tb=0.02):
    tblPr = t._tbl.tblPr; m = OxmlElement("w:tblCellMar")
    for side, v in (("top", tb), ("bottom", tb), ("left", lr), ("right", lr)):
        x = OxmlElement("w:" + side); x.set(qn("w:w"), str(int(v * 567))); x.set(qn("w:type"), "dxa"); m.append(x)
    tblPr.append(m)

def shade(cell, fill=GREY):
    tcPr = cell._tc.get_or_add_tcPr(); sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear"); sh.set(qn("w:color"), "auto"); sh.set(qn("w:fill"), fill); tcPr.append(sh)

def vertical(cell):
    tcPr = cell._tc.get_or_add_tcPr(); d = OxmlElement("w:textDirection"); d.set(qn("w:val"), "btLr"); tcPr.append(d)

def fixed(t, widths):
    t.autofit = False; t.alignment = WD_TABLE_ALIGNMENT.CENTER
    lay = OxmlElement("w:tblLayout"); lay.set(qn("w:type"), "fixed"); t._tbl.tblPr.append(lay)
    for gc, w in zip(t._tbl.tblGrid.findall(qn("w:gridCol")), widths): gc.set(qn("w:w"), str(int(w * 567)))
    for row in t.rows:
        for i, w in enumerate(widths):
            if i < len(row.cells): row.cells[i].width = Cm(w)

def row_h(row, cm, exact=False):
    row.height = Cm(cm); row.height_rule = WD_ROW_HEIGHT_RULE.EXACTLY if exact else WD_ROW_HEIGHT_RULE.AT_LEAST

def fill(cell, parts, box=BOXV, center=False, lab=9.5):
    """parts: ("b", t) bold · ("t", t) · ("s", t) small · ("i", t) small italic · ("box", label) ·
    ("line", n) blank · ("br",) new line · ("digits", n) n big digit boxes · ("sep", t) text at digit size"""
    p = para(cell, first=True)
    if center: p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    for part in parts:
        k = part[0]
        if k == "b": run(p, part[1], lab, bold=True)
        elif k == "t": run(p, part[1], lab)
        elif k == "s": run(p, part[1], 8)
        elif k == "i": run(p, part[1], 7.5, italic=True)
        elif k == "box":
            run(p, BOX, box, font="Segoe UI Symbol")
            if part[1]: run(p, " " + part[1] + GAP[0], lab)
        elif k == "line": run(p, "_" * part[1] + " ", lab)
        elif k == "digits": run(p, BOX * part[1], DIGIT, font="Segoe UI Symbol")
        elif k == "sep": run(p, part[1], DIGIT - 4)
        elif k == "br":
            p = para(cell)
            if center: p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    return cell

GAP = ["     "]   # the space after an option's label (page 1's echo part uses less)
def B(*labels): return [("box", l) for l in labels]

def table(doc, widths, rows, box=BOXV, label=True, heights=None, lab=9.5, h=0.56):
    t = doc.add_table(rows=len(rows), cols=len(widths)); borders(t); cell_margins(t)
    for ri, row in enumerate(rows):
        tr = t.rows[ri]; row_h(tr, (heights or {}).get(ri, h))
        for ci, parts in enumerate(row):
            fill(tr.cells[ci], parts, box=box, lab=lab)
            if ci == 0 and label: shade(tr.cells[ci])
    fixed(t, widths)
    return t

def heading(doc, text, note="", before=3, after=1, size=10.5):
    p = para(doc); p.paragraph_format.space_before = Pt(before); p.paragraph_format.space_after = Pt(after)
    run(p, text, size, bold=True)
    if note: run(p, "   " + note, 8, italic=True)
    p.paragraph_format.keep_with_next = True
    return p

def spacer(doc, pt=3):
    p = para(doc); p.paragraph_format.space_after = Pt(0); run(p, "", pt); return p

# ---------- the department header (pages 1 and 2) ----------
def letterhead(doc, title):
    t = doc.add_table(rows=1, cols=3); no_borders(t); cell_margins(t, 0.05, 0)
    c0, c1, c2 = t.rows[0].cells
    p = para(c0, True); p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    if os.path.exists(LOGO): p.add_run().add_picture(LOGO, width=Cm(1.3))
    for ln in ("2nd Floor, OPD Building", "LTMGH Hospital", "Sion, Mumbai-22", "Email: ltmghcardio@gmail.com"):
        q = para(c0); run(q, ln, 7)
    for ln, sz, bold, col in (("LOKMANYA TILAK MUNICIPAL MEDICAL COLLEGE &", 8, True, None), ("LOKMANYA TILAK MUNICIPAL GENERAL HOSPITAL", 8, True, None),
                              ("DEPARTMENT OF CARDIOLOGY", 7.5, True, "C00000")):
        q = para(c1); q.alignment = WD_ALIGN_PARAGRAPH.CENTER; run(q, ln, sz, bold=bold, color=col)
    q = para(c1); q.alignment = WD_ALIGN_PARAGRAPH.CENTER; q.paragraph_format.space_before = Pt(6)
    run(q, title, 13 if title.isupper() else 12, bold=True, color="1F3A93" if title.isupper() else None)
    for ln in ("Phone : +91-22-24090446", "+91-22-24076381", "Fax : +91-22-24076100", "(Extn : 3805/3806)"):
        q = para(c2); q.alignment = WD_ALIGN_PARAGRAPH.RIGHT; run(q, ln, 7)
    c0.vertical_alignment = c1.vertical_alignment = c2.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
    fixed(t, [4.6, 9.4, 4.6])
    return t

# ---------- the vessel grid ----------
LESION = ["Plaque", "Calcific", "Thrombotic", "Occlusion", "Discrete", "Tubular", "Diffuse", "Eccentric", "Dissection", "Bridge", "Aneurysm"]
STENT = ["Stent", "NIH", "Well endo­thelized"]
# Segment, Stenosis %, 11 lesion boxes, Stent box, ISR %, NIH box, Well endothelized box, Stent thrombosis %, Stent type — every box column ≈ 0.89 cm, so a tick has room round its box
_BX = (18.6 - (1.6 + 1.05 + 0.95 + 0.95 + 1.6)) / 14
VW = [1.6, 1.05] + [_BX] * 11 + [_BX, 0.95, _BX, _BX, 0.95, 1.6]

def vessel_grid(doc, name, options, segments, branch=None, no_bridge=False, branches=None):
    """options: parts for the vessel's own line (spans the grid; None = no such
    line); segments: row labels; branch / branches: (label, option-parts) — a
    side branch row under its own line"""
    branches = branches or ([branch] if branch else [])
    top = 1 if options is not None else 0
    n_rows = top + 2 + len(segments) + 2 * len(branches)
    t = doc.add_table(rows=n_rows, cols=len(VW)); borders(t); cell_margins(t, 0.03, 0.02)
    if top:
        # row 0: vessel name + its own options
        r0 = t.rows[0]; row_h(r0, 0.7)
        fill(r0.cells[0], [("b", name)], lab=11); shade(r0.cells[0])
        m = r0.cells[1].merge(r0.cells[len(VW) - 1]); fill(m, options)
    # row 1: group headers
    r1 = t.rows[top]; row_h(r1, 0.42, exact=True)
    fill(r1.cells[0], []); shade(r1.cells[0])
    fill(r1.cells[1], [("s", "")]); shade(r1.cells[1])
    g1 = r1.cells[2].merge(r1.cells[12]); fill(g1, [("b", "Lesion")], lab=8.5, center=True); shade(g1)
    g2 = r1.cells[13].merge(r1.cells[18]); fill(g2, [("b", "If stent:")], lab=8.5, center=True); shade(g2)
    # row 2: column titles (vertical for the box columns)
    r2 = t.rows[top + 1]; row_h(r2, 1.95, exact=True)
    heads = ["Segment", "Stenosis %"] + LESION + ["Stent", "ISR %", "NIH", "Well endo-\nthelized", "Stent thrombosis %", "Stent type"]
    for i, h in enumerate(heads):
        c = r2.cells[i]; shade(c)
        if i in (0, 1, 18):
            fill(c, [("b", h.replace("\n", ""))], lab=8, center=True)
        else:
            vertical(c); p = para(c, True); p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run(p, h.replace("\n", ""), 7.5, bold=True); c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    def data_row(r, label):
        row_h(r, 0.95)
        fill(r.cells[0], [("b", label)], lab=9.5); shade(r.cells[0])
        fill(r.cells[1], [("t", "____%")], lab=9, center=True)
        for i in range(2, 13):
            if no_bridge and LESION[i - 2] == "Bridge": fill(r.cells[i], [("s", "—")], center=True); shade(r.cells[i], "F7F7F7")
            else: fill(r.cells[i], [("box", "")], center=True)
        fill(r.cells[13], [("box", "")], center=True)
        fill(r.cells[14], [("t", "___%")], lab=9, center=True)
        fill(r.cells[15], [("box", "")], center=True); fill(r.cells[16], [("box", "")], center=True)
        fill(r.cells[17], [("t", "___%")], lab=9, center=True)
        fill(r.cells[18], [], center=True)
    for k, s in enumerate(segments): data_row(t.rows[top + 2 + k], s)
    for bi, br in enumerate(branches):
        at = top + 2 + len(segments) + 2 * bi
        rb = t.rows[at]; row_h(rb, 0.6)
        fill(rb.cells[0], [("b", br[0])], lab=10); shade(rb.cells[0])
        mb = rb.cells[1].merge(rb.cells[len(VW) - 1]); fill(mb, br[1])
        data_row(t.rows[at + 1], br[0])
    fixed(t, VW)
    return t

def notes_lines(doc, n=1, label="Notes"):
    for k in range(n):
        p = para(doc); p.paragraph_format.space_before = Pt(5)
        run(p, (label + " : " if k == 0 else "") + "_" * (96 if k == 0 else 104), 9.5)

# ---------- the pages ----------
# ---------- page 1 = the v2.7 page above "Echocardiogram" + the echo part as tables ----------
# The original page 1 has no Word source: its top half (and the left-margin
# checklist down to "Consent") is taken from CAG_Proforma_v2_7.pdf as it is,
# and the echo, RWMA and blood sections below it are generated here and drawn
# into the same page (compose_page1).
P1_SRC = os.path.join(HERE, "CAG_Proforma_v2_7.pdf")
P1_CUT = 556.5       # pt from the top: just above the "Echocardiogram :" heading
P1_STRIP = (0, 79, 592)   # the left-margin checklist strip (x0, x1, down to y pt from the top) — "Consent" ends at 585
P1_LEFT, P1_RIGHT = 81.1, 478.0   # the page's content column, pt

def page1_bottom(doc):
    GAP[0] = "   "
    w = (P1_RIGHT - P1_LEFT) / 28.3465          # cm
    heading(doc, "Echocardiogram :", before=0)
    t = doc.add_table(rows=3, cols=6); borders(t); cell_margins(t)
    for r, trip in enumerate([("LA", "IVSDd", "LVIDd"), ("Aorta", "PWDd", "LVIDs"), ("PASP", "RA/RV", "LVEF")]):
        row_h(t.rows[r], 0.43, exact=True)
        for k, lab in enumerate(trip):
            fill(t.rows[r].cells[2 * k], [("b", lab)], lab=9); shade(t.rows[r].cells[2 * k])
            fill(t.rows[r].cells[2 * k + 1], [("t", "%" if lab == "LVEF" else "")], lab=9)
    a = (w - 3 * 1.6) / 3
    fixed(t, [1.6, a, 1.6, a, 1.6, a])
    spacer(doc, 2)
    vt = doc.add_table(rows=4, cols=8); borders(vt); cell_margins(vt, 0.03)
    heads = ["", "MR", "MS", "MVA", "AS", "AR", "TR", "Revised LVEF"]
    for i, h in enumerate(heads):
        fill(vt.rows[0].cells[i], [("b", h)], lab=8.5, center=True); shade(vt.rows[0].cells[i])
    row_h(vt.rows[0], 0.42)
    for r, sev in enumerate(["Mild", "Moderate", "Severe"]):
        tr = vt.rows[r + 1]; row_h(tr, 0.68, exact=True)
        fill(tr.cells[0], [("b", sev)], lab=8.5); shade(tr.cells[0])
        for i in range(1, 7):
            if heads[i] == "MVA": fill(tr.cells[i], [("t", "____ sq cm")] if r == 0 else [], lab=8, center=True)
            else: fill(tr.cells[i], [("box", "")], box=18, center=True)
    m = vt.rows[1].cells[7].merge(vt.rows[3].cells[7]); fill(m, [("line", 5), ("t", " %"), ("br",), ("br",), ("line", 14)], lab=9)
    c = (w - 1.75 - 2.3 - 3.6) / 5
    fixed(vt, [1.75, c, c, 2.3, c, c, c, 3.6])
    spacer(doc, 2)
    table(doc, [1.6, w - 1.6], [
        [[("b", "RWMA")], B("No", "A / AL / AS", "I / IL / IS", "GLVH", "Apical")],
        [[("b", "Diastology")], [("t", "DD grade "), ("line", 5), ("t", "      AVPG "), ("line", 5), ("t", " mmHg")]],
    ], box=BOX1, lab=9, h=0.5)
    heading(doc, "Blood Investigation :", before=2)
    t = doc.add_table(rows=5, cols=6); borders(t); cell_margins(t)
    cols = [("Hb", "TLC", "Platelets", "TC", ""), ("BUN", "Sr. Creat", "Sr. Na/K", "TG", ""), ("HIV", "HBsAg", "HCV", "RBS/FBS", "LDL")]
    for r in range(5):
        row_h(t.rows[r], 0.43, exact=True)
        for k in range(3):
            lab = cols[k][r]
            fill(t.rows[r].cells[2 * k], [("b", lab)] if lab else [], lab=9)
            if lab: shade(t.rows[r].cells[2 * k])
            fill(t.rows[r].cells[2 * k + 1], [])
    fixed(t, [1.6, a, 1.6, a, 1.6, a])

def build_page1_bottom(out):
    doc = Document(); sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.left_margin = Cm(P1_LEFT / 28.3465); sec.right_margin = Cm((595.3 - P1_RIGHT) / 28.3465)
    sec.top_margin = Cm(P1_CUT / 28.3465); sec.bottom_margin = Cm(0.75); sec.footer_distance = Cm(0.45)
    st = doc.styles["Normal"]; st.font.name = FONT; st.font.size = Pt(9.5)
    st.paragraph_format.space_after = Pt(0); st.paragraph_format.space_before = Pt(0)
    if doc.paragraphs: doc.paragraphs[0]._p.getparent().remove(doc.paragraphs[0]._p)
    p = sec.footer.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER; run(p, "Page 1 of 4", 9)
    page1_bottom(doc)
    doc.save(out)

def compose_page1(bottom_pdf, out_pdf):
    """the bottom page with the original page's top half (and margin strip) drawn in, clipped"""
    import pikepdf
    dst = pikepdf.open(bottom_pdf); src = pikepdf.open(P1_SRC)
    page = dst.pages[0]
    fx = dst.copy_foreign(src.pages[0].as_form_xobject())
    res = page.obj.get("/Resources") or pikepdf.Dictionary()
    if "/XObject" not in res: res["/XObject"] = pikepdf.Dictionary()
    res["/XObject"]["/OrigTop"] = fx; page.obj["/Resources"] = res
    H = 841.89; x0, x1, ybot = P1_STRIP
    clip = ("q 0 %.2f 595.3 %.2f re %.2f %.2f %.2f %.2f re W n /OrigTop Do Q\n" %
            (H - P1_CUT, P1_CUT, x0, H - ybot, x1 - x0, ybot - P1_CUT)).encode()
    page.contents_add(dst.make_stream(clip), prepend=False)
    dst.save(out_pdf)

def page2(doc):
    letterhead(doc, "Angiogram")
    spacer(doc, 4)
    table(doc, [3.0, 15.6], [
        [[("b", "CAG No")], [("line", 24)]],
        [[("b", "Catheter")], B("Right", "Left", "Femoral", "Radial") + [("line", 40)]],
        [[("b", "Performed by")], [("t", "Dr "), ("line", 26), ("i", "  (Cardiology registrar)"), ("br",), ("t", "Dr "), ("line", 26), ("i", "  (Cardiology registrar)")]],
        [[("b", "Supervised by")], [("t", "Dr. P. J. Nathani (Professor & Head)")]],
    ], box=BOXV)
    spacer(doc, 6)
    vessel_grid(doc, "Lt. Main", B("Normal", "Short", "Separate LAD LCx origin", "Anterior dot", "Posterior dot", "Eye sign") +
                [("br",)] + B("Anomalous origin from") + [("line", 16)], ["Ostial", "Distal"], no_bridge=True)
    notes_lines(doc, 1)
    spacer(doc, 6)
    vessel_grid(doc, "LAD", [("t", "Type ")] + B("I", "II", "III") + [("t", "     TIMI ")] + B("I", "II", "III") + [("t", "flow")],
                ["Ostial", "Proximal", "Mid", "Distal"],
                branch=("Diagonal", B("Major", "Minor", "Normal")))
    notes_lines(doc, 2)

def page3(doc):
    vessel_grid(doc, "LCx", B("Dominant", "Non dominant", "Co-dominant") + [("t", "  TIMI ")] + B("I", "II", "III") + [("t", "flow"), ("br",)] +
                B("Normal origin", "Anomalous origin from") + [("line", 16)],
                ["Ostial", "Proximal", "Mid", "Distal"], branch=("OM", B("Major", "Minor", "Normal")))
    notes_lines(doc, 2)
    spacer(doc, 8)
    vessel_grid(doc, "RCA", B("Dominant", "Non dominant", "Co-dominant") + [("t", "  TIMI ")] + B("I", "II", "III") + [("t", "flow"), ("br",)] +
                B("Normal origin", "Anomalous origin from") + [("line", 16)],
                ["Ostial", "Proximal", "Mid", "Distal"])
    notes_lines(doc, 2)

def branch_table(doc, rows):
    """PDA / PLV / ramus — each one row of the vessel grid under its own line"""
    vessel_grid(doc, rows[0], B("Major", "Minor", "Normal"), [rows[0]])

def page4(doc):
    heading(doc, "PDA, PLV & Ramus :", before=0)
    vessel_grid(doc, "", None, [], branches=[(nm, B("Major", "Minor", "Normal")) for nm in ("PDA", "PLV", "Ramus")])
    notes_lines(doc, 2)
    heading(doc, "Collaterals, grafts & renals :", before=6)
    table(doc, [2.9, 15.7], [
        [[("b", "Rentrop grade")], B("0", "1", "2", "3")],
        [[("b", "Collaterals")], [("t", "to ")] + B("LAD", "LCx", "RCA") + [("t", "      from ")] + B("LAD", "LCx", "RCA")],
        [[("b", "Grafts")], [("t", "LIMA ")] + B("Normal") + [("t", "  RIMA ")] + B("Normal") + [("t", "  Grafts "), ("line", 34)]],
        [[("b", "Left renal")], B("Normal") + [("t", "Ostial "), ("line", 5), ("t", "% stenosis   ")] + B("Stent")],
        [[("b", "Right renal")], B("Normal") + [("t", "Ostial "), ("line", 5), ("t", "% stenosis   ")] + B("Stent")],
    ], box=BOXV)
    heading(doc, "Final Diagnosis & Plan :", before=6)
    table(doc, [2.9, 15.7], [
        [[("b", "Final diagnosis")], B("LM", "LAD", "D1", "LCx", "OM", "RCA", "PDA", "PLV", "Ramus") + [("br",)] + B("Non obstructive CAD", "Non-anginal chest pain")],
        [[("b", "Plan")], B("MMM") + [("t", "  PTCA to ")] + B("LM", "LAD", "D1", "LCx", "OM", "RCA", "Ramus") + [("br",), ("t", "with ")] + B("IVUS", "Rota", "CABG", "DCB")],
        [[("b", "Advice")], [("t", "Continued medical management. Aggressive control of risk factors.")]],
    ], box=BOXV)
    p = para(doc); p.paragraph_format.space_before = Pt(6); run(p, "Duplicate report won’t be issued", 9, italic=True)

def footer(section):
    p = section.footer.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run(p, "Page ", 9)
    for instr in ("PAGE",):
        r = p.add_run(); f1 = OxmlElement("w:fldChar"); f1.set(qn("w:fldCharType"), "begin"); r._r.append(f1)
        r2 = p.add_run(); it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = instr; r2._r.append(it)
        r3 = p.add_run(); f2 = OxmlElement("w:fldChar"); f2.set(qn("w:fldCharType"), "end"); r3._r.append(f2)
        for rr in (r, r2, r3): rr.font.size = Pt(9); rr.font.name = FONT
    run(p, " of 4", 9)

def page_break(doc):
    p = para(doc); p.paragraph_format.page_break_before = True; return p

def build(out):
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(1.2); sec.top_margin = Cm(1.0); sec.bottom_margin = Cm(1.1)
    sec.footer_distance = Cm(0.5); sec.header_distance = Cm(0.4)
    pg = OxmlElement("w:pgNumType"); pg.set(qn("w:start"), "2"); sec._sectPr.append(pg)     # these are pages 2–4
    st = doc.styles["Normal"]; st.font.name = FONT; st.font.size = Pt(9.5)
    st.paragraph_format.space_after = Pt(0); st.paragraph_format.space_before = Pt(0)
    if doc.paragraphs: doc.paragraphs[0]._p.getparent().remove(doc.paragraphs[0]._p)
    footer(sec)
    page2(doc)
    page_break(doc); page3(doc)
    page_break(doc); page4(doc)
    doc.save(out); print("wrote", out)

def build_pdf():
    """CAG_Proforma_v3_0.pdf: the composed page 1 + pages 2–4 (then add_markers.py)"""
    import subprocess, pypdf
    d24 = os.path.join(HERE, "CAG_Proforma_v3_0_p2-4.docx"); b1 = os.path.join(HERE, "_cag_p1_bottom.docx")
    build(d24); build_page1_bottom(b1)
    for f in (d24, b1): subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", HERE, f], check=True, capture_output=True)
    p1 = os.path.join(HERE, "_cag_p1.pdf"); compose_page1(b1.replace(".docx", ".pdf"), p1)
    w = pypdf.PdfWriter()
    for f in (p1, d24.replace(".docx", ".pdf")):
        for pg in pypdf.PdfReader(f).pages: w.add_page(pg)
    out = os.path.join(HERE, "CAG_Proforma_v3_0.pdf"); w.write(out)
    for f in (b1, b1.replace(".docx", ".pdf"), p1): os.remove(f)
    print("wrote", out, len(w.pages), "pages")

if __name__ == "__main__":
    build_pdf()
