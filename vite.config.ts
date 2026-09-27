import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: false,
  },
  build: {
    target: 'es2020',
    // The engine is one big module graph; vendors go in their own long-cached chunks
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/three/examples/') || id.includes('/three-stdlib/')) return 'three-extras';
          if (id.includes('/three/')) return 'three';
          if (id.includes('/postprocessing/') || id.includes('@react-three/postprocessing')) return 'postfx';
          if (id.includes('@react-three')) return 'r3f';
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'react';
          return 'vendor';
        },
      },
    },
  },
  esbuild: {
    legalComments: 'none',
    drop: ['debugger'],
  },
});
