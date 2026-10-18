/**
 * Cross-build adapter for hosts without executable IA-32 support.
 * electron-builder already includes an NSIS UninstallerReader for its macOS
 * path. Reuse that parser on Linux for the unsigned intermediate uninstaller.
 * This does not change dependencies, skip checksum verification, or execute
 * Windows code. Pinned electron-builder version: see package-lock.json.
 */
const path = require("node:path");
const { build, Platform, Arch } = require("electron-builder");
const { WineVmManager } = require("app-builder-lib/out/vm/WineVm");
const {
  UninstallerReader,
} = require("app-builder-lib/out/targets/nsis/nsisUtil");
const pkg = require("../package.json");
const root = path.resolve(__dirname, "..");
const expected = path.join(
  root,
  "release",
  `MemeRadar-${pkg.version}-Windows-x64.exe`,
);
if (process.platform === "linux") {
  WineVmManager.prototype.exec = async function (
    file,
    args = [],
    options = {},
  ) {
    if (
      path.resolve(file) !== expected ||
      args.length !== 0 ||
      options.env?.__COMPAT_LAYER !== "RunAsInvoker"
    ) {
      throw new Error(
        "Unexpected Windows tool request: native adapter only supports the NSIS intermediate uninstaller.",
      );
    }
    const output = file.replace(/exe$/, "") + "__uninstaller.exe";
    await UninstallerReader.exec(file, output);
    console.log(
      "NSIS intermediate uninstaller extracted with electron-builder native reader.",
    );
  };
}
build({
  projectDir: root,
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
  config: process.env.electron_config_cache
    ? { electronDownload: { cache: process.env.electron_config_cache } }
    : {},
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
