// ==UserScript==
// @name         Gather Auto
// @namespace    gather.markdown
// @version      1.0.0
// @description  Send a marked ChatGPT shared answer into your Gather workspace.
// @match        https://chatgpt.com/s/*
// @match        https://chatgpt.com/share/*
// @match        https://markdown-collector-zhiwei.s13571842931.chatgpt.site/*
// @run-at       document-idle
// @inject-into  content
// @noframes
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @grant        GM.listValues
// ==/UserScript==

(async () => {
  'use strict';
  const GATHER = 'https://markdown-collector-zhiwei.s13571842931.chatgpt.site/';
  const PREFIX = 'gather:transfer:';
  const TTL = 60 * 60 * 1000;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let busy = false;
  let notice;

  function status(message, retry) {
    if (!notice) {
      notice = document.createElement('div');
      notice.setAttribute('role', 'status');
      notice.style.cssText = 'position:fixed;bottom:max(18px,env(safe-area-inset-bottom));left:16px;right:16px;z-index:2147483647;max-width:520px;margin:auto;padding:16px 20px;border-radius:16px;background:#173f38;color:white;box-shadow:0 8px 30px #0003;font:15px/1.5 system-ui,sans-serif;';
      (document.body || document.documentElement).append(notice);
    }
    notice.replaceChildren(document.createTextNode(message));
    if (retry) {
      const button = document.createElement('button');
      button.textContent = 'Retry';
      button.style.cssText = 'margin:10px 0 0;padding:8px 14px;display:block;border:1px solid #ffffff80;border-radius:9px;background:transparent;color:inherit;font:inherit;';
      button.addEventListener('click', retry);
      notice.append(button);
    }
  }

  function findAnswer() {
    for (const selector of [
      '[data-assistant-markdown-root]',
      '[data-assistant-markdown]',
      '[data-message-author-role="assistant"] .markdown',
      '[data-message-author-role="assistant"]',
      'main .markdown'
    ]) {
      const answers = [...document.querySelectorAll(selector)]
        .filter(el => el.getBoundingClientRect().width > 0 && !el.closest('[hidden]'));
      if (answers.length) return answers[answers.length - 1];
    }
    return null;
  }

  async function waitForAnswer() {
    let previous = '', stableAt = 0;
    const started = Date.now();
    while (Date.now() - started < 60000) {
      const answer = findAnswer();
      const text = answer?.textContent || '';
      if (answer && text.trim() && !answer.querySelector('[aria-busy="true"]') && document.readyState === 'complete') {
        if (text !== previous) { previous = text; stableAt = Date.now(); }
        else if (Date.now() - stableAt >= 1500) return answer;
      } else { previous = ''; stableAt = 0; }
      await sleep(350);
    }
    throw new Error('No completed answer found. Finish any sign-in or page check, wait for the answer, then tap Retry.');
  }

  async function cleanExpired() {
    for (const key of await GM.listValues()) {
      if (!key.startsWith(PREFIX)) continue;
      const transfer = await GM.getValue(key, null);
      if (!transfer || Date.now() - transfer.createdAt > TTL) await GM.deleteValue(key);
    }
  }

  async function sendAnswer() {
    if (busy || !new URLSearchParams(location.hash.slice(1)).has('gather-auto')) return;
    busy = true;
    try {
      status('Gather · Waiting for the answer…');
      const answer = await waitForAnswer();
      const markdown = extractMarkdown(answer);
      if (markdown.length > 600000) throw new Error('This answer is too long. Use your existing Safari shortcut for a smaller section.');
      const id = crypto.randomUUID();
      await cleanExpired();
      await GM.setValue(PREFIX + id, { id, markdown, createdAt: Date.now() });
      // Keep the text in extension storage, rather than the URL or clipboard.
      status('Gather · Opening your answer…');
      history.replaceState(history.state, '', location.pathname + location.search);
      location.assign(GATHER + '#gather-transfer=' + id);
    } catch (error) {
      busy = false;
      status('Gather · ' + (error.message || 'Sending failed.'), sendAnswer);
    }
  }

  async function receiveAnswer() {
    const id = new URLSearchParams(location.hash.slice(1)).get('gather-transfer');
    if (!id || !/^[a-f0-9-]{36}$/.test(id) || busy) return;
    busy = true;
    try {
      const transfer = await GM.getValue(PREFIX + id, null);
      if (!transfer || transfer.id !== id || Date.now() - transfer.createdAt > TTL) throw new Error('This transfer expired or was already received. Share the answer again.');
      status('Gather · Loading your answer…');
      const started = Date.now();
      while (document.documentElement.dataset.gatherImportReady !== '1') {
        if (Date.now() - started > 30000) throw new Error('Gather is still loading. Refresh this page, then try again.');
        await sleep(250);
      }
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          document.removeEventListener('gather:import-result-v1', onResult);
          reject(new Error('Gather did not receive the answer. Refresh this page, then try again.'));
        }, 5000);
        function onResult(event) {
          if (typeof event.detail !== 'string') return;
          let result;
          try { result = JSON.parse(event.detail); } catch { return; }
          if (result.id !== id) return;
          clearTimeout(timeout);
          document.removeEventListener('gather:import-result-v1', onResult);
          result.ok ? resolve() : reject(new Error(result.error || 'Import failed.'));
        }
        document.addEventListener('gather:import-result-v1', onResult);
        document.dispatchEvent(new CustomEvent('gather:import-v1', { detail: JSON.stringify(transfer) }));
      });
      await GM.deleteValue(PREFIX + id);
      history.replaceState(history.state, '', location.pathname + location.search);
      notice?.remove();
      notice = null;
    } catch (error) {
      busy = false;
      status('Gather · ' + (error.message || 'Receiving failed.'), receiveAnswer);
    }
  }

  function extractMarkdown(answer) {
  const root = answer.querySelector('[aria-busy]') || answer;
  const codeBlocks = [];
  const skip = new Set(['BUTTON', 'SCRIPT', 'STYLE', 'SVG', 'NAV', 'ASIDE', 'FORM', 'IFRAME']);
  const text = value => value.replace(/\s+/g, ' ').replace(/([\\`*_\[\]])/g, '\\$1');
  const fence = value => '`'.repeat(Math.max(3, ...Array.from(value.matchAll(/`+/g), m => m[0].length + 1)));
  const children = element => Array.from(element.childNodes).map(render).join('');

  function list(element) {
    let number = Number(element.getAttribute('start')) || 1;
    return Array.from(element.children).filter(el => el.tagName === 'LI').map(item => {
      const marker = element.tagName === 'OL' ? number++ + '. ' : '- ';
      const body = Array.from(item.childNodes).map(child => {
        if (child.nodeType === 1 && ['UL', 'OL'].includes(child.tagName)) return '\n' + list(child) + '\n';
        return render(child);
      }).join('').trim();
      return marker + body.split('\n').map((line, index) => index ? ' '.repeat(marker.length) + line : line).join('\n');
    }).join('\n');
  }

  function table(element) {
    const rows = Array.from(element.querySelectorAll('tr')).map(row => Array.from(row.children).filter(cell => ['TH', 'TD'].includes(cell.tagName)).map(cell => children(cell).trim().replace(/\n+/g, '<br>').replace(/\|/g, '\\|'))).filter(row => row.length);
    if (!rows.length) return '';
    const columns = Math.max(...rows.map(row => row.length));
    const header = element.querySelector('tr')?.querySelector('th') ? rows.shift() : Array.from({ length: columns }, (_, i) => 'Column ' + (i + 1));
    const row = cells => '| ' + Array.from({ length: columns }, (_, i) => cells[i] || '').join(' | ') + ' |';
    return '\n\n' + [row(header), row(Array(columns).fill('---')), ...rows.map(row)].join('\n') + '\n\n';
  }

  function render(node) {
    if (node.nodeType === 3) return text(node.textContent || '');
    if (node.nodeType !== 1 || skip.has(node.tagName) || node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return '';
    const tag = node.tagName;
    if (node.getAttribute('role') === 'button') return '';
    if (tag === 'BR') return '\n';
    if (tag === 'HR') return '\n\n---\n\n';
    if (tag === 'PRE') {
      const code = node.querySelector('code') || node;
      const value = (code.textContent || '').replace(/\n$/, '');
      const marker = fence(value);
      const language = /(?:language-|lang-)([\w+-]+)/.exec(code.className || '')?.[1] || '';
      const token = '\uE000GATHER_CODE_' + codeBlocks.length + '\uE001';
      codeBlocks.push(marker + language + '\n' + value + '\n' + marker);
      return '\n\n' + token + '\n\n';
    }
    if (tag === 'CODE') {
      const value = node.textContent || '';
      const marker = '`'.repeat(Math.max(1, ...Array.from(value.matchAll(/`+/g), m => m[0].length + 1)));
      return marker + ' ' + value + ' ' + marker;
    }
    if (tag === 'TABLE') return table(node);
    if (tag === 'UL' || tag === 'OL') return '\n\n' + list(node) + '\n\n';
    if (/^H[1-6]$/.test(tag)) return '\n\n' + '#'.repeat(Number(tag[1])) + ' ' + children(node).trim() + '\n\n';
    if (tag === 'P') return '\n\n' + children(node).trim() + '\n\n';
    if (tag === 'STRONG' || tag === 'B') return '**' + children(node).trim() + '**';
    if (tag === 'EM' || tag === 'I') return '*' + children(node).trim() + '*';
    if (tag === 'DEL' || tag === 'S') return '~~' + children(node).trim() + '~~';
    if (tag === 'BLOCKQUOTE') return '\n\n' + children(node).trim().split('\n').map(line => '> ' + line).join('\n') + '\n\n';
    if (tag === 'INPUT') return node.getAttribute('type') === 'checkbox' ? (node.checked ? '[x] ' : '[ ] ') : '';
    if (tag === 'IMG') return node.getAttribute('alt') ? '[Image: ' + text(node.getAttribute('alt')) + ']' : '';
    if (tag === 'A') {
      const label = children(node).trim();
      let url;
      try { url = new URL(node.getAttribute('href') || '', location.href); } catch { return label; }
      if (!label || !['http:', 'https:', 'mailto:'].includes(url.protocol)) return label;
      return '[' + label + '](<' + url.href.replace(/>/g, '%3E') + '>)';
    }
    // Code headers may contain a language label and Copy button outside <pre>.
    if (tag === 'DIV' && node.querySelector('pre') && !node.querySelector('p,h1,h2,h3,h4,h5,h6,ul,ol,blockquote,table')) {
      return Array.from(node.querySelectorAll('pre')).map(render).join('\n\n');
    }
    return children(node);
  }

  const markdown = children(root).replace(/^[\t ]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
    .replace(/\uE000GATHER_CODE_(\d+)\uE001/g, (_, index) => codeBlocks[Number(index)]);
  if (!markdown) throw new Error('The answer is empty. Let the page finish loading and try again.');
  return markdown;
  }

  if (location.origin === new URL(GATHER).origin) {
    await receiveAnswer();
    window.addEventListener('hashchange', receiveAnswer);
  } else {
    await sendAnswer();
    window.addEventListener('hashchange', sendAnswer);
  }
})().catch(error => console.error('Gather Auto:', error.message));
