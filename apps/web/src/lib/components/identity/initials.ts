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

export function avatarTone(name: string) {
  let hash = 0;
  for (const character of name) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return (Math.abs(hash) % 6) + 1;
}
