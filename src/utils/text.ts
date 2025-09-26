export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function includesAll(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalize(haystack);
  const normalizedNeedle = normalize(needle);

  if (!normalizedNeedle) {
    return false;
  }

  const words = normalizedNeedle.split(' ').filter(Boolean);
  if (words.length === 0) {
    return false;
  }

  return words.every((word) => normalizedHaystack.includes(word));
}
