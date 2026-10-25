import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: { outDir: mode === "owner" ? "dist-owner" : "dist" },
  define: {
    "import.meta.env.VITE_PREVIEW_MODE": JSON.stringify(mode !== "owner"),
  },
}));
