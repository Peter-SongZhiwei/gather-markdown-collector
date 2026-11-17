import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSource, collectMarkdown } from '../web/core.js';

test('keeps code with blank lines and tables as complete blocks', () => {
  const { blocks } = parseSource('# Heading\n\nFirst paragraph\nwrapped line.\n\n```python\nprint(1)\n\nprint(2)\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |');
  assert.deepEqual(blocks.map(b => b.type), ['heading', 'paragraph', 'code', 'table']);
  assert.match(blocks[2].raw, /print\(1\)\n\nprint\(2\)/);
  assert.match(blocks[3].raw, /\| 1 \| 2 \|/);
});

test('makes each top-level list item selectable with its nested details', () => {
  const { blocks } = parseSource('1. First\n   - Nested A\n   - Nested B\n2. Second\n   Continuation\n\n   Another paragraph.\n3. Third');
  assert.equal(blocks.length, 3);
  assert.match(blocks[0].raw, /   - Nested B/);
  assert.match(blocks[1].raw, /Another paragraph/);
  assert.equal(blocks[2].raw, '3. Third');
});

test('exports in source order rather than selection order', () => {
  const { blocks } = parseSource('Alpha\n\nBeta\n\nGamma');
  const selected = new Set([blocks[2].id, blocks[0].id]);
  assert.equal(collectMarkdown(blocks, selected), 'Alpha\n\nGamma');
});

test('preserves references used by selected Markdown', () => {
  const { blocks, definitions } = parseSource('A [reference][docs].\n\nOther text.\n\n[docs]: https://example.com "Docs"');
  assert.equal(blocks.length, 2);
  assert.equal(collectMarkdown(blocks, new Set([blocks[0].id]), definitions), 'A [reference][docs].\n\n[docs]: https://example.com "Docs"');
  assert.equal(collectMarkdown(blocks, new Set(), definitions), '');
});

test('handles CRLF, empty text, duplicate paragraphs, and unfinished fences', () => {
  assert.equal(parseSource(' \n\n').blocks.length, 0);
  const { blocks } = parseSource('Same\r\n\r\nSame\r\n\r\n```\r\nunfinished\r\n\r\ncode');
  assert.equal(blocks.length, 3);
  assert.notEqual(blocks[0].id, blocks[1].id);
  assert.equal(blocks[2].type, 'code');
  assert.equal(blocks[2].raw, '```\nunfinished\n\ncode');
});

test('unchanged blocks retain identifiers when unrelated content changes', () => {
  const before = parseSource('First\n\nKeep this\n\nLast');
  const after = parseSource('First edited\n\nKeep this\n\nLast');
  assert.equal(before.blocks[1].id, after.blocks[1].id);
});
