"""Build the hosted Kitchen app, preserving embedded recipes and photographs."""
from pathlib import Path
import hashlib
import re

ROOT = Path(__file__).resolve().parents[1]
page = ROOT / "site/index.html"
if not page.is_file():
    raise SystemExit("site/index.html missing; no changes made")
html = page.read_text(encoding="utf-8")


def replace_script(document, block_id, source):
    if re.search(r"</script\s*>", source, re.I):
        raise ValueError(f"Unexpected closing script tag in {block_id}")
    pattern = re.compile(r'(<script\b(?=[^>]*\bid="' + re.escape(block_id) + r'")[^>]*>).*?(</script>)', re.S)
    updated, count = pattern.subn(lambda match: match.group(1) + source + match.group(2), document)
    if count != 1:
        raise ValueError(f"Expected one {block_id} block, found {count}")
    return updated


if 'id="kitchen-journal-customizations"' not in html:
    marker = '<script id="kitchen-app">'
    if html.count(marker) != 1:
        raise SystemExit("Expected one Kitchen app script; no changes made")
    html = html.replace(marker, '<script id="kitchen-journal-customizations"></script>\n' + marker, 1)

for block_id, path in [
    ("kitchen-logic", "source/personalization-rules.js"),
    ("kitchen-journal-customizations", "source/journal-customizations.js"),
    ("kitchen-app", "source/app.js"),
]:
    html = replace_script(html, block_id, (ROOT / path).read_text(encoding="utf-8"))

style = (ROOT / "source/journal.css").read_text(encoding="utf-8")
if re.search(r"</style\s*>", style, re.I):
    raise SystemExit("Unexpected closing style tag; no changes made")
style_id = "kitchen-journal-style"
if f'id="{style_id}"' not in html:
    html = html.replace("</head>", f'<style id="{style_id}"></style>\n</head>', 1)
html, count = re.subn(r'(<style\b[^>]*id="kitchen-journal-style"[^>]*>).*?(</style>)', lambda m: m.group(1) + style + m.group(2), html, flags=re.S)
if count != 1:
    raise SystemExit("Expected one journal stylesheet; no changes made")

if html.count("</body>") != 1:
    raise SystemExit("Expected one HTML body closing tag; no changes made")
for name in ("kitchen-assistant-local.js", "kitchen-chatgpt-personal-bridge.js"):
    version = hashlib.sha256((ROOT / "site" / name).read_bytes()).hexdigest()[:12]
    html = re.sub(r'<script\s+src="' + re.escape(name) + r'(?:\?[^"]*)?"\s+defer></script>\n?', "", html)
    html = html.replace("</body>", f'<script src="{name}?v={version}" defer></script>\n</body>', 1)

if page.read_text(encoding="utf-8") != html:
    page.write_text(html, encoding="utf-8")
    print("Built journal options and assistant interface; recipe data and photos preserved.")
else:
    print("Hosted Kitchen app is already current.")

