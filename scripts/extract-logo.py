"""Extract the Bossuyt logo bitmap from the sample Service Bon into public/bossuyt-logo.png.

Usage: python3 scripts/extract-logo.py
Requires PyMuPDF (`pip install pymupdf`). The logo is the widest image on page 1.
"""
import sys
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tests" / "fixtures" / "sauna-molenhoeve.pdf"
DST = ROOT / "public" / "bossuyt-logo.png"

doc = fitz.open(SRC)
page = doc[0]
images = page.get_images(full=True)
if not images:
    sys.exit("no images found on page 1")

# get_images tuples: (xref, smask, width, height, bpc, colorspace, ...)
logo = max(images, key=lambda img: img[2])
pix = fitz.Pixmap(doc, logo[0])
if pix.n - pix.alpha >= 4:  # CMYK -> RGB
    pix = fitz.Pixmap(fitz.csRGB, pix)
pix.save(DST)
print(f"wrote {DST} ({pix.width}x{pix.height})")
