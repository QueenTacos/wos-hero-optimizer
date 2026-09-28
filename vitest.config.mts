import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Lets tests import app pages/components that use the "@/..." alias and JSX.
  resolve: { alias: [{ find: /^@\//, replacement: path.resolve(__dirname) + "/" }] },
  esbuild: { jsx: "automatic" },
  test: { exclude: ["**/node_modules/**", "preview/dist/**"] },
});
