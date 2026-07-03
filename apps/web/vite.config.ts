import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API stays same-origin in dev (and in `vite preview` for e2e) so the
// httpOnly refresh cookie needs no cross-site configuration.
const apiProxy = {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [
    // Router plugin MUST come before react() or the route transform breaks.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
});
