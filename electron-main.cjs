const { app, BrowserWindow, session } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const file = path.resolve(ROOT, relative);
      if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500).end(); return; }
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cache-Control': 'no-cache'
        });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

app.whenReady().then(async () => {
  const { port } = await startServer();
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'media'));
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600,
    backgroundColor: '#0a0b10', title: 'MonkeyMoji',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${port}/obs-output.html`)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1280, height: 720, frame: false, transparent: true, backgroundColor: '#00000000', alwaysOnTop: false } };
    }
    return { action: 'deny' };
  });
  await win.loadURL(`http://127.0.0.1:${port}/index.html`);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
