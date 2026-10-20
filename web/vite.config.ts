import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local, offline dApp. Fixed port 5173 (requirement 2).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
