"""
Cuts the app's headline font: a static instance of the OFL variable font
Newsreader[opsz,wght].ttf (github.com/google/fonts, ofl/newsreader) at optical
size 32 and weight 600, named "Newsreader Display SemiBold".

The @expo-google-fonts static files are the 16 pt optical size, while the
website draws h1/h2 with font-optical-sizing: auto, so headlines at 26-34 pt
looked heavier and looser in the app. License: assets/fonts/OFL-Newsreader.txt.

    pip install fonttools
    python3 scripts/cut-display-font.py 'Newsreader[opsz,wght].ttf' assets/fonts/NewsreaderDisplay-SemiBold.ttf
"""
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

OPSZ, WGHT = 32, 600
FAMILY, STYLE = "Newsreader Display", "SemiBold"
POSTSCRIPT = "NewsreaderDisplay-SemiBold"

source, target = sys.argv[1], sys.argv[2]
font = instancer.instantiateVariableFont(TTFont(source), {"opsz": OPSZ, "wght": WGHT}, updateFontNames=False)
if "DSIG" in font:
    del font["DSIG"]  # the signature no longer matches

names = {
    1: f"{FAMILY} {STYLE}",
    2: "Regular",
    3: f"1.003;PROD;{POSTSCRIPT}",
    4: f"{FAMILY} {STYLE}",
    5: font["name"].getDebugName(5) or "Version 1.003",
    6: POSTSCRIPT,
    16: FAMILY,
    17: STYLE,
}
table = font["name"]
table.names = [n for n in table.names if n.nameID not in (*names, 25)]
for name_id, text in names.items():
    table.setName(text, name_id, 3, 1, 0x409)
    table.setName(text, name_id, 1, 0, 0)
font["OS/2"].usWeightClass = WGHT
font.save(target)
print(f"wrote {target}")
