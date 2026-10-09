import { defineConfig } from 'pult';

export default defineConfig({
  project: 'marl',
  include: ['src/backoffice/**/*.pult.ts'],
  delivery: { mode: 'webhook', path: '/api/pult' },
  environments: ['dev', 'prod']
});
