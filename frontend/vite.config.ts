import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Proxy target is env-driven so the same config works for:
//   - bare-metal dev    -> http://127.0.0.1:8765 (default)
//   - `make dev` in compose -> http://backend:8000 (set by docker-compose.dev.yml)
//
// Set via VITE_PROXY_TARGET in the shell or compose env.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget =
    env.VITE_PROXY_TARGET ?? process.env.VITE_PROXY_TARGET ?? "http://127.0.0.1:8765";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/tournament": proxyTarget,
        "/healthz": proxyTarget,
      },
    },
  };
});
