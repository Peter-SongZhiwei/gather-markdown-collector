import './build.mjs';
import { createServer } from 'node:http';
const { default: worker } = await import('../dist/server/index.js');

const port = Number(process.env.PORT || 4173);
createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const request = new Request('http://' + incoming.headers.host + incoming.url, { method: incoming.method, headers: incoming.headers, ...(!['GET', 'HEAD'].includes(incoming.method) ? { body } : {}) });
    const response = await worker.fetch(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end('Preview request failed.'); }
}).listen(port, '0.0.0.0', () => console.log('Gather preview listening on ' + port));
