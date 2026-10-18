import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.(tsx?|cjs)$/.test(file)
        ? [file]
        : [];
  });
}
describe("Capacités exclues de la distribution", () => {
  it("ne contient aucune primitive de signature ou portefeuille", () => {
    for (const file of [
      ...sourceFiles(resolve("apps")),
      ...sourceFiles(resolve("packages/core")),
    ]) {
      const code = readFileSync(file, "utf8");
      expect(code, file).not.toMatch(
        /\b(?:signTransaction|sendTransaction|sendRawTransaction|fromSecretKey|WalletConnect|Keypair)\b/,
      );
      expect(code, file).not.toMatch(
        /-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/,
      );
      expect(code, file).not.toMatch(/\b(?:moon|x100|pépite|gem)\b/i);
    }
  });
  it("conserve les protections du shell et ne désactive pas le sandbox dans le code livré", () => {
    const main = readFileSync(resolve("apps/desktop/main.cjs"), "utf8");
    expect(main).toContain("nodeIntegration: false");
    expect(main).toContain("contextIsolation: true");
    expect(main).toContain("sandbox: true");
    expect(main).not.toContain("--no-sandbox");
    expect(main).not.toContain("ignore-certificate-errors");
  });
});
