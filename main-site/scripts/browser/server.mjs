/** Static production artifact + the actual isolated-runner response.
 * Not a Cloudflare/Firebase/Supabase emulator. Unavailable APIs return 503.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

export async function serveBuild(root) {
  const headersText = await readFile(path.join(root, '_headers'), 'utf8');
  const headers = {};
  let global = false;
  for (const line of headersText.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      global = line === '/*';
      continue;
    }
    const index = line.indexOf(':');
    if (global && index > 0) headers[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  const source = await readFile(new URL('../../functions/_playground.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const { playgroundRunner } = await import(
    `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
  );
  const received = [];
  const server = http.createServer(async (req, res) => {
    try {
      received.push(req.url);
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/playground/runner') {
        const response = playgroundRunner();
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
        return;
      }
      if (pathname.startsWith('/api/')) {
        res.writeHead(503, { ...headers, 'content-type': 'application/json' });
        res.end('{"error":"Pages Functions unavailable in static browser tests"}');
        return;
      }
      let file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) file = path.join(root, 'index.html');
      try {
        if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
        await stat(file);
      } catch {
        file = path.extname(pathname) ? '' : path.join(root, 'index.html');
      }
      if (!file) {
        res.writeHead(404, headers);
        res.end('Not found');
        return;
      }
      const bytes = await readFile(file);
      const mime =
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.woff2': 'font/woff2',
          '.json': 'application/json',
          '.webmanifest': 'application/manifest+json',
        }[path.extname(file)] ?? 'application/octet-stream';
      res.writeHead(200, { ...headers, 'content-type': mime, 'cache-control': 'no-store' });
      res.end(bytes);
    } catch {
      res.writeHead(500);
      res.end('Browser test server error');
    }
  });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  return {
    received,
    origin: `http://localhost:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
