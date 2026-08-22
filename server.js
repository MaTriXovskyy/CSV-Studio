const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 8765;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${HOST}:${PORT}`).pathname);
  } catch (error) {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  const filePath = path.resolve(ROOT_DIR, `.${pathname}`);
  const isInsideProject = filePath === ROOT_DIR || filePath.startsWith(`${ROOT_DIR}${path.sep}`);
  if (!isInsideProject) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(response);
  });
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    // Serwer już działa po wcześniejszym uruchomieniu aplikacji.
    process.exit(0);
  }

  console.error('Nie udało się uruchomić CSV Studio:', error.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`CSV Studio działa pod adresem http://${HOST}:${PORT}`);
  console.log('To okno może pozostać zminimalizowane. Zamknięcie go wyłączy aplikację.');
});
