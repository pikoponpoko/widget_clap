import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_PREVIEW_MODE": JSON.stringify(mode !== "owner"),
  },
}));
