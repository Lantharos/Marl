import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
  },
  kit: {
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
  }
};

export default config;
