import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:42618', ws: true },
      '/health': 'http://127.0.0.1:42618'
    }
  }
});
