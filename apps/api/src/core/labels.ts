const labelColors = ['#e16f73', '#d58b5f', '#d3a45f', '#77a86b', '#68a7b8', '#668fc7', '#8c7ad8', '#bd6f9c'];

export function labelColor(name: string) {
  let hash = 0;
  for (const character of name) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return labelColors[Math.abs(hash) % labelColors.length];
}
