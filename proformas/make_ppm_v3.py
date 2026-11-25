"""PPM proforma v3 — two pages, laid out like the CAG proforma.

Page 1: letterhead, approval column, procedure type (new implant / pulse
generator replacement / upgrade single → dual chamber), identity, the
indication block as Dr Yadav edited it (v2), then examination, ECG, echo and
bloods as on CAG page 1 (ECG merged with the pacing-specific points).
Page 2: the procedure — site of implant, lead positions (the atrial lead only
for a dual-chamber system), generator and leads, the replacement and upgrade
details, programming, complications, stickers.

  python3 make_ppm_v3.py   → PPM_Proforma_v3.docx (blank), PPM_Proforma_v3_example.docx
"""
import sys
sys.argv = [sys.argv[0], "PTCA_Proforma_v2_5.docx"]
import make_ppm_bmv as M
from make_ppm_bmv import para, emit, run, grid, spacer, borders, boxes_line
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_ROW_HEIGHT_RULE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


def tight(t, h):
    """exact row heights; the empty paragraph Word keeps after a table in a cell made tiny"""
    for r in t.rows:
        r.height = Cm(h); r.height_rule = WD_ROW_HEIGHT_RULE.EXACTLY
    nx = t._tbl.getnext()
    if nx is not None and nx.tag == qn("w:p") and not "".join(nx.itertext()).strip():
        pr = nx.get_or_add_pPr()
        sp = OxmlElement("w:spacing"); sp.set(qn("w:before"), "0"); sp.set(qn("w:after"), "0")
        sp.set(qn("w:line"), "80"); sp.set(qn("w:lineRule"), "exact"); pr.append(sp)

S = 9.5     # body size on the forms
M.XBOX, M.COMB = 10.5, 15


def lv_table(cont, rows, h=0.42, size=9, keys="t"):
    """label / value pairs side by side, as the CAG echo and blood tables"""
    n = max(len(r) for r in rows)
    t = cont.add_table(rows=len(rows), cols=n * 2); borders(t)
    for ri, r in enumerate(rows):
        t.rows[ri].height = Cm(h)
        for k, lab in enumerate(r):
            p = t.rows[ri].cells[k * 2].paragraphs[0]; p.paragraph_format.space_after = Pt(0)
            if lab: run(p, lab, size=size)
            v = M.VALS.get(keys + ":" + lab) if lab else None
            if v:
                q = t.rows[ri].cells[k * 2 + 1].paragraphs[0]; q.paragraph_format.space_after = Pt(0)
                run(q, v, italic=True, color=M.INK, size=size)
    tight(t, h)
    return t


def valve_grid(cont):
    t = cont.add_table(rows=4, cols=7); borders(t)
    for i, h in enumerate(["", "MR", "MS", "MVA", "AS", "AR", "TR"]):
        p = t.rows[0].cells[i].paragraphs[0]; p.paragraph_format.space_after = Pt(0); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run(p, h, size=9)
    for ri, lab in enumerate(["Mild", "Moderate", "Severe"]):
        t.rows[ri + 1].height = Cm(0.36)
        p = t.rows[ri + 1].cells[0].paragraphs[0]; p.paragraph_format.space_after = Pt(0); run(p, lab, size=9)
        for ci, v in enumerate(["MR", "MS", "", "AS", "AR", "TR"]):
            if v and M.VALS.get("valve:" + v) == lab:
                q = t.rows[ri + 1].cells[ci + 1].paragraphs[0]; q.alignment = WD_ALIGN_PARAGRAPH.CENTER; run(q, "✕", color=M.INK, size=9)
    a = t.cell(1, 3).merge(t.cell(3, 3)); p = a.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    if M.VALS.get("mva"): run(p, M.VALS["mva"] + " ", italic=True, color=M.INK, size=9)
    run(p, "Sq cm", size=8)
    tight(t, 0.4)
    return t


def ppm3(d, left, main):
    M.left_column(left, ["Device in stock", "TPI in situ", "Echo done"])
    M.title(main, "PERMANENT PACEMAKER IMPLANTATION PROFORMA")
    para(main, [("b", "Procedure :  "), ("x", "New implant", "pt:new"), ("x", "Pulse generator replacement", "pt:pgr"), ("x", "Upgrade (single → dual chamber)", "pt:upg")], after=2, size=S)
    para(main, ["Name : ", ("_", 42, "name"), "   Age : ", ("_", 6, "age"), "   Sex : ", ("_", 6, "sex")], after=2, size=S)
    p = para(main, [("b", "Cath No. :  ")], after=2, size=S)
    if M.VALS.get("caseNo"): M.ink(p, " " + M.VALS["caseNo"] + " ")
    else:
        emit(p, ("c", 4)); run(p, " / PPM-", bold=True, size=11); emit(p, ("c", 3)); run(p, " / ", bold=True, size=11); emit(p, ("c", 4))
        run(p, "   cath serial no. / PPM no. / year", italic=True, size=7)
    para(main, [("b", "Date :  "), ("d", "date"), "    Height : ", ("_", 6, "ht"), " cm   Weight : ", ("_", 6, "wt"), " kg"], after=2, size=S)
    para(main, [("b", "IPD No. :  "), ("c", 7, "ipd"), "    ", ("b", "OPD No. :  "), ("c", 7, "opd")], after=2, size=S)
    # the indication block, as edited (v2)
    para(main, [("u", "Indication :")], after=1, size=S)
    para(main, [("x", "CHB", "ind:CHB"), ("x", "Mobitz II 2° AVB", "ind:M2"), ("x", "High-grade AVB", "ind:HG"), ("x", "2:1 AVB", "ind:21")], after=0, size=S)
    para(main, [("x", "SSS / Sinus node dysfunction", "ind:SSS"), ("x", "Tachy–brady", "ind:TB"), ("x", "AF with slow VR", "ind:AF")], after=0, size=S)
    para(main, [("x", "Bifascicular block + syncope", "ind:BIF"), ("x", "Post-TAVI / post-op AVB", "ind:POST"), ("x", "Alternating BBB", "ind:ABBB")], after=0, size=S)
    para(main, [("x", "CRT — HFrEF + LBBB", "ind:CRT"), ("x", "ICD — Primary", "ind:ICD1"), ("x", "Secondary", "ind:ICD2"), "Others : ", ("_", 16, "indOther")], after=2, size=S)
    para(main, [("b", "Symptoms :  "), ("x", "Syncope", "sy:syn"), ("x", "Presyncope", "sy:pre"), ("x", "Giddiness", "sy:gid"), ("x", "Dyspnoea", "sy:dys"), ("x", "Fatigue", "sy:fat"), ("x", "Asymptomatic", "sy:asy")], after=0, size=S)
    para(main, ["Since : ", ("_", 14, "since"), "    No. of syncopal episodes : ", ("_", 6, "synN"), "    NYHA : ", ("_", 5, "nyha")], after=2, size=S)
    para(main, [("b", "Aetiology :  "), ("x", "Degenerative", "ae:deg"), ("x", "Ischaemic (IWMI / AWMI)", "ae:isch"), ("x", "Post-operative", "ae:post"), ("x", "Congenital", "ae:cong"), ("x", "Unknown", "ae:unk")], after=2, size=S)
    para(main, [("b", "Reversible causes excluded :  "), ("x", "Drugs (BB / CCB / digoxin)", "rv:drug"), ("x", "K+", "rv:k"), ("x", "Ischaemia", "rv:isch"), ("x", "Thyroid", "rv:thy")], after=2, size=S)
    para(main, [("b", "Temporary pacing :  "), ("x", "No", "tpi:no"), ("x", "Yes", "tpi:yes"), " on ", ("_", 9, "tpiDate"), "  via ", ("x", "Femoral", "tpi:fem"), ("x", "IJV", "tpi:ijv"), ("x", "Subclavian", "tpi:sc")], after=2, size=S)
    para(main, [("b", "Past History :  "), ("x", "HTN", "ph:htn"), ("x", "DM", "ph:dm"), ("x", "CAD", "ph:cad"), ("x", "PTCA / CABG", "ph:rev"), ("x", "CKD", "ph:ckd"), ("x", "CVA", "ph:cva"), ("x", "Prior device", "ph:dev")], after=1, size=S)
    para(main, [("_", 78, "phNote")], after=2, size=S)
    para(main, [("b", "Procedural Risk :  "), ("x", "High", "risk:h"), ("x", "Moderate", "risk:m"), ("x", "Low", "risk:l")], after=2, size=S)

    # the rest as on CAG page 1
    para(main, [("b", "Examination :")], after=1, size=S)
    para(main, ["Pulse : ", ("_", 7, "pulse"), " /min      BP : ", ("_", 9, "bp"), " mm/Hg      RS : Clear ", ("_", 12, "rs")], after=0, size=S)
    para(main, ["Peripheral pulses : All ", ("x", "Yes", "pp:y"), ("x", "No", "pp:n"), "   Allen’s Test : ", ("x", "(+)", "al:p"), ("x", "(−)", "al:n"), "   CVS : S1 S2 (+) ", ("_", 12, "cvs")], after=2, size=S)
    para(main, [("b", "Investigations :")], after=1, size=S)
    para(main, ["ECG :  HR ", ("_", 6, "ecgHr"), " /min   PR ", ("_", 6, "pr"), " ms   ", ("b", "Holter : "), ("_", 30, "holter")], after=0, size=S)
    para(main, ["Rhythm :  ", ("x", "NSR", "r:a"), ("x", "Sinus tachy", "r:b"), ("x", "Sinus brady", "r:c"), ("x", "Pauses", "r:d"), ("x", "AF / AFL", "r:e"), ("x", "AT", "r:f"), ("x", "SVT", "r:g"), ("x", "NSVT", "r:h"), ("x", "Junctional", "r:i")], after=0, size=S)
    para(main, ["Block :  ", ("x", "1° HB", "b:1"), ("x", "Mobitz I", "b:m1"), ("x", "Mobitz II", "b:m2"), ("x", "2:1", "b:21"), ("x", "High-grade", "b:hg"), ("x", "CHB", "b:chb"), " escape ", ("_", 4, "esc"), " /min ", ("x", "narrow", "b:nar"), ("x", "wide", "b:wide")], after=0, size=S)
    para(main, ["Conduction :  ", ("x", "RBBB", "c:r"), ("x", "LBBB", "c:l"), ("x", "LAFB", "c:la"), ("x", "LPFB", "c:lp"), ("x", "Alternating BBB", "c:alt")], after=0, size=S)
    para(main, ["QRS / ST-T changes :  ", ("x", "ST ↑", "q:st"), ("_", 4, "q:stL"), " ", ("x", "Q waves", "q:q"), ("_", 4, "q:qL"), " ", ("x", "ST ↓", "q:std"), ("_", 4, "q:stdL"), " ", ("x", "T ↓", "q:t"), ("_", 4, "q:tL"), " ", ("x", "Normal", "q:n")], after=2, size=S)
    para(main, [("b", "Echocardiogram :")], after=1, size=S)
    lv_table(main, [("LA", "IVSDd", "LVIDd"), ("Aorta", "PWDd", "LVIDs"), ("PASP", "RA/RV", "LVEF  %")], keys="echo")
    valve_grid(main)
    para(main, ["RWMA :  ", ("x", "No", "rw:no"), ("x", "A / AL / AS", "rw:a"), ("x", "I / IL / IS", "rw:i"), ("x", "GLVH", "rw:g"), ("x", "Apical", "rw:ap"), ("x", "Global", "rw:gl")], before=2, after=2, size=S)
    para(main, [("b", "Blood Investigation :")], after=1, size=S)
    lv_table(main, [("Hb", "Bun", "HIV"), ("TLC", "Sr. Creat", "HBsAg"), ("Platelets", "Sr. Na/K", "HCV"),
                    ("TC", "TG", "RBS/FBS"), ("PT / INR", "APTT", "LDL"), ("TSH", "Blood group", "")], keys="bl")

    # ---------------- page 2: the procedure ----------------
    M.new_page(d)
    M.header_short(d, "PPM")
    para(d, [("u", "Procedure :"), "  Date ", ("d", "procDate"), "  Performed by : Dr ", ("_", 15, "op1"), " Dr ", ("_", 15, "op2")], after=1, size=S)
    para(d, ["Technician : ", ("_", 16, "tech"), "   Fluoro time ", ("_", 6, "ft"), " min   AK ", ("_", 6, "ak"), "   Antibiotic : ", ("_", 16, "abx")], after=3, size=S)
    para(d, [("b", "Mode :  "), ("x", "VVI(R)", "m:vvi"), ("x", "AAI(R)", "m:aai"), ("x", "DDD(R)", "m:ddd"), ("x", "VDD", "m:vdd"), ("x", "CRT-P", "m:crtp"), ("x", "CRT-D", "m:crtd"), ("x", "ICD-VR", "m:icdvr"), ("x", "ICD-DR", "m:icddr"), ("x", "Leadless", "m:ll")], after=3, size=S)

    para(d, [("u", "Site of implant :")], after=1, size=S)
    para(d, ["Side :  ", ("x", "Left", "side:l"), ("x", "Right", "side:r"), "     Pocket :  ", ("x", "Subcutaneous", "pk:sc"), ("x", "Subpectoral", "pk:sp"), "     Closure : ", ("_", 12, "closure")], after=0, size=S)
    para(d, ["Venous access :  ", ("x", "Cephalic cut-down", "va:ceph"), ("x", "Axillary", "va:ax"), ("x", "Subclavian", "va:sc"), ("x", "Femoral (leadless)", "va:fem"), ("x", "Venogram done", "va:veno")], after=3, size=S)

    para(d, [("u", "Position of leads :")], after=1, size=S)
    para(d, [("b", "Ventricular lead :  "), ("x", "RV apex", "vl:apex"), ("x", "RV septum", "vl:sept"), ("x", "His bundle", "vl:his"), ("x", "LBBAP", "vl:lbb")], after=0, size=S)
    para(d, [("b", "Atrial lead "), ("i", "(dual chamber only)", 8), (" :  "), ("x", "RAA", "al:raa"), ("x", "RA free wall", "al:fw")], after=0, size=S)
    para(d, [("b", "LV lead "), ("i", "(CRT only)", 8), (" :  CS branch "), ("_", 14, "lvBranch"), "   ", ("x", "Lateral", "lv:lat"), ("x", "Posterolateral", "lv:pl"), ("x", "Anterior", "lv:ant")], after=3, size=S)

    para(d, [("u", "Generator & leads :")], after=1, size=S)
    grid(d, ["", "Company", "Model", "Serial No.", "Mode"], ["Generator"], widths=[2.6, 3.4, 3.6, 4.4, 2.2], keys="gen", size=9, height=0.5)
    spacer(d, 2)
    grid(d, ["Lead", "New / Existing", "Company / Model", "Serial No.", "Fixation", "R / P wave (mV)", "Impedance (Ω)", "Threshold (V @ ms)"],
         ["Atrial", "Ventricular", "LV (CS)"], widths=[1.8, 1.8, 3.0, 2.6, 1.5, 1.7, 1.8, 2.0], size=8, keys="lead", height=0.5)
    para(d, [("i", "Fixation: A = active, P = passive.  Atrial row only for a dual-chamber system, LV row only for CRT.  LBBAP: paced QRS ____ ms, V6 RWPT ____ ms.", 7)], after=3)

    para(d, [("u", "Pulse generator replacement :"), "  ", ("i", "(fill only for a replacement)", 8)], after=1, size=S)
    para(d, ["Old generator : ", ("_", 26, "old:gen"), "  implanted on ", ("_", 10, "old:date"), "   Reason :  ", ("x", "ERI / EOL", "old:eri"), ("x", "Infection / erosion", "old:inf"), ("x", "Malfunction", "old:mal")], after=0, size=S)
    para(d, ["Existing leads :  ", ("x", "Tested and retained", "old:ret"), ("x", "Lead replaced / added", "old:rep"), "   Pocket revised ", ("x", "Yes", "old:pky"), ("x", "No", "old:pkn")], after=3, size=S)

    para(d, [("u", "Pacemaker upgrade (single → dual chamber) :"), "  ", ("i", "(fill only for an upgrade)", 8)], after=1, size=S)
    para(d, ["From ", ("x", "VVI(R)", "up:vvi"), ("x", "AAI(R)", "up:aai"), " to ", ("x", "DDD(R)", "up:ddd"), ("x", "CRT", "up:crt"), "    Reason : ", ("_", 30, "up:why")], after=0, size=S)
    para(d, ["Existing lead :  ", ("x", "Retained", "up:ret"), ("x", "Capped / abandoned", "up:cap"), ("x", "Extracted", "up:ext"), "   New lead added :  ", ("x", "Atrial", "up:a"), ("x", "LV (CS)", "up:lv"), ("x", "LBB / His", "up:lbb")], after=0, size=S)
    para(d, ["Old generator explanted : ", ("_", 30, "up:oldgen"), "   Venogram :  ", ("x", "Patent", "up:vp"), ("x", "Occluded", "up:vo")], after=3, size=S)

    para(d, [("u", "Final programming :"), "  Mode ", ("_", 6, "pmode"), "  LRL ", ("_", 4, "lrl"), "  URL ", ("_", 4, "url"), "  AV delay ", ("_", 8, "avd"), " ms"], after=0, size=S)
    para(d, ["Outputs :  A ", ("_", 9, "outA"), "  V ", ("_", 9, "outV"), "  LV ", ("_", 9, "outLv"), "   Sensitivity :  A ", ("_", 5, "sensA"), "  V ", ("_", 5, "sensV")], after=3, size=S)
    para(d, [("b", "Complications :  "), ("x", "None", "cx:none"), ("x", "Pneumothorax", "cx:ptx"), ("x", "Haematoma", "cx:hem"), ("x", "Lead dislodgement", "cx:dis"), ("x", "Perforation / effusion", "cx:perf"), ("x", "Arrhythmia", "cx:arr")], after=0, size=S)
    para(d, [("b", "Post-procedure :  "), ("x", "CXR — lead position satisfactory", "pp:cxr"), ("x", "No pneumothorax", "pp:noptx"), ("x", "ECG — capture", "pp:ecg")], after=2, size=S)
    para(d, [("b", "Other hardware : "), ("_", 66, "hw")], after=1, size=S)
    para(d, [("b", "Recommendations (in addition to standard) : "), ("_", 42, "rec")], after=3, size=S)
    t = d.add_table(rows=1, cols=1); borders(t, 4)
    c = t.rows[0].cells[0]; t.rows[0].height = Cm(3.0)
    p = c.paragraphs[0]; run(p, "Paste the generator and lead stickers here", italic=True, size=8)
    if M.VALS.get("stickers"): q = c.add_paragraph(); run(q, M.VALS["stickers"], italic=True, color=M.INK, size=9)
    para(d, [("i", "Standard advice: wound check on day 7, no overhead abduction of the implant-side arm for 4–6 weeks, device check at 1 month, then every 6–12 months; carry the device card.", 7)], before=2, after=0)


def build(out, vals):
    M.VALS = vals
    d, left, main = M.shell()
    ppm3(d, left, main)
    M.footers(d, "PPM", 2)
    d.core_properties.title = "PPM proforma — LTMGH Cardiology"
    d.save(out)
    print("wrote", out)


T = True
EX = dict(M.PPM_EX)
EX.update({"pt:new": T, "phNote": "", "pulse": "34", "bp": "150/70", "rs": "", "cvs": "", "pp:y": T,
           "ecgHr": "34", "pr": "—", "holter": "not done", "b:chb": T, "esc": "34", "b:wide": T, "c:r": T, "q:n": T,
           "echo:LA": "36", "echo:IVSDd": "11", "echo:LVIDd": "46", "echo:Aorta": "28", "echo:PWDd": "10", "echo:LVIDs": "30",
           "echo:PASP": "28", "echo:RA/RV": "N", "echo:LVEF  %": "55", "valve:MR": "Mild", "rw:no": T,
           "bl:Hb": "12.1", "bl:TLC": "7800", "bl:Platelets": "2.1 L", "bl:Bun": "14", "bl:Sr. Creat": "1.1", "bl:Sr. Na/K": "138/4.3",
           "bl:HIV": "NR", "bl:HBsAg": "NR", "bl:HCV": "NR", "bl:PT / INR": "1.0", "bl:TSH": "2.4", "bl:Blood group": "B+",
           "va:ax": T, "pk:sc": T, "vl:lbb": T, "al:raa": T,
           "lead:Atrial:New / Existing": "New", "lead:Atrial:Company / Model": "Medtronic 5076-52", "lead:Atrial:Serial No.": "PJN8812345", "lead:Atrial:Fixation": "A",
           "lead:Atrial:R / P wave (mV)": "2.8", "lead:Atrial:Impedance (Ω)": "520", "lead:Atrial:Threshold (V @ ms)": "0.6 @ 0.4",
           "lead:Ventricular:New / Existing": "New", "lead:Ventricular:Company / Model": "Medtronic 3830-69", "lead:Ventricular:Serial No.": "LFF1234567", "lead:Ventricular:Fixation": "A",
           "lead:Ventricular:R / P wave (mV)": "11", "lead:Ventricular:Impedance (Ω)": "640", "lead:Ventricular:Threshold (V @ ms)": "0.7 @ 0.4",
           "outA": "2.0 @ 0.4", "outV": "2.5 @ 0.4"})

if __name__ == "__main__":
    build("PPM_Proforma_v3.docx", {})
    build("PPM_Proforma_v3_example.docx", EX)
