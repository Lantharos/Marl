import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, runnerImport, type Plugin } from 'vite';

function markdownDocuments(): Plugin {
  let renderer: Promise<typeof import('@marl/markdown')> | undefined;
  return {
    name: 'marl-markdown-documents',
    async transform(source, id) {
      if (!id.endsWith('.md')) return;
      renderer ??= runnerImport<typeof import('@marl/markdown')>('@marl/markdown', { configFile: false }).then(
        (result) => result.module
      );
      const { renderMarkdown } = await renderer;
      return { code: `export default ${JSON.stringify(renderMarkdown(source))};`, map: null };
    }
  };
}

export default defineConfig({
  plugins: [
    markdownDocuments(),
    tailwindcss(),
    sveltekit({
      compilerOptions: {
        runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
      },
      adapter: adapter(),
      csp: {
        mode: 'auto',
        directives: {
          'default-src': ['self'],
          'base-uri': ['self'],
          'connect-src': ['self', 'ws:', 'wss:'],
          'font-src': ['self'],
          'form-action': ['self'],
          'frame-ancestors': ['none'],
          'frame-src': ['none'],
          'img-src': ['self', 'https:', 'data:', 'blob:'],
          'object-src': ['none'],
          'script-src': ['self'],
          'style-src': ['self'],
          'style-src-attr': ['unsafe-inline']
        }
      }
    })
  ],
  worker: { format: 'es' },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:42618', ws: true },
      '/health': 'http://127.0.0.1:42618'
    }
  }
});
