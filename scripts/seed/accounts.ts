export const demoPassword = 'marl-demo-local-2026';

export type Person = { handle: string; name: string; bio: string; website: string };

export const you: Person = {
  handle: 'demo',
  name: 'Demo Account',
  bio: 'Exploring Marl with a seeded workspace.',
  website: ''
};

export const teammates = {
  mira: { handle: 'mira', name: 'Mira Okafor', bio: 'Color science and accessible interfaces.', website: '' },
  theo: { handle: 'theo', name: 'Theo Lindqvist', bio: 'Performance, caching, and build tooling.', website: '' },
  jun: { handle: 'jun', name: 'Jun Park', bio: 'Keeping contrast math honest.', website: '' },
  sam: { handle: 'sam', name: 'Sam Rivera', bio: 'Docs, design tokens, and first-time contributors.', website: '' }
} satisfies Record<string, Person>;

export function emailFor(person: Person) {
  return `${person.handle}@demo.marl.test`;
}
