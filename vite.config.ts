import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { Server } from 'node:http';
import { attachGameServer } from './server/index';

/** Run the online game server inside `npm run dev` / `npm run preview`, so online play just works. */
function gameServer(): Plugin {
  return {
    name: 'murlan-game-server',
    configureServer(server) {
      if (server.httpServer) attachGameServer(server.httpServer as Server);
    },
    configurePreviewServer(server) {
      attachGameServer(server.httpServer as Server);
    },
  };
}

export default defineConfig({
  plugins: [react(), gameServer()],
  base: './',
  test: { globals: true },
});
