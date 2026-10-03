"""Package the built plugin with portable paths and no repository/private files."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent
plugin = root / "kartodesk-for-woocommerce"
required = ["kartodesk-for-woocommerce.php", "readme.txt", "license.txt", "build/app.js", "build/app.css", "build/kartodesk.svg"]
for name in required:
    if not (plugin / name).is_file():
        raise SystemExit(f"Missing {name}; run npm run build:wp first.")
files = [plugin / name for name in required] + sorted((plugin / "includes").glob("*.php"))
archive = root / "dist" / "kartodesk-for-woocommerce-0.1.0.zip"
archive.parent.mkdir(exist_ok=True)
with ZipFile(archive, "w", ZIP_DEFLATED) as zip_file:
    for path in files:
        zip_file.write(path, (Path(plugin.name) / path.relative_to(plugin)).as_posix())
with ZipFile(archive) as zip_file:
    assert zip_file.testzip() is None
    assert all("\\" not in name and ".." not in name.split("/") for name in zip_file.namelist())
print(f"Created {archive} ({archive.stat().st_size:,} bytes)")
