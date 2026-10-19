import https from "node:https";
import { rootCertificates } from "node:tls";
import { readFile } from "node:fs/promises";
export async function checkHealth({ local = false } = {}) {
  const origin = new URL(process.env.MEMERADAR_API_PUBLIC_ORIGIN);
  if (
    origin.protocol !== "https:" ||
    origin.origin !== origin.href.slice(0, -1)
  )
    throw new Error();
  const caFile = process.env.MEMERADAR_MONITOR_CA_FILE;
  const ca = caFile
    ? [...rootCertificates, await readFile(caFile, "utf8")]
    : undefined;
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: local ? "127.0.0.1" : origin.hostname,
        port: local
          ? Number(process.env.MEMERADAR_API_PORT ?? "8787")
          : Number(origin.port || "443"),
        servername: origin.hostname,
        path: "/health",
        headers: { Host: origin.host },
        ca,
        timeout: 5000,
      },
      (res) => {
        let body = "";
        res.on("data", (data) => {
          body += data;
          if (body.length > 4096) req.destroy(new Error());
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            const result = JSON.parse(body);
            if (
              res.statusCode !== 200 ||
              result.service !== "MemeRadar" ||
              result.origin !== process.env.MEMERADAR_API_ORIGIN ||
              result.status !== "server_only"
            )
              throw new Error();
            resolve(true);
          } catch {
            reject(new Error());
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error()));
    req.on("error", reject);
  });
}
if (process.argv[1]?.endsWith("health.mjs")) {
  try {
    await checkHealth({ local: true });
    process.stdout.write(
      "API HTTPS et accès SQL disponibles ; fournisseurs non vérifiés.\n",
    );
  } catch {
    process.stderr.write("API HTTPS indisponible.\n");
    process.exitCode = 1;
  }
}
