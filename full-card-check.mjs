import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSemanticMatcher } from './semantic.mjs';

const cards = JSON.parse(await readFile(new URL('./data/activities.json', import.meta.url), 'utf8'));
assert.equal(cards.length, 20);
assert.equal(new Set(cards.map(card => card.id)).size, 20);
for (const card of cards) {
  assert.ok([5, 10, 15].includes(card.minutes));
  assert.equal(typeof card.stationary, 'boolean');
  assert.equal(card.steps.length, 3);
  assert.ok(card.title && card.summary && card.notePrompt);
}
const matcher = await createSemanticMatcher({ localModelPath: fileURLToPath(new URL('./models/', import.meta.url)), cacheDir: fileURLToPath(new URL('./cache/', import.meta.url)), allowRemoteModels: false });
const indexed = await matcher.indexCards(cards, { textForCard: card => [card.title, card.summary, ...card.steps, ...card.tags].join('. ') });
const cases = [
  { query: 'I want to hear wildlife singing while I stay in one place.', expected: 'bird-listening' },
  { query: 'I would like a peaceful moment gazing at the shapes drifting overhead.', expected: 'cloud-drift' },
];
const results = [];
for (const item of cases) {
  const rankings = await matcher.rank(item.query, { limit: cards.length });
  assert.equal(rankings.length, 20);
  assert.ok(rankings.every(row => Number.isFinite(row.score) && row.score >= -1 && row.score <= 1));
  assert.equal(rankings[0].id, item.expected);
  const eligible = rankings.filter(row => row.card.minutes <= 5 && row.card.stationary);
  assert.ok(eligible.length > 0);
  assert.ok(eligible.every(row => row.card.minutes <= 5 && row.card.stationary));
  results.push({ query: item.query, topFive: rankings.slice(0, 5).map(({ id, score }) => ({ id, score })), eligibleTop: eligible[0].id });
}
await matcher.dispose();
const receipt = { checkedAt: new Date().toISOString(), scope: 'Actual 20 authored cards, genuine local Node inference; browser UI filters still require browser verification.', indexed, cases: results, assertionsPassed: true };
await writeFile(new URL('./full-card-check-receipt.json', import.meta.url), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
