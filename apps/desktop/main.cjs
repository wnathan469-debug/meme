const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  protocol,
  net,
  clipboard,
  safeStorage,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { schema } = require("./preferences.cjs");
const APP_ORIGIN = "memeradar://app";
protocol.registerSchemesAsPrivileged([
  {
    scheme: "memeradar",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
app.setName("MemeRadar");
app.setAppUserModelId("local.memeradar.desktop");
let window;
let writeQueue = Promise.resolve();
let localRuntime;
function trusted(event) {
  return (
    event.sender === window?.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url.startsWith(`${APP_ORIGIN}/`)
  );
}
function stateFile() {
  return path.join(app.getPath("userData"), "preferences-v1.json");
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      try {
        await fs.mkdir(app.getPath("userData"), { recursive: true });
        const {
          LocalRuntime,
        } = require("../../desktop-dist/local-runtime.cjs");
        localRuntime = new LocalRuntime(
          path.join(app.getPath("userData"), "local-data-v1.sqlite"),
          {
            available: () =>
              safeStorage.isEncryptionAvailable() &&
              (process.platform !== "linux" ||
                safeStorage.getSelectedStorageBackend() !== "basic_text"),
            encrypt: (value) => safeStorage.encryptString(value),
            decrypt: (value) => safeStorage.decryptString(value),
          },
        );
      } catch {
        // Preserve an unreadable database; never substitute demonstration records.
        console.error(
          "Moteur local indisponible ; données existantes conservées.",
        );
      }
      const dist = path.resolve(__dirname, "../../dist");
      protocol.handle("memeradar", async (request) => {
        const url = new URL(request.url);
        if (url.hostname !== "app" || request.method !== "GET")
          return new Response("Forbidden", { status: 403 });
        let resource;
        try {
          resource = decodeURIComponent(url.pathname);
        } catch {
          return new Response("Bad URL", { status: 400 });
        }
        const resolved = path.resolve(
          dist,
          resource === "/" ? "index.html" : `.${resource}`,
        );
        if (!resolved.startsWith(dist + path.sep))
          return new Response("Forbidden", { status: 403 });
        const types = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".png": "image/png",
          ".ico": "image/x-icon",
        };
        const type = types[path.extname(resolved)];
        if (!type) return new Response("Forbidden", { status: 403 });
        try {
          return new Response(await fs.readFile(resolved), {
            headers: {
              "Content-Type": type,
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      });
      // All remote requests are denied, including redirects and third-party subresources.
      session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
        callback({ cancel: !details.url.startsWith(`${APP_ORIGIN}/`) }),
      );
      session.defaultSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.on("will-download", (event) =>
        event.preventDefault(),
      );
      ipcMain.handle("preferences:load", async (event) => {
        if (!trusted(event)) throw new Error("Accès refusé");
        try {
          const info = await fs.stat(stateFile());
          if (info.size > 128 * 1024) throw new Error("Invalid size");
          const data = JSON.parse(await fs.readFile(stateFile(), "utf8"));
          const result = schema.safeParse(data);
          return result.success
            ? { state: result.data }
            : {
                state: null,
                warning:
                  "Fichier de préférences invalide. Il est conservé ; utilisez Réinitialiser pour le remplacer.",
              };
        } catch (error) {
          return error.code === "ENOENT"
            ? { state: null }
            : {
                state: null,
                warning:
                  "Lecture des préférences impossible. Le fichier existant est conservé.",
              };
        }
      });
      ipcMain.handle("local:command", async (event, command, input) => {
        if (!trusted(event)) throw new Error("Accès refusé");
        if (!localRuntime)
          return {
            error:
              "Stockage local indisponible. Données conservées ; aucune collecte possible.",
          };
        try {
          return { state: await localRuntime.command(command, input) };
        } catch {
          return {
            error:
              "Opération refusée. Vérifiez la configuration, la protection Windows et l’arrêt de la collecte.",
          };
        }
      });
      ipcMain.handle("clipboard:address", async (event, address) => {
        if (
          !trusted(event) ||
          typeof address !== "string" ||
          !/^(0xDEMO[0-9]{36}|DEMo[1-9A-HJ-NP-Za-km-z]{28,40})$/.test(address)
        )
          throw new Error("Adresse fictive invalide");
        clipboard.writeText(address);
      });
      ipcMain.handle("preferences:save", async (event, value) => {
        if (!trusted(event)) throw new Error("Accès refusé");
        const data = schema.parse(value);
        const save = async () => {
          await fs.mkdir(app.getPath("userData"), { recursive: true });
          const temp = stateFile() + ".tmp";
          await fs.writeFile(temp, JSON.stringify(data, null, 2), {
            mode: 0o600,
          });
          await fs.rename(temp, stateFile());
        };
        writeQueue = writeQueue.catch(() => {}).then(save);
        await writeQueue;
      });
      window = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 860,
        minHeight: 640,
        title: "MemeRadar",
        icon: path.resolve(__dirname, "../../assets/icon.png"),
        backgroundColor: "#0b111b",
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          devTools: !app.isPackaged,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
      });
      window.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      await window.loadURL(`${APP_ORIGIN}/index.html`);
      window.on("closed", () => {
        window = undefined;
      });
    })
    .catch((error) => {
      console.error("Démarrage impossible :", error.message);
      app.quit();
    });
}
app.on("window-all-closed", () => app.quit());

let quitting = false;
app.on("before-quit", (event) => {
  if (!quitting) {
    event.preventDefault();
    quitting = true;
    Promise.allSettled([writeQueue, localRuntime?.close()]).finally(() =>
      app.quit(),
    );
  }
});
