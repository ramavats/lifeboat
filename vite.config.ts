import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The app lives in web/; the wallet logic it shares with the CLI lives in src/.
export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true, target: "es2022" },
  worker: { format: "es" },
  server: { port: 5173, fs: { allow: [".."] } },
});
