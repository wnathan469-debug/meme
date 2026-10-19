const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("memeradar", {
  loadState: () => ipcRenderer.invoke("preferences:load"),
  saveState: (state) => ipcRenderer.invoke("preferences:save", state),
  copyAddress: (address) => ipcRenderer.invoke("clipboard:address", address),
  local: {
    command: (command, input) =>
      ipcRenderer.invoke("local:command", command, input),
  },
  version: "0.3.2",
});
