import { marked } from './vendor/marked.js';

export const STORAGE_KEY = 'gather.markdown.v1';

function hash(value) {
  let n = 2166136261;
  for (let i = 0; i < value.length; i++) {
    n ^= value.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return (n >>> 0).toString(36);
}

export function parseSource(source) {
  const normalized = source.replace(/\r\n?/g, '\n');
  const tokens = marked.lexer(normalized, { gfm: true });
  const definitions = tokens.filter(t => t.type === 'def').map(t => t.raw.trim()).join('\n');
  const blocks = [];
  const occurrences = new Map();
  function add(type, raw) {
    raw = raw.trimEnd();
    if (!raw.trim()) return;
    const key = hash(type + '\0' + raw);
    const occurrence = occurrences.get(key) || 0;
    occurrences.set(key, occurrence + 1);
    blocks.push({ id: key + '-' + occurrence, type, raw });
  }
  for (const token of tokens) {
    if (token.type === 'space' || token.type === 'def') continue;
    if (token.type === 'list') {
      for (const item of token.items) add('list_item', item.raw);
    } else add(token.type, token.raw);
  }
  return { blocks, definitions };
}

export function collectMarkdown(blocks, selected, definitions = '') {
  const raw = blocks.filter(b => selected.has(b.id)).map(b => b.raw).join('\n\n');
  return raw && definitions ? raw + '\n\n' + definitions : raw;
}

export function blockLabel(type) {
  return ({ paragraph: 'Paragraph', heading: 'Heading', list_item: 'List item', code: 'Code', table: 'Table', blockquote: 'Quote', hr: 'Divider', html: 'HTML', text: 'Text' })[type] || 'Block';
}

export function fileName(title) {
  return (title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\.+$/g, '').slice(0, 100) || 'collected-note') + '.md';
}

export const EXAMPLE = `# A little less copying. A lot more keeping.

AI answers can be long. Your notes don't have to be. Keep the ideas you want to come back to, and let the rest go.

## Make this note your own

- **Tap a block** to add it to your collection. Tap again to remove it.
- **Pick just one list item.** Its nested details stay together:
  - Useful context stays with the parent.
  - Indentation is preserved when you copy.
- **Review your collection** to see everything in its original order.

> A good note is something your future self will thank you for.

## Formatting comes along

| Content | How selection works |
| --- | --- |
| Paragraph | One block at a time |
| List | One item, with its nested details |
| Code and tables | Kept whole |

\`\`\`python
ideas = ["understand", "collect", "revisit"]
for idea in ideas:
    print(idea)
\`\`\`

**Ready for Obsidian.** Copy your collection as Markdown, or download a .md file.

[Learn about Markdown](https://www.markdownguide.org/basic-syntax/)
`;
