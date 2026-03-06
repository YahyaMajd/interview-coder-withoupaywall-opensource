// vite.config.ts
import { defineConfig } from "vite"
import electron from "vite-plugin-electron"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // main.ts
        entry: "electron/main.ts",
        // We launch Electron manually in package.json scripts.
        // Disable vite-plugin-electron auto startup to avoid duplicate app instances.
        onstart() {},
        vite: {
          build: {
            outDir: "dist-electron",
            sourcemap: true,
            minify: false,
            rollupOptions: {
              external: ["electron"]
            }
          }
        }
      },
      {
        // preload.ts
        entry: "electron/preload.ts",
        // Keep auto startup disabled for all electron entries.
        onstart() {},
        vite: {
          build: {
            outDir: "dist-electron",
            sourcemap: true,
            rollupOptions: {
              external: ["electron"]
            }
          }
        }
      }
    ])
  ],
  base: process.env.NODE_ENV === "production" ? "./" : "/",
  server: {
    port: 54321,
    strictPort: true,
    watch: {
      usePolling: true
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
})
