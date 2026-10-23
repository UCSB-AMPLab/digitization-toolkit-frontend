#!/usr/bin/env python3
"""Rebuild static/fonts/MaterialSymbolsOutlined.woff2 from the icon names in
src/lib/icon-names.json.

Usage:
    python3 -m venv /tmp/fontvenv && /tmp/fontvenv/bin/pip install fonttools brotli
    /tmp/fontvenv/bin/python scripts/subset-icon-font.py <full-font.woff2> [out.woff2]

<full-font.woff2> is the complete Material Symbols Outlined variable font
(FILL, GRAD, opsz, wght axes). The output defaults to
static/fonts/MaterialSymbolsOutlined.woff2.

The font maps icon names to glyphs through ligatures in the GSUB 'rlig'
lookup. Subsetting by character alone would keep every ligature that can be
spelled with the retained letters, so the ligature table is pruned to the
listed names first and the subsetter then keeps only what those names need.
"""
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
NAMES = json.loads((ROOT / "src/lib/icon-names.json").read_text())

if len(sys.argv) < 2:
    sys.exit(__doc__)
src = Path(sys.argv[1])
dst = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "static/fonts/MaterialSymbolsOutlined.woff2"

font = TTFont(src)
cmap = font.getBestCmap()
glyph_for_char = {chr(c): g for c, g in cmap.items()}
chars = sorted({ch for n in NAMES for ch in n})
name_to_glyph = {ch: glyph_for_char[ch] for ch in chars}
wanted = {tuple(name_to_glyph[ch] for ch in n[1:]): (name_to_glyph[n[0]], n) for n in NAMES}

keep_glyphs = set(name_to_glyph.values())
found = set()
for lookup in font["GSUB"].table.LookupList.Lookup:
    for st in lookup.SubTable:
        st = getattr(st, "ExtSubTable", st)
        if not hasattr(st, "ligatures"):
            continue
        for first in list(st.ligatures):
            kept = []
            for lig in st.ligatures[first]:
                key = tuple(lig.Component)
                if key in wanted and wanted[key][0] == first:
                    kept.append(lig)
                    found.add(wanted[key][1])
                    keep_glyphs.add(lig.LigGlyph)
            if kept:
                st.ligatures[first] = kept
            else:
                del st.ligatures[first]

missing = sorted(set(NAMES) - found)
if missing:
    sys.exit(f"not in the font: {missing}")

opts = subset.Options()
opts.layout_features = ["rlig"]
opts.glyph_names = False
opts.notdef_outline = True
opts.name_IDs = [1, 2, 3, 4, 6]
opts.flavor = "woff2"
sub = subset.Subsetter(opts)
sub.populate(glyphs=sorted(keep_glyphs))
sub.subset(font)
font.flavor = "woff2"
font.save(dst)
print(f"{len(NAMES)} icons -> {dst} ({dst.stat().st_size} bytes)")
