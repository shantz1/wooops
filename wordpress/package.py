"""Package the built plugin with portable paths and no repository/private files."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import re

root = Path(__file__).resolve().parent
plugin = root / "kartodesk-for-woocommerce"
required = ["kartodesk-for-woocommerce.php", "uninstall.php", "readme.txt", "license.txt", "dashboard-widget.css", "dashboard-widget.js", "build/app.js", "build/app.css", "build/kartodesk.svg"]
for name in required:
    if not (plugin / name).is_file():
        raise SystemExit(f"Missing {name}; run npm run build:wp first.")
files = [plugin / name for name in required if not name.startswith("build/")] + sorted((plugin / "includes").glob("*.php"))
# Include every generated module chunk, not only the entry script.
files += sorted(path for path in (plugin / "build").rglob("*") if path.is_file() and path.suffix in {".js", ".mjs", ".css", ".svg"})
version = re.search(r"Version:\s*([0-9.]+)", (plugin / "kartodesk-for-woocommerce.php").read_text(encoding="utf-8")).group(1)
archive = root / "dist" / f"kartodesk-for-woocommerce-{version}.zip"
archive.parent.mkdir(exist_ok=True)
with ZipFile(archive, "w", ZIP_DEFLATED) as zip_file:
    for path in files:
        zip_file.write(path, (Path(plugin.name) / path.relative_to(plugin)).as_posix())
with ZipFile(archive) as zip_file:
    assert zip_file.testzip() is None
    assert all("\\" not in name and ".." not in name.split("/") for name in zip_file.namelist())
print(f"Created {archive} ({archive.stat().st_size:,} bytes)")
