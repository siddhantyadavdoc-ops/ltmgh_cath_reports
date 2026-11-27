"""Corner markers for offline scanning (13.62).

Adds four ArUco markers (DICT_4X4_50) to every page of the CAG and PTCA
proformas, so a photo can be straightened onto the printed template without
Gemini, and the page recognised from the marker ids alone.

  marker id = page_code * 4 + corner   (corner: 0 TL, 1 TR, 2 BR, 3 BL)
  page_code: 0-3 CAG sheets 1-4 (v2.8), 4 CAG coronary diagram (later),
             5-8 PTCA sheets 1-4 (v2.7), 9 utilization report, 10 PTCA diagram (later),
             11-14 CAG sheets 1-4 of the v3.0 tables printing (ids 44-59: DICT_4X4_100)

Each marker is SIZE pt square (6 x 6 cells incl. its black border), INSET pt
from the paper edge. Positions are written to markers.json for the
alignment code.

  python3 add_markers.py CAG_Proforma_v2_7.pdf CAG_Proforma_v2_8.pdf 0
  python3 add_markers.py PTCA_Proforma_v2_6.pdf PTCA_Proforma_v2_7.pdf 5
"""
import sys, json, io, os
import cv2, numpy as np
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

SIZE, INSET = 18.0, 11.0
DICT = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_100)   # its first 50 are DICT_4X4_50 exactly, so older PDFs are unchanged

def cells(mid):
    img = cv2.aruco.generateImageMarker(DICT, mid, 60)      # 6 cells x 10 px
    return (img.reshape(6, 10, 6, 10).mean(axis=(1, 3)) < 128)   # True = black

def corners(w, h):
    # lower-left origin of each marker, corner order TL, TR, BR, BL
    return [(INSET, h - INSET - SIZE), (w - INSET - SIZE, h - INSET - SIZE), (w - INSET - SIZE, INSET), (INSET, INSET)]

def overlay(w, h, page_code):
    buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=(w, h)); u = SIZE / 6
    for k, (x0, y0) in enumerate(corners(w, h)):
        g = cells(page_code * 4 + k)
        # the corner is blank paper already (checked: >= 32 pt free), which is the quiet zone the detector needs
        c.setFillColorRGB(0, 0, 0)
        for r in range(6):
            for col in range(6):
                if g[r, col]: c.rect(x0 + col * u, y0 + (5 - r) * u, u, u, stroke=0, fill=1)
    c.save(); buf.seek(0); return PdfReader(buf).pages[0]

def main(src, dst, first_code):
    r, wtr = PdfReader(src), PdfWriter(); info = {}
    for i, p in enumerate(r.pages):
        w, h = float(p.mediabox.width), float(p.mediabox.height); code = first_code + i
        p.merge_page(overlay(w, h, code)); wtr.add_page(p)
        info[str(code)] = {"page": i + 1, "w": w, "h": h, "size": SIZE,
                           "ids": [code * 4 + k for k in range(4)],
                           # top-left corner of each marker in pt, origin top-left of the page
                           "tl": [[x, h - y - SIZE] for x, y in corners(w, h)]}
    with open(dst, "wb") as f: wtr.write(f)
    jp = os.path.join(os.path.dirname(os.path.abspath(dst)), "markers.json")
    allm = json.load(open(jp)) if os.path.exists(jp) else {}
    allm[os.path.basename(dst)] = info; json.dump(allm, open(jp, "w"), indent=1)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]))
