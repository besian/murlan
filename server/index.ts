import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Client, DEFAULT_TIMING, RoomManager, Timing } from './rooms';
import type { ServerMsg } from '../src/shared/protocol';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

export interface ServerOptions {
  port: number;
  /** Built client (vite `dist/`) to serve; omitted in dev, where Vite serves the page. */
  staticDir?: string;
  timing?: Timing;
}

export function startServer(opts: ServerOptions) {
  const manager = new RoomManager(opts.timing ?? DEFAULT_TIMING);
  const root = opts.staticDir ? resolve(opts.staticDir) : null;

  const http = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: manager.rooms.size }));
      return;
    }
    if (!root) {
      res.writeHead(404).end('Not found');
      return;
    }
    let file = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) {
      res.writeHead(400).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('Client not built — run `npm run build`.');
      return;
    }
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    const cache = file.includes(`${root}/assets/`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'content-type': type, 'cache-control': cache });
    createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 4096 });
  wss.on('connection', (ws: WebSocket & { alive?: boolean }) => {
    ws.alive = true;
    const client: Client = {
      send(msg: ServerMsg) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
    };
    ws.on('pong', () => (ws.alive = true));
    ws.on('message', (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      try {
        manager.handle(client, msg);
      } catch (e) {
        console.error('error handling message', e);
        client.send({ t: 'error', message: 'Server error.' });
      }
    });
    ws.on('close', () => manager.disconnect(client));
  });

  // Drop dead connections so their seats go to autopilot promptly.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
  }, 15_000);

  const ready = new Promise<number>((res) => {
    http.listen(opts.port, () => {
      const addr = http.address();
      res(typeof addr === 'object' && addr ? addr.port : opts.port);
    });
  });

  return {
    ready,
    manager,
    close: () =>
      new Promise<void>((res) => {
        clearInterval(heartbeat);
        for (const room of [...manager.rooms.values()]) manager.delete(room);
        for (const ws of wss.clients) ws.terminate();
        wss.close();
        http.close(() => res());
      }),
  };
}

// Run directly: `node dist-server/index.js` or `tsx server/index.ts`.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT) || 8787;
  const staticDir = process.env.STATIC_DIR ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '../dist');
  const server = startServer({ port, staticDir });
  server.ready.then((p) => console.log(`Murlan server on http://localhost:${p} (ws at /ws)`));
}
