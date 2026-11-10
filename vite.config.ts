import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5190 },
  worker: { format: "es" },
  test: { environment: "node" },
});
