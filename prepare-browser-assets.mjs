import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'node_modules', '@huggingface', 'transformers', 'dist');
const files = [
  ['transformers.js', 'vendor/transformers.js', 'ca697cc102b304de065fbbbd7f3714084d18531509741066ea0bb0326a8ac815'],
  ['ort-wasm-simd-threaded.jsep.mjs', 'vendor/ort/ort-wasm-simd-threaded.jsep.mjs', '08fb86ec433c78bfb032c5d84a68b8e8e5a8d81268fa39e24314179a5767a5b9'],
  ['ort-wasm-simd-threaded.jsep.wasm', 'vendor/ort/ort-wasm-simd-threaded.jsep.wasm', 'c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39'],
];
const receipt = [];
for (const [sourceName, targetName, expected] of files) {
  const source = join(dist, sourceName);
  const bytes = await readFile(source);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expected) throw new Error(`Unexpected source hash: ${sourceName}`);
  const target = join(root, targetName);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  receipt.push({ source: `node_modules/@huggingface/transformers/dist/${sourceName}`, target: targetName, bytes: (await stat(target)).size, sha256: hash });
}
const semantic = await readFile(join(root, 'semantic.mjs'), 'utf8');
const originalImport = "import { env, pipeline } from '@huggingface/transformers';";
if (!semantic.startsWith(originalImport)) throw new Error('Semantic import changed; review browser conversion.');
await writeFile(join(root, 'semantic.browser.mjs'), semantic.replace(originalImport, "import { env, pipeline } from './vendor/transformers.js';"));
await writeFile(join(root, 'browser-assets-receipt.json'), JSON.stringify({ checkedAt: new Date().toISOString(), package: '@huggingface/transformers', version: '3.8.1', transformation: 'Exact package import replaced with local fully bundled browser module; other semantic code unchanged.', files: receipt }, null, 2) + '\n');
console.log(JSON.stringify({ prepared: receipt.length, localBrowserModule: 'semantic.browser.mjs', networkCalls: 0 }));
