import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
await mkdir(join(root, 'licenses'), { recursive: true });
const copied = [
  ['node_modules/@huggingface/transformers/LICENSE', 'licenses/transformers-Apache-2.0.txt'],
  ['node_modules/.pnpm/@huggingface+jinja@0.5.10/node_modules/@huggingface/jinja/LICENSE', 'licenses/jinja-MIT.txt'],
];
const records = [];
for (const [source, target] of copied) {
  await copyFile(join(root, source), join(root, target));
  const bytes = await readFile(join(root, target));
  records.push({ source, target, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), unmodified: true });
}
const onnx = 'https://raw.githubusercontent.com/microsoft/onnxruntime/89f8206ba4f1c22c39e0297fb55272e8ce8cd7d0/';
const emscripten = 'https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.4/';
const downloads = [
  [onnx + 'LICENSE', 'licenses/onnxruntime-MIT.txt'],
  [onnx + 'ThirdPartyNotices.txt', 'licenses/onnxruntime-ThirdPartyNotices.txt'],
  [emscripten + 'LICENSE', 'licenses/emscripten-LICENSE.txt'],
  [emscripten + 'AUTHORS', 'licenses/emscripten-AUTHORS.txt'],
  [emscripten + 'system/lib/libc/musl/COPYRIGHT', 'licenses/musl-COPYRIGHT.txt'],
  [emscripten + 'system/lib/libcxx/LICENSE.TXT', 'licenses/libcxx-LICENSE.txt'],
  [emscripten + 'system/lib/libcxxabi/LICENSE.TXT', 'licenses/libcxxabi-LICENSE.txt'],
  [emscripten + 'system/lib/compiler-rt/LICENSE.TXT', 'licenses/compiler-rt-LICENSE.txt'],
  ['https://raw.githubusercontent.com/webpack/webpack/v5.97.1/LICENSE', 'licenses/webpack-MIT.txt'],
];
for (const [source, target] of downloads) {
  const response = await fetch(source, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Notice unavailable: ${response.status} ${source}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || /<!doctype html|<html/i.test(bytes.toString('utf8').slice(0,500))) throw new Error('Unexpected notice content.');
  await writeFile(join(root, target), bytes);
  records.push({ source, target, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), unmodified: true });
}
await writeFile(join(root, 'notice-sources.json'), JSON.stringify({ checkedAt: new Date().toISOString(), files: records, scope: 'Original notices preserved for the shipped browser bundle and prebuilt WASM; broader upstream notice list does not establish all components are linked. Emscripten and Webpack versions are source CI/lock inferences.', eigenSource: 'https://gitlab.com/libeigen/eigen/-/archive/1d8b82b0740839c0de7f1242a3585e3390ff5f33/eigen-1d8b82b0740839c0de7f1242a3585e3390ff5f33.zip', eigenLicense: 'MPL-2.0; full license text retained in ONNX upstream ThirdPartyNotices.txt.' }, null, 2) + '\n');
console.log(JSON.stringify({ originalNoticeFiles: records.length, eigenSourceAvailabilityRecorded: true }));
