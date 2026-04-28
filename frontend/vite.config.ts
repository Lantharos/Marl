import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	build: {
		rolldownOptions: {
			output: {
				codeSplitting: {
					minSize: 20_000,
					maxSize: 450_000
				},
				manualChunks(id) {
					if (!id.includes('node_modules')) return;
					if (id.includes('@ave-id')) return 'auth';
					if (id.includes('lucide-svelte')) return 'icons';
					if (id.includes('marked')) return 'markdown';
					if (id.includes('diff')) return 'diffs';
				}
			}
		}
	}
});
