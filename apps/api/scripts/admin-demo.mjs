import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { dashboardResponse } from '../src/admin/dashboard.ts';
import { periodFrom } from '../src/ai/ledger.ts';
import { demoLedger } from '../fixtures/synthetic-ledger.ts';

// Separate loopback-only preview process. No env, secrets, auth bypass, or OpenAI import.
export async function startDemo(port = 8790) {
  const ledger = await demoLedger();
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    let result;
    if (request.headers.host !== `127.0.0.1:${server.address().port}`) result = new Response('Loopback preview only.', { status: 403 });
    else if (request.method !== 'GET') result = new Response('Read only.', { status: 405, headers: { Allow: 'GET' } });
    else if (url.pathname !== '/admin/ai') result = new Response('Not found.', { status: 404 });
    else {
      try { result = dashboardResponse({ kind: 'ready', report: await ledger.report(periodFrom(url)), synthetic: true }); }
      catch { result = dashboardResponse({ kind: 'error', message: 'Alege date UTC valide, în ordine, pentru cel mult 366 de zile.' }, 400); }
    }
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(await result.text());
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startDemo();
  console.log(`Synthetic Resumora preview: http://127.0.0.1:${server.address().port}/admin/ai`);
}
