"""[title] The loader's self-hosted font subsets, made from the text the title can show.

  python3 tools/anime/loader-fonts.py --src <dir with ZenMaruGothic-Bold.ttf, ZenMaruGothic-Black.ttf, DelaGothicOne-Regular.ttf>

Writes src/anime/assets/loader/{zen-maru-700,zen-maru-900,dela-gothic-one}.woff2 and rewrites the three @font-face lines of
src/anime/ui/loader/loader.css with their unicode-range, so the CSS and the files always agree. Then run
`env -u NODE_OPTIONS bun scripts/anime/loader-inline.js`.

What each face carries (docs/CRAFT.md section 2: one display face and one text face):
- Zen Maru Gothic 700, the text face: every character of the title's markup (#intro), the tips (Japanese, English and both source titles),
  the strings of title-boot.js, and all of printable ASCII (an English tip or source can use any Latin letter).
- Zen Maru Gothic 900: the まめ知識 / TRIVIA label only.
- Dela Gothic One, the display face: the start prompt (TAP / CLICK TO START), the percent and its digits: A-Z, 0-9, %, space.
The fonts are OFL (THIRD-PARTY-NOTICES). Sources: Google Fonts (Zen Maru Gothic by Yoshimichi Ohira; Dela Gothic One by artakana).
"""
import argparse, html, json, re
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]


def ranges(cps):
    cps = sorted(set(cps)); out = []; i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1: j += 1
        out.append(f"U+{cps[i]:04X}" if i == j else f"U+{cps[i]:04X}-U+{cps[j]:04X}"); i = j + 1
    return ", ".join(out)


def intro_text():
    page = (ROOT / "src/anime/index.html").read_text(encoding="utf-8")
    a = page.index('<div id="intro"'); b = page.index("<!--klc:sky-->")
    block = re.sub(r"<!--klc:logo-->[\s\S]*?<!--/klc:logo-->", "", page[a:b])   # (the mark is outlines, no text)
    block = re.sub(r"<[^>]+>", " ", block)
    return html.unescape(block)


def tips_text():
    data = json.loads((ROOT / "data/loading-tips.json").read_text(encoding="utf-8"))
    parts = [data.get("title", {}).get("ja", ""), data.get("title", {}).get("en", "")]
    for t in data["tips"]:
        parts += [t["ja"], t["en"], t["source"]["title"], t["source"].get("title_en", "")]
    return "".join(parts)


def strings_of(path):
    src = (ROOT / path).read_text(encoding="utf-8")
    return "".join(m.group(2) for m in re.finditer(r"(['\"])((?:(?!\1).)*)\1", src))


def write_subset(src, out, text):
    cps = sorted({ord(c) for c in text if ord(c) >= 0x20 and c not in "​  "})
    font = TTFont(src, recalcTimestamp=False)   # (deterministic: the same text gives the same bytes)
    cmap = font.getBestCmap()
    have = [c for c in cps if c in cmap]
    opts = subset.Options(); opts.flavor = "woff2"; opts.layout_features = ["palt", "kern", "liga", "tnum"]; opts.name_IDs = ["*"]; opts.notdef_outline = True
    sub = subset.Subsetter(opts); sub.populate(unicodes=have); sub.subset(font)
    font.flavor = "woff2"; font.save(out)
    return have, [c for c in cps if c not in cmap]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--src", required=True); a = ap.parse_args()
    src = Path(a.src); dst = ROOT / "src/anime/assets/loader"
    ascii_ = "".join(chr(c) for c in range(0x20, 0x7F))
    text700 = ascii_ + intro_text() + tips_text() + strings_of("src/anime/ui/loader/title-boot.js") + "…・「」（）、。！？：〜"
    text900 = " まめ知識TriviaTRIVIA"   # (the label; an English page sets it in capitals)
    dela = " %0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    faces = [("Zen Maru Gothic", 700, "ZenMaruGothic-Bold.ttf", "zen-maru-700", text700),
             ("Zen Maru Gothic", 900, "ZenMaruGothic-Black.ttf", "zen-maru-900", text900),
             ("Dela Gothic One", 400, "DelaGothicOne-Regular.ttf", "dela-gothic-one", dela)]
    css_path = ROOT / "src/anime/ui/loader/loader.css"; css = css_path.read_text(encoding="utf-8")
    for family, weight, ttf, name, text in faces:
        have, missing = write_subset(str(src / ttf), str(dst / f"{name}.woff2"), text)
        size = (dst / f"{name}.woff2").stat().st_size
        print(f"{name}.woff2  {len(have)} glyphs  {size} B" + (f"  (not in the font: {''.join(chr(c) for c in missing)!r})" if missing else ""))
        line = (f'@font-face {{ font-family: "{family}"; font-weight: {weight}; font-style: normal; font-display: swap; '
                f'src: url("./assets/loader/{name}.woff2") format("woff2"); unicode-range: {ranges(have)}; }}')
        pat = re.compile(r'@font-face \{ font-family: "' + re.escape(family) + r'"; font-weight: ' + str(weight) + r';[^\n]*\}')
        if not pat.search(css): raise SystemExit(f"loader.css has no @font-face line for {family} {weight}")
        css = pat.sub(lambda _m: line, css, count=1)
    css_path.write_text(css, encoding="utf-8")
    print("loader.css @font-face lines updated")


if __name__ == "__main__":
    main()
