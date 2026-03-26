const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  showSaveDialog: (defaultName) => ipcRenderer.invoke('show-save-dialog', defaultName),
});
