import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createSemanticMatcher, activityText, MODEL_ID, MODEL_REVISION } from './semantic.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MODEL_ROOT = join(ROOT, 'models');
const MODEL_DIR = join(MODEL_ROOT, MODEL_ID);
const CACHE_DIR = join(ROOT, 'cache', 'inference');
const RECEIPT = join(ROOT, 'model-preflight-receipt.json');
const MODEL_CARD = `https://huggingface.co/${MODEL_ID}`;
const MANIFEST_URL = `https://huggingface.co/api/models/${MODEL_ID}/revision/${MODEL_REVISION}?blobs=true`;
const LICENSE_URL = 'https://www.apache.org/licenses/LICENSE-2.0.txt';
const FILES = [
  'README.md', 'config.json', 'tokenizer.json', 'tokenizer_config.json',
  'special_tokens_map.json', 'vocab.txt', 'onnx/model_quantized.onnx',
];

// Authored fixture: the model ranks these supplied cards; it does not write them.
export const FIXTURE = [
  {
    id: 'cloud-pause', title: 'Watch the clouds',
    description: 'Stand outdoors and look up at the sky. Watch cloud shapes slowly change. Notice the light and enjoy a calm pause without walking far.',
  },
  {
    id: 'bird-listening', title: 'Listen for birds',
    description: 'Find a quiet outdoor spot. Stay still and listen to birds singing and chirping. Count different bird calls and notice where the sounds come from.',
  },
  {
    id: 'leaf-details', title: 'Look closely at a leaf',
    description: 'Go outside near a tree or plant. Study a leaf without picking it. Notice its veins, edges, texture and shades of green.',
  },
  {
    id: 'gentle-walk', title: 'Take a gentle walk',
    description: 'Walk outside at an easy pace for a few minutes. Stretch your legs, move your body and pay attention to the feeling of each footstep.',
  },
];
export const QUERIES = [
  { text: 'I want to hear wildlife singing while I stay in one place.', expectedTop: 'bird-listening' },
  { text: 'I feel like strolling a little to get my legs moving.', expectedTop: 'gentle-walk' },
  { text: 'I would like a peaceful moment gazing at the shapes drifting overhead.', expectedTop: 'cloud-pause' },
];

function digest(bytes, algorithm = 'sha256') {
  return createHash(algorithm).update(bytes).digest('hex');
}
function verifyModelFile(bytes, metadata) {
  assert.equal(bytes.length, metadata.size, `${metadata.rfilename}: file size`);
  if (metadata.lfs) {
    assert.equal(digest(bytes), metadata.lfs.sha256, `${metadata.rfilename}: published LFS SHA-256`);
  } else {
    const gitBlobHash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(gitBlobHash, metadata.blobId, `${metadata.rfilename}: published Git blob SHA-1`);
  }
}
async function fetchBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} at ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function prepareFiles(download) {
  await mkdir(CACHE_DIR, { recursive: true });
  const manifestPath = join(ROOT, 'cache', 'model-source-manifest.json');
  let manifest;
  if (download) {
    manifest = JSON.parse((await fetchBytes(MANIFEST_URL)).toString('utf8'));
    assert.equal(manifest.sha, MODEL_REVISION, 'Pinned model revision');
    assert.equal(manifest.gated, false, 'Public ungated model');
    assert.equal(manifest.cardData?.license, 'apache-2.0', 'Model card license');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  } else {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(manifest.sha, MODEL_REVISION);
  }
  const fileRecords = await Promise.all(FILES.map(async name => {
    const metadata = manifest.siblings.find(file => file.rfilename === name);
    assert.ok(metadata, `Pinned source contains ${name}`);
    const path = join(MODEL_DIR, name);
    const sourceUrl = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/${name}`;
    let bytes;
    let downloadedThisRun = false;
    try {
      bytes = await readFile(path);
      verifyModelFile(bytes, metadata);
    } catch (error) {
      if (!download) throw error;
      bytes = await fetchBytes(sourceUrl);
      verifyModelFile(bytes, metadata);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
      downloadedThisRun = true;
    }
    return {
      path: relative(ROOT, path).replaceAll('\\', '/'), sourceUrl,
      bytes: bytes.length, sha256: digest(bytes),
      publishedSha256: metadata.lfs?.sha256 ?? null,
      publishedGitBlobSha1: metadata.blobId,
      downloadedThisRun,
    };
  }));
  const licensePath = join(MODEL_ROOT, 'LICENSE-Apache-2.0.txt');
  let licenseBytes;
  if (download) {
    licenseBytes = await fetchBytes(LICENSE_URL);
    await writeFile(licensePath, licenseBytes);
  } else {
    licenseBytes = await readFile(licensePath);
  }
  assert.ok(licenseBytes.toString('utf8').includes('Apache License'));
  return {
    modelId: MODEL_ID, revision: MODEL_REVISION, modelCard: MODEL_CARD,
    sourceManifest: MANIFEST_URL, gated: manifest.gated, license: manifest.cardData.license,
    sourceRepositoryLicenseFiles: manifest.siblings.filter(file => /(^|\/)(licen[sc]e|notice)(\.|$)/i.test(file.rfilename)).map(file => file.rfilename),
    files: fileRecords,
    totalModelFileBytes: fileRecords.reduce((total, file) => total + file.bytes, 0),
    licenseText: {
      path: relative(ROOT, licensePath).replaceAll('\\', '/'), sourceUrl: LICENSE_URL,
      bytes: licenseBytes.length, sha256: digest(licenseBytes),
      note: 'The Xenova source repository has an Apache-2.0 license tag but no standalone LICENSE file. This is the unmodified official Apache-2.0 license text.',
    },
  };
}

async function inferencePass(blockFetch) {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  if (blockFetch) globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Network fetch is disabled during the offline inference pass.');
  };
  const progressEvents = [];
  const started = performance.now();
  let matcher;
  try {
    matcher = await createSemanticMatcher({
      localModelPath: MODEL_ROOT + '/', cacheDir: CACHE_DIR,
      allowRemoteModels: false,
      progressCallback: event => progressEvents.push({ status: event.status, file: event.file, progress: event.progress }),
    });
    const loadMs = performance.now() - started;
    const embeddingStarted = performance.now();
    const texts = [...FIXTURE.map(activityText), ...QUERIES.map(query => query.text)];
    const vectors = await matcher.embed(texts);
    const embeddingMs = performance.now() - embeddingStarted;
    const norms = vectors.map(vector => Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)));
    assert.equal(vectors.length, 7);
    vectors.forEach((vector, index) => {
      assert.equal(vector.length, 384, `Embedding ${index}: dimensions`);
      assert.ok(vector.every(Number.isFinite), `Embedding ${index}: finite values`);
      assert.ok(Math.abs(norms[index] - 1) < 0.00001, `Embedding ${index}: unit norm`);
    });
    const indexingStarted = performance.now();
    await matcher.indexCards(FIXTURE);
    const indexingMs = performance.now() - indexingStarted;
    const rankings = [];
    for (const query of QUERIES) {
      const rankStarted = performance.now();
      const results = await matcher.rank(query.text);
      rankings.push({
        query: query.text, expectedTop: query.expectedTop,
        topMatchesExpectation: results[0].id === query.expectedTop,
        inferenceMs: performance.now() - rankStarted,
        results: results.map(result => ({ id: result.id, score: result.score })),
      });
      assert.equal(results[0].id, query.expectedTop, `Paraphrase ranking: ${query.text}`);
    }
    assert.equal(fetchCalls, 0, 'Offline pass attempted no JavaScript fetch calls');
    return {
      passed: true, freshProcess: blockFetch, device: 'cpu', dtype: 'q8', pooling: 'mean', normalized: true,
      remoteModelsAllowed: false, localFilesOnly: true, javascriptFetchBlocked: blockFetch, fetchCalls,
      timingsMs: { modelLoad: loadMs, sevenEmbeddings: embeddingMs, cardIndexing: indexingMs, total: performance.now() - started },
      embeddingValidation: { vectors: vectors.length, dimensions: 384, allFinite: true, norms, tolerance: 0.00001 },
      rankings, progressEvents,
      vectorsSha256: digest(Buffer.from(new Float32Array(vectors.flat()).buffer)),
      proofLimit: 'Remote model loading is disabled and JavaScript fetch is blocked in the second fresh process. This does not simulate an OS-level network disconnect.',
    };
  } finally {
    await matcher?.dispose();
    globalThis.fetch = originalFetch;
  }
}

async function offlineChild() {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--offline-child'], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Offline inference exceeded its 120-second bound.')); }, 120_000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Offline child failed (${code}): ${stderr || stdout}`));
      else {
        try { resolve({ ...JSON.parse(stdout), runtimeWarnings: stderr.trim() || null }); }
        catch (error) { reject(new Error(`Offline result parsing failed: ${error.message}; ${stdout}`)); }
      }
    });
  });
}

async function installedLibraryFiles() {
  const packageDir = join(ROOT, 'node_modules', '@huggingface', 'transformers');
  const metadata = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
  assert.equal(metadata.version, '3.8.1', 'Installed library version is pinned');
  assert.equal(metadata.license, 'Apache-2.0');
  const names = ['LICENSE', 'dist/transformers.js', 'dist/ort-wasm-simd-threaded.jsep.mjs', 'dist/ort-wasm-simd-threaded.jsep.wasm'];
  return await Promise.all(names.map(async name => {
    const path = join(packageDir, name);
    const bytes = await readFile(path);
    return { path: relative(ROOT, path).replaceAll('\\', '/'), bytes: bytes.length, sha256: digest(bytes) };
  }));
}

async function main() {
  if (process.argv.includes('--offline-child')) {
    console.log(JSON.stringify(await inferencePass(true)));
    return;
  }
  const receipt = {
    generatedAt: new Date().toISOString(), project: 'Outside First', preparationOnly: true,
    verifiedEarnings: 0,
    runtime: { node: process.version, platform: process.platform, architecture: process.arch },
    library: { name: '@huggingface/transformers', version: '3.8.1', license: 'Apache-2.0', source: 'https://registry.npmjs.org/@huggingface/transformers/3.8.1', docs: 'https://huggingface.co/docs/transformers.js/v3.8.1/api/pipelines', installScripts: 'disabled', npmTarballIntegrity: 'sha512-tsTk4zVjImqdqjS8/AOZg2yNLd1z9S5v+7oUPpXaasDRwEDhB+xnglK1k5cad26lL5/ZIaeREgWWy0bs9y9pPA==' },
    fixtures: FIXTURE, queries: QUERIES,
    browserVerification: { tested: false, nextStep: 'Serve semantic.mjs, the pinned model directory and the bundled ONNX WASM assets locally, then verify the same fixtures in a browser.' },
  };
  try {
    receipt.library.localFiles = await installedLibraryFiles();
    receipt.model = await prepareFiles(process.argv.includes('--download'));
    receipt.firstLocalInference = await inferencePass(false);
    receipt.secondOfflineInference = await offlineChild();
    assert.equal(receipt.firstLocalInference.vectorsSha256, receipt.secondOfflineInference.vectorsSha256, 'Same float32 embeddings after a fresh local-only reload');
    receipt.embeddingRepeatability = 'Identical float32 SHA-256 across two processes.';
    receipt.status = 'passed';
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = { message: error.message, stack: error.stack };
    receipt.nextStep = 'Inspect the recorded runtime error before continuing to browser integration. No mocked AI fallback is present.';
    process.exitCode = 1;
  }
  await writeFile(RECEIPT, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ status: receipt.status, receipt: RECEIPT, timings: receipt.secondOfflineInference?.timingsMs, rankings: receipt.secondOfflineInference?.rankings, error: receipt.error?.message }, null, 2));
}

await main();
