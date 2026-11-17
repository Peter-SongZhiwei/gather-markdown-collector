import { readFile, readdir, mkdir, writeFile, rm, copyFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.md': 'text/markdown' };
const assets = Object.create(null);
async function add(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name), name = prefix + '/' + entry.name;
    if (entry.isDirectory()) await add(path, name);
    else assets[name] = { type: (types[extname(entry.name)] || 'text/plain') + '; charset=utf-8', content: await readFile(path, 'utf8') };
  }
}
await add(resolve(root, 'web'));
const worker = (await readFile(resolve(root, 'worker/index.js'), 'utf8')).replace('__GATHER_ASSETS__', () => JSON.stringify(assets));
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist/server'), { recursive: true });
await mkdir(resolve(root, 'dist/.openai'), { recursive: true });
await writeFile(resolve(root, 'dist/server/index.js'), worker);
await copyFile(resolve(root, '.openai/hosting.json'), resolve(root, 'dist/.openai/hosting.json'));
console.log('Built Gather.');
