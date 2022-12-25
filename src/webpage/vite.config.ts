import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: "./",
  root: "src/webpage/",
  build: {
    outDir: "../../dist/webpage/",
    emptyOutDir: false,
    lib: {
      entry: 'index.ts',
      formats: [ 'es' ],
    },
    rollupOptions: {
      external: /^lit/,
      input: "src/webpage/index.html"
    },
  },
});
