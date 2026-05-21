import { app as i, BrowserWindow as t, ipcMain as n, Notification as d } from "electron";
import o from "node:path";
process.env.DIST = o.join(__dirname, "../dist");
process.env.VITE_PUBLIC = i.isPackaged ? process.env.DIST : o.join(process.env.DIST, "../public");
let e;
const s = process.env.VITE_DEV_SERVER_URL;
function a() {
  e = new t({
    icon: o.join(process.env.VITE_PUBLIC, "favicon.ico"),
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: !1,
    // Frameless window for custom UI
    webPreferences: {
      preload: o.join(__dirname, "preload.js"),
      nodeIntegration: !1,
      contextIsolation: !0
    }
  }), e.webContents.on("did-finish-load", () => {
    e == null || e.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), s ? e.loadURL(s) : e.loadFile(o.join(process.env.DIST, "index.html"));
}
i.on("window-all-closed", () => {
  process.platform !== "darwin" && (i.quit(), e = null);
});
i.on("activate", () => {
  t.getAllWindows().length === 0 && a();
});
i.whenReady().then(a);
n.on("window-minimize", () => {
  e == null || e.minimize();
});
n.on("window-maximize", () => {
  e != null && e.isMaximized() ? e == null || e.unmaximize() : e == null || e.maximize();
});
n.on("window-close", () => {
  e == null || e.close();
});
n.on("show-notification", (l, { title: r, body: c }) => {
  new d({ title: r, body: c }).show();
});
