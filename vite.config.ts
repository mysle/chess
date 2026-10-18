import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    // Wbudowany awaryjny silnik ASM (?raw) ma ~3 MB - podnieś limit, żeby na pewno
    // został wbudowany w pojedynczy index.html (gra z pliku file:// bez serwera).
    assetsInlineLimit: 100 * 1024 * 1024,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
