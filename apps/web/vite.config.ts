import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  cacheDir: fileURLToPath(new URL("../../.cache/vite", import.meta.url)),
  plugins: [react()],
  server: {
    host: process.env.DEV_HOST ?? "127.0.0.1",
    port: 5173,
    strictPort: true,
    headers: {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* ws://127.0.0.1:*; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    },
    proxy: {
      "/api": process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001",
      "/health": process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001",
    },
  },
});
