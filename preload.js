const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  generateCSV: (config) => ipcRenderer.invoke('generate-csv', config),
  savePreset: (data) => ipcRenderer.invoke('save-preset', data),
  listPresets: () => ipcRenderer.invoke('list-presets'),
  loadPreset: (name) => ipcRenderer.invoke('load-preset', name)
});
