import { defineConfig } from "vite";
export default defineConfig({
  build: {
    ssr: true,
    outDir: "server-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        server: "scripts/api-serve.ts",
        admin: "scripts/api-admin.ts",
        migrate: "scripts/db-migrate.ts",
      },
      output: { entryFileNames: "[name].js" },
    },
  },
});
