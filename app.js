(() => {
  'use strict';

  // ── IndexedDB Storage ──
  const DB_NAME = 'flashstudy_db';
  const DB_VERSION = 2;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (!db.objectStoreNames.contains('sets')) {
          db.createObjectStore('sets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('card_stats')) {
          const cs = db.createObjectStore('card_stats', { keyPath: 'id' });
          cs.createIndex('setId', 'setId', { unique: false });
        }
        if (!db.objectStoreNames.contains('sessions')) {
          const ss = db.createObjectStore('sessions', { keyPath: 'id' });
          ss.createIndex('setId', 'setId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Sets CRUD ──
  async function loadSets() {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('sets', 'readonly');
        const req = tx.objectStore('sets').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch { return []; }
  }

  async function saveSets(setsData) {
    try {
      const db = await openDB();
      const tx = db.transaction('sets', 'readwrite');
      const store = tx.objectStore('sets');
      store.clear();
      for (const set of setsData) store.put(set);
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      toast('Failed to save — storage error', true);
      return false;
    }
  }

  // ── Card Stats CRUD ──
  async function loadCardStats(setId) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('card_stats', 'readonly');
        const idx = tx.objectStore('card_stats').index('setId');
        const req = idx.getAll(setId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch { return []; }
  }

  async function saveCardStat(stat) {
    try {
      const db = await openDB();
      const tx = db.transaction('card_stats', 'readwrite');
      tx.objectStore('card_stats').put(stat);
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch { return false; }
  }

  // ── Sessions CRUD ──
  async function loadSessions(setId) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('sessions', 'readonly');
        const idx = tx.objectStore('sessions').index('setId');
        const req = idx.getAll(setId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch { return []; }
  }

  async function saveSession(session) {
    try {
      const db = await openDB();
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(session);
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch { return false; }
  }

  async function deleteStatsForSet(setId) {
    try {
      const db = await openDB();
      const tx = db.transaction(['card_stats', 'sessions'], 'readwrite');
      const csStore = tx.objectStore('card_stats');
      const ssStore = tx.objectStore('sessions');
      const csKeys = await new Promise((res, rej) => { const r = csStore.index('setId').getAllKeys(setId); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      for (const key of csKeys) csStore.delete(key);
      const ssKeys = await new Promise((res, rej) => { const r = ssStore.index('setId').getAllKeys(setId); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      for (const key of ssKeys) ssStore.delete(key);
      return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error); });
    } catch { return false; }
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ── Migrate from localStorage ──
  async function migrateFromLocalStorage() {
    const STORAGE_KEY = 'flashstudy_sets';
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const oldSets = JSON.parse(raw);
      if (!Array.isArray(oldSets) || oldSets.length === 0) return;
      const existing = await loadSets();
      if (existing.length === 0) await saveSets(oldSets);
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }

  // ── DOM refs ──
  const $  = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];

  const homeView   = $('#home-view');
  const createView = $('#create-view');
  const studyView  = $('#study-view');
  const prepView   = $('#prep-view');
  const statsView  = $('#stats-view');

  const setsList      = $('#sets-list');
  const emptyState    = $('#empty-state');
  const newSetBtn     = $('#new-set-btn');
  const createBackBtn = $('#create-back-btn');
  const saveSetBtn    = $('#save-set-btn');
  const createTitle   = $('#create-title');
  const setNameInput  = $('#set-name-input');
  const cardsContainer = $('#cards-container');
  const addCardBtn    = $('#add-card-btn');

  const studyBackBtn    = $('#study-back-btn');
  const studySetTitle   = $('#study-set-title');
  const studyProgress   = $('#study-progress');
  const flashcard       = $('#flashcard');
  const cardFrontContent = $('#card-front-content');
  const cardBackContent  = $('#card-back-content');
  const prevCardBtn     = $('#prev-card-btn');
  const nextCardBtn     = $('#next-card-btn');
  const flipHint        = $('#flip-hint');
  const studyComplete   = $('#study-complete');
  const completeMsg     = $('#complete-msg');
  const restartBtn      = $('#restart-btn');
  const doneBtn         = $('#done-btn');

  // Prep DOM refs
  const prepLauncher     = $('#prep-launcher');
  const prepLauncherCancel = $('#prep-launcher-cancel');
  const prepBackBtn      = $('#prep-back-btn');
  const prepSetTitle     = $('#prep-set-title');
  const prepProgressBadge = $('#prep-progress');
  const prepProgressBar  = $('#prep-progress-bar');
  const prepFront        = $('#prep-front');
  const prepBack         = $('#prep-back');
  const prepAnswerSection = $('#prep-answer-section');
  const prepShowBtn      = $('#prep-show-btn');
  const prepRatingSection = $('#prep-rating-section');
  const prepSummary      = $('#prep-summary');
  const prepScore        = $('#prep-score');
  const prepBreakdown    = $('#prep-breakdown');
  const prepSummaryMsg   = $('#prep-summary-msg');
  const prepReviewWeakBtn = $('#prep-review-weak-btn');
  const prepStatsBtn     = $('#prep-stats-btn');
  const prepDoneBtn      = $('#prep-done-btn');

  // Stats DOM refs
  const statsBackBtn   = $('#stats-back-btn');
  const statsSetTitle  = $('#stats-set-title');
  const masteryCircle  = $('#mastery-circle');
  const masteryPct     = $('#mastery-pct');
  const breakdownBar   = $('#breakdown-bar');
  const breakdownLegend = $('#breakdown-legend');
  const sessionHistory = $('#session-history');
  const cardDetails    = $('#card-details');

  // ── State ──
  let sets = [];
  let editingSetId = null;
  let studyCards = [];
  let studyIndex = 0;

  // Prep state
  let prepSetId = null;
  let prepCards = [];       // [{card, cardIndex, stat}]
  let prepIndex = 0;
  let prepSessionRatings = []; // array of star values (0.5–5)
  let selectedStarRating = 0;  // currently selected star value

  // Stats state
  let statsSetId = null;

  // ── View navigation ──
  function showView(view) {
    [homeView, createView, studyView, prepView, statsView].forEach(v => v.classList.remove('active'));
    view.classList.add('active');
    window.scrollTo(0, 0);
  }

  // ── Toast ──
  function toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' toast-error' : '');
    el.textContent = msg;
    $('#toast-container').appendChild(el);
    setTimeout(() => { el.classList.add('toast-out'); }, 2200);
    setTimeout(() => { el.remove(); }, 2500);
  }

  // ── Confirm dialog ──
  function confirm(msg) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.innerHTML = `
        <div class="confirm-box">
          <p>${msg}</p>
          <div class="confirm-actions">
            <button class="btn btn-outline btn-small" data-action="cancel">Cancel</button>
            <button class="btn btn-primary btn-small" style="background:var(--danger)" data-action="confirm">Delete</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => {
        const action = e.target.dataset.action;
        if (action === 'confirm') { overlay.remove(); resolve(true); }
        else if (action === 'cancel' || e.target === overlay) { overlay.remove(); resolve(false); }
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── HOME: Render sets list ──
  async function renderHome() {
    sets = await loadSets();
    setsList.innerHTML = '';

    if (sets.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    for (const set of sets) {
      const stats = await loadCardStats(set.id);
      const reviewed = stats.length;
      const total = set.cards.length;

      const card = document.createElement('div');
      card.className = 'set-card';
      card.innerHTML = `
        <div class="set-card-header">
          <h3>${escapeHtml(set.name)}</h3>
        </div>
        <div class="set-card-meta">${total} card${total !== 1 ? 's' : ''}${reviewed > 0 ? ` &middot; ${reviewed} reviewed` : ''}</div>
        <div class="set-card-actions">
          <button class="btn btn-primary btn-small study-btn">Study</button>
          <button class="btn btn-primary btn-small prep-btn" style="background:#a855f7">Test Prep</button>
          ${reviewed > 0 ? '<button class="btn btn-outline btn-small stats-btn">Stats</button>' : ''}
          <button class="btn btn-outline btn-small edit-btn">Edit</button>
          <button class="btn btn-outline btn-small export-btn">Export</button>
          <button class="btn-danger-text delete-btn">Delete</button>
        </div>`;

      $('.study-btn', card).addEventListener('click', e => { e.stopPropagation(); startStudy(set.id); });
      $('.prep-btn', card).addEventListener('click', e => { e.stopPropagation(); openPrepLauncher(set.id); });
      const statsBtn = $('.stats-btn', card);
      if (statsBtn) statsBtn.addEventListener('click', e => { e.stopPropagation(); openStats(set.id); });
      $('.edit-btn', card).addEventListener('click', e => { e.stopPropagation(); openEditor(set.id); });
      $('.export-btn', card).addEventListener('click', e => { e.stopPropagation(); exportSet(set.id); });
      $('.delete-btn', card).addEventListener('click', async e => {
        e.stopPropagation();
        if (await confirm(`Delete "<strong>${escapeHtml(set.name)}</strong>"? This cannot be undone.`)) {
          sets = sets.filter(s => s.id !== set.id);
          await saveSets(sets);
          await renderHome();
          toast('Set deleted');
        }
      });

      setsList.appendChild(card);
    }
  }

  // ── Export / Import ──
  function exportSet(setId) {
    const set = sets.find(s => s.id === setId);
    if (!set) return;
    const exportData = { flashstudy: true, version: 1, name: set.name, cards: set.cards };
    const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = set.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase() + '.flashstudy.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Set exported!');
  }

  async function importSet(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.flashstudy || !data.name || !Array.isArray(data.cards) || data.cards.length === 0) {
        toast('Invalid flash set file', true);
        return;
      }
      const newSet = { id: generateId(), name: data.name, cards: data.cards };
      sets.push(newSet);
      if (!await saveSets(sets)) { sets = await loadSets(); return; }
      toast(`Imported "${data.name}"!`);
      await renderHome();
    } catch {
      toast('Failed to read file', true);
    }
  }

  // ══════════════════════════════════════════
  //  CREATE / EDIT (unchanged logic)
  // ══════════════════════════════════════════
  function openEditor(setId = null) {
    editingSetId = setId;
    cardsContainer.innerHTML = '';
    if (setId) {
      const set = sets.find(s => s.id === setId);
      createTitle.textContent = 'Edit Set';
      setNameInput.value = set.name;
      set.cards.forEach(c => addCardEditor(c.front, c.frontImage, c.back, c.backImage));
    } else {
      createTitle.textContent = 'New Flash Set';
      setNameInput.value = '';
      addCardEditor();
      addCardEditor();
    }
    showView(createView);
    setNameInput.focus();
  }

  let cardCounter = 0;

  function addCardEditor(frontText = '', frontImage = '', backText = '', backImage = '') {
    cardCounter++;
    const el = document.createElement('div');
    el.className = 'card-editor';
    el.dataset.idx = cardCounter;

    el.innerHTML = `
      <div class="card-editor-header">
        <span>Card ${cardsContainer.children.length + 1}</span>
        <button class="btn-danger-text remove-card-btn" title="Remove card">&times;</button>
      </div>
      <div class="card-editor-body">
        <div class="card-side">
          <span class="card-side-label">Front</span>
          <textarea placeholder="Question or term..." class="front-text">${escapeHtml(frontText)}</textarea>
          <div class="front-image-area">
            ${frontImage
              ? `<div class="image-preview"><img src="${frontImage}" alt="Card image"><button class="remove-image" title="Remove image">&times;</button></div>`
              : `<div class="image-upload-area"><input type="file" accept="image/*" class="image-input"><span class="upload-label"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Drop image or click to upload</span></div>`
            }
          </div>
        </div>
        <div class="card-side">
          <span class="card-side-label">Back</span>
          <textarea placeholder="Answer or definition..." class="back-text">${escapeHtml(backText)}</textarea>
          <div class="back-image-area">
            ${backImage
              ? `<div class="image-preview"><img src="${backImage}" alt="Card image"><button class="remove-image" title="Remove image">&times;</button></div>`
              : `<div class="image-upload-area"><input type="file" accept="image/*" class="image-input"><span class="upload-label"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Drop image or click to upload</span></div>`
            }
          </div>
        </div>
      </div>`;

    $('.remove-card-btn', el).addEventListener('click', () => {
      if (cardsContainer.children.length <= 1) { toast('Need at least one card', true); return; }
      el.remove();
      renumberCards();
    });

    setupImageHandlers(el);

    const autoAdd = () => {
      if (el === cardsContainer.lastElementChild) { addCardEditor(); renumberCards(); }
    };
    $('.front-text', el).addEventListener('input', autoAdd, { once: true });
    $('.back-text', el).addEventListener('input', autoAdd, { once: true });

    cardsContainer.appendChild(el);
  }

  function compressImage(dataUrl, maxDim = 800, quality = 0.7) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    });
  }

  function handleImageFile(file, area) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Please select an image file', true); return; }
    if (file.size > 10 * 1024 * 1024) { toast('Image must be under 10 MB', true); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const compressed = await compressImage(reader.result);
      showImagePreview(area, compressed);
    };
    reader.readAsDataURL(file);
  }

  function addDragDropHandlers(area) {
    const uploadArea = $('.image-upload-area', area);
    if (!uploadArea) return;
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); uploadArea.classList.add('drag-over'); });
    uploadArea.addEventListener('dragleave', e => { e.preventDefault(); e.stopPropagation(); uploadArea.classList.remove('drag-over'); });
    uploadArea.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation(); uploadArea.classList.remove('drag-over');
      handleImageFile(e.dataTransfer.files[0], area);
    });
  }

  function setupImageHandlers(cardEl) {
    $$('.front-image-area, .back-image-area', cardEl).forEach(area => {
      const input = $('.image-input', area);
      if (input) input.addEventListener('change', e => handleImageFile(e.target.files[0], area));
      addDragDropHandlers(area);
      const removeBtn = $('.remove-image', area);
      if (removeBtn) removeBtn.addEventListener('click', () => showUploadArea(area));
    });
  }

  function showImagePreview(area, dataUrl) {
    area.innerHTML = `<div class="image-preview"><img src="${dataUrl}" alt="Card image"><button class="remove-image" title="Remove image">&times;</button></div>`;
    $('.remove-image', area).addEventListener('click', () => showUploadArea(area));
    const cardEl = area.closest('.card-editor');
    if (cardEl && cardEl === cardsContainer.lastElementChild) { addCardEditor(); renumberCards(); }
  }

  function showUploadArea(area) {
    area.innerHTML = `<div class="image-upload-area"><input type="file" accept="image/*" class="image-input"><span class="upload-label"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Drop image or click to upload</span></div>`;
    $('.image-input', area).addEventListener('change', e => handleImageFile(e.target.files[0], area));
    addDragDropHandlers(area);
  }

  function renumberCards() {
    $$('.card-editor', cardsContainer).forEach((el, i) => {
      $('.card-editor-header span', el).textContent = `Card ${i + 1}`;
    });
  }

  function collectCards() {
    return $$('.card-editor', cardsContainer).map(el => {
      const front = $('.front-text', el).value.trim();
      const back = $('.back-text', el).value.trim();
      const frontImgEl = $('.front-image-area .image-preview img', el);
      const backImgEl = $('.back-image-area .image-preview img', el);
      return { front, frontImage: frontImgEl ? frontImgEl.src : '', back, backImage: backImgEl ? backImgEl.src : '' };
    });
  }

  async function saveSet() {
    const name = setNameInput.value.trim();
    if (!name) { toast('Please enter a set name', true); setNameInput.focus(); return; }
    const cards = collectCards();
    const validCards = cards.filter(c => c.front || c.frontImage || c.back || c.backImage);
    if (validCards.length === 0) { toast('Add at least one card with content', true); return; }

    if (editingSetId) {
      const idx = sets.findIndex(s => s.id === editingSetId);
      if (idx !== -1) { sets[idx].name = name; sets[idx].cards = validCards; }
    } else {
      sets.push({ id: generateId(), name, cards: validCards });
    }

    if (!await saveSets(sets)) { sets = await loadSets(); return; }
    toast(editingSetId ? 'Set updated!' : 'Set created!');
    showView(homeView);
    await renderHome();
  }

  // ══════════════════════════════════════════
  //  SIMPLE STUDY MODE (unchanged)
  // ══════════════════════════════════════════
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startStudy(setId) {
    const set = sets.find(s => s.id === setId);
    if (!set || set.cards.length === 0) { toast('No cards to study', true); return; }
    studyCards = shuffle(set.cards);
    studyIndex = 0;
    studySetTitle.textContent = set.name;
    studyComplete.classList.add('hidden');
    showView(studyView);
    renderStudyCard();
  }

  function renderStudyCard() {
    const card = studyCards[studyIndex];
    flashcard.classList.remove('flipped');
    flipHint.style.visibility = 'visible';
    renderCardContent(cardFrontContent, card.front, card.frontImage);
    renderCardContent(cardBackContent, card.back, card.backImage);
    studyProgress.textContent = `${studyIndex + 1} / ${studyCards.length}`;
    prevCardBtn.disabled = studyIndex === 0;
  }

  function renderCardContent(el, text, image) {
    if (image) {
      el.innerHTML = text
        ? `<div><img src="${image}" alt=""><p style="margin-top:10px">${escapeHtml(text)}</p></div>`
        : `<img src="${image}" alt="">`;
    } else {
      el.textContent = text;
    }
  }

  function flipCard() {
    flashcard.classList.toggle('flipped');
    flipHint.style.visibility = 'hidden';
  }

  function nextCard() {
    if (studyIndex < studyCards.length - 1) { studyIndex++; renderStudyCard(); }
    else {
      completeMsg.textContent = `You reviewed all ${studyCards.length} card${studyCards.length !== 1 ? 's' : ''}.`;
      studyComplete.classList.remove('hidden');
    }
  }

  function prevCard() {
    if (studyIndex > 0) { studyIndex--; renderStudyCard(); }
  }

  // ══════════════════════════════════════════
  //  TEST PREP MODE
  // ══════════════════════════════════════════

  // Weighted shuffle: lower stars = higher weight = appears more often
  function weightedShuffle(items) {
    const weighted = items.map(item => {
      // rating is 0.5–5 stars; unreviewed = 0
      const r = item.stat ? item.stat.rating : 0;
      // unreviewed: weight 8, 0.5 stars: 10, 5 stars: 1
      const w = r === 0 ? 8 : Math.max(1, Math.round(11 - r * 2));
      return { ...item, weight: w };
    });

    const result = [];
    const pool = [...weighted];
    while (pool.length > 0) {
      const totalWeight = pool.reduce((sum, it) => sum + it.weight, 0);
      let rand = Math.random() * totalWeight;
      let picked = 0;
      for (let i = 0; i < pool.length; i++) {
        rand -= pool[i].weight;
        if (rand <= 0) { picked = i; break; }
      }
      result.push(pool[picked]);
      pool.splice(picked, 1);
    }
    return result;
  }

  // ── Star Rating UI ──
  const STAR_SVG = `<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

  const STAR_LABELS = {
    0.5: 'No clue', 1: 'No clue',
    1.5: 'Barely knew it', 2: 'Barely knew it',
    2.5: 'Shaky', 3: 'Shaky',
    3.5: 'Pretty good', 4: 'Pretty good',
    4.5: 'Nailed it', 5: 'Nailed it'
  };

  function buildStarRow() {
    const row = $('.star-row', prepRatingSection);
    row.innerHTML = '';
    for (let star = 1; star <= 5; star++) {
      for (const half of ['left', 'right']) {
        const val = half === 'left' ? star - 0.5 : star;
        const el = document.createElement('div');
        el.className = `star-half ${half}`;
        el.dataset.value = val;
        el.innerHTML = STAR_SVG;
        el.addEventListener('mouseenter', () => highlightStars(val, 'hover'));
        el.addEventListener('click', () => selectStars(val));
        row.appendChild(el);
      }
    }
    row.addEventListener('mouseleave', () => highlightStars(selectedStarRating, 'active'));
  }

  function highlightStars(upTo, cls) {
    $$('.star-half', prepRatingSection).forEach(el => {
      const v = parseFloat(el.dataset.value);
      el.classList.remove('hover', 'active');
      if (v <= upTo) el.classList.add(cls);
    });
    const label = $('#star-label');
    label.textContent = upTo > 0 ? `${upTo} — ${STAR_LABELS[upTo] || ''}` : '';
  }

  function selectStars(val) {
    selectedStarRating = val;
    highlightStars(val, 'active');
    $('#star-confirm-btn').disabled = false;
  }

  async function openPrepLauncher(setId) {
    prepSetId = setId;
    const set = sets.find(s => s.id === setId);
    if (!set) return;

    const stats = await loadCardStats(setId);
    const statsMap = {};
    stats.forEach(s => statsMap[s.cardIndex] = s);

    let weakCount = 0, newCount = 0;
    set.cards.forEach((_, i) => {
      const st = statsMap[i];
      if (!st) newCount++;
      else if (st.rating <= 2.5) weakCount++;
    });

    $('#prep-count-all').textContent = set.cards.length;
    $('#prep-count-weak').textContent = weakCount;
    $('#prep-count-new').textContent = newCount;

    // Disable buttons with 0 cards
    $$('.launcher-opt', prepLauncher).forEach(btn => {
      const filter = btn.dataset.filter;
      if (filter === 'weak') btn.disabled = weakCount === 0;
      else if (filter === 'unreviewed') btn.disabled = newCount === 0;
    });

    prepLauncher.classList.remove('hidden');
  }

  async function startPrep(filter) {
    prepLauncher.classList.add('hidden');
    const set = sets.find(s => s.id === prepSetId);
    if (!set) return;

    const stats = await loadCardStats(prepSetId);
    const statsMap = {};
    stats.forEach(s => statsMap[s.cardIndex] = s);

    let items = set.cards.map((card, i) => ({
      card,
      cardIndex: i,
      stat: statsMap[i] || null
    }));

    // Apply filter
    if (filter === 'weak') {
      items = items.filter(it => it.stat && it.stat.rating <= 2.5);
    } else if (filter === 'unreviewed') {
      items = items.filter(it => !it.stat);
    }

    if (items.length === 0) { toast('No cards match this filter', true); return; }

    prepCards = weightedShuffle(items);
    prepIndex = 0;
    prepSessionRatings = [];
    prepSetTitle.textContent = set.name;
    prepSummary.classList.add('hidden');

    showView(prepView);
    buildStarRow();
    renderPrepCard();
  }

  function renderPrepCard() {
    const item = prepCards[prepIndex];
    const card = item.card;

    // Show front
    renderCardContent(prepFront, card.front, card.frontImage);

    // Hide answer + rating, reset stars
    prepAnswerSection.classList.add('hidden');
    prepRatingSection.classList.add('hidden');
    prepShowBtn.classList.remove('hidden');
    prepShowBtn.style.display = '';
    selectedStarRating = 0;
    highlightStars(0, 'active');
    $('#star-confirm-btn').disabled = true;

    // Progress
    prepProgressBadge.textContent = `${prepIndex + 1} / ${prepCards.length}`;
    const pct = ((prepIndex) / prepCards.length) * 100;
    prepProgressBar.style.width = pct + '%';
  }

  function showPrepAnswer() {
    const item = prepCards[prepIndex];
    const card = item.card;

    renderCardContent(prepBack, card.back, card.backImage);
    prepAnswerSection.classList.remove('hidden');
    prepRatingSection.classList.remove('hidden');
    prepShowBtn.style.display = 'none';
  }

  async function ratePrepCard(rating) {
    const item = prepCards[prepIndex];
    const statId = `${prepSetId}_${item.cardIndex}`;

    prepSessionRatings.push(rating);

    // Update card stat
    const existing = item.stat || {
      id: statId,
      setId: prepSetId,
      cardIndex: item.cardIndex,
      rating: 0,
      totalReviews: 0,
      ratingSum: 0,
      lastReviewed: 0,
      streak: 0
    };

    existing.totalReviews++;
    existing.rating = rating;
    existing.ratingSum = (existing.ratingSum || 0) + rating;
    existing.lastReviewed = Date.now();
    if (rating >= 4.5) existing.streak++;
    else existing.streak = 0;

    item.stat = existing;
    await saveCardStat(existing);

    // Next card or finish
    if (prepIndex < prepCards.length - 1) {
      prepIndex++;
      renderPrepCard();
    } else {
      prepProgressBar.style.width = '100%';
      showPrepSummary();
    }
  }

  function starsHtml(val, size = 14) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      let fill = 'var(--surface2)';
      if (val >= i) fill = 'var(--warning)';
      else if (val >= i - 0.5) fill = 'url(#half-star)';
      html += `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="vertical-align:middle"><defs><linearGradient id="half-star"><stop offset="50%" stop-color="var(--warning)"/><stop offset="50%" stop-color="var(--surface2)"/></linearGradient></defs><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="${fill}"/></svg>`;
    }
    return html;
  }

  async function showPrepSummary() {
    const total = prepCards.length;
    const avg = prepSessionRatings.reduce((s, v) => s + v, 0) / total;
    const avgRound = Math.round(avg * 10) / 10;
    const low = prepSessionRatings.filter(r => r <= 2.5).length;
    const mid = prepSessionRatings.filter(r => r > 2.5 && r < 4).length;
    const high = prepSessionRatings.filter(r => r >= 4).length;
    const score = Math.round((avg / 5) * 100);

    await saveSession({
      id: generateId(),
      setId: prepSetId,
      date: Date.now(),
      totalCards: total,
      avgRating: avgRound,
      ratings: { low, mid, high },
      score
    });

    // Score display
    let scoreColor = 'var(--danger)';
    if (avg >= 4) scoreColor = 'var(--success)';
    else if (avg >= 2.5) scoreColor = 'var(--warning)';
    prepScore.innerHTML = `<span style="color:${scoreColor}">${avgRound}</span><span style="font-size:.9rem;color:var(--text2)"> / 5 avg</span>`;

    // Breakdown
    prepBreakdown.innerHTML = `
      <span class="breakdown-item"><span class="breakdown-dot" style="background:var(--danger)"></span>${low} weak</span>
      <span class="breakdown-item"><span class="breakdown-dot" style="background:var(--warning)"></span>${mid} okay</span>
      <span class="breakdown-item"><span class="breakdown-dot" style="background:var(--success)"></span>${high} strong</span>`;

    if (avg >= 4.5) prepSummaryMsg.textContent = 'Perfect! You\'re ready for the test.';
    else if (avg >= 3.5) prepSummaryMsg.textContent = 'Great job! Just a few to brush up on.';
    else if (avg >= 2.5) prepSummaryMsg.textContent = 'Getting there — focus on the weak cards.';
    else prepSummaryMsg.textContent = 'Keep practicing — you\'ll get there!';

    prepReviewWeakBtn.style.display = low > 0 ? '' : 'none';
    prepSummary.classList.remove('hidden');
  }

  // ══════════════════════════════════════════
  //  STATS VIEW
  // ══════════════════════════════════════════

  async function openStats(setId) {
    statsSetId = setId;
    const set = sets.find(s => s.id === setId);
    if (!set) return;

    statsSetTitle.textContent = set.name;
    const stats = await loadCardStats(setId);
    const sessions = await loadSessions(setId);

    const statsMap = {};
    stats.forEach(s => statsMap[s.cardIndex] = s);

    const total = set.cards.length;
    let strong = 0, okay = 0, weak = 0, unreviewed = 0;
    let ratingSum = 0, reviewedCount = 0;
    set.cards.forEach((_, i) => {
      const st = statsMap[i];
      if (!st) { unreviewed++; return; }
      reviewedCount++;
      ratingSum += st.rating;
      if (st.rating >= 4) strong++;
      else if (st.rating >= 2.5) okay++;
      else weak++;
    });

    // Mastery ring (avg stars as %)
    const avgStars = reviewedCount > 0 ? ratingSum / reviewedCount : 0;
    const masteryVal = total > 0 ? Math.round((avgStars / 5) * 100) : 0;
    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (masteryVal / 100) * circumference;
    masteryCircle.style.strokeDasharray = circumference;
    masteryCircle.style.strokeDashoffset = offset;
    if (masteryVal >= 80) masteryCircle.style.stroke = 'var(--success)';
    else if (masteryVal >= 50) masteryCircle.style.stroke = 'var(--warning)';
    else masteryCircle.style.stroke = 'var(--danger)';
    masteryPct.textContent = masteryVal + '%';

    // Breakdown bar
    breakdownBar.innerHTML = '';
    const segments = [
      { count: strong, color: 'var(--success)', label: 'Strong (4-5)' },
      { count: okay, color: 'var(--warning)', label: 'Okay (2.5-3.5)' },
      { count: weak, color: 'var(--danger)', label: 'Weak (0.5-2)' },
      { count: unreviewed, color: 'var(--surface2)', label: 'Unreviewed' },
    ];
    segments.forEach(seg => {
      if (seg.count === 0) return;
      const div = document.createElement('div');
      div.className = 'breakdown-bar-seg';
      div.style.width = (seg.count / total * 100) + '%';
      div.style.background = seg.color;
      breakdownBar.appendChild(div);
    });

    breakdownLegend.innerHTML = segments.map(seg =>
      `<span class="legend-item"><span class="legend-dot" style="background:${seg.color}"></span>${seg.count} ${seg.label}</span>`
    ).join('');

    // Session history (newest first)
    const sorted = [...sessions].sort((a, b) => b.date - a.date);
    if (sorted.length === 0) {
      sessionHistory.innerHTML = '<p class="session-history-empty">No sessions yet. Start a Test Prep to see history.</p>';
    } else {
      sessionHistory.innerHTML = sorted.slice(0, 20).map(s => {
        const d = new Date(s.date);
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const t = s.totalCards;
        const r = s.ratings || {};
        const hW = t > 0 ? ((r.high || r.nailed || 0) / t * 100) : 0;
        const mW = t > 0 ? ((r.mid || r.shaky || 0) / t * 100) : 0;
        const lW = t > 0 ? ((r.low || r.missed || 0) / t * 100) : 0;
        const avg = s.avgRating || (s.score ? (s.score / 20) : 0);
        const avgDisplay = Math.round(avg * 10) / 10;
        let sColor = 'var(--danger)';
        if (avg >= 4) sColor = 'var(--success)';
        else if (avg >= 2.5) sColor = 'var(--warning)';
        return `<div class="session-row">
          <span class="session-date">${dateStr}</span>
          <span class="session-score" style="color:${sColor}">${avgDisplay}/5</span>
          <div class="session-bar-wrap">
            <div class="session-bar-seg" style="width:${hW}%;background:var(--success)"></div>
            <div class="session-bar-seg" style="width:${mW}%;background:var(--warning)"></div>
            <div class="session-bar-seg" style="width:${lW}%;background:var(--danger)"></div>
          </div>
          <span class="session-cards">${t} cards</span>
        </div>`;
      }).join('');
    }

    // Per-card details (sorted: worst first)
    const cardEntries = set.cards.map((card, i) => ({ card, index: i, stat: statsMap[i] || null }));
    cardEntries.sort((a, b) => {
      const rA = a.stat ? a.stat.rating : 0;
      const rB = b.stat ? b.stat.rating : 0;
      return rA - rB;
    });

    cardDetails.innerHTML = cardEntries.map(({ card, stat }) => {
      let color = 'var(--text2)';
      let meta = 'Unreviewed';
      let streakHtml = '';
      if (stat) {
        if (stat.rating >= 4) color = 'var(--success)';
        else if (stat.rating >= 2.5) color = 'var(--warning)';
        else color = 'var(--danger)';
        meta = `${starsHtml(stat.rating, 12)} &middot; ${stat.totalReviews} review${stat.totalReviews !== 1 ? 's' : ''}`;
        if (stat.streak >= 2) streakHtml = `<span class="card-detail-streak">${stat.streak} streak</span>`;
      }
      const label = card.front || (card.frontImage ? '[Image]' : '[Empty]');
      return `<div class="card-detail-row">
        <span class="card-detail-indicator" style="background:${color}"></span>
        <span class="card-detail-text">${escapeHtml(label)}</span>
        <span class="card-detail-meta">${meta}</span>
        ${streakHtml}
      </div>`;
    }).join('');

    showView(statsView);
  }

  // ══════════════════════════════════════════
  //  EVENT BINDINGS
  // ══════════════════════════════════════════

  // Home
  newSetBtn.addEventListener('click', () => openEditor());
  const importBtn = $('#import-set-btn');
  const importFileInput = $('#import-file-input');
  importBtn.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', e => { importSet(e.target.files[0]); e.target.value = ''; });
  createBackBtn.addEventListener('click', async () => { showView(homeView); await renderHome(); });
  saveSetBtn.addEventListener('click', saveSet);
  addCardBtn.addEventListener('click', () => { addCardEditor(); renumberCards(); });

  // Study
  studyBackBtn.addEventListener('click', async () => { showView(homeView); await renderHome(); });
  flashcard.addEventListener('click', flipCard);
  nextCardBtn.addEventListener('click', nextCard);
  prevCardBtn.addEventListener('click', prevCard);
  restartBtn.addEventListener('click', () => {
    studyCards = shuffle(studyCards);
    studyIndex = 0;
    studyComplete.classList.add('hidden');
    renderStudyCard();
  });
  doneBtn.addEventListener('click', async () => { showView(homeView); await renderHome(); });

  // Prep launcher
  $$('.launcher-opt', prepLauncher).forEach(btn => {
    btn.addEventListener('click', () => startPrep(btn.dataset.filter));
  });
  prepLauncherCancel.addEventListener('click', () => prepLauncher.classList.add('hidden'));
  prepLauncher.addEventListener('click', e => {
    if (e.target === prepLauncher) prepLauncher.classList.add('hidden');
  });

  // Prep session
  prepBackBtn.addEventListener('click', async () => { showView(homeView); await renderHome(); });
  prepShowBtn.addEventListener('click', showPrepAnswer);
  $('#star-confirm-btn').addEventListener('click', () => {
    if (selectedStarRating > 0) ratePrepCard(selectedStarRating);
  });
  prepReviewWeakBtn.addEventListener('click', () => startPrep('weak'));
  prepStatsBtn.addEventListener('click', () => openStats(prepSetId));
  prepDoneBtn.addEventListener('click', async () => { showView(homeView); await renderHome(); });

  // Stats
  statsBackBtn.addEventListener('click', async () => { showView(homeView); await renderHome(); });
  $('#reset-stats-btn').addEventListener('click', async () => {
    if (await confirm('Reset all stats and session history for this set? This cannot be undone.')) {
      await deleteStatsForSet(statsSetId);
      toast('Stats reset');
      showView(homeView);
      await renderHome();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    // Study view shortcuts
    if (studyView.classList.contains('active') && studyComplete.classList.contains('hidden')) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
      else if (e.key === 'ArrowRight') nextCard();
      else if (e.key === 'ArrowLeft') prevCard();
      return;
    }
    // Prep view shortcuts
    if (prepView.classList.contains('active') && prepSummary.classList.contains('hidden')) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (prepAnswerSection.classList.contains('hidden')) {
          showPrepAnswer();
        } else if (selectedStarRating > 0) {
          ratePrepCard(selectedStarRating);
        }
      }
    }
  });

  // ── Init ──
  (async () => {
    await migrateFromLocalStorage();
    await renderHome();
  })();
})();
