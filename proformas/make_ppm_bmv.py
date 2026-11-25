"""PPM (permanent pacemaker) and BMV (balloon mitral valvuloplasty) proformas,
in the department's PTCA proforma style: the same letterhead, crest and
left-margin approval column on page 1, Times New Roman with Segoe UI Symbol
tick boxes and comb boxes, a printed footer "PPM — Page N of 3" on every page
(the scanner sorts pages by it).

  python3 make_ppm_bmv.py [PTCA_Proforma_v2_5.docx]

writes PPM_Proforma_v1.docx, BMV_Proforma_v1.docx (blank, to print) and
PPM_Proforma_v1_example.docx, BMV_Proforma_v1_example.docx (filled in blue
with a made-up patient, to show how a completed sheet reads).

Case number: xxxx/PPM-aaa/YYYY (cath serial no. / PPM no. / year) and
xxxx/BMV-aaa/YYYY."""
import copy, sys
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_SECTION
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

SRC = sys.argv[1] if len(sys.argv) > 1 else "PTCA_Proforma_v2_5.docx"
BOX = "☐"          # ☐
TICK = "☒"         # ☒ — a ticked box in the examples
INK = RGBColor(0x1F, 0x3F, 0xBF)
VALS = {}               # the example's values; empty = blank form


# ------------------------------------------------------------ run helpers
def run(p, text, bold=False, size=None, italic=False, font=None, color=None, underline=False):
    r = p.add_run(text)
    r.bold = bold or None
    r.italic = italic or None
    if size: r.font.size = Pt(size)
    if font:
        r.font.name = font
        r._r.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), font)
        r._r.get_or_add_rPr().get_or_add_rFonts().set(qn("w:cs"), font)
    if color is not None: r.font.color.rgb = color
    if underline: r.underline = True
    return r


def ink(p, text):
    return run(p, text, italic=True, color=INK, underline=True)


def para(cont, parts, after=3, before=0, size=None, align=None):
    p = cont.add_paragraph()
    pf = p.paragraph_format
    pf.space_after = Pt(after); pf.space_before = Pt(before)
    if align: p.alignment = align
    for x in parts: emit(p, x, size)
    return p


def emit(p, x, size=None):
    if isinstance(x, str):
        run(p, x, size=size); return
    k = x[0]
    if k == "b":                         # bold label
        run(p, x[1], bold=True, size=size)
    elif k == "u":                       # bold underlined heading
        r = run(p, x[1], bold=True, size=size); r.underline = True
    elif k == "i":                       # small italic note
        run(p, x[1], italic=True, size=x[2] if len(x) > 2 else 8)
    elif k == "x":                       # a tick box before its label: ("x", label, key)
        key = x[2] if len(x) > 2 else x[1]
        on = VALS.get(key) is True
        run(p, (TICK if on else BOX) + "\u00a0", font="Segoe UI Symbol", size=12, color=INK if on else None)
        run(p, x[1].replace(" ", "\u00a0") if len(x[1]) <= 18 else x[1], size=size)
        run(p, "   ", size=size)
    elif k == "_":                       # a blank: ("_", n, key)
        v = VALS.get(x[2]) if len(x) > 2 else None
        if v not in (None, "", True): ink(p, " " + str(v) + " ")
        else: run(p, "_" * x[1], size=size)
    elif k == "c":                       # comb boxes: ("c", n, key)
        v = VALS.get(x[2]) if len(x) > 2 else None
        if v not in (None, ""):
            s = str(v)
            r = run(p, " ".join(s) + " ", font="Segoe UI Symbol", size=13, color=INK)
        else:
            run(p, BOX * x[1], font="Segoe UI Symbol", size=20)
    elif k == "d":                       # a date comb: ("d", key)
        v = VALS.get(x[1])
        if v: ink(p, " " + v + " ")
        else:
            for i in range(3):
                run(p, BOX * 2, font="Segoe UI Symbol", size=20)
                if i < 2: run(p, "/", font="Segoe UI Symbol", size=16)
            run(p, " DD/MM/YY", size=6)
    elif k == "t":                       # a literal with a size
        run(p, x[1], size=x[2])


def boxes_line(cont, label, items, after=3):
    parts = [("b", label + " :  ")] if label else []
    for it in items:
        if isinstance(it, tuple): parts.append(it)
        elif it.endswith(" ") or it.endswith(": "): parts.append(it)      # literal text
        else: parts.append(("x", it, label + ":" + it if label else it))
    return para(cont, parts, after=after)


def borders(tbl, sz=6):
    tblPr = tbl._tbl.tblPr
    b = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement("w:" + edge)
        e.set(qn("w:val"), "single"); e.set(qn("w:sz"), str(sz)); e.set(qn("w:space"), "0"); e.set(qn("w:color"), "000000")
        b.append(e)
    tblPr.append(b)


def grid(cont, head, rows, widths=None, size=9, height=0.55, keys=None):
    """a bordered table: head = column titles, rows = first-column labels
    (the rest blank, or the example's value at keys[(row, col)])"""
    t = cont.add_table(rows=1 + len(rows), cols=len(head))
    borders(t)
    t.autofit = False
    for i, h in enumerate(head):
        c = t.rows[0].cells[i]
        p = c.paragraphs[0]; p.paragraph_format.space_after = Pt(0)
        run(p, h, bold=True, size=size); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for ri, r in enumerate(rows):
        row = t.rows[ri + 1]
        row.height = Cm(height)
        for ci in range(len(head)):
            c = row.cells[ci]
            p = c.paragraphs[0]; p.paragraph_format.space_after = Pt(0)
            if ci == 0 and r != "": run(p, r, bold=True, size=size)
            else:
                v = VALS.get((keys or "") + ":" + r + ":" + head[ci])
                if v not in (None, ""): run(p, str(v), italic=True, color=INK, size=size)
    if widths:
        for row in t.rows:
            for ci, w in enumerate(widths): row.cells[ci].width = Cm(w)
    return t


def spacer(cont, after=2):
    p = cont.add_paragraph(); p.paragraph_format.space_after = Pt(after)
    return p


# ------------------------------------------------------------ the document shell
def shell():
    d = Document(SRC)
    body = d.element.body
    page1 = copy.deepcopy(d.tables[0]._tbl)          # left column + letterhead
    final = body.find(qn("w:sectPr"))
    for el in list(body):
        if el is not final: body.remove(el)
    # no inherited header/footer parts: each page gets its own footer below
    for ref in final.findall(qn("w:footerReference")) + final.findall(qn("w:headerReference")):
        final.remove(ref)
    body.insert(0, page1)
    t = d.tables[0]
    main = t.rows[0].cells[1]
    # keep the letterhead table only
    for el in list(main._tc):
        if el.tag in (qn("w:p"), qn("w:tbl")) and el is not main._tc.find(qn("w:tbl")):
            main._tc.remove(el)
    return d, t.rows[0].cells[0], main


def left_column(cell, extra):
    """the approval column as on the PTCA form, with this procedure's own
    boxes added at its foot"""
    for txt in extra:
        p = cell.add_paragraph(); p.paragraph_format.space_after = Pt(6)
        if txt.startswith("("):                  # a second line of the label above
            p.paragraph_format.space_before = Pt(-6); run(p, "     " + txt, size=8); continue
        on = VALS.get("L:" + txt) is True
        run(p, (TICK if on else BOX) + " ", font="Segoe UI Symbol", size=12, color=INK if on else None)
        run(p, txt, size=8)


def new_page(d):
    d.add_section(WD_SECTION.NEW_PAGE)


def footers(d, tag, n):
    for i, s in enumerate(d.sections):
        s.footer.is_linked_to_previous = False
        s.header.is_linked_to_previous = False
        f = s.footer.paragraphs[0]
        f.text = ""
        f.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run(f, "%s — Page %d of %d" % (tag, i + 1, n), size=9)


def title(cont, text, sub=None):
    p = para(cont, [], after=2, align=WD_ALIGN_PARAGRAPH.CENTER)
    r = run(p, text, bold=True, size=13); r.font.color.rgb = RGBColor(0, 0, 0xCC); r.underline = True
    if sub: para(cont, [("i", sub, 8)], after=4, align=WD_ALIGN_PARAGRAPH.CENTER)


def case_no(cont, kind):
    """Cath No. : ☐☐☐☐ / PPM- ☐☐☐ / ☐☐☐☐ — the cath serial number, the
    procedure's own number, the year"""
    v = VALS.get("caseNo")
    p = para(cont, [("b", "Cath No. :  ")], after=1)
    if v:
        ink(p, " " + v + " ")
    else:
        emit(p, ("c", 4)); run(p, "  /  ", bold=True, size=13)
        run(p, kind + "-", bold=True, size=13); emit(p, ("c", 3)); run(p, "  /  ", bold=True, size=13)
        emit(p, ("c", 4))
    para(cont, [("i", "cath serial no.  /  %s no.  /  year of the procedure      e.g. 2415/%s-087/2026" % (kind, kind), 7)], after=4)


def notes(d, n=4):
    para(d, [("b", "Clinical notes : "), ("_", 72, "notes")], after=6)
    for i in range(n - 1): para(d, [("_", 96)], after=6)


def header_short(cont, kind):
    """name and number again at the top of pages 2 and 3"""
    para(cont, ["Name : ", ("_", 38, "name"), "    Cath No. : ", ("_", 24, "caseNo")], after=8)


# ============================================================ PPM
def ppm(d, left, main):
    left_column(left, ["Device in stock", "TPI in situ", "Echo done"])
    title(main, "PERMANENT PACEMAKER IMPLANTATION PROFORMA")
    para(main, ["Name : ", ("_", 42, "name"), "   Age : ", ("_", 6, "age"), "   Sex : ", ("_", 6, "sex")], after=4)
    case_no(main, "PPM")
    para(main, [("b", "Date :  "), ("d", "date"), "     Height : ", ("_", 7, "ht"), " cm   Weight : ", ("_", 7, "wt"), " kg"], after=3)
    para(main, [("b", "IPD No. :  "), ("c", 7, "ipd"), "      ", ("b", "OPD No. :  "), ("c", 7, "opd")], after=6)
    para(main, [("u", "Indication :")], after=2)
    boxes_line(main, "", [("x", "CHB", "ind:CHB"), ("x", "Mobitz II 2° AVB", "ind:M2"), ("x", "High-grade AVB", "ind:HG"), ("x", "2:1 AVB", "ind:21")], after=1)
    boxes_line(main, "", [("x", "SSS / Sinus node dysfunction", "ind:SSS"), ("x", "Tachy–brady", "ind:TB"), ("x", "AF with slow VR", "ind:AF")], after=1)
    boxes_line(main, "", [("x", "Bifascicular block + syncope", "ind:BIF"), ("x", "Post-TAVI / post-op AVB", "ind:POST"), ("x", "Alternating BBB", "ind:ABBB")], after=1)
    boxes_line(main, "", [("x", "CRT — HFrEF + LBBB", "ind:CRT"), ("x", "ICD — Primary", "ind:ICD1"), ("x", "Secondary", "ind:ICD2"), "Others : ", ("_", 16, "indOther")], after=5)
    boxes_line(main, "Symptoms", [("x", "Syncope", "sy:syn"), ("x", "Presyncope", "sy:pre"), ("x", "Giddiness", "sy:gid"), ("x", "Dyspnoea", "sy:dys"), ("x", "Fatigue", "sy:fat"), ("x", "Asymptomatic", "sy:asy")], after=1)
    para(main, ["Since : ", ("_", 14, "since"), "     No. of syncopal episodes : ", ("_", 6, "synN"), "     NYHA : ", ("_", 5, "nyha")], after=5)
    boxes_line(main, "Aetiology", [("x", "Degenerative", "ae:deg"), ("x", "Ischaemic (IWMI / AWMI)", "ae:isch"), ("x", "Post-operative", "ae:post"), ("x", "Congenital", "ae:cong"), ("x", "Unknown", "ae:unk")], after=4)
    boxes_line(main, "Reversible causes excluded", [("x", "Drugs (BB / CCB / digoxin)", "rv:drug"), ("x", "K+", "rv:k"), ("x", "Ischaemia", "rv:isch"), ("x", "Thyroid", "rv:thy")], after=5)
    para(main, [("b", "Temporary pacing :  "), ("x", "No", "tpi:no"), ("x", "Yes", "tpi:yes"), " on ", ("d", "tpiDate"), "   via ", ("x", "Femoral", "tpi:fem"), ("x", "IJV", "tpi:ijv"), ("x", "Subclavian", "tpi:sc")], after=5)
    boxes_line(main, "Past History", [("x", "HTN", "ph:htn"), ("x", "DM", "ph:dm"), ("x", "CAD", "ph:cad"), ("x", "PTCA / CABG", "ph:rev"), ("x", "CKD", "ph:ckd"), ("x", "CVA", "ph:cva"), ("x", "Prior device", "ph:dev")], after=4)
    para(main, [("b", "Antithrombotics :  "), ("x", "Aspirin", "at:asp"), ("x", "Clopidogrel", "at:clop"), ("x", "Warfarin", "at:warf"), ("x", "NOAC", "at:noac"), "  stopped on ", ("_", 10, "atStop")], after=4)
    para(main, [("b", "Procedural Risk :  "), ("x", "High", "risk:h"), ("x", "Moderate", "risk:m"), ("x", "Low", "risk:l"), "     ", ("b", "Allergy : "), ("_", 18, "allergy")], after=8)
    grid(main, ["HR", "Rhythm", "QRS ms", "EF %", "Sr. Creat", "K+", "Hb", "INR"], [""], height=0.7, keys="strip")
    para(main, [("i", "Latest values — write the newest before the procedure.", 7)], after=0)

    new_page(d)
    header_short(d, "PPM")
    para(d, [("u", "ECG :"), "   HR ", ("_", 6, "ecgHr"), " /min   PR ", ("_", 6, "pr"), " ms   QRS ", ("_", 6, "qrs"), " ms   QTc ", ("_", 6, "qtc"), " ms"], after=2)
    boxes_line(d, "Rhythm", [("x", "Sinus", "r:s"), ("x", "Sinus brady", "r:sb"), ("x", "Sinus arrest / pauses", "r:sa"), ("x", "AF / flutter", "r:af"), ("x", "Junctional", "r:j")], after=1)
    boxes_line(d, "Block", [("x", "1°", "b:1"), ("x", "Mobitz I", "b:m1"), ("x", "Mobitz II", "b:m2"), ("x", "2:1", "b:21"), ("x", "High-grade", "b:hg"), ("x", "CHB", "b:chb"), "escape ", ("_", 5, "esc"), " /min  ", ("x", "narrow", "b:nar"), ("x", "wide", "b:wide")], after=1)
    boxes_line(d, "Conduction", [("x", "RBBB", "c:rbbb"), ("x", "LBBB", "c:lbbb"), ("x", "LAFB", "c:lafb"), ("x", "LPFB", "c:lpfb"), ("x", "Alternating BBB", "c:alt")], after=3)
    para(d, [("b", "Holter / event monitor : "), ("_", 70, "holter")], after=6)
    para(d, [("u", "Blood Investigations :")], after=2)
    t = d.add_table(rows=4, cols=6); borders(t)
    lab = [("Hb", "Sr. Creatinine", "HIV"), ("TLC", "Sr. Na / K", "HBsAg"), ("Platelets", "PT / INR", "HCV"), ("TSH", "APTT", "Blood group")]
    for ri, r in enumerate(lab):
        for k in range(3):
            c = t.rows[ri].cells[k * 2]; p = c.paragraphs[0]; p.paragraph_format.space_after = Pt(0)
            run(p, r[k], bold=True, size=9)
            v = VALS.get("bl:" + r[k])
            if v:
                p2 = t.rows[ri].cells[k * 2 + 1].paragraphs[0]; run(p2, v, italic=True, color=INK, size=9)
        t.rows[ri].height = Cm(0.55)
    spacer(d, 6)
    para(d, [("u", "Echocardiogram :"), "   LVEF ", ("_", 6, "ef"), " %   LVIDd ", ("_", 6, "lvidd"), "   LVIDs ", ("_", 6, "lvids"), "   LA ", ("_", 6, "la"), "   PASP ", ("_", 6, "pasp")], after=2)
    boxes_line(d, "RWMA", [("x", "No", "rw:no"), ("x", "A / AL / AS", "rw:a"), ("x", "I / IL / IS", "rw:i"), ("x", "Global", "rw:g")], after=1)
    para(d, [("b", "Valves : "), ("_", 30, "valves"), "   ", ("b", "Other : "), ("_", 28, "echoOther")], after=8)
    para(d, [("u", "Device plan :")], after=2)
    boxes_line(d, "Mode", [("x", "VVI(R)", "m:vvi"), ("x", "AAI(R)", "m:aai"), ("x", "DDD(R)", "m:ddd"), ("x", "VDD", "m:vdd"), ("x", "CRT-P", "m:crtp"), ("x", "CRT-D", "m:crtd"), ("x", "ICD-VR", "m:icdvr"), ("x", "ICD-DR", "m:icddr"), ("x", "Leadless", "m:ll")], after=1)
    boxes_line(d, "Ventricular pacing site", [("x", "RV apex", "vs:apex"), ("x", "RV septum", "vs:sept"), ("x", "His bundle", "vs:his"), ("x", "LBBAP", "vs:lbb"), ("x", "CS (LV)", "vs:cs")], after=1)
    para(d, [("x", "MRI-conditional system", "mri"), ("x", "Rate response", "rr"), "     Planned side :  ", ("x", "Left", "side:l"), ("x", "Right", "side:r")], after=1)
    para(d, [("b", "Consent & counselling done by : "), ("_", 30, "consentBy")], after=8)
    para(d, [("u", "Pre-procedure checklist :")], after=2)
    boxes_line(d, "", [("x", "Consent", "ck:cons"), ("x", "NBM 6 h", "ck:nbm"), ("x", "Antibiotic prophylaxis", "ck:abx"), ("x", "Part prepared", "ck:prep"), ("x", "IV line (opposite arm)", "ck:iv"), ("x", "Anticoagulant stopped / INR < 1.5", "ck:inr")], after=8)
    notes(d)

    new_page(d)
    header_short(d, "PPM")
    para(d, [("u", "Procedure :"), "   Date ", ("d", "procDate"), "   Performed by :  Dr ", ("_", 16, "op1"), "  Dr ", ("_", 16, "op2")], after=2)
    para(d, ["Technician : ", ("_", 18, "tech"), "   Fluoro time ", ("_", 7, "ft"), " min   AK ", ("_", 7, "ak"), "   Antibiotic : ", ("_", 14, "abx")], after=2)
    boxes_line(d, "Access", [("x", "Left", "ac:l"), ("x", "Right", "ac:r"), ("x", "Cephalic cut-down", "ac:ceph"), ("x", "Axillary", "ac:ax"), ("x", "Subclavian", "ac:sc"), ("x", "Femoral (leadless)", "ac:fem")], after=1)
    boxes_line(d, "Pocket", [("x", "Subcutaneous", "po:sc"), ("x", "Submuscular", "po:sm"), "  Closure : ", ("_", 14, "closure")], after=5)
    para(d, [("u", "Generator :")], after=2)
    grid(d, ["", "Company", "Model", "Serial No.", "Mode"], ["Generator"], widths=[2.6, 3.4, 3.6, 4.2, 2.4], keys="gen")
    spacer(d, 4)
    para(d, [("u", "Leads & measurements at implant :")], after=2)
    grid(d, ["Lead", "Company / Model", "Serial No.", "Fixation", "Position", "R / P wave (mV)", "Impedance (Ω)", "Threshold (V @ ms)"],
         ["RA", "RV", "LV (CS)", "His / LBB"], widths=[1.6, 3.0, 2.6, 1.6, 2.4, 1.7, 1.7, 2.0], size=8, keys="lead")
    para(d, [("i", "Fixation: A = active, P = passive.  LBBAP: paced QRS ____ ms, V6 R-wave peak time ____ ms, current of injury ☐", 7)], after=4)
    para(d, [("u", "Final programming :"), "  Mode ", ("_", 6, "pmode"), "  LRL ", ("_", 4, "lrl"), "  URL ", ("_", 4, "url"), "  AV delay ", ("_", 8, "avd"), " ms"], after=1)
    para(d, ["Outputs :  RA ", ("_", 9, "outRa"), "  RV ", ("_", 9, "outRv"), "  LV ", ("_", 9, "outLv"), "   Sensitivity :  A ", ("_", 5, "sensA"), "  V ", ("_", 5, "sensV")], after=5)
    boxes_line(d, "Complications", [("x", "None", "cx:none"), ("x", "Pneumothorax", "cx:ptx"), ("x", "Haematoma", "cx:hem"), ("x", "Lead dislodgement", "cx:dis"), ("x", "Perforation / effusion", "cx:perf"), ("x", "Arrhythmia", "cx:arr")], after=1)
    boxes_line(d, "Post-procedure", [("x", "CXR — lead position satisfactory", "pp:cxr"), ("x", "No pneumothorax", "pp:noptx"), ("x", "ECG — capture", "pp:ecg")], after=4)
    para(d, [("b", "Other hardware : "), ("_", 64, "hw")], after=1)
    para(d, [("b", "Recommendations (in addition to standard) : "), ("_", 40, "rec")], after=4)
    # space for the stickers
    t = d.add_table(rows=1, cols=1); borders(t, 4)
    c = t.rows[0].cells[0]; t.rows[0].height = Cm(3.6)
    p = c.paragraphs[0]; run(p, "Paste the generator and lead stickers here", italic=True, size=8)
    if VALS.get("stickers"): p2 = c.add_paragraph(); run(p2, VALS["stickers"], italic=True, color=INK, size=9)
    para(d, [("i", "Standard advice: wound check on day 7, no overhead abduction of the implant-side arm for 4–6 weeks, device check at 1 month, then every 6–12 months; carry the device card.", 7)], before=3, after=0)


# ============================================================ BMV
def bmv(d, left, main):
    left_column(left, ["TEE done", "Echo done", "UPT (female)"])
    title(main, "BALLOON MITRAL VALVULOPLASTY (BMV / PTMC) PROFORMA")
    para(main, ["Name : ", ("_", 42, "name"), "   Age : ", ("_", 6, "age"), "   Sex : ", ("_", 6, "sex")], after=4)
    case_no(main, "BMV")
    para(main, [("b", "Date :  "), ("d", "date"), "     Height : ", ("_", 7, "ht"), " cm   Weight : ", ("_", 7, "wt"), " kg"], after=3)
    para(main, [("b", "IPD No. :  "), ("c", 7, "ipd"), "      ", ("b", "OPD No. :  "), ("c", 7, "opd")], after=6)
    para(main, [("u", "Clinical :")], after=2)
    boxes_line(main, "NYHA", [("x", "I", "ny:1"), ("x", "II", "ny:2"), ("x", "III", "ny:3"), ("x", "IV", "ny:4")], after=1)
    boxes_line(main, "Symptoms", [("x", "Dyspnoea", "sy:dys"), ("x", "Orthopnoea / PND", "sy:orth"), ("x", "Palpitations", "sy:pal"), ("x", "Haemoptysis", "sy:hae"), ("x", "Embolic event", "sy:emb")], after=1)
    para(main, ["Since : ", ("_", 14, "since"), "    Rhythm :  ", ("x", "NSR", "rh:nsr"), ("x", "AF", "rh:af"), "   Heart rate ", ("_", 6, "hr"), " /min"], after=4)
    para(main, [("b", "Pregnancy :  "), ("x", "No", "pg:no"), ("x", "Yes", "pg:yes"), "  ", ("_", 4, "pgWk"), " weeks      ", ("b", "Prior commissurotomy :  "), ("x", "No", "pc:no"), ("x", "BMV", "pc:bmv"), ("x", "CMV", "pc:cmv"), " year ", ("_", 6, "pcYr")], after=4)
    boxes_line(main, "Past History", [("x", "Rheumatic fever", "ph:rf"), ("x", "Stroke / TIA", "ph:cva"), ("x", "IE", "ph:ie"), ("x", "HTN", "ph:htn"), ("x", "DM", "ph:dm"), ("x", "CKD", "ph:ckd")], after=4)
    para(main, [("b", "Secondary prophylaxis :  "), ("x", "Benzathine penicillin", "sp:bp"), ("x", "Oral penicillin", "sp:op"), ("x", "None", "sp:no")], after=4)
    para(main, [("b", "Anticoagulation :  "), ("x", "None", "ac:no"), ("x", "Warfarin", "ac:warf"), " INR ", ("_", 5, "inr"), ("x", "NOAC", "ac:noac"), "  stopped on ", ("_", 10, "acStop")], after=4)
    para(main, [("b", "Procedural Risk :  "), ("x", "High", "risk:h"), ("x", "Moderate", "risk:m"), ("x", "Low", "risk:l"), "     ", ("b", "Allergy : "), ("_", 18, "allergy")], after=8)
    grid(main, ["MVA cm²", "Mean MDG", "PASP", "Wilkins", "MR", "LA clot", "Creat", "Hb"], [""], height=0.7, keys="strip")
    para(main, [("i", "From the echo / TEE before the procedure.", 7)], after=0)

    new_page(d)
    header_short(d, "BMV")
    para(d, [("u", "ECG :"), "   HR ", ("_", 6, "ecgHr"), " /min   ", ("x", "NSR", "e:nsr"), ("x", "AF", "e:af"), ("x", "LAE (P mitrale)", "e:lae"), ("x", "RVH", "e:rvh"), ("x", "RAD", "e:rad")], after=6)
    para(d, [("u", "Blood Investigations :")], after=2)
    t = d.add_table(rows=4, cols=6); borders(t)
    lab = [("Hb", "Sr. Creatinine", "HIV"), ("TLC", "Sr. Na / K", "HBsAg"), ("Platelets", "PT / INR", "HCV"), ("ASO", "APTT", "Blood group")]
    for ri, r in enumerate(lab):
        for k in range(3):
            c = t.rows[ri].cells[k * 2]; p = c.paragraphs[0]; p.paragraph_format.space_after = Pt(0)
            run(p, r[k], bold=True, size=9)
            v = VALS.get("bl:" + r[k])
            if v:
                p2 = t.rows[ri].cells[k * 2 + 1].paragraphs[0]; run(p2, v, italic=True, color=INK, size=9)
        t.rows[ri].height = Cm(0.55)
    spacer(d, 6)
    para(d, [("u", "Transthoracic echo :")], after=2)
    para(d, ["MVA (planimetry) ", ("_", 6, "mvaP"), " cm²   MVA (PHT) ", ("_", 6, "mvaPht"), " cm²   Mean MDG ", ("_", 5, "mdg"), " mmHg at HR ", ("_", 5, "mdgHr")], after=1)
    para(d, ["PASP ", ("_", 5, "pasp"), " mmHg   LA ", ("_", 5, "la"), " mm   LVEF ", ("_", 5, "ef"), " %   TAPSE ", ("_", 5, "tapse"), " mm"], after=1)
    boxes_line(d, "MR", [("x", "None", "mr:0"), ("x", "Mild", "mr:1"), ("x", "Moderate", "mr:2"), ("x", "Severe", "mr:3")], after=1)
    para(d, [("b", "AR : "), ("_", 8, "ar"), "   ", ("b", "AS : "), ("_", 8, "as"), "   ", ("b", "TR : "), ("_", 8, "tr"), "   ", ("b", "Commissural calcium :  "), ("x", "None", "cc:0"), ("x", "One", "cc:1"), ("x", "Both", "cc:2")], after=4)
    para(d, [("b", "Wilkins score")], after=2)
    grid(d, ["Mobility", "Leaflet thickening", "Calcification", "Subvalvular thickening", "Total / 16"], [""], keys="wk", height=0.7)
    spacer(d, 5)
    para(d, [("u", "TEE :"), "  date ", ("d", "teeDate"), "   LA / LAA clot :  ", ("x", "Absent", "tee:no"), ("x", "Present", "tee:yes"), ("x", "SEC", "tee:sec"), "   IAS : ", ("_", 14, "ias")], after=6)
    para(d, [("b", "Decision :  "), ("x", "Suitable for BMV", "dec:ok"), ("x", "Not suitable — refer for surgery", "dec:no"), " reason : ", ("_", 20, "decWhy")], after=1)
    para(d, [("b", "Consent & counselling done by : "), ("_", 30, "consentBy")], after=6)
    para(d, [("u", "Pre-procedure checklist :")], after=2)
    boxes_line(d, "", [("x", "Consent", "ck:cons"), ("x", "NBM 6 h", "ck:nbm"), ("x", "Part prepared", "ck:prep"), ("x", "INR < 1.5 / NOAC held", "ck:inr"), ("x", "Blood arranged", "ck:blood"), ("x", "CTVS informed", "ck:ctvs")], after=8)
    notes(d)

    new_page(d)
    header_short(d, "BMV")
    para(d, [("u", "Procedure :"), "   Date ", ("d", "procDate"), "   Performed by :  Dr ", ("_", 16, "op1"), "  Dr ", ("_", 16, "op2")], after=2)
    para(d, ["Technician : ", ("_", 18, "tech"), "   Fluoro time ", ("_", 7, "ft"), " min   AK ", ("_", 7, "ak"), "   Heparin ", ("_", 7, "hep"), " U"], after=2)
    boxes_line(d, "Access", [("x", "Right femoral vein", "ac:rfv"), ("x", "Left femoral vein", "ac:lfv"), ("x", "Femoral artery (pigtail)", "ac:fa"), "  Sheath ", ("_", 4, "sheath"), " F"], after=1)
    boxes_line(d, "Septal puncture", [("x", "Brockenbrough needle", "sp:bb"), ("x", "Mullins sheath", "sp:mul"), ("x", "Fluoro", "sp:fl"), ("x", "TEE / ICE guided", "sp:tee"), "  attempts ", ("_", 3, "spN")], after=1)
    boxes_line(d, "Balloon", [("x", "Inoue", "bl:inoue"), ("x", "Accura", "bl:accura"), ("x", "JOMIVA", "bl:jom"), ("x", "Double balloon", "bl:dbl"), "  size ", ("_", 5, "blSize"), " mm  (height / 10 + 10 = ", ("_", 4, "blRef"), " mm)"], after=4)
    para(d, [("b", "Inflations")], after=2)
    grid(d, ["No.", "Balloon (mm)", "LA mean (mmHg)", "Mean MDG (mmHg)", "MR after", "Commissure split"], ["1", "2", "3", "4"], keys="inf", widths=[1.2, 2.6, 3.0, 3.0, 2.6, 3.6])
    spacer(d, 4)
    para(d, [("b", "Haemodynamics")], after=2)
    grid(d, ["", "LA mean", "LA v wave", "LVEDP", "Mean MDG", "PA (s / d / m)", "Aorta (s / d)", "MVA (Gorlin)"], ["Pre", "Post"], keys="hd", widths=[1.4, 1.9, 1.9, 1.7, 2.0, 2.6, 2.3, 2.2], size=8)
    spacer(d, 4)
    para(d, [("u", "Post-BMV echo :"), "  MVA ", ("_", 6, "postMva"), " cm²   Mean MDG ", ("_", 5, "postMdg"), " mmHg   MR ", ("_", 8, "postMr"), "   ", ("x", "Iatrogenic ASD", "post:asd"), ("x", "Pericardial effusion", "post:pe")], after=3)
    boxes_line(d, "Result", [("x", "Successful (MVA ≥ 1.5 cm² or ↑ ≥ 50%, MR ≤ moderate)", "res:ok"), ("x", "Suboptimal", "res:sub"), ("x", "Failed", "res:fail")], after=1)
    boxes_line(d, "Complications", [("x", "None", "cx:none"), ("x", "Severe MR", "cx:mr"), ("x", "Tamponade", "cx:tamp"), ("x", "Embolism / stroke", "cx:emb"), ("x", "Arrhythmia", "cx:arr"), ("x", "Vascular", "cx:vasc")], after=4)
    para(d, [("b", "Other hardware : "), ("_", 64, "hw")], after=1)
    para(d, [("b", "Recommendations (in addition to standard) : "), ("_", 40, "rec")], after=4)
    t = d.add_table(rows=1, cols=1); borders(t, 4)
    c = t.rows[0].cells[0]; t.rows[0].height = Cm(2.6)
    p = c.paragraphs[0]; run(p, "Paste the balloon / sheath stickers here", italic=True, size=8)
    if VALS.get("stickers"): p2 = c.add_paragraph(); run(p2, VALS["stickers"], italic=True, color=INK, size=9)
    para(d, [("i", "Standard advice: secondary prophylaxis to continue, anticoagulation if AF, echo at 1 month and then yearly.", 7)], before=3, after=0)


def build(kind, out, vals):
    global VALS
    VALS = vals
    d, left, main = shell()
    (ppm if kind == "PPM" else bmv)(d, left, main)
    footers(d, kind, 3)
    d.core_properties.title = "%s proforma — LTMGH Cardiology" % kind
    d.save(out)
    print("wrote", out)


# ------------------------------------------------------------ the examples (made up)
T = True
PPM_EX = {"name": "Ramesh Kamble", "age": "68", "sex": "M", "caseNo": "2415/PPM-087/2026", "date": "24/11/26", "ht": "164", "wt": "61",
          "ipd": "4518822", "L:Device in stock": T, "L:TPI in situ": T, "L:Echo done": T, "ind:CHB": T, "sy:syn": T, "sy:gid": T, "since": "3 weeks", "synN": "2", "nyha": "II",
          "ae:deg": T, "rv:drug": T, "rv:k": T, "rv:isch": T, "rv:thy": T, "tpi:yes": T, "tpiDate": "21/11/26", "tpi:fem": T,
          "ph:htn": T, "ph:dm": T, "at:asp": T, "atStop": "continued", "risk:m": T, "allergy": "nil",
          "strip::HR": "34", "strip::Rhythm": "CHB", "strip::QRS ms": "128", "strip::EF %": "55", "strip::Sr. Creat": "1.1", "strip::K+": "4.3", "strip::Hb": "12.1", "strip::INR": "1.0",
          "ecgHr": "34", "pr": "—", "qrs": "128", "qtc": "440", "b:chb": T, "esc": "34", "b:wide": T, "c:rbbb": T,
          "holter": "not done (CHB on ECG)",
          "bl:Hb": "12.1", "bl:TLC": "7800", "bl:Platelets": "2.1 L", "bl:Sr. Creatinine": "1.1", "bl:Sr. Na / K": "138 / 4.3", "bl:PT / INR": "1.0",
          "bl:HIV": "NR", "bl:HBsAg": "NR", "bl:HCV": "NR", "bl:TSH": "2.4",
          "ef": "55", "lvidd": "46", "lvids": "30", "la": "36", "pasp": "28", "rw:no": T, "valves": "mild MR", "m:ddd": T, "vs:lbb": T, "mri": T, "rr": T, "side:l": T,
          "consentBy": "Dr. Khushmi", "ck:cons": T, "ck:nbm": T, "ck:abx": T, "ck:prep": T, "ck:iv": T,
          "procDate": "24/11/26", "op1": "Saurabh", "op2": "Khushmi", "tech": "Indresh", "ft": "11.2", "ak": "96", "abx": "Cefazolin 2 g",
          "ac:l": T, "ac:ax": T, "po:sc": T, "closure": "3 layers",
          "gen:Generator:Company": "Medtronic", "gen:Generator:Model": "Azure XT DR", "gen:Generator:Serial No.": "RNB612345S", "gen:Generator:Mode": "DDDR",
          "lead:RA:Company / Model": "Medtronic 5076-52", "lead:RA:Serial No.": "PJN8812345", "lead:RA:Fixation": "A", "lead:RA:Position": "RA appendage", "lead:RA:R / P wave (mV)": "2.8", "lead:RA:Impedance (Ω)": "520", "lead:RA:Threshold (V @ ms)": "0.6 @ 0.4",
          "lead:His / LBB:Company / Model": "Medtronic 3830-69", "lead:His / LBB:Serial No.": "LFF1234567", "lead:His / LBB:Fixation": "A", "lead:His / LBB:Position": "LBB area", "lead:His / LBB:R / P wave (mV)": "11", "lead:His / LBB:Impedance (Ω)": "640", "lead:His / LBB:Threshold (V @ ms)": "0.7 @ 0.4",
          "pmode": "DDDR", "lrl": "60", "url": "130", "avd": "180 / 150", "outRa": "2.0 @ 0.4", "outRv": "2.5 @ 0.4", "sensA": "0.3", "sensV": "2.0",
          "cx:none": T, "pp:cxr": T, "pp:noptx": T, "pp:ecg": T, "hw": "7F peel-away sheath × 2, C315 His sheath",
          "rec": "TPI removed after implant; arm sling 48 h", "stickers": "[generator and lead stickers pasted here]"}

BMV_EX = {"name": "Sunita Gaikwad", "age": "29", "sex": "F", "caseNo": "2419/BMV-031/2026", "date": "25/11/26", "ht": "152", "wt": "47",
          "ipd": "4519107", "L:TEE done": T, "L:Echo done": T, "L:UPT (female)": T, "ny:3": T, "sy:dys": T, "sy:pal": T, "since": "1 year", "rh:nsr": T, "hr": "92",
          "pg:no": T, "pc:no": T, "ph:rf": T, "sp:bp": T, "ac:no": T, "risk:l": T, "allergy": "nil",
          "strip::MVA cm²": "0.8", "strip::Mean MDG": "14", "strip::PASP": "62", "strip::Wilkins": "7", "strip::MR": "trivial", "strip::LA clot": "absent", "strip::Creat": "0.7", "strip::Hb": "11.2",
          "ecgHr": "92", "e:nsr": T, "e:lae": T, "e:rvh": T,
          "bl:Hb": "11.2", "bl:TLC": "6900", "bl:Platelets": "2.6 L", "bl:Sr. Creatinine": "0.7", "bl:Sr. Na / K": "139 / 4.1", "bl:PT / INR": "1.0",
          "bl:HIV": "NR", "bl:HBsAg": "NR", "bl:HCV": "NR", "bl:ASO": "neg",
          "mvaP": "0.8", "mvaPht": "0.85", "mdg": "14", "mdgHr": "92", "pasp": "62", "la": "48", "ef": "60", "tapse": "17", "mr:0": T, "ar": "trivial", "as": "nil", "tr": "mod", "cc:0": T,
          "wk::Mobility": "2", "wk::Leaflet thickening": "2", "wk::Calcification": "1", "wk::Subvalvular thickening": "2", "wk::Total / 16": "7",
          "teeDate": "23/11/26", "tee:no": T, "ias": "normal", "dec:ok": T, "consentBy": "Dr. Saurabh",
          "ck:cons": T, "ck:nbm": T, "ck:prep": T, "ck:inr": T, "ck:blood": T, "ck:ctvs": T,
          "procDate": "25/11/26", "op1": "Saurabh", "op2": "Khushmi", "tech": "Kelkar", "ft": "9.5", "ak": "210", "hep": "5000",
          "ac:rfv": T, "ac:fa": T, "sheath": "14", "sp:bb": T, "sp:mul": T, "sp:fl": T, "spN": "1", "bl:accura": T, "blSize": "26", "blRef": "25",
          "inf:1:Balloon (mm)": "24", "inf:1:LA mean (mmHg)": "18", "inf:1:Mean MDG (mmHg)": "8", "inf:1:MR after": "trivial", "inf:1:Commissure split": "one",
          "inf:2:Balloon (mm)": "25", "inf:2:LA mean (mmHg)": "12", "inf:2:Mean MDG (mmHg)": "4", "inf:2:MR after": "mild", "inf:2:Commissure split": "both",
          "hd:Pre:LA mean": "28", "hd:Pre:LA v wave": "36", "hd:Pre:LVEDP": "8", "hd:Pre:Mean MDG": "15", "hd:Pre:PA (s / d / m)": "64/30/42", "hd:Pre:Aorta (s / d)": "104/68", "hd:Pre:MVA (Gorlin)": "0.8",
          "hd:Post:LA mean": "12", "hd:Post:LA v wave": "16", "hd:Post:LVEDP": "9", "hd:Post:Mean MDG": "4", "hd:Post:PA (s / d / m)": "42/18/26", "hd:Post:Aorta (s / d)": "110/70", "hd:Post:MVA (Gorlin)": "1.9",
          "postMva": "1.9", "postMdg": "4", "postMr": "mild", "res:ok": T, "cx:none": T,
          "hw": "Mullins sheath, BB needle, 0.025\" LA coil wire, Accura 26", "rec": "Benzathine penicillin to continue; echo at 1 month",
          "stickers": "[Accura balloon sticker pasted here]"}

if __name__ == "__main__":
    build("PPM", "PPM_Proforma_v1.docx", {})
    build("BMV", "BMV_Proforma_v1.docx", {})
    build("PPM", "PPM_Proforma_v1_example.docx", PPM_EX)
    build("BMV", "BMV_Proforma_v1_example.docx", BMV_EX)
