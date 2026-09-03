'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openFileDialog: () => ipcRenderer.invoke('file:open-dialog'),
  saveFileDirect: (filePath, content, encoding) => (
    ipcRenderer.invoke('file:save-direct', { filePath, content, encoding })
  ),
  saveFileDialog: (filename, content, encoding) => (
    ipcRenderer.invoke('file:save-dialog', { filename, content, encoding })
  ),
  saveBinaryDirect: (filePath, binaryBase64) => (
    ipcRenderer.invoke('file:save-binary-direct', { filePath, binaryBase64 })
  ),
  saveBinaryDialog: (filename, binaryBase64) => (
    ipcRenderer.invoke('file:save-binary-dialog', { filename, binaryBase64 })
  ),
  onFileOpenedFromSystem: (callback) => subscribe('file:opened-from-system', callback),
  onUpdateStatus: (callback) => subscribe('update:status', callback)
});
