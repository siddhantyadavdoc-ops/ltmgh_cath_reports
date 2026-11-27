"""PTCA proforma v2.7 (was the v2.6 grid draft, now built on the released
v2.6 so it keeps page 1's "PTCA date (not CAG)" label): page 3's "PTCA to" box rows become a grid (vessel ×
segment), and a second grid of the same shape below it, "POBA to", for
segments treated with balloon angioplasty alone — so one case can record
"PTCA to vessel segment x and y and vessel a, POBA to vessel segment z".

  python3 make_ptca_v27.py  → PTCA_Proforma_v2_7.docx (+ _example with ticks)
  then: soffice --headless --convert-to pdf PTCA_Proforma_v2_7.docx
        python3 add_markers.py PTCA_Proforma_v2_7.pdf PTCA_Proforma_v2_7.pdf 5   (corner markers)
"""
import copy
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_ROW_HEIGHT_RULE, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.text.paragraph import Paragraph

SRC = "PTCA_Proforma_v2_6.docx"
BOX, TICK = "☐", "☒"
PAGE12_BOX = 18     # pages 1–2 (v2.6 printed them at 16 pt)
BOXPT = 20          # the grids and tables: 20 pt ≈ 5.1 mm (pages 1–2 keep the v2.6 16 pt ≈ 4.1 mm)
INK = RGBColor(0x1F, 0x3F, 0xBF)

SEGS = ["Ostial", "Proximal", "Mid", "Distal"]
# rows: vessel, the four segment cells (label under the box, or None = no box), the "other" boxes
ROWS = [
    ("LM", ["", "Shaft", None, "Distal / bifurcation"], ["LM over LAD", "LM over LCx", "Ramus"]),
    ("LAD", ["", "ex ostium", "beyond D1 / septal", ""], ["LAD over Diagonal", "D1", "D2"]),
    ("LCx", ["", "", "", ""], ["LCx over OM", "OM1", "OM2"]),
    ("RCA", ["", "", "", ""], ["PDA", "PLV"]),
]


def run(p, t, size=10, bold=False, font=None, color=None, italic=False):
    r = p.add_run(t); r.font.size = Pt(size); r.bold = bold or None; r.italic = italic or None
    if font:
        r.font.name = font
        rf = r._r.get_or_add_rPr().get_or_add_rFonts(); rf.set(qn("w:eastAsia"), font); rf.set(qn("w:cs"), font)
    if color is not None: r.font.color.rgb = color
    return r


def borders(t):
    b = OxmlElement("w:tblBorders")
    for e in ("top", "left", "bottom", "right", "insideH", "insideV"):
        x = OxmlElement("w:" + e); x.set(qn("w:val"), "single"); x.set(qn("w:sz"), "4"); x.set(qn("w:space"), "0"); x.set(qn("w:color"), "000000")
        b.append(x)
    t._tbl.tblPr.append(b)


def grid(doc, kind, ticks):
    """kind "PTCA" or "DEB"; ticks = set of "Vessel:Segment" / "Vessel:Other" ticked in the example"""
    t = doc.add_table(rows=1 + len(ROWS), cols=6); borders(t)
    widths = [1.3, 1.6, 2.6, 3.3, 3.2, 6.6]
    head = ["", "Ostial", "Proximal", "Mid", "Distal", "Branch / over"]
    for i, h in enumerate(head):
        p = t.rows[0].cells[i].paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0); run(p, h, 9, bold=True)
    for ri, (v, segs, other) in enumerate(ROWS):
        row = t.rows[ri + 1]
        row.height = Cm(0.5); row.height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST
        p = row.cells[0].paragraphs[0]; p.paragraph_format.space_after = Pt(0); run(p, v, 10, bold=True)
        for si, lab in enumerate(segs):
            c = row.cells[si + 1]; c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            p = c.paragraphs[0]; p.paragraph_format.space_after = Pt(0); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            if lab is None:
                run(p, "—", 9, color=RGBColor(0x99, 0x99, 0x99)); continue
            on = (v + ":" + SEGS[si]) in ticks
            run(p, TICK if on else BOX, BOXPT, font="Segoe UI Symbol", color=INK if on else None)
            if lab: run(p, " " + lab, 7.5, italic=True)
        c = row.cells[5]; p = c.paragraphs[0]; p.paragraph_format.space_after = Pt(0)
        for o in other:
            on = (v + ":" + o) in ticks
            run(p, (TICK if on else BOX) + " ", BOXPT, font="Segoe UI Symbol", color=INK if on else None)
            run(p, o.replace(" ", " ") + "   ", 9)
    t.autofit = False
    lay = OxmlElement("w:tblLayout"); lay.set(qn("w:type"), "fixed"); t._tbl.tblPr.append(lay)
    for gc, w in zip(t._tbl.tblGrid.findall(qn("w:gridCol")), widths): gc.set(qn("w:w"), str(int(w * 567)))
    for row in t.rows:
        for i, w in enumerate(widths): row.cells[i].width = Cm(w)
    return t


# ---- 13.62: the technique checklists as tables, in the style of the grids ----
GREY = "EDEDED"

def shade(cell, fill=GREY):
    tcPr = cell._tc.get_or_add_tcPr(); sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear"); sh.set(qn("w:color"), "auto"); sh.set(qn("w:fill"), fill); tcPr.append(sh)

def fill_cell(cell, parts, center=False):
    """parts: list of ("b", text) bold, ("t", text), ("i", text) small italic,
    ("box", label) a box with its label, ("line", n) a blank of n underscores,
    ("br",) a new line in the same cell"""
    p = cell.paragraphs[0]; p.paragraph_format.space_after = Pt(0); p.paragraph_format.space_before = Pt(0)
    if center: p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    for part in parts:
        k = part[0]
        if k == "b": run(p, part[1], 9.5, bold=True)
        elif k == "hb": run(p, part[1], 8.5, bold=True)
        elif k == "t": run(p, part[1], 9)
        elif k == "i": run(p, part[1], 7.5, italic=True)
        elif k == "box":
            run(p, BOX, BOXPT, font="Segoe UI Symbol")
            if part[1]: run(p, " " + part[1] + "   ", 9)
        elif k == "line": run(p, "_" * part[1] + " ", 9)
        elif k == "br":
            p = cell.add_paragraph(); p.paragraph_format.space_after = Pt(0); p.paragraph_format.space_before = Pt(0)
            if center: p.alignment = WD_ALIGN_PARAGRAPH.CENTER

def table(doc, widths, rows, head=None, label_col=True):
    """rows: list of rows, each a list of cell part-lists; head: list of header texts"""
    n = len(rows) + (1 if head else 0)
    t = doc.add_table(rows=n, cols=len(widths)); borders(t)
    r0 = 0
    if head:
        for i, h in enumerate(head):
            c = t.rows[0].cells[i]; fill_cell(c, [("hb", h)] if h else [], center=True); shade(c)
        r0 = 1
    for ri, row in enumerate(rows):
        tr = t.rows[r0 + ri]; tr.height = Cm(0.55); tr.height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST
        for ci, parts in enumerate(row):
            c = tr.cells[ci]
            fill_cell(c, parts, center=(ci > 0 and all(x[0] == "box" and not x[1] for x in parts) and bool(parts)))
            if ci == 0 and label_col: shade(c)
    t.autofit = False
    lay = OxmlElement("w:tblLayout"); lay.set(qn("w:type"), "fixed"); t._tbl.tblPr.append(lay)
    for gc, w in zip(t._tbl.tblGrid.findall(qn("w:gridCol")), widths): gc.set(qn("w:w"), str(int(w * 567)))
    for row in t.rows:
        for i, w in enumerate(widths): row.cells[i].width = Cm(w)
    return t

def heading_before(par, text, note=""):
    """turn the paragraph into a bold section heading (its old text goes)"""
    for r in list(par.runs): r._r.getparent().remove(r._r)
    for br in par._p.findall(".//" + qn("w:br")): br.getparent().remove(br)
    par.paragraph_format.space_before = Pt(5); par.paragraph_format.space_after = Pt(2)
    run(par, text, 10, bold=True)
    if note: run(par, "   " + note, 8, italic=True)

def find(doc, prefix, after=0):
    return [q for n, q in enumerate(doc.paragraphs) if n >= after and q.text.lstrip().startswith(prefix)][0]

def drop(par): par._p.getparent().remove(par._p)

BOXES = lambda *labels: [("box", l) for l in labels]
SUPPORT4 = ["Buddy wire", "Deep engagement", "Balloon anchor", "Guide extension"]

def technique_tables(d):
    # Strategy + overlapping stents (page 3)
    p = find(d, "☐ Predilate"); heading_before(p, "Strategy :")
    t = table(d, [3.4, 15.2], [
        [[("b", "Sequence")], BOXES("PrD → Stent → PoD", "Stenting → PoD", "Direct stenting", "PrD → Stent")],
        [[("b", "Overlapping stents")], [("t", "How many "), ("line", 4), ("t", "   ")] + BOXES("Distal first", "Prox first") + [("t", "  Vessel ")] + BOXES("LAD", "LCx", "RCA")],
    ])
    p._p.addnext(t._tbl)
    drop(find(d, "Overlapping stents"))
    # Wiring (page 3)
    p = find(d, "Wiring technique"); heading_before(p, "Wiring :")
    t = table(d, [3.4, 15.2], [
        [[("b", "Technique")], BOXES("Simple", "Parallel", "Reverse loop", "IVUS guided", "Balloon blocking")],
        [[("b", "Support")], BOXES("Balloon support", "Microcatheter support", "Grenadoplasty", "Carlino", "HDR", "STAR")],
    ])
    p._p.addnext(t._tbl)
    wir_head, wir_tbl = p, t          # placed on page 4, above Balloon & stent (below)
    drop(find(d, "Support (For wire)"))
    # the rule between wire support and the balloon rows
    ps = d.paragraphs; stop = [n for n, q in enumerate(ps) if q.text.startswith("Support (For Pre balloon)")][0]
    for q in reversed(ps[:stop]):              # the nearest one above the balloon rows
        if q.text.strip().startswith("_____") and len(q.text.strip()) > 60: drop(q); break
        if q.text.strip(): break                 # never reach past the wiring section
    # Balloon & stent: technique and support per step (page 3)
    p = find(d, "Support (For Pre balloon)"); heading_before(p, "Balloon & stent :", "technique, and the support used at each step")
    t = table(d, [2.3, 8.3, 2.0, 2.0, 2.0, 2.0], [
        [[("b", "Pre balloon")], [("t", "Predilation ")] + BOXES("Simple", "Sequential") + [("line", 8)], [("box", "")], [("box", "")], [("box", "")], [("box", "")]],
        [[("b", "Stent")], [("t", "Position ")] + BOXES("Floating wire", "Szabo") + [("line", 6)], [("box", "")], [("box", "")], [("box", "")], [("box", "")]],
        [[("b", "Post balloon")], [("t", "Post dilation ")] + BOXES("Simple", "Differential", "POT"), [("box", "")], [("box", "")], [("box", "")], [("box", "")]],
    ], head=["Step", "Technique", "Buddy wire", "Deep engagement", "Balloon anchor", "Guide extension"])
    for pre in ("Predilation:", "Support (For Stent)", "Stent position", "Support (For Post balloon)", "Post dilation"):
        drop(find(d, pre))
    bal_head, bal_tbl = p, t          # placed on page 4, above Bifurcation (below)
    # Bifurcation (page 4)
    p = find(d, "Bif techniques")
    p._p.addprevious(wir_head._p); wir_head._p.addnext(wir_tbl._tbl)
    p._p.addprevious(bal_head._p); bal_head._p.addnext(bal_tbl._tbl)
    heading_before(p, "Bifurcation :")
    t1 = table(d, [3.4, 15.2], [
        [[("b", "Technique")], BOXES("Provisional", "Provisional switched to true bif") + [("br",)] + BOXES("DK crush", "Mini crush", "Culotte", "T stenting", "TAP", "Direct crush", "JSBT")],
    ])
    vessels = ["LM", "LAD", "LCx", "Diagonal", "OM", "PDA", "PLV"]
    t2 = table(d, [3.4] + [15.2 / 7] * 7, [
        [[("b", "Main branch")]] + [[("box", "")] for _ in vessels],
        [[("b", "Side branch")]] + [[("box", "")] for _ in vessels],
    ], head=["Vessels"] + vessels)
    t3 = table(d, [3.4, 15.2], [
        [[("b", "Recross / POT")], [("t", "Recross wire 1 "), ("line", 18), ("t", "  2 "), ("line", 18), ("t", "   POT ")] + BOXES("1", "2")],
    ])
    p._p.addnext(t1._tbl); t1._tbl.addnext(t2._tbl); t2._tbl.addnext(t3._tbl)
    for pre in ("Bifurcation vessels", "Recross wire"): drop(find(d, pre))
    # Thrombus management (page 4)
    p = find(d, "Thrombus Mx"); heading_before(p, "Thrombus management :")
    t = table(d, [3.4, 15.2], [
        [[("b", "Aspiration via")], BOXES("Thrombus catheter", "Guide extension", "Guide catheter") + [("t", "   Runs "), ("line", 5)]],
        [[("b", "Balloon")], BOXES("Dottering", "Inflation")],
        [[("b", "Laser")], BOXES("ELCA")],
        [[("b", "Result")], [("t", "TIMI "), ("line", 5), ("t", " flow achieved   or   ")] + BOXES("Failed to restore flow")],
    ])
    p._p.addnext(t._tbl)
    # Calcium management (page 4)
    p = find(d, "Calcium Mx"); heading_before(p, "Calcium management :")
    # the rows the app reports in full (cutting balloon with dissection; Rota
    # burr, rpm, runs, polishing; ELCA with contrast and its settings)
    t = table(d, [3.4, 15.2], [
        [[("b", "Cutting balloon")], [("box", ""), ("t", " Size & brand "), ("line", 22), ("t", "    ")] + BOXES("Dissection")],
        [[("b", "Rotablation")], [("box", ""), ("t", " Burr "), ("line", 5), ("t", " mm    RPM "), ("line", 8), ("t", "    Runs "), ("line", 4), ("t", "    ")] + BOXES("Polishing run")],
        [[("b", "Laser")], BOXES("ELCA", "With contrast") + [("t", "Runs "), ("line", 4), ("t", "   Fluence "), ("line", 4), ("t", "   Hz "), ("line", 4), ("t", "   ns "), ("line", 4)]],
        [[("b", "IVL")], [("box", ""), ("t", " Balloon size & brand "), ("line", 20), ("t", "    Pulses "), ("line", 6)]],
        [[("b", "OPN balloon")], [("box", ""), ("t", " Size "), ("line", 12), ("t", "   atm "), ("line", 5), ("t", "   used for  ")] + BOXES("Predilation", "Postdilation")],
    ])
    p._p.addnext(t._tbl)


def build(out, ptca_ticks=(), poba_ticks=()):
    d = Document(SRC)
    ps = d.paragraphs
    i = [k for k, p in enumerate(ps) if p.text.startswith("PTCA to")][0]
    first, rest = ps[i], ps[i + 1:i + 4]          # the heading row and the three box rows below it
    assert all("☐" in p.text for p in rest), [p.text for p in rest]
    anchor = first._p
    for p in rest: p._p.getparent().remove(p._p)
    # "PTCA to :" heading, kept bold as before
    for r in first.runs[1:]: r._r.getparent().remove(r._r)
    first.runs[0].text = "PTCA to :"
    run(first, "   stent(s) implanted — tick every segment covered", 8, italic=True)
    first.paragraph_format.space_after = Pt(2)
    t1 = grid(d, "PTCA", set(ptca_ticks))
    anchor.addnext(t1._tbl)
    # "DEB to :" heading and its grid (drug-eluting balloon), the same shape
    hp = copy.deepcopy(first._p); t1._tbl.addnext(hp)
    h = Paragraph(hp, first._parent)
    for r in h.runs: r._r.getparent().remove(r._r)
    h.paragraph_format.space_before = Pt(6); h.paragraph_format.space_after = Pt(2)
    run(h, "DEB to :", bold=True)
    run(h, "   drug-eluting balloon \u2014 tick every segment treated", 8, italic=True)
    t2 = grid(d, "DEB", set(poba_ticks))
    hp.addnext(t2._tbl)
    # "POBA to :" — one line the residents write the segment on
    pp = copy.deepcopy(first._p); t2._tbl.addnext(pp)
    pb = Paragraph(pp, first._parent)
    for r in pb.runs: r._r.getparent().remove(r._r)
    pb.paragraph_format.space_before = Pt(8); pb.paragraph_format.space_after = Pt(2)
    run(pb, "POBA to :  ", bold=True)
    run(pb, "_" * 46, 11)
    run(pb, "   plain balloon angioplasty, no stent \u2014 write the segment, e.g. mid LAD", 8, italic=True)
    # tighter spacing on page 3 below the Technician line, so the page keeps all its rows
    allp = d.paragraphs
    a0 = [n for n, q in enumerate(allp) if q.text.startswith("Technician")][0]
    a1 = [n for n, q in enumerate(allp) if q.text.startswith("Post dilation")][0]
    for q in allp[a0 + 1:a1 + 1]:
        if q.text.strip():
            q.paragraph_format.space_before = Pt(2); q.paragraph_format.space_after = Pt(3)
    # the blank lines above the strategy boxes: keep one
    allp = d.paragraphs
    k = [n for n, q in enumerate(allp) if q.text.startswith("\u2610 Predilate")][0]
    n = k - 1
    while n > 0 and not allp[n].text.strip() and not allp[n].text.startswith("Technician") and n > a0 + 1:
        allp[n]._p.getparent().remove(allp[n]._p); n -= 1
    technique_tables(d)
    # page 2's QRS / ST-T line: shorter blanks, so the bigger boxes keep it on one line
    for q in d.paragraphs:
        if q.text.startswith("QRS / ST-T"):
            for r in q.runs:
                if "______" in r.text: r.text = r.text.replace("______", "____")
    # pages 1–2: the v2.6 boxes from 16 pt up to PAGE12_BOX (only where a box is its own run)
    stop = [n for n, q in enumerate(d.paragraphs) if q.text.startswith("CAG Reference")][0]
    for q in d.paragraphs[:stop]:
        for r in q.runs:
            if r.text.strip() and set(r.text.strip()) <= {BOX} and r.font.size and r.font.size.pt == 16: r.font.size = Pt(PAGE12_BOX)
    for t in d.tables:
        for row in t.rows:
            for c in row.cells:
                for q in c.paragraphs:
                    for r in q.runs:
                        if r.text.strip() and set(r.text.strip()) <= {BOX} and r.font.size and r.font.size.pt == 16: r.font.size = Pt(PAGE12_BOX)
    # page 4 starts on its own page: the blank lines that used to pad page 3
    # down to its end are replaced by a page break before page 4's Name line
    # (page 3 is taller now, so the padding spilled onto page 4)
    allp = d.paragraphs
    pd = [n for n, q in enumerate(allp) if q.text.startswith("POBA to")][0]
    nm = [n for n, q in enumerate(allp) if n > pd and q.text.startswith("Name")][0]
    for q in allp[pd + 1:nm]:
        if not q.text.strip(): q._p.getparent().remove(q._p)
    allp[nm].paragraph_format.page_break_before = True
    # page 4 is fuller now (Wiring and Balloon & stent moved there): keep one blank line above Complications
    allp = d.paragraphs
    ca = [n for n, q in enumerate(allp) if q.text.startswith("Calcium management")][0]
    co = [n for n, q in enumerate(allp) if q.text.startswith("Complications")][0]
    blanks = [q for q in allp[ca + 1:co] if not q.text.strip()]
    for q in blanks[1:]: q._p.getparent().remove(q._p)
    d.save(out)
    print("wrote", out)


if __name__ == "__main__":
    build("PTCA_Proforma_v2_7.docx")
    # the example: PTCA to proximal-mid LAD and the RCA (ostial), DEB to the D1
    build("PTCA_Proforma_v2_7_example.docx",
          ptca_ticks=["LAD:Proximal", "LAD:Mid", "RCA:Ostial"], poba_ticks=["LAD:D1"])
