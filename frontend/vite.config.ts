import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, "index.html"),
        dashboard: resolve(rootDir, "dashboard.html"),
        admin: resolve(rootDir, "admin.html"),
      },
    },
  },
});
