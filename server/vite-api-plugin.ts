// Runs the api/ functions inside `npm run dev`, the same way Vercel runs them,
// so the whole app (frontend + backend + database) works on your computer.
import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';

export function apiDevPlugin(): Plugin {
  return {
    name: 'roomfit-api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();
        const file = `/api/${url.pathname.slice(5).replace(/[^\w/-]/g, '')}.ts`;
        if (!existsSync('.' + file)) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'Not found' }));
        }
        try {
          const mod = await server.ssrLoadModule(file);
          const fn = mod[req.method ?? 'GET'];
          if (typeof fn !== 'function') {
            res.statusCode = 405;
            return res.end(JSON.stringify({ error: 'Method not allowed' }));
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : Buffer.concat(chunks),
          });
          const response: Response = await fn(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => k !== 'set-cookie' && res.setHeader(k, v));
          const cookies = response.headers.getSetCookie?.() ?? [];
          if (cookies.length) res.setHeader('set-cookie', cookies);
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          server.ssrFixStacktrace(e as Error);
          console.error(e);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String((e as Error).message) }));
        }
      });
    },
  };
}
