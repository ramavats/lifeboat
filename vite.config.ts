import { defineConfig } from "vite";

// The browser page lives in web/; the exposure logic it imports lives in src/.
export default defineConfig({
  root: "web",
  build: { outDir: "../dist", emptyOutDir: true, target: "es2022" },
  server: { port: 5173, fs: { allow: [".."] } },
});
