import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('balloonDefense', {
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});
