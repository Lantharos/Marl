export function seoExcerpt(value: string | null | undefined, fallback: string, limit = 155) {
  const text = value
    ?.replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const description = text || fallback;
  if (description.length <= limit) return description;
  return `${description.slice(0, limit - 1).replace(/\s+\S*$/, '').trimEnd()}…`;
}
