import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const outDir = here("./kartodesk-for-woocommerce/build");

/**
 * Builds the WordPress plugin bundle from the shared panel components. Output is an ES module entry, local screen chunks and one stylesheet. WordPress prints the
 * runtime config before the entry; the stable entry names are used by the plugin.
 */
export default defineConfig({
  base: "./",
  plugins: [
    tailwindcss(),
    {
      name: "kartodesk-copy-logo",
      closeBundle() {
        mkdirSync(outDir, { recursive: true });
        copyFileSync(here("./app/kartodesk.svg"), `${outDir}/kartodesk.svg`);
      },
    },
  ],
  resolve: {
    alias: [
      { find: /^next\/link$/, replacement: here("./app/shims/link.tsx") },
      { find: /^next\/navigation$/, replacement: here("./app/shims/navigation.ts") },
      { find: /^next\/image$/, replacement: here("./app/shims/image.tsx") },
      { find: /^@\//, replacement: `${here("../src")}/` },
    ],
  },
  oxc: { jsx: { runtime: "automatic" } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: true,
    // Readable output: WordPress.org guidelines ask for human-readable code; the full source is in the repository.
    minify: false,
    cssMinify: false,
    sourcemap: false,
    target: "es2020",
    rolldownOptions: {
      // "use client" directives only matter to Next.js; the plugin bundle is entirely client-side.
      onLog(level, log, handler) {
        if (log.code === "MODULE_LEVEL_DIRECTIVE") return;
        handler(level, log);
      },
    },
    lib: {
      entry: here("./app/main.tsx"),
      formats: ["es"],
      name: "KartoDesk",
      fileName: () => "app.js",
      cssFileName: "app",
    },
  },
  logLevel: "warn",
});
