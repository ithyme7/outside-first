"""Build and verify a release from an exact public-file allowlist."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import zipfile
from datetime import datetime, timezone

root = Path(__file__).resolve().parent
files = [
    '.gitignore', '.nojekyll', 'index.html', 'app.css', 'app.mjs', 'model-worker.mjs', 'sw.js',
    'manifest.webmanifest', 'icons/leaf.svg', 'icons/maskable.svg', 'data/activities.json',
    'semantic.mjs', 'semantic.browser.mjs', 'package.json', 'pnpm-lock.yaml', 'server.mjs',
    'prepare-browser-assets.mjs', 'prepare-notices.mjs', 'model-preflight.mjs',
    'full-card-check.mjs', 'package-release.py', 'README.md', 'LICENSE', 'CREDITS.md',
    'QA.md', 'MODEL-NOTICE.txt', 'model-provenance.json', 'notice-sources.json',
    'vendor/transformers.js', 'vendor/ort/ort-wasm-simd-threaded.jsep.mjs',
    'vendor/ort/ort-wasm-simd-threaded.jsep.wasm', 'models/LICENSE-Apache-2.0.txt',
]
model = json.loads((root / 'model-provenance.json').read_text(encoding='utf-8-sig'))
notices = json.loads((root / 'notice-sources.json').read_text(encoding='utf-8-sig'))
files += [entry['path'] for entry in model['files']]
files += [entry['target'] for entry in notices['files']]
assert len(files) == len(set(files)), 'Duplicate public file'
assert len(notices['files']) == 11, 'Review changed notice inventory'
for name in files:
    parts = PurePosixPath(name).parts
    assert not PurePosixPath(name).is_absolute() and '..' not in parts
    assert not any(part in {'node_modules', 'cache', '.git', 'entry-review', 'screenshots'} for part in parts)
    assert (root / name).is_file(), f'Missing public file: {name}'
for entry in model['files'] + notices['files']:
    name = entry.get('path', entry.get('target'))
    blob = (root / name).read_bytes()
    assert len(blob) == entry['bytes'], f'Wrong original size: {name}'
    assert hashlib.sha256(blob).hexdigest() == entry['sha256'], f'Changed original asset: {name}'
for name in files:
    if Path(name).suffix in {'.md', '.mjs', '.js', '.html', '.json', '.yaml', '.py'} and not name.startswith('vendor/'):
        text = (root / name).read_text(encoding='utf-8-sig')
        assert not re.search(r'[A-Za-z0-9._%+-]+@(?:gmail|outlook|hotmail|yahoo)\.com\b', text), f'Personal webmail address in {name}'
        assert not re.search(r'[A-Za-z]:[/\\]Users[/\\]', text), f'Absolute home directory in {name}'
archive = root / 'outside-first-0.1.zip'
records = []
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as release:
    for name in files:
        blob = (root / name).read_bytes()
        records.append({'path': name, 'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()})
        release.writestr(name, blob)
with zipfile.ZipFile(archive) as release:
    assert release.testzip() is None
    assert set(release.namelist()) == set(files)
    for entry in records:
        assert hashlib.sha256(release.read(entry['path'])).hexdigest() == entry['sha256']
manifest = {
    'checkedAt': datetime.now(timezone.utc).isoformat(),
    'fileCount': len(records), 'sourceBytes': sum(entry['bytes'] for entry in records),
    'archive': archive.name, 'archiveBytes': archive.stat().st_size,
    'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
    'exactAllowlistAndAllArchiveHashesPassed': True,
    'privateWorkspaceCachesReceiptsAndEntryDraftsExcluded': True,
    'files': records,
}
(root / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: value for key, value in manifest.items() if key != 'files'}, indent=2))
