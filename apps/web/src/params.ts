import { defineParams } from '@sveltejs/kit/params';

export const params = defineParams({
  pullTab: (param) => (param === 'changes' || param === 'commits' || param === 'checks' ? param : undefined)
});
