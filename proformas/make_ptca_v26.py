"""PTCA proforma v2.6: page 3's "PTCA to" box rows become a grid (vessel ×
segment), and a second grid of the same shape below it, "POBA to", for
segments treated with balloon angioplasty alone — so one case can record
"PTCA to vessel segment x and y and vessel a, POBA to vessel segment z".

  python3 make_ptca_v26.py  → PTCA_Proforma_v2_6.docx (+ _example with ticks)
"""
import copy
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_ROW_HEIGHT_RULE, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.text.paragraph import Paragraph

SRC = "PTCA_Proforma_v2_5.docx"
BOX, TICK = "☐", "☒"
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
    """kind "PTCA" or "POBA"; ticks = set of "Vessel:Segment" / "Vessel:Other" ticked in the example"""
    t = doc.add_table(rows=1 + len(ROWS), cols=6); borders(t)
    widths = [1.4, 1.7, 2.6, 2.9, 3.2, 6.8]
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
            run(p, TICK if on else BOX, 13, font="Segoe UI Symbol", color=INK if on else None)
            if lab: run(p, " " + lab, 7.5, italic=True)
        c = row.cells[5]; p = c.paragraphs[0]; p.paragraph_format.space_after = Pt(0)
        for o in other:
            on = (v + ":" + o) in ticks
            run(p, (TICK if on else BOX) + " ", 12, font="Segoe UI Symbol", color=INK if on else None)
            run(p, o.replace(" ", " ") + "   ", 9)
    t.autofit = False
    lay = OxmlElement("w:tblLayout"); lay.set(qn("w:type"), "fixed"); t._tbl.tblPr.append(lay)
    for gc, w in zip(t._tbl.tblGrid.findall(qn("w:gridCol")), widths): gc.set(qn("w:w"), str(int(w * 567)))
    for row in t.rows:
        for i, w in enumerate(widths): row.cells[i].width = Cm(w)
    return t


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
    # "POBA to :" heading and its grid
    hp = copy.deepcopy(first._p); t1._tbl.addnext(hp)
    h = Paragraph(hp, first._parent)
    for r in h.runs: r._r.getparent().remove(r._r)
    h.paragraph_format.space_before = Pt(6); h.paragraph_format.space_after = Pt(2)
    run(h, "POBA to :", bold=True)
    run(h, "   plain balloon angioplasty, no stent", 8, italic=True)
    t2 = grid(d, "POBA", set(poba_ticks))
    hp.addnext(t2._tbl)
    sp = OxmlElement("w:p"); t2._tbl.addnext(sp)
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
    d.save(out)
    print("wrote", out)


if __name__ == "__main__":
    build("PTCA_Proforma_v2_6.docx")
    # the example: PTCA to proximal-mid LAD and the RCA (ostial), POBA to the D1
    build("PTCA_Proforma_v2_6_example.docx",
          ptca_ticks=["LAD:Proximal", "LAD:Mid", "RCA:Ostial"], poba_ticks=["LAD:D1"])
