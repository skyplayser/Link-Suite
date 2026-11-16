// Brücke für das Fenster „Über Link-Suite“: nur Version, Lizenztext und GitHub öffnen.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("about", {
  info: () => ipcRenderer.invoke("about:info"),
  licenses: () => ipcRenderer.invoke("about:licenses"),
  github: () => ipcRenderer.invoke("about:open", "github"),
  resize: (h: unknown) => { if (typeof h === "number" && Number.isFinite(h)) ipcRenderer.send("about:resize", h); },
  onLicenses: (cb: () => void) => { ipcRenderer.on("about:licenses", () => cb()); },
});
