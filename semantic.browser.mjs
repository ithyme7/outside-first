import { env, pipeline } from './vendor/transformers.js';

// Apache-2.0 model; attribution and the pinned local file hashes are in MODEL-NOTICE.txt
// and model-preflight-receipt.json. No generated activity text or remote inference.
export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const MODEL_REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
export const EMBEDDING_DIMENSIONS = 384;

export function activityText(card) {
  const steps = Array.isArray(card.steps) ? card.steps.join(' ') : card.steps;
  const tags = Array.isArray(card.tags) ? card.tags.join(' ') : card.tags;
  return [card.title, card.description, steps, tags].filter(Boolean).join('. ');
}

export function cosineSimilarity(left, right) {
  if (left.length !== right.length || left.length === 0) {
    throw new TypeError('Cosine similarity needs equal, nonempty vectors.');
  }
  let dot = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  for (let i = 0; i < left.length; i += 1) {
    if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) {
      throw new TypeError('Embedding values must be finite.');
    }
    dot += left[i] * right[i];
    leftSquared += left[i] * left[i];
    rightSquared += right[i] * right[i];
  }
  if (!leftSquared || !rightSquared) throw new TypeError('Embedding norms must be nonzero.');
  return Math.max(-1, Math.min(1, dot / Math.sqrt(leftSquared * rightSquared)));
}

/**
 * Load a real local sentence embedding model. The model directory has the layout
 * models/Xenova/all-MiniLM-L6-v2/{config.json,tokenizer.json,onnx/model_quantized.onnx,...}.
 * Browser callers can pass localModelPath:'/models/' and local wasmPaths to keep
 * runtime assets on the same origin. Node callers should pass an absolute directory.
 * Transformers.js environment settings are process-wide: configure one model loader
 * per app. progressCallback receives the library's model-loading progress events.
 * Remote model access defaults to disabled; opting in only downloads model assets.
 */
export async function createSemanticMatcher({
  localModelPath = '/models/',
  cacheDir,
  wasmPaths,
  device = typeof process !== 'undefined' && process.versions?.node ? 'cpu' : 'wasm',
  allowRemoteModels = false,
  progressCallback,
} = {}) {
  env.allowLocalModels = true;
  env.allowRemoteModels = allowRemoteModels;
  env.localModelPath = localModelPath;
  if (cacheDir !== undefined) env.cacheDir = cacheDir;
  // One WASM thread also works on pages without cross-origin isolation.
  env.backends.onnx.wasm.numThreads = 1;
  if (wasmPaths !== undefined) env.backends.onnx.wasm.wasmPaths = wasmPaths;

  const extractor = await pipeline('feature-extraction', MODEL_ID, {
    revision: MODEL_REVISION,
    dtype: 'q8',
    device,
    local_files_only: !allowRemoteModels,
    progress_callback: progressCallback,
  });

  let indexedCards = [];
  let indexedVectors = [];
  let disposed = false;

  async function embed(texts) {
    if (disposed) throw new Error('This matcher has been disposed.');
    const inputs = typeof texts === 'string' ? [texts] : texts;
    if (!Array.isArray(inputs) || !inputs.length || inputs.some(text => typeof text !== 'string' || !text.trim())) {
      throw new TypeError('Provide at least one nonempty text string.');
    }
    const tensor = await extractor(inputs, { pooling: 'mean', normalize: true });
    const vectors = tensor.tolist();
    if (vectors.length !== inputs.length || vectors.some(vector =>
      vector.length !== EMBEDDING_DIMENSIONS || vector.some(value => !Number.isFinite(value)))) {
      throw new Error('The model returned an unexpected embedding shape or nonfinite values.');
    }
    return vectors;
  }

  async function indexCards(cards, { textForCard = activityText } = {}) {
    if (!Array.isArray(cards) || !cards.length) throw new TypeError('Provide at least one activity card.');
    const vectors = await embed(cards.map(textForCard));
    indexedCards = cards.slice();
    indexedVectors = vectors;
    return { count: cards.length, dimensions: EMBEDDING_DIMENSIONS };
  }

  async function rank(query, { limit = indexedCards.length } = {}) {
    if (!indexedCards.length) throw new Error('Call indexCards before ranking a preference.');
    if (!Number.isInteger(limit) || limit < 1) throw new TypeError('The result limit must be a positive integer.');
    const [queryVector] = await embed(query);
    return indexedCards.map((card, index) => ({
      card,
      id: card.id,
      index,
      score: cosineSimilarity(queryVector, indexedVectors[index]),
    })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit);
  }

  return {
    modelId: MODEL_ID,
    revision: MODEL_REVISION,
    dimensions: EMBEDDING_DIMENSIONS,
    embed,
    indexCards,
    rank,
    async dispose() {
      if (!disposed) await extractor.dispose();
      disposed = true;
      indexedCards = [];
      indexedVectors = [];
    },
  };
}
