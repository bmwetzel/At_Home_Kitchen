"""Add hosted local Kitchen Helper to the existing static HTML, without rewriting recipes."""
from pathlib import Path
p = Path("site/index.html")
if not p.is_file():
    raise SystemExit("site/index.html missing; do not publish")
s = p.read_text(encoding="utf-8")
marker = '<script src="kitchen-assistant-local.js" defer></script>'
if marker not in s:
    if "</body>" not in s:
        raise SystemExit("HTML closing body tag missing; no changes made")
    s = s.replace("</body>", marker + "\n</body>", 1)
    p.write_text(s, encoding="utf-8")
    print("Inserted Kitchen Helper script")
else:
    print("Kitchen Helper script already present")
