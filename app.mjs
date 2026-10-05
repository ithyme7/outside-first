const STORAGE_PREFIX = 'outside-first:v1:';
const NOTES_KEY = `${STORAGE_PREFIX}notes`;
const PREFERENCES_KEY = `${STORAGE_PREFIX}preferences`;
const MAX_QUERY_LENGTH = 500;
const MAX_NOTE_LENGTH = 280;

/** Time is an upper limit. This function is also usable by the constraint tests. */
export function eligibleCards(cards, { minutes = 5, stationary = false } = {}) {
  if (![5, 10, 15].includes(Number(minutes))) throw new TypeError('Choose 5, 10, or 15 minutes.');
  return cards.filter(card => card.minutes <= Number(minutes) && (!stationary || card.stationary === true));
}

export function validatePreference(value) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Tell the guide one thing you would enjoy noticing.');
  if (value.length > MAX_QUERY_LENGTH) throw new TypeError('Keep your preference to 500 characters or fewer.');
  return value.trim();
}

export function rankEligibleCards(cards, ranked, constraints) {
  const allowed = new Map(eligibleCards(cards, constraints).map(card => [card.id, card]));
  const seen = new Set();
  return ranked.filter(item => allowed.has(item.id) && Number.isFinite(item.score) && !seen.has(item.id) && seen.add(item.id))
    .map(item => ({ card: allowed.get(item.id), score: item.score }));
}

function readStored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}

function writeStored(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function cleanNotes(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(note => note && typeof note.id === 'string' && typeof note.cardId === 'string' &&
    typeof note.title === 'string' && typeof note.text === 'string' && note.text.trim() &&
    note.text.length <= MAX_NOTE_LENGTH && Number.isFinite(Date.parse(note.createdAt)))
    .map(note => ({ id: note.id.slice(0, 100), cardId: note.cardId.slice(0, 100), title: note.title.slice(0, 160),
      text: note.text, createdAt: note.createdAt })).slice(0, 500);
}

if (typeof document !== 'undefined') {
  const element = id => document.getElementById(id);
  const ui = Object.fromEntries(['moment-form', 'preference', 'char-count', 'preference-help', 'stationary', 'find-moment',
    'find-label', 'form-status', 'model-dot', 'model-status', 'model-progress', 'prepare-model', 'manual-mode',
    'offline-status', 'prepare-offline', 'manual-browser', 'manual-cards', 'manual-description', 'mission-section',
    'mission-title', 'mission-meta', 'mission-summary', 'mission-steps', 'match-badge', 'match-reason', 'mission-tags',
    'alternative-wrap', 'alternative-title', 'alternative-meta', 'choose-alternative', 'field-note-form', 'field-note',
    'field-note-label', 'note-status', 'notes-dialog', 'notes-list', 'note-count', 'notes-storage-status', 'pocket-dialog',
    'pocket-title', 'pocket-meta', 'pocket-steps', 'start-timer', 'timer-display', 'about-dialog', 'about-readiness']
    .map(id => [id, element(id)]));

  const state = { cards: [], mode: 'unprepared', busy: false, worker: null, requests: new Map(), requestId: 0,
    operation: 0, mission: null, choices: [], activeChoice: 0, lastQuery: '', constraints: { minutes: 5, stationary: false },
    notes: cleanNotes(readStored(NOTES_KEY, [])), timerStarted: null, timerInterval: null, offlineReady: false };
  const preferences = readStored(PREFERENCES_KEY, {});
  if (preferences && typeof preferences === 'object') {
    if (typeof preferences.preference === 'string') ui.preference.value = preferences.preference.slice(0, MAX_QUERY_LENGTH);
    if ([5, 10, 15].includes(Number(preferences.minutes))) {
      document.querySelector(`input[name="minutes"][value="${Number(preferences.minutes)}"]`).checked = true;
    }
    ui.stationary.checked = preferences.stationary === true;
  }

  function constraints() {
    return { minutes: Number(document.querySelector('input[name="minutes"]:checked').value), stationary: ui.stationary.checked };
  }

  function invalidateMission() {
    if (!state.mission) return;
    state.mission = null;
    state.choices = [];
    ui['mission-section'].hidden = true;
    stopTimer();
    setFormStatus('Your choices changed. Find a new outside moment when you are ready.');
  }

  function savePreferences() {
    writeStored(PREFERENCES_KEY, { preference: ui.preference.value.slice(0, MAX_QUERY_LENGTH), ...constraints() });
  }

  function updateControls() {
    const usable = state.cards.length && (state.mode === 'ready' || state.mode === 'manual');
    ui['find-moment'].disabled = !usable || state.busy;
    ui['find-label'].textContent = state.busy ? 'Finding your moment…' : state.mode === 'manual' ? 'Browse field cards' : 'Find my outside moment';
    ui['prepare-model'].disabled = state.mode === 'loading' || state.busy || !state.cards.length;
    ui['prepare-model'].textContent = state.mode === 'ready' ? 'Local guide ready' : state.mode === 'error' ? 'Try preparation again' : 'Prepare local guide';
    if (state.mode === 'ready') ui['prepare-model'].disabled = true;
    ui['manual-mode'].textContent = state.mode === 'manual' ? 'Manual mode is on' : 'Choose a card myself';
    ui['manual-mode'].disabled = state.mode === 'manual' || !state.cards.length;
    ui['prepare-offline'].disabled = state.mode !== 'ready' || state.offlineReady || !('serviceWorker' in navigator);
    document.querySelectorAll('input[name="minutes"]').forEach(input => { input.disabled = state.busy; });
    ui.stationary.disabled = state.busy;
    ui.preference.disabled = state.busy;
    document.querySelectorAll('[data-idea]').forEach(button => { button.disabled = state.busy; });
    ui['preference-help'].textContent = state.mode === 'manual'
      ? 'Manual mode: choose an authored card. Your words are not used to rank it.'
      : 'A feeling, a small curiosity, or something you enjoy.';
  }

  function setFormStatus(message, error = false) {
    ui['form-status'].textContent = message;
    ui['form-status'].classList.toggle('error-text', error);
  }

  function setModelStatus(mode, message) {
    state.mode = mode;
    ui['model-status'].textContent = message;
    ui['model-status'].classList.toggle('error-text', mode === 'error');
    ui['model-dot'].className = `status-dot ${mode === 'ready' ? 'ready' : mode === 'loading' ? 'loading' : mode === 'error' ? 'error' : ''}`;
    ui['model-progress'].hidden = mode !== 'loading';
    ui['about-readiness'].textContent = mode === 'ready'
      ? 'The local model loaded and indexed all 20 cards successfully in this browser session.'
      : mode === 'manual' ? 'Manual mode is on. The open model is not choosing your cards.'
      : mode === 'error' ? 'The model could not be prepared in this session. Manual cards remain available.'
      : mode === 'loading' ? 'The local guide is preparing in this browser session.' : 'The local guide has not been prepared in this session.';
    updateControls();
  }

  function terminateWorker(reason = 'The local guide was stopped.') {
    state.worker?.terminate();
    state.worker = null;
    state.requests.forEach(request => { clearTimeout(request.timeout); request.reject(new Error(reason)); });
    state.requests.clear();
  }

  function createWorker() {
    terminateWorker();
    const worker = new Worker(new URL('./model-worker.mjs', import.meta.url), { type: 'module', name: 'outside-first-local-guide' });
    worker.onmessage = event => {
      const packet = event.data;
      if (!packet || typeof packet !== 'object') return;
      if (packet.type === 'progress' && state.mode === 'loading') {
        if (Number.isFinite(packet.progress)) {
          ui['model-progress'].value = Math.max(0, Math.min(100, packet.progress));
          ui['model-status'].textContent = `Preparing local model assets · ${Math.round(ui['model-progress'].value)}% of ${packet.file || 'current file'}`;
        } else {
          ui['model-progress'].removeAttribute('value');
          ui['model-status'].textContent = packet.stage === 'indexing'
            ? 'Model loaded. Comparing the 20 authored cards on this device…' : 'Loading the model and runtime from this app’s server…';
        }
        return;
      }
      const request = state.requests.get(packet.requestId);
      if (!request) return;
      clearTimeout(request.timeout);
      state.requests.delete(packet.requestId);
      if (packet.type === 'error') request.reject(new Error(packet.message || 'The local model could not finish.'));
      else if (packet.type === 'result') request.resolve(packet.payload);
    };
    worker.onerror = event => {
      event.preventDefault();
      const message = event.message || 'The browser could not start the local model worker.';
      const hadRequests = state.requests.size > 0;
      terminateWorker(message);
      if (!hadRequests && state.mode === 'ready') {
        setModelStatus('error', 'The local guide stopped. Try preparation again, or choose a card yourself.');
        setFormStatus('The guide is unavailable. Your field notes are still here.', true);
      }
    };
    state.worker = worker;
  }

  function askWorker(type, data, timeoutMs = 180000) {
    if (!state.worker) return Promise.reject(new Error('Prepare the local guide first.'));
    const requestId = ++state.requestId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        state.requests.delete(requestId);
        reject(new Error('Preparation took too long in this browser. Try again, or choose a card yourself.'));
      }, timeoutMs);
      state.requests.set(requestId, { resolve, reject, timeout });
      state.worker.postMessage({ type, requestId, ...data });
    });
  }

  async function prepareModel() {
    if (!state.cards.length || state.mode === 'loading' || state.mode === 'ready') return;
    const operation = ++state.operation;
    state.busy = false;
    setModelStatus('loading', 'Loading the model and runtime from this app’s server…');
    ui['model-progress'].removeAttribute('value');
    setFormStatus('Your preference stays here while the guide prepares.');
    try {
      createWorker();
      const result = await askWorker('init', { cards: state.cards });
      if (operation !== state.operation) return;
      if (result?.count !== state.cards.length || result?.dimensions !== 384) throw new Error('The local card index was incomplete.');
      setModelStatus('ready', 'Local guide ready. The model has loaded and indexed 20 cards here. Your words stay on this device.');
      setFormStatus('Ready when you are. Describe a little thing you would enjoy.');
      ui['manual-browser'].hidden = true;
      refreshOfflineStatus();
    } catch (error) {
      if (operation !== state.operation) return;
      terminateWorker();
      setModelStatus('error', 'The local guide could not load. Check that the app server has its model and runtime files, then retry. You can also choose a card yourself.');
      setFormStatus(error.message || 'The local guide is unavailable.', true);
    }
  }

  function manualMode() {
    ++state.operation;
    state.busy = false;
    terminateWorker('Manual mode was selected.');
    invalidateMission();
    setModelStatus('manual', 'Manual mode is on. These are the same authored cards, without model matching.');
    setFormStatus('Choose a card below. Your time and stay-in-one-place choices still apply.');
    renderManualCards();
    ui['manual-browser'].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function smallArrow() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 12h15M13 6l6 6-6 6');
    svg.append(path);
    return svg;
  }

  function renderManualCards() {
    const cards = eligibleCards(state.cards, constraints());
    ui['manual-browser'].hidden = false;
    ui['manual-description'].textContent = `${cards.length} authored cards fit your choices. Pick one yourself; the model is not ranking these.`;
    ui['manual-cards'].replaceChildren();
    cards.forEach(card => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'manual-choice';
      const meta = document.createElement('span');
      meta.textContent = `${card.minutes} MINUTES · ${card.stationary ? 'STAY IN ONE PLACE' : 'A FAMILIAR SHORT WALK'}`;
      const title = document.createElement('strong');
      title.textContent = card.title;
      const summary = document.createElement('small');
      summary.textContent = card.summary;
      button.append(meta, title, summary, smallArrow());
      button.addEventListener('click', () => {
        state.choices = [{ card, score: null }];
        state.activeChoice = 0;
        state.lastQuery = '';
        state.constraints = constraints();
        showMission(card, 'manual');
      });
      ui['manual-cards'].append(button);
    });
  }

  function fillSteps(target, steps) {
    target.replaceChildren();
    steps.forEach(step => {
      const item = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = step;
      item.append(text);
      target.append(item);
    });
  }

  function showMission(card, source) {
    stopTimer();
    state.mission = { card, source };
    ui['mission-section'].hidden = false;
    ui['mission-title'].textContent = card.title;
    ui['mission-meta'].textContent = `${card.minutes} minutes · ${card.stationary ? 'Stay in one place' : 'A familiar short walk'}`;
    ui['mission-summary'].textContent = card.summary;
    fillSteps(ui['mission-steps'], card.steps);
    ui['match-badge'].textContent = source === 'model' ? 'Matched on your device' : 'Chosen by you';
    ui['match-reason'].textContent = source === 'model'
      ? `The local model compared your words with all 20 authored cards. This is ${state.activeChoice === 0 ? 'the highest' : 'another'} eligible match within your ${state.constraints.minutes}-minute limit${state.constraints.stationary ? ', with no walk required' : ''}. Its focus: ${card.tags.slice(0, 3).join(', ')}.`
      : `You chose this card yourself. It fits your ${state.constraints.minutes}-minute limit${state.constraints.stationary ? ' and lets you stay in one place' : ''}. Its focus: ${card.tags.slice(0, 3).join(', ')}.`;
    ui['mission-tags'].replaceChildren();
    card.tags.slice(0, 3).forEach(tag => { const span = document.createElement('span'); span.textContent = tag; ui['mission-tags'].append(span); });
    const alternateIndex = state.activeChoice === 0 ? 1 : 0;
    const alternate = source === 'model' ? state.choices[alternateIndex]?.card : null;
    ui['alternative-wrap'].hidden = !alternate;
    if (alternate) {
      ui['alternative-title'].textContent = alternate.title;
      ui['alternative-meta'].textContent = `${alternate.minutes} minutes · ${alternate.stationary ? 'Stay in one place' : 'A familiar short walk'}`;
    }
    ui['field-note-label'].textContent = card.notePrompt;
    ui['field-note'].value = '';
    ui['note-status'].textContent = '';
    ui['note-status'].classList.remove('error-text');
    ui['mission-title'].focus({ preventScroll: true });
    ui['mission-section'].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function findMoment(event) {
    event.preventDefault();
    if (state.busy || !state.cards.length) return;
    if (state.mode === 'manual') {
      renderManualCards();
      ui['manual-browser'].scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (state.mode !== 'ready') return;
    let query;
    try { query = validatePreference(ui.preference.value); } catch (error) {
      setFormStatus(error.message, true);
      ui.preference.focus();
      return;
    }
    const operation = ++state.operation;
    state.busy = true;
    state.constraints = constraints();
    state.lastQuery = query;
    savePreferences();
    updateControls();
    setFormStatus('Comparing your words with the authored cards on this device…');
    try {
      const ranked = await askWorker('rank', { query, limit: state.cards.length }, 60000);
      if (operation !== state.operation) return;
      if (!Array.isArray(ranked)) throw new Error('The local guide returned an unexpected result.');
      state.choices = rankEligibleCards(state.cards, ranked, state.constraints).slice(0, 2);
      if (!state.choices.length) throw new Error('No card matched your constraints. Try another time choice.');
      state.activeChoice = 0;
      showMission(state.choices[0].card, 'model');
      setFormStatus('Your pocket card is ready. Take your attention outside.');
    } catch (error) {
      if (operation !== state.operation) return;
      setFormStatus(`${error.message} You can choose a card yourself.`, true);
      terminateWorker();
      setModelStatus('error', 'The local guide could not finish matching. Retry preparation, or choose a card yourself.');
    } finally {
      if (operation === state.operation) { state.busy = false; updateControls(); }
    }
  }

  function updateNoteCount() {
    ui['note-count'].hidden = state.notes.length === 0;
    ui['note-count'].textContent = String(state.notes.length);
  }

  function renderNotes() {
    ui['notes-list'].replaceChildren();
    if (!state.notes.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-notes';
      const icon = document.createElement('img');
      icon.src = new URL('./icons/leaf.svg', import.meta.url).href;
      icon.alt = '';
      const heading = document.createElement('h3');
      heading.textContent = 'A fresh page.';
      const text = document.createElement('p');
      text.textContent = 'After your outside moment, keep one small detail here. No perfect words needed.';
      empty.append(icon, heading, text);
      ui['notes-list'].append(empty);
    }
    state.notes.forEach(note => {
      const article = document.createElement('article');
      article.className = 'saved-note';
      const header = document.createElement('div');
      header.className = 'saved-note-header';
      const title = document.createElement('h3');
      title.textContent = note.title;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'text-button delete-note';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete field note for ${note.title}`);
      remove.addEventListener('click', () => {
        const next = state.notes.filter(item => item.id !== note.id);
        if (!writeStored(NOTES_KEY, next)) {
          ui['notes-storage-status'].textContent = 'This browser could not delete the stored note. Check its storage permissions.';
          ui['notes-storage-status'].classList.add('error-text');
          return;
        }
        state.notes = next;
        updateNoteCount();
        renderNotes();
        ui['notes-storage-status'].textContent = 'Field note deleted from this browser.';
        ui['notes-storage-status'].classList.remove('error-text');
      });
      header.append(title, remove);
      const time = document.createElement('time');
      time.dateTime = note.createdAt;
      time.textContent = new Date(note.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const text = document.createElement('p');
      text.textContent = note.text;
      article.append(header, time, text);
      ui['notes-list'].append(article);
    });
  }

  function saveFieldNote(event) {
    event.preventDefault();
    if (!state.mission) return;
    const text = ui['field-note'].value.trim();
    if (!text || text.length > MAX_NOTE_LENGTH) {
      ui['note-status'].textContent = 'Keep one line, up to 280 characters.';
      ui['note-status'].classList.add('error-text');
      return;
    }
    if (state.notes.length >= 500) {
      ui['note-status'].textContent = 'Your notebook has 500 notes. Delete an older note to make a little room.';
      ui['note-status'].classList.add('error-text');
      return;
    }
    const note = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      cardId: state.mission.card.id, title: state.mission.card.title, text, createdAt: new Date().toISOString() };
    const next = [note, ...state.notes];
    if (!writeStored(NOTES_KEY, next)) {
      ui['note-status'].textContent = 'This browser could not save your note. Check its storage permissions; your words are still in the box.';
      ui['note-status'].classList.add('error-text');
      return;
    }
    state.notes = next;
    updateNoteCount();
    ui['field-note'].value = '';
    ui['note-status'].textContent = 'Kept here, in this browser. See it in My field notes.';
    ui['note-status'].classList.remove('error-text');
  }

  function openPocket() {
    if (!state.mission) return;
    const { card } = state.mission;
    ui['pocket-title'].textContent = card.title;
    ui['pocket-meta'].textContent = `${card.minutes} minutes · ${card.setting}`;
    fillSteps(ui['pocket-steps'], card.steps);
    ui['pocket-dialog'].showModal();
  }

  function stopTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = null;
    state.timerStarted = null;
    ui['timer-display'].hidden = true;
    ui['timer-display'].textContent = '00:00';
    ui['start-timer'].textContent = 'Start optional elapsed timer';
  }

  function updateTimer() {
    if (!state.timerStarted) return;
    const seconds = Math.max(0, Math.floor((Date.now() - state.timerStarted) / 1000));
    const minutes = Math.floor(seconds / 60);
    ui['timer-display'].textContent = `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  async function serviceWorkerRequest(type, timeoutMs = 120000) {
    if (!('serviceWorker' in navigator)) throw new Error('This browser does not support offline preparation.');
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('The offline worker is not ready. Refresh once and try again.')), 15000)),
    ]);
    const target = navigator.serviceWorker.controller || registration.active;
    if (!target) throw new Error('The offline worker is not ready. Refresh once and try again.');
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => { channel.port1.close(); reject(new Error('Offline preparation took too long. Keep the app server available and retry.')); }, timeoutMs);
      channel.port1.onmessage = event => {
        const packet = event.data;
        if (packet?.type === 'cache-progress') {
          ui['offline-status'].textContent = `Keeping local assets · ${packet.done} of ${packet.total} files`;
          return;
        }
        clearTimeout(timeout);
        channel.port1.close();
        if (packet?.error) reject(new Error(packet.error));
        else resolve(packet);
      };
      target.postMessage({ type }, [channel.port2]);
    });
  }

  async function refreshOfflineStatus() {
    try {
      const result = await serviceWorkerRequest('CACHE_STATUS', 15000);
      state.offlineReady = result?.modelReady === true && result?.shellReady === true;
      ui['offline-status'].textContent = state.offlineReady
        ? 'App, model & runtime kept on this device.'
        : result?.shellReady ? 'App shell kept. Keep the model for offline matching.' : 'Offline use is not prepared yet.';
      ui['prepare-offline'].textContent = state.offlineReady ? 'Kept for offline use' : 'Keep for offline use';
      updateControls();
    } catch {
      ui['offline-status'].textContent = 'Offline preparation needs a supported browser on localhost or HTTPS.';
    }
  }

  async function prepareOffline() {
    if (state.mode !== 'ready' || state.offlineReady) return;
    ui['prepare-offline'].disabled = true;
    ui['offline-status'].textContent = 'Keeping the app, local model, and runtime on this device…';
    try {
      const result = await serviceWorkerRequest('CACHE_MODEL');
      if (!result?.modelReady || !result?.shellReady) throw new Error('The local asset cache is incomplete.');
      state.offlineReady = true;
      ui['offline-status'].textContent = 'App, model & runtime kept on this device.';
      ui['prepare-offline'].textContent = 'Kept for offline use';
    } catch (error) {
      ui['offline-status'].textContent = `${error.message} Keep the app server available and retry.`;
    }
    updateControls();
  }

  ui.preference.addEventListener('input', () => { ui['char-count'].textContent = `${ui.preference.value.length} / 500`; invalidateMission(); savePreferences(); });
  ui['char-count'].textContent = `${ui.preference.value.length} / 500`;
  document.querySelectorAll('[data-idea]').forEach(button => button.addEventListener('click', () => {
    ui.preference.value = button.dataset.idea;
    ui.preference.dispatchEvent(new Event('input'));
    ui.preference.focus();
  }));
  document.querySelectorAll('input[name="minutes"], #stationary').forEach(input => input.addEventListener('change', () => {
    savePreferences();
    invalidateMission();
    if (state.mode === 'manual') renderManualCards();
  }));
  ui['moment-form'].addEventListener('submit', findMoment);
  ui['prepare-model'].addEventListener('click', prepareModel);
  ui['manual-mode'].addEventListener('click', manualMode);
  ui['prepare-offline'].addEventListener('click', prepareOffline);
  ui['choose-alternative'].addEventListener('click', () => {
    state.activeChoice = state.activeChoice === 0 ? 1 : 0;
    const card = state.choices[state.activeChoice]?.card;
    if (card) showMission(card, 'model');
  });
  ui['field-note-form'].addEventListener('submit', saveFieldNote);
  element('open-pocket').addEventListener('click', openPocket);
  element('close-pocket').addEventListener('click', () => { ui['pocket-dialog'].close(); stopTimer(); });
  element('return-from-outside').addEventListener('click', () => {
    ui['pocket-dialog'].close();
    stopTimer();
    ui['field-note-form'].scrollIntoView({ behavior: 'smooth', block: 'center' });
    ui['field-note'].focus({ preventScroll: true });
  });
  ui['pocket-dialog'].addEventListener('close', stopTimer);
  ui['start-timer'].addEventListener('click', () => {
    if (state.timerStarted) { stopTimer(); return; }
    state.timerStarted = Date.now();
    ui['timer-display'].hidden = false;
    ui['start-timer'].textContent = 'Stop elapsed timer';
    updateTimer();
    state.timerInterval = setInterval(updateTimer, 1000);
  });
  element('open-notes').addEventListener('click', () => {
    renderNotes();
    ui['notes-storage-status'].textContent = '';
    ui['notes-dialog'].showModal();
  });
  ['close-notes', 'notes-done'].forEach(id => element(id).addEventListener('click', () => ui['notes-dialog'].close()));
  element('open-about').addEventListener('click', () => ui['about-dialog'].showModal());
  ['close-about', 'about-done'].forEach(id => element(id).addEventListener('click', () => ui['about-dialog'].close()));
  document.addEventListener('visibilitychange', updateTimer);
  window.addEventListener('storage', event => {
    if (event.key === NOTES_KEY || event.key === null) {
      state.notes = cleanNotes(readStored(NOTES_KEY, []));
      updateNoteCount();
      if (ui['notes-dialog'].open) renderNotes();
    }
  });
  updateNoteCount();
  updateControls();

  async function start() {
    try {
      const response = await fetch(new URL('./data/activities.json', import.meta.url));
      if (!response.ok) throw new Error(`The card file could not load (${response.status}).`);
      const cards = await response.json();
      if (!Array.isArray(cards) || !cards.length || cards.some(card => typeof card.id !== 'string' || typeof card.title !== 'string' ||
        typeof card.summary !== 'string' || ![5, 10, 15].includes(card.minutes) || typeof card.stationary !== 'boolean' ||
        !Array.isArray(card.steps) || card.steps.length !== 3 || card.steps.some(step => typeof step !== 'string') ||
        !Array.isArray(card.tags) || card.tags.some(tag => typeof tag !== 'string') || typeof card.notePrompt !== 'string')) {
        throw new Error('The activity cards have an unexpected format.');
      }
      state.cards = cards;
      updateControls();
    } catch (error) {
      setFormStatus(`${error.message} Start the app through its local server and reload.`, true);
      ui['model-status'].textContent = 'The activity cards are unavailable. Check the app’s local files and server.';
    }
    if ('serviceWorker' in navigator && ['http:', 'https:'].includes(location.protocol)) {
      try {
        await navigator.serviceWorker.register(new URL('./sw.js', import.meta.url), { scope: './' });
        refreshOfflineStatus();
      } catch {
        ui['offline-status'].textContent = 'Offline preparation is unavailable here. Use localhost or HTTPS and reload.';
      }
    } else {
      ui['offline-status'].textContent = 'Offline preparation needs a supported browser on localhost or HTTPS.';
    }
  }
  start();
}
