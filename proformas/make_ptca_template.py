"""PTCA proforma v2.5 (IPD No. and OPD No. on their own lines) and the planned-PTCA
template: the same form with {tokens} in the page-1/page-2 fields the app
pre-fills from a CAG case. Token kinds: {t:key} text blank, {b:key} tick
box, {c:key} comb boxes (CAG No, IPD, dates), {v:valve:Severity} valve
grid cell. Pages 3–4 (procedure) stay blank for the cath-lab."""
import re, sys, copy
from docx import Document
from docx.shared import Pt

SRC = sys.argv[1] if len(sys.argv) > 1 else "PTCA_Proforma_v2_5.docx"
BLANK = sys.argv[2] if len(sys.argv) > 2 else "PTCA_Proforma_v2_5.docx"
TEMPLATE = "ptca_planned_template.docx"

# ---- 1. the blank v2.4: the typo
d = Document(SRC)
def fix_typo(doc):
    n = 0
    for p in doc.paragraphs:
        for r in p.runs:
            if "Mild LAD" in r.text: r.text = r.text.replace("Mild LAD", "Mid LAD"); n += 1
    return n
print("typo fixed in", fix_typo(d), "run(s)")
d.save(BLANK)

# ---- 2. the template
d = Document(BLANK)
def boxes(p, keys):
    """single-box runs ('☐ ' in Segoe UI Symbol) get {b:key} in order"""
    i = 0
    for r in p.runs:
        if r.text.strip() == "☐":
            if i >= len(keys): raise SystemExit("more boxes than keys in: " + p.text[:60])
            r.text = r.text.replace("☐", "{b:%s}" % keys[i]); i += 1
    if i != len(keys): raise SystemExit("boxes %d != keys %d in: %s" % (i, len(keys), p.text[:60]))
def blanks(p, keys):
    """each run of 4+ underscores becomes {t:key} in order"""
    i = 0
    for r in p.runs:
        def sub(m):
            nonlocal i
            if i >= len(keys): raise SystemExit("more blanks than keys in: " + p.text[:60])
            k = keys[i]; i += 1
            return "{t:%s:%d}" % (k, len(m.group(0)))
        r.text = re.sub(r"_{4,}", sub, r.text)
    if i != len(keys): raise SystemExit("blanks %d != keys %d in: %s" % (i, len(keys), p.text[:60]))
def comb(p, key, which=0):
    """the which-th comb (a run of ☐☐… plus its '/' runs) becomes one plain run {c:key}"""
    runs = p.runs; groups = []; cur = []
    for r in runs:
        if r.font.name == "Segoe UI Symbol" and ("☐" in r.text or r.text.strip() == "/"):
            cur.append(r)
        else:
            if cur: groups.append(cur); cur = []
    if cur: groups.append(cur)
    g = groups[which]
    first = g[0]
    first.text = "{c:%s}" % key
    first.font.name = None; first.font.size = None
    rpr = first._r.rPr
    if rpr is not None:
        for tag in ("rFonts", "sz", "szCs"):
            for el in rpr.findall("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}" + tag): rpr.remove(el)
    for r in g[1:]: r._r.getparent().remove(r._r)
def cell_token(cell, token):
    p = cell.paragraphs[0]
    for r in p.runs[1:]: r._r.getparent().remove(r._r)
    r = p.runs[0] if p.runs else p.add_run("")
    r.text = token; r.font.size = Pt(10)

main = d.tables[0].rows[0].cells[1]
P = main.paragraphs
# title: a small label under it
lab = P[0].add_run("{t:plannedLabel}"); lab.bold = False; lab.font.size = Pt(9)
blanks(P[1], ["name", "age", "sex"])
comb(P[3], "cagNo"); blanks(P[3], ["height"])
blanks(P[4], ["weight"])
comb(P[5], "ipd"); comb(P[6], "opd")
boxes(P[8], ["awmi", "iw", "pw", "rv", "thrYes", "thrNo"])
boxes(P[9], ["ua", "csa", "nstemi", "nacp"])
boxes(P[10], ["stk", "tnk", "rtp"]); comb(P[10], "dxDate")
blanks(P[11], ["cagFinding"]); comb(P[11], "cagDate")
blanks(P[12], ["ptcaTo"])
boxes(P[13], ["cvaBleed", "cvaIsch", "ihd"]); blanks(P[13], ["priorPtca"])
boxes(P[14], ["htn", "dm", "pvd", "cva", "smoking", "tobacco"])
boxes(P[15], ["familyCad", "renal"]); blanks(P[15], ["rfOthers"])
strip = main.tables[1]
for ci, k in enumerate(["lvidd", "lvids", "ef", "creat", "k", "hb"]): cell_token(strip.rows[1].cells[ci], "{t:q_%s}" % k)

body = d.paragraphs
def para(text_start):
    for p in body:
        if p.text.startswith(text_start): return p
    raise SystemExit("no paragraph " + text_start)
# page 2
p2 = [p for p in body if p.text.startswith("Name : ____")]
blanks(p2[0], ["name2", "cathNo"]); blanks(p2[1], ["name3", "cathNo2"])
p = para("Pulse :"); blanks(p, ["pulse", "bp"]); boxes(p, ["allFelt", "notAll"])
p = para("Allen"); boxes(p, ["allenPos", "allenNeg"]); blanks(p, ["cvs", "rs"])
blood = d.tables[1]
left = ["bdate", "hb", "tlc", "platelets", "tc", "tg", "ldl", "rbsFbs"]
right = ["bdate2", "bun", "srCreat", "srNaK", "hiv", "hbsag", "hcv", "blGroup"]
for ri in range(1, 9):
    cell_token(blood.rows[ri].cells[1], "{t:b_%s}" % left[ri - 1])
    cell_token(blood.rows[ri].cells[4], "{t:b_%s}" % right[ri - 1])
p = para("ECG :"); blanks(p, ["hr"])
p = para("Rhythm :"); boxes(p, ["nsr", "sinusTachy", "hb1", "hb2", "chb", "nsvt", "afib", "at", "svt"])
p = para("QRS"); boxes(p, ["stElev", "qWaves", "stDep", "tInv", "ecgNormal"]); blanks(p, ["stElevLeads", "qLeads", "stDepLeads", "tInvLeads"])
p = para("CST :"); boxes(p, ["cstPos", "cstNeg"]); blanks(p, ["ecgNote"])
echo = d.tables[2]
def uniq(row):
    out = []; seen = []
    for c in row.cells:
        if c._tc in seen: continue
        seen.append(c._tc); out.append(c)
    return out
r0, r1, r2 = uniq(echo.rows[0]), uniq(echo.rows[1]), uniq(echo.rows[2])
for cells, keys in ((r0, ["la", "ivsdd", "lvidd"]), (r1, ["aorta", "pwdd", "lvids"]), (r2, ["pasp", "raRv", "lvef"])):
    for ci, k in zip((1, 3, 5), keys): cell_token(cells[ci], "{t:e_%s}" % k)
for ri, sev in ((5, "Mild"), (6, "Moderate"), (7, "Severe")):
    cells = uniq(echo.rows[ri])
    for ci, valve in zip(range(1, 7), ["mr", "ms", "mva", "as", "ar", "tr"]):
        if valve == "mva":
            if sev == "Mild":
                r = cells[ci].paragraphs[0].add_run(" {t:mva:0}"); r.font.size = Pt(8)
            continue
        cell_token(cells[ci], "{v:%s-%s}" % (valve, sev))
p = para("RWMA :"); boxes(p, ["rwmaNo", "aAlAs", "iIlIs", "glvh", "apical"]); blanks(p, ["ddGrade", "avpg"])
p = para("2D Echo"); blanks(p, ["doppler"])
for lab2, key in (("LMCA :", "cag_lm"), ("LAD :", "cag_lad"), ("LCX :", "cag_lcx"), ("RCA :", "cag_rca")):
    blanks(para(lab2), [key])
d.save(TEMPLATE)
xml = Document(TEMPLATE)  # sanity: the tokens are whole runs
import zipfile
doc = zipfile.ZipFile(TEMPLATE).read("word/document.xml").decode()
toks = sorted(set(re.findall(r"\{[btcv]:[^}]+\}", doc)))
print(len(toks), "tokens:", " ".join(toks))
