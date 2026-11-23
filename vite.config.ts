import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    // `npm run dev:server` runs the game server; Vite forwards the socket to it.
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
  test: { globals: true },
});
