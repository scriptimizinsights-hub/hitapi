import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The Workbench uses the HitAPI extension's own request / body / auth / cURL / code logic
// (hitapi-extension/shared), so the website and the extension behave the same.
const sharedDir = fileURLToPath(new URL('../hitapi-extension/shared', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@hitapi/shared': sharedDir },
  },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true
      },
      '/health': {
        target: 'http://localhost:8787',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) return 'vendor';
          if (id.includes('node_modules/recharts')) return 'charts';
          if (id.includes('node_modules/lucide-react')) return 'icons';
          if (id.includes('hitapi-extension/shared')) return 'hitapi-shared';
        }
      }
    }
  }
});