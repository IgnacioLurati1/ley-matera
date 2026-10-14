// Lo poco que el juego le pide a la app de escritorio (Opciones › Gráficos): el
// modo de video y la prueba de rendimiento (main.cjs). En la web no existe
// window.mduDesktop y esas opciones no se muestran.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mduDesktop', {
  video: () => ipcRenderer.invoke('mdu:video'),
  setVideo: (mode) => ipcRenderer.invoke('mdu:setVideo', mode),
  medir: () => ipcRenderer.invoke('mdu:medir'),
  medirListo: (res) => ipcRenderer.invoke('mdu:medirListo', res),
  medirUltimo: () => ipcRenderer.invoke('mdu:medirUltimo'),
});
