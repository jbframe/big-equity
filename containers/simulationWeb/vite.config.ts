import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Static SPA build.
export default defineConfig({
  plugins: [react()],
  server: {
    // The API gateway's login wall proxies http://local.allin.… here in local
    // dev (scripts/local-stack.sh); Vite's DNS-rebinding guard would reject
    // the forwarded Host header otherwise.
    allowedHosts: ["local.allin.makejohnacoffee.com"],
  },
  build: {
    target: "es2022",
  },
});
