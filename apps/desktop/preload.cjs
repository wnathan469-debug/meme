const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("memeradar", {
  loadState: () => ipcRenderer.invoke("preferences:load"),
  saveState: (state) => ipcRenderer.invoke("preferences:save", state),
  copyAddress: (address) => ipcRenderer.invoke("clipboard:address", address),
  version: "0.1.0",
});
