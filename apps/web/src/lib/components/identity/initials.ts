export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

const avatarTones = [
  ['#d5b496', '#3d2518'],
  ['#d9a08a', '#44200f'],
  ['#c9b98a', '#39301a'],
  ['#a9bf9c', '#1f3320'],
  ['#9fb8c4', '#1b2f3a'],
  ['#b9a8cf', '#2c2140']
];

export function avatarTone(name: string) {
  let hash = 0;
  for (const character of name) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return avatarTones[Math.abs(hash) % avatarTones.length];
}
