"""Install safe Kitchen Assistant scripts without changing recipes, images or journal."""
from pathlib import Path
p = Path("site/index.html")
if not p.is_file():
    raise SystemExit("site/index.html missing; no changes made")
s = p.read_text(encoding="utf-8")
if "</body>" not in s:
    raise SystemExit("Cannot find HTML body closing tag")
markers = [
    '<script src="kitchen-assistant-local.js" defer></script>',
    '<script src="kitchen-chatgpt-personal-bridge.js" defer></script>',
]
for marker in markers:
    if marker not in s:
        s = s.replace("</body>", marker + "\n</body>", 1)
        print("Installed", marker)
    else:
        print("Already present", marker)
p.write_text(s, encoding="utf-8")
