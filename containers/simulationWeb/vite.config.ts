import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Static SPA build.
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
  },
});
