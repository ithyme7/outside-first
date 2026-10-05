/* Same-origin, explicit-asset cache. It never caches notes, workspace documents,
 * arbitrary URLs, remote requests, or a directory listing. Bump VERSION when
 * the shipped app or pinned model/runtime changes. */
const VERSION = 'outside-first-v3-20261005';
const SHELL_CACHE = `${VERSION}-shell`;
const MODEL_CACHE = `${VERSION}-model-751bff3`;
const BASE = new URL('./', self.registration.scope);
const assetURL = path => new URL(path, BASE).href;

const SHELL_PATHS = [
  './', './index.html', './app.css', './app.mjs', './model-worker.mjs',
  './data/activities.json', './manifest.webmanifest', './icons/leaf.svg', './icons/maskable.svg',
];
const MODEL_PATHS = [
  './semantic.browser.mjs', './vendor/transformers.js',
  './vendor/ort/ort-wasm-simd-threaded.jsep.mjs', './vendor/ort/ort-wasm-simd-threaded.jsep.wasm',
  './models/Xenova/all-MiniLM-L6-v2/config.json',
  './models/Xenova/all-MiniLM-L6-v2/tokenizer.json',
  './models/Xenova/all-MiniLM-L6-v2/tokenizer_config.json',
  './models/Xenova/all-MiniLM-L6-v2/special_tokens_map.json',
  './models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx',
];
const SHELL_URLS = new Set(SHELL_PATHS.map(assetURL));
const MODEL_URLS = new Set(MODEL_PATHS.map(assetURL));

async function fetchForCache(url) {
  const response = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
  if (!response.ok || response.type === 'opaque') throw new Error(`Could not keep ${new URL(url).pathname} (${response.status}).`);
  return response;
}

async function keepAssets(cacheName, urls, port) {
  const cache = await caches.open(cacheName);
  let done = 0;
  // Sequential caching avoids simultaneous model and WASM copies on small devices.
  for (const url of urls) {
    const existing = await cache.match(url);
    if (!existing) await cache.put(url, await fetchForCache(url));
    done += 1;
    port?.postMessage({ type: 'cache-progress', done, total: urls.length });
  }
}

async function allPresent(cacheName, urls) {
  const cache = await caches.open(cacheName);
  const entries = await Promise.all([...urls].map(url => cache.match(url)));
  return entries.every(Boolean);
}

async function status() {
  const [shellReady, modelReady] = await Promise.all([
    allPresent(SHELL_CACHE, SHELL_URLS), allPresent(MODEL_CACHE, MODEL_URLS),
  ]);
  return { type: 'cache-status', shellReady, modelReady, version: VERSION };
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await keepAssets(SHELL_CACHE, [...SHELL_URLS]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('outside-first-') && name !== SHELL_CACHE && name !== MODEL_CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== BASE.origin || url.search) return;
  const href = url.href;
  if (!SHELL_URLS.has(href) && !MODEL_URLS.has(href)) return;
  const cacheName = MODEL_URLS.has(href) ? MODEL_CACHE : SHELL_CACHE;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const saved = await cache.match(href);
    if (saved) return saved;
    const response = await fetch(event.request);
    if (response.ok && response.type !== 'opaque') await cache.put(href, response.clone());
    return response;
  })());
});

self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port || !['CACHE_STATUS', 'CACHE_MODEL'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'CACHE_MODEL') {
        await keepAssets(SHELL_CACHE, [...SHELL_URLS]);
        await keepAssets(MODEL_CACHE, [...MODEL_URLS], port);
      }
      port.postMessage(await status());
    } catch (error) {
      port.postMessage({ type: 'cache-error', error: error instanceof Error ? error.message : 'Offline preparation failed.' });
    } finally { port.close(); }
  })());
});
