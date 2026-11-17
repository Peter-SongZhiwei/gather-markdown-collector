import { STORAGE_KEY, EXAMPLE, parseSource, collectMarkdown, blockLabel } from './core.js';
import { markdownFragment, plainText } from './render.js';

const $ = id => document.getElementById(id);
const state = { source: '',  blocks: [], definitions: '', selected: new Set(), history: [], parsed: false, editing: true, view: 'select', outputView: 'preview', lastIndex: null, newSource: false };
let toastTimer, storageTimer, copyTimer;
let clearedSource = null;
const receivedTransfers = new Set();

function sourceSnapshot() {
  return { ...state, selected: new Set(state.selected), history: state.history.map(ids => [...ids]), draft: $('source-input').value };
}

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3400);
}

function saveNow() {
  clearTimeout(storageTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, source: state.source, draft: $('source-input').value, selected: [...state.selected], parsed: state.parsed, editing: state.editing, view: state.view, newSource: state.newSource }));
    $('save-status').classList.remove('unsaved');
    $('save-status').lastChild.textContent = 'Saved on this device';
  } catch {
    $('save-status').classList.add('unsaved');
    $('save-status').lastChild.textContent = 'Draft not saved';
  }
}
function scheduleSave() {
  clearTimeout(storageTimer);
  storageTimer = setTimeout(saveNow, 350);
}

function updateInputCount() {
  $('input-count').textContent = $('source-input').value.length.toLocaleString() + ' characters';
  $('select-mode-button').disabled = !$('source-input').value.trim();
  $('clear-source').disabled = !$('source-input').value.length && !state.source.length;
  $('undo-clear-source').hidden = !clearedSource;
}

function output() { return collectMarkdown(state.blocks, state.selected, state.definitions); }

function showView(view, scroll = false) {
  state.view = view;
  $('workspace').dataset.mobileView = view;
  $('select-tab').classList.toggle('active', view === 'select');
  $('select-tab').setAttribute('aria-pressed', String(view === 'select'));
  $('collection-tab').classList.toggle('active', view === 'collection');
  $('collection-tab').setAttribute('aria-pressed', String(view === 'collection'));
  const showBar = !!state.selected.size && view === 'select';
  $('mobile-bottom-bar').hidden = !showBar;
  document.body.classList.toggle('has-mobile-bar', showBar && matchMedia('(max-width: 760px)').matches);
  if (scroll && matchMedia('(max-width: 760px)').matches) $('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  scheduleSave();
}

function renderCollection() {
  const count = state.selected.size;
  const markdown = output();
  $('tab-count').textContent = count;
  $('heading-count').textContent = count;
  $('bottom-count').textContent = count + (count === 1 ? ' block' : ' blocks');
  $('collection-empty').hidden = !!count;
  $('collection-filled').hidden = !count;
  for (const id of ['copy-button', 'download-button', 'copy-text-button', 'clear-selection']) $(id).disabled = !count;
  $('undo-button').disabled = !state.history.length;
  $('select-all').textContent = count && count === state.blocks.length ? 'All selected' : 'Select all';
  $('select-all').disabled = !state.blocks.length || count === state.blocks.length;
  $('collection-stats').textContent = count + (count === 1 ? ' block' : ' blocks') + ' · ' + markdown.length.toLocaleString() + ' characters';
  $('collection-preview').replaceChildren(markdownFragment(markdown));
  $('collection-markdown').value = markdown;
  $('collection-preview').hidden = state.outputView !== 'preview';
  $('collection-markdown').hidden = state.outputView !== 'markdown';
  showView(state.view);
}

function renderSelected() {
  for (const card of $('blocks-list').children) {
    const selected = state.selected.has(card.dataset.id);
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-checked', String(selected));
  }
  renderCollection();
}

function rememberSelection() {
  state.history.push([...state.selected]);
  if (state.history.length > 50) state.history.shift();
}

function selectBlock(index, range = false) {
  const block = state.blocks[index];
  if (!block) return;
  rememberSelection();
  const shouldSelect = !state.selected.has(block.id);
  const start = range && state.lastIndex !== null ? Math.min(index, state.lastIndex) : index;
  const end = range && state.lastIndex !== null ? Math.max(index, state.lastIndex) : index;
  for (let i = start; i <= end; i++) {
    if (shouldSelect) state.selected.add(state.blocks[i].id);
    else state.selected.delete(state.blocks[i].id);
  }
  state.lastIndex = index;
  renderSelected();
}

function renderBlocks() {
  const fragment = document.createDocumentFragment();
  state.blocks.forEach((block, index) => {
    const card = document.createElement('div');
    card.className = 'block-card';
    card.dataset.id = block.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'checkbox');
    card.setAttribute('aria-checked', String(state.selected.has(block.id)));
    card.setAttribute('aria-label', blockLabel(block.type) + ' ' + (index + 1) + ': ' + block.raw.replace(/[#*`|>]/g, '').slice(0, 110));
    const check = document.createElement('span');
    check.className = 'block-check';
    check.setAttribute('aria-hidden', 'true');
    check.innerHTML = '<svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg>';
    const content = document.createElement('div');
    content.className = 'block-content';
    const label = document.createElement('div');
    label.className = 'block-type';
    const type = document.createElement('span');
    type.textContent = blockLabel(block.type);
    const number = document.createElement('span');
    number.className = 'block-number';
    number.textContent = String(index + 1).padStart(2, '0');
    label.append(type, number);
    const body = document.createElement('div');
    body.className = 'markdown-body';
    body.append(markdownFragment(block.raw + (state.definitions ? '\n\n' + state.definitions : '')));
    content.append(label, body);
    card.append(check, content);
    card.addEventListener('click', event => {
      // Dragging to select text or scrolling a wide table must not change a pick.
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && card.contains(selection.anchorNode)) return;
      if (event.target.closest('a')) event.preventDefault();
      selectBlock(index, event.shiftKey);
    });
    card.addEventListener('keydown', event => {
      if (event.target !== card) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault(); selectBlock(index, event.shiftKey);
      }
    });
    card.classList.toggle('selected', state.selected.has(block.id));
    fragment.append(card);
  });
  $('blocks-list').replaceChildren(fragment);
  $('block-count').textContent = state.blocks.length + (state.blocks.length === 1 ? ' block' : ' blocks') + ' · tap to collect';
}

function renderMode() {
  $('input-view').hidden = !state.editing;
  $('blocks-view').hidden = state.editing;
  for (const mode of ['edit', 'select']) {
    const active = (mode === 'edit') === state.editing;
    $(mode + '-mode-button').classList.toggle('active', active);
    $(mode + '-mode-button').setAttribute('aria-pressed', String(active));
  }
  $('source-heading').textContent = state.editing ? 'Paste or edit your answer' : 'Choose what stays';
  $('source-mode-hint').textContent = state.editing ? 'Paste or edit, then switch to Select blocks.' : 'Switch to Edit to change your source.';
  updateInputCount();
}

function parseInput() {
  const source = $('source-input').value;
  if (!source.trim()) { $('source-input').focus(); return; }
  if (source.length > 600000) { toast('Please paste a shorter answer (under 600,000 characters).'); return; }
  try {
    const parsed = parseSource(source);
    if (!parsed.blocks.length) { toast('Add some text to start selecting.'); return; }
    applyParsedSource(source, parsed, state.newSource);
  } catch { toast('This answer could not be parsed. Try a smaller section.'); }
}

function applyParsedSource(source, parsed, newSource = false) {
    const ids = new Set(parsed.blocks.map(b => b.id));
    state.selected = newSource ? new Set() : new Set([...state.selected].filter(id => ids.has(id)));
    state.source = source;
    state.blocks = parsed.blocks;
    state.definitions = parsed.definitions;
    state.parsed = true;
    state.editing = false;
    state.newSource = false;
    state.history = [];
    state.lastIndex = null;
    renderBlocks(); renderMode(); renderCollection();
    showView('select', true); saveNow();
}

function editSource() {
  if (state.editing) return;
  state.editing = true;
  renderMode(); showView('select'); saveNow();
}

function clearSource() {
  if (!$('source-input').value.length && !state.source.length) return;
  clearedSource = sourceSnapshot();
  $('undo-clear-source').textContent = 'Undo clear';
  Object.assign(state, { source: '', blocks: [], definitions: '', selected: new Set(), history: [], parsed: false, editing: true, view: 'select', lastIndex: null, newSource: false });
  $('source-input').value = '';
  renderBlocks(); renderMode(); renderCollection(); saveNow();
  toast('Source and selections cleared. Undo clear can restore them.');
}

function undoClearSource() {
  if (!clearedSource) return;
  const { draft, ...previous } = clearedSource;
  clearedSource = null;
  Object.assign(state, previous);
  $('source-input').value = draft;
  renderBlocks(); renderMode(); renderCollection(); saveNow();
  toast('Previous source and selections restored.');
}

// The Safari extension hands over text locally through a DOM event. No clipboard,
// remote import request, or answer content in the URL is required.
document.addEventListener('gather:import-v1', event => {
  let payload;
  try {
    if (typeof event.detail !== 'string' || event.detail.length > 3700000) return;
    payload = JSON.parse(event.detail);
    if (!payload || typeof payload.id !== 'string' || !/^[a-f0-9-]{36}$/.test(payload.id)) return;
    if (receivedTransfers.has(payload.id)) {
      acknowledgeTransfer(payload.id, true);
      return;
    }
    if (typeof payload.markdown !== 'string' || !payload.markdown.trim() || payload.markdown.length > 600000) throw new Error('The imported answer must contain 1–600,000 characters.');
    const parsed = parseSource(payload.markdown);
    if (!parsed.blocks.length) throw new Error('The imported answer has no selectable text.');
    // Parse before replacing anything. The previous draft and picks remain undoable.
    clearedSource = sourceSnapshot();
    $('source-input').value = payload.markdown;
    applyParsedSource(payload.markdown, parsed, true);
    $('undo-clear-source').textContent = 'Undo import';
    receivedTransfers.add(payload.id);
    toast('Answer received from Safari. Tap the parts you want to keep.');
    acknowledgeTransfer(payload.id, true);
  } catch (error) {
    if (payload?.id) acknowledgeTransfer(payload.id, false, error.message);
  }
});

function acknowledgeTransfer(id, ok, error) {
  document.dispatchEvent(new CustomEvent('gather:import-result-v1', { detail: JSON.stringify({ id, ok, error }) }));
}

function startNewInput() {
  clearedSource = null;
  updateInputCount(); scheduleSave();
}

function manualCopy(text) {
  $('manual-copy').value = text;
  $('copy-dialog').showModal();
  $('manual-copy').focus(); $('manual-copy').select();
  $('manual-copy').setSelectionRange(0, text.length);
}

async function copyNote(asText = false) {
  const markdown = output();
  if (!markdown) return;
  const text = asText ? plainText(markdown) : markdown;
  try {
    await navigator.clipboard.writeText(text);
    toast(asText ? 'Plain text copied. Ready for your notes.' : 'Markdown copied. Ready for your notes.');
    if (!asText) {
      clearTimeout(copyTimer);
      $('copy-button').querySelector('span').textContent = 'Copied!';
      copyTimer = setTimeout(() => { $('copy-button').querySelector('span').textContent = 'Copy Markdown'; }, 2200);
    }
  } catch { manualCopy(text); }
}

$('source-input').addEventListener('input', startNewInput);
$('select-mode-button').addEventListener('click', () => { if (state.editing) parseInput(); });
$('edit-mode-button').addEventListener('click', editSource);
$('clear-source').addEventListener('click', clearSource);
$('undo-clear-source').addEventListener('click', undoClearSource);
$('source-input').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); parseInput(); } });
$('example-button').addEventListener('click', () => { $('source-input').value = EXAMPLE; state.newSource = true; startNewInput(); parseInput(); toast('Try tapping a few blocks to collect them.'); });
$('paste-button').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) { toast('The clipboard is empty. Copy an answer first.'); return; }
    $('source-input').value = text;
    startNewInput();
    toast('Pasted. Switch to Select blocks when you’re ready.');
  } catch { $('source-input').focus(); toast('Touch and hold in the input, then choose Paste.'); }
});
$('select-all').addEventListener('click', () => { rememberSelection(); state.selected = new Set(state.blocks.map(b => b.id)); renderSelected(); });
$('clear-selection').addEventListener('click', () => { rememberSelection(); state.selected.clear(); renderSelected(); });
$('undo-button').addEventListener('click', () => { if (!state.history.length) return; state.selected = new Set(state.history.pop()); renderSelected(); });
$('select-tab').addEventListener('click', () => showView('select'));
$('collection-tab').addEventListener('click', () => showView('collection'));
$('review-button').addEventListener('click', () => showView('collection', true));
$('review-selection').addEventListener('click', () => { showView('select', true); if (!matchMedia('(max-width: 760px)').matches) $('source-heading').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
for (const view of ['preview', 'markdown']) $(view + '-button').addEventListener('click', () => {
  state.outputView = view;
  for (const option of ['preview', 'markdown']) {
    $(option + '-button').classList.toggle('active', option === view);
    $(option + '-button').setAttribute('aria-pressed', String(option === view));
  }
  renderCollection();
});
$('copy-button').addEventListener('click', () => copyNote());
$('copy-text-button').addEventListener('click', () => copyNote(true));
$('download-button').addEventListener('click', () => {
  const markdown = output(); if (!markdown) return;
  const blob = new Blob([markdown + '\n'], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'gathered-note.md';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast('Your Markdown file is ready.');
});
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
for (const id of ['close-help', 'got-it']) $(id).addEventListener('click', () => $('help-dialog').close());
$('close-copy').addEventListener('click', () => $('copy-dialog').close());
$('select-copy-text').addEventListener('click', () => { $('manual-copy').focus(); $('manual-copy').select(); $('manual-copy').setSelectionRange(0, $('manual-copy').value.length); });
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
window.addEventListener('pagehide', saveNow);
matchMedia('(max-width: 760px)').addEventListener('change', () => showView(state.view));

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved && saved.version === 1 && typeof saved.source === 'string') {
    state.source = saved.source;
    $('source-input').value = typeof saved.draft === 'string' ? saved.draft : saved.source;
    state.parsed = !!saved.parsed;
    state.editing = saved.editing !== false || !state.parsed;
    state.newSource = !!saved.newSource;
    state.view = saved.view === 'collection' ? 'collection' : 'select';
    if (state.parsed) {
      const parsed = parseSource(state.source);
      state.blocks = parsed.blocks; state.definitions = parsed.definitions;
      const valid = new Set(state.blocks.map(b => b.id));
      state.selected = new Set(Array.isArray(saved.selected) ? saved.selected.filter(id => valid.has(id)) : []);
    }
  }
} catch { /* A malformed or inaccessible local draft starts with a clean workspace. */ }
updateInputCount(); renderMode(); renderBlocks(); renderCollection();
document.documentElement.dataset.gatherImportReady = '1';
