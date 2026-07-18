import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Static SPA build.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The API gateway's login wall proxies http://local.allin.… here in local
    // dev (scripts/local-stack.sh); Vite's DNS-rebinding guard would reject
    // the forwarded Host header otherwise.
    allowedHosts: ["local.allin.makejohnacoffee.com"],
  },
  build: {
    target: "es2022",
  },
  test: {
    // Engine tests run in node; DOM tests opt into jsdom per file.
    environment: "node",
  },
});
