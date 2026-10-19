import { defineConfig } from "vite";
export default defineConfig({
  build: {
    ssr: true,
    outDir: "desktop-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "apps/desktop/local-runtime.ts",
      output: { format: "cjs", entryFileNames: "local-runtime.cjs" },
    },
  },
});
