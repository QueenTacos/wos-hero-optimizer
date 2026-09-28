// Builds the static preview: npx vite build --config preview/vite.config.mts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
const root = path.resolve(__dirname, "..");
export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react()],
  resolve: { alias: [{ find: "next/link", replacement: path.join(__dirname, "linkShim.tsx") }, { find: /^@\//, replacement: root + "/" }] },
  css: { postcss: root },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: path.join(__dirname, "dist"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: { output: { inlineDynamicImports: true, entryFileNames: "app.js", assetFileNames: "[name][extname]" } },
  },
});
