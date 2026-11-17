import { marked } from './vendor/marked.js';

// Parse into an inert template, then rebuild only safe presentation elements.
// No event handlers, styles, external images, or executable URLs survive.
const allowed = new Set('P H1 H2 H3 H4 H5 H6 UL OL LI BLOCKQUOTE PRE CODE TABLE THEAD TBODY TFOOT TR TH TD STRONG B EM I DEL S BR HR A SPAN INPUT SUP SUB DL DT DD'.split(' '));
const discarded = new Set('SCRIPT STYLE IFRAME OBJECT EMBED SVG MATH NOSCRIPT TEMPLATE FORM VIDEO AUDIO SOURCE'.split(' '));

function safeUrl(value) {
  try {
    if (value.startsWith('#')) return value;
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function markdownFragment(markdown) {
  const template = document.createElement('template');
  template.innerHTML = marked.parse(markdown, { gfm: true, breaks: false });
  function clean(node) {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    const result = document.createDocumentFragment();
    if (node.nodeType !== Node.ELEMENT_NODE) return result;
    const tag = node.tagName;
    if (discarded.has(tag)) return result;
    if (tag === 'IMG') {
      const alt = node.getAttribute('alt');
      return document.createTextNode(alt ? '[Image: ' + alt + ']' : '[Image]');
    }
    if (!allowed.has(tag)) {
      for (const child of node.childNodes) result.append(clean(child));
      return result;
    }
    const el = document.createElement(tag.toLowerCase());
    if (tag === 'A') {
      const href = safeUrl(node.getAttribute('href') || '');
      if (href) { el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer'; }
      if (node.hasAttribute('title')) el.title = node.getAttribute('title');
    }
    if (tag === 'OL' && /^\d+$/.test(node.getAttribute('start') || '')) el.setAttribute('start', node.getAttribute('start'));
    if ((tag === 'TD' || tag === 'TH') && ['left', 'center', 'right'].includes(node.getAttribute('align'))) el.setAttribute('align', node.getAttribute('align'));
    if (tag === 'INPUT') {
      if (node.getAttribute('type') !== 'checkbox') return result;
      el.type = 'checkbox'; el.disabled = true; el.checked = node.hasAttribute('checked');
    }
    for (const child of node.childNodes) el.append(clean(child));
    return el;
  }
  const fragment = document.createDocumentFragment();
  for (const child of template.content.childNodes) fragment.append(clean(child));
  // Give wide code blocks and tables a scroll container without widening the page.
  for (const element of [...fragment.querySelectorAll('table, pre')]) {
    const wrapper = document.createElement('div');
    wrapper.className = 'overflow-content';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', element.tagName === 'TABLE' ? 'Scrollable table' : 'Scrollable code');
    element.replaceWith(wrapper);
    wrapper.append(element);
  }
  return fragment;
}

export function plainText(markdown) {
  const el = document.createElement('div');
  el.append(markdownFragment(markdown));
  // textContent omits the visual separators between block elements.
  for (const br of [...el.querySelectorAll('br')]) br.replaceWith('\n');
  for (const row of el.querySelectorAll('tr')) {
    [...row.children].forEach((cell, index) => cell.append(index < row.children.length - 1 ? '\t' : '\n'));
  }
  for (const item of el.querySelectorAll('li')) item.append('\n');
  for (const block of el.querySelectorAll('p,h1,h2,h3,h4,h5,h6,blockquote,pre,ul,ol,table')) block.append('\n\n');
  return el.textContent.replace(/\n{3,}/g, '\n\n').trim();
}
