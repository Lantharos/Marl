import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ url }) => {
  if (!dev) error(404, 'Not found');

  const status = Number(url.searchParams.get('status') ?? 404);
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    error(400, 'Choose an HTTP error status between 400 and 599.');
  }

  error(status, 'Error preview');
};
