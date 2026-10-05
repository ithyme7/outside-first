import { createSemanticMatcher, MODEL_ID, MODEL_REVISION } from './semantic.browser.mjs';

let matcher = null;
let initialization = null;

function textForCard(card) {
  // activities.json deliberately has a summary rather than a description.
  return [card.title, card.summary, card.steps.join(' '), card.tags.join(' ')].join('. ');
}

async function initialize(cards) {
  if (matcher) return { count: cards.length, dimensions: matcher.dimensions, modelId: MODEL_ID, revision: MODEL_REVISION };
  if (initialization) return initialization;
  initialization = (async () => {
    if (!Array.isArray(cards) || !cards.length) throw new TypeError('The authored activity cards are missing.');
    const candidate = await createSemanticMatcher({
      localModelPath: new URL('./models/', import.meta.url).href,
      wasmPaths: new URL('./vendor/ort/', import.meta.url).href,
      device: 'wasm',
      allowRemoteModels: false,
      progressCallback(event) {
        const file = typeof event?.file === 'string' ? event.file.split('/').pop() : undefined;
        const progress = event?.status === 'progress' && Number.isFinite(event.progress) ? event.progress : undefined;
        self.postMessage({ type: 'progress', stage: 'loading', file, progress });
      },
    });
    try {
      self.postMessage({ type: 'progress', stage: 'indexing' });
      const result = await candidate.indexCards(cards, { textForCard });
      matcher = candidate;
      return { ...result, modelId: MODEL_ID, revision: MODEL_REVISION };
    } catch (error) {
      await candidate.dispose();
      throw error;
    }
  })();
  try { return await initialization; } finally { initialization = null; }
}

// All model inference is here, keeping the interface responsive during loading.
self.onmessage = async event => {
  const packet = event.data;
  if (!packet || !Number.isInteger(packet.requestId)) return;
  const { type, requestId } = packet;
  try {
    let payload;
    if (type === 'init') payload = await initialize(packet.cards);
    else if (type === 'rank') {
      if (!matcher) throw new Error('Prepare the local guide before matching.');
      if (typeof packet.query !== 'string' || !packet.query.trim() || packet.query.length > 500) {
        throw new TypeError('Provide a preference of 1–500 characters.');
      }
      const ranked = await matcher.rank(packet.query.trim(), { limit: packet.limit });
      payload = ranked.map(({ id, score }) => ({ id, score }));
    } else if (type === 'dispose') {
      await matcher?.dispose();
      matcher = null;
      payload = { disposed: true };
    } else throw new TypeError('Unknown local model operation.');
    self.postMessage({ type: 'result', requestId, payload });
  } catch (error) {
    self.postMessage({ type: 'error', requestId, message: error instanceof Error ? error.message : 'The local model operation failed.' });
  }
};
