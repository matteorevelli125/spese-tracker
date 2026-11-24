// Server statico per il "golden test" delle metriche. Nessuna dipendenza.
//
//   node tools/golden/server.mjs --root <cartella app> --port 8131
//
// - serve l'app da --root (es. un worktree di `main` oppure il branch corrente);
// - /__golden/*            → i file di questo strumento (sempre quelli del branch corrente,
//                            così si misura la versione vecchia con lo stesso probe);
// - /__golden/data/<nome>  → un JSON da private/ (dati reali) o tests/fixtures/;
// - POST /__golden/save?label=X → scrive private/snapshots/X.json;
// - /index.html?golden=1   → index.html con iniettati freeze-time.js (prima degli
//                            script dell'app) e probe.js (dopo).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(TOOL_DIR, '..', '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const ROOT = path.resolve(REPO, arg('root', '.'));
const PORT = Number(arg('port', 8131));
const OUT = path.resolve(REPO, arg('out', 'private/snapshots'));
const DATA_DIRS = [path.join(REPO, 'private'), path.join(REPO, 'tests', 'fixtures')];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon',
};

// Risolve un percorso dentro `base` rifiutando ogni uscita (../).
function inside(base, rel) {
  const p = path.resolve(base, '.' + path.sep + rel);
  return p === base || p.startsWith(base + path.sep) ? p : null;
}

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveFile(res, file, transform) {
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'not found');
    const body = transform ? transform(buf.toString('utf8')) : buf;
    send(res, 200, body, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

function injectGolden(html) {
  const freeze = '<script src="/__golden/freeze-time.js"></script>\n';
  const probe = '<script src="/__golden/probe.js"></script>\n';
  const firstAppScript = html.indexOf('<script src="categories.js">');
  if (firstAppScript < 0) throw new Error('index.html: script categories.js non trovato');
  html = html.slice(0, firstAppScript) + freeze + html.slice(firstAppScript);
  return html.replace('</body>', probe + '</body>');
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = decodeURIComponent(url.pathname);

  if (req.method === 'POST' && p === '/__golden/save') {
    const label = (url.searchParams.get('label') || '').replace(/[^\w.-]/g, '');
    if (!label) return send(res, 400, 'label mancante');
    // Buffer, non stringhe: un chunk può spezzare un carattere UTF-8 multibyte (es. "−").
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      fs.mkdirSync(OUT, { recursive: true });
      const file = path.join(OUT, `${label}.json`);
      fs.writeFileSync(file, body);
      console.log(`✔ snapshot salvato: ${path.relative(REPO, file)} (${body.length} byte)`);
      send(res, 200, 'ok');
    });
    return;
  }

  if (p.startsWith('/__golden/data/')) {
    const name = p.slice('/__golden/data/'.length);
    for (const dir of DATA_DIRS) {
      const f = inside(dir, name);
      if (f && fs.existsSync(f)) return serveFile(res, f);
    }
    return send(res, 404, 'dati non trovati');
  }

  if (p.startsWith('/__golden/')) {
    const f = inside(TOOL_DIR, p.slice('/__golden/'.length));
    return f ? serveFile(res, f) : send(res, 403, 'vietato');
  }

  const rel = p === '/' ? 'index.html' : p.slice(1);
  const f = inside(ROOT, rel);
  if (!f) return send(res, 403, 'vietato');
  if (rel === 'index.html' && url.searchParams.get('golden')) return serveFile(res, f, injectGolden);
  serveFile(res, f);
}).listen(PORT, () => {
  console.log(`golden server: http://localhost:${PORT}  (app da ${path.relative(REPO, ROOT) || '.'})`);
});
