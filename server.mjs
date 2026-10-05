import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.OUTSIDE_FIRST_PORT ?? 8897);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port.');
const publicFiles = new Set([
  'index.html', 'app.css', 'app.mjs', 'model-worker.mjs', 'sw.js', 'manifest.webmanifest',
  'semantic.browser.mjs', 'data/activities.json', 'CREDITS.md', 'MODEL-NOTICE.txt', 'model-provenance.json', 'notice-sources.json',
  'licenses/transformers-Apache-2.0.txt', 'licenses/jinja-MIT.txt', 'licenses/onnxruntime-MIT.txt', 'licenses/onnxruntime-ThirdPartyNotices.txt',
  'licenses/emscripten-LICENSE.txt', 'licenses/emscripten-AUTHORS.txt', 'licenses/musl-COPYRIGHT.txt', 'licenses/libcxx-LICENSE.txt',
  'licenses/libcxxabi-LICENSE.txt', 'licenses/compiler-rt-LICENSE.txt', 'licenses/webpack-MIT.txt', 'models/LICENSE-Apache-2.0.txt',
  'vendor/transformers.js', 'vendor/ort/ort-wasm-simd-threaded.jsep.mjs', 'vendor/ort/ort-wasm-simd-threaded.jsep.wasm',
  'models/Xenova/all-MiniLM-L6-v2/config.json', 'models/Xenova/all-MiniLM-L6-v2/tokenizer.json',
  'models/Xenova/all-MiniLM-L6-v2/tokenizer_config.json', 'models/Xenova/all-MiniLM-L6-v2/special_tokens_map.json',
  'models/Xenova/all-MiniLM-L6-v2/vocab.txt', 'models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx',
]);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.onnx': 'application/octet-stream' };
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html'; }
  catch { res.writeHead(400); return res.end('Bad path'); }
  const allowedIcon = /^icons\/[A-Za-z0-9_-]+\.svg$/.test(name);
  if (!publicFiles.has(name) && !allowedIcon) { res.writeHead(404); return res.end('Not found'); }
  try {
    const path = join(root, name);
    const info = await stat(path);
    if (!info.isFile()) throw new Error('Not a file');
    const suffix = name.slice(name.lastIndexOf('.'));
    res.writeHead(200, {
      'Content-Type': mime[suffix] ?? 'application/octet-stream', 'Content-Length': info.size,
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
    if (req.method === 'HEAD') return res.end();
    res.end(await readFile(path));
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
server.listen(port, '127.0.0.1', () => console.log(`Outside First preview: http://127.0.0.1:${port}/ (allowlisted project files only)`));
