'use strict';

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const iconv = require('iconv-lite');
const { autoUpdater } = require('electron-updater');

const APP_ID = 'pl.matrixovskyy.csvstudio';
const SUPPORTED_EXTENSIONS = new Set(['.csv', '.dsv', '.tsv', '.txt', '.xlsx', '.xls']);
const BINARY_EXTENSIONS = new Set(['.xlsx', '.xls']);
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

let mainWindow = null;

function normalizeFilePath(candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  const resolved = path.resolve(candidate);
  if (!SUPPORTED_EXTENSIONS.has(path.extname(resolved).toLowerCase())) return null;
  return resolved;
}

function filePathsFromArguments(argv) {
  const uniquePaths = new Set();
  for (const argument of argv || []) {
    if (typeof argument !== 'string' || argument.startsWith('-')) continue;
    const filePath = normalizeFilePath(argument);
    if (filePath && fs.existsSync(filePath)) uniquePaths.add(filePath);
  }
  return [...uniquePaths];
}

async function serializeFile(filePath) {
  const resolved = normalizeFilePath(filePath);
  if (!resolved) throw new Error('Nieobsługiwany typ pliku.');

  const buffer = await fsPromises.readFile(resolved);
  return {
    filename: path.basename(resolved),
    filePath: resolved,
    isBinary: BINARY_EXTENSIONS.has(path.extname(resolved).toLowerCase()),
    binaryBase64: buffer.toString('base64')
  };
}

async function sendFilesToRenderer(filePaths) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  for (const filePath of filePaths) {
    try {
      const payload = await serializeFile(filePath);
      mainWindow.webContents.send('file:opened-from-system', payload);
    } catch (error) {
      dialog.showErrorBox('Nie udało się otworzyć pliku', error.message);
    }
  }
}

function encodeText(content, encoding = 'utf-8') {
  const normalized = String(encoding || 'utf-8').toLowerCase();
  const iconvEncoding = {
    'utf-8': 'utf8',
    'utf8': 'utf8',
    'windows-1250': 'win1250',
    'iso-8859-2': 'iso-8859-2',
    'utf-16le': 'utf16le'
  }[normalized] || 'utf8';

  const encoded = iconv.encode(String(content ?? ''), iconvEncoding);
  if (iconvEncoding === 'utf8') {
    return Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), encoded]);
  }
  if (iconvEncoding === 'utf16le') {
    return Buffer.concat([Buffer.from([0xFF, 0xFE]), encoded]);
  }
  return encoded;
}

function safeFilename(filename, fallback) {
  const name = path.basename(String(filename || '')).replace(/[<>:"/\\|?*]/g, '_').trim();
  return name || fallback;
}

async function writeTextFile(filePath, content, encoding) {
  const resolved = path.resolve(filePath);
  await fsPromises.writeFile(resolved, encodeText(content, encoding));
  return {
    success: true,
    filePath: resolved,
    filename: path.basename(resolved)
  };
}

async function writeBinaryFile(filePath, binaryBase64) {
  const resolved = path.resolve(filePath);
  await fsPromises.writeFile(resolved, Buffer.from(String(binaryBase64 || ''), 'base64'));
  return {
    success: true,
    filePath: resolved,
    filename: path.basename(resolved)
  };
}

function errorResult(error) {
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

function registerFileHandlers() {
  ipcMain.handle('file:open-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Otwórz arkusz',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Obsługiwane arkusze', extensions: ['csv', 'dsv', 'tsv', 'txt', 'xlsx', 'xls'] },
        { name: 'Pliki CSV i tekstowe', extensions: ['csv', 'dsv', 'tsv', 'txt'] },
        { name: 'Pliki programu Excel', extensions: ['xlsx', 'xls'] }
      ]
    });

    if (result.canceled) return [];
    return Promise.all(result.filePaths.map(serializeFile));
  });

  ipcMain.handle('file:save-direct', async (_event, request) => {
    try {
      return await writeTextFile(request.filePath, request.content, request.encoding);
    } catch (error) {
      return errorResult(error);
    }
  });

  ipcMain.handle('file:save-dialog', async (_event, request) => {
    const filename = safeFilename(request.filename, 'Arkusz.csv');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Zapisz arkusz jako',
      defaultPath: filename,
      filters: [
        { name: 'Plik CSV', extensions: ['csv'] },
        { name: 'Plik TSV', extensions: ['tsv'] },
        { name: 'Wszystkie pliki', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    try {
      return await writeTextFile(result.filePath, request.content, request.encoding);
    } catch (error) {
      return errorResult(error);
    }
  });

  ipcMain.handle('file:save-binary-direct', async (_event, request) => {
    try {
      return await writeBinaryFile(request.filePath, request.binaryBase64);
    } catch (error) {
      return errorResult(error);
    }
  });

  ipcMain.handle('file:save-binary-dialog', async (_event, request) => {
    const filename = safeFilename(request.filename, 'Arkusz.xlsx').replace(/\.xls$/i, '.xlsx');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Zapisz arkusz Excel jako',
      defaultPath: filename,
      filters: [{ name: 'Arkusz programu Excel', extensions: ['xlsx'] }]
    });

    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    try {
      return await writeBinaryFile(result.filePath, request.binaryBase64);
    } catch (error) {
      return errorResult(error);
    }
  });
}

function sendUpdateStatus(status, details = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('update:status', { status, ...details });
}

function configureAutoUpdates() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
  autoUpdater.on('update-available', info => sendUpdateStatus('available', { version: info.version }));
  autoUpdater.on('update-not-available', info => sendUpdateStatus('current', { version: info.version }));
  autoUpdater.on('download-progress', progress => {
    sendUpdateStatus('downloading', { percent: Math.round(progress.percent || 0) });
  });
  autoUpdater.on('update-downloaded', info => {
    sendUpdateStatus('downloaded', { version: info.version });
  });
  autoUpdater.on('error', error => {
    console.error('Błąd automatycznej aktualizacji:', error);
    sendUpdateStatus('error');
  });

  const checkForUpdates = () => autoUpdater.checkForUpdatesAndNotify().catch(error => {
    console.error('Nie udało się sprawdzić aktualizacji:', error);
  });

  setTimeout(checkForUpdates, 5000);
  setInterval(checkForUpdates, UPDATE_INTERVAL_MS);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111827',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.once('did-finish-load', () => {
    sendFilesToRenderer(filePathsFromArguments(process.argv.slice(1)));
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      sendFilesToRenderer(filePathsFromArguments(commandLine.slice(1)));
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    registerFileHandlers();
    createWindow();
    configureAutoUpdates();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
