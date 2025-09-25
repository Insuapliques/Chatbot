export interface MemoryCandidate {
  type: string;
  text: string;
}

const emailRegex = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const phoneRegex = /\b(?:\+?\d{1,3}[ -]?)?(?:\(?\d{2,4}\)?[ -]?){2,4}\d{3,4}\b/g;

interface PreferencePattern {
  type: string;
  regex: RegExp;
  valueIndex?: number;
}

const preferencePatterns: PreferencePattern[] = [
  {
    type: 'preference_like',
    regex: /\b(me\s+gusta|me\s+encanta|adoro|soy\s+fan\s+de)\s+([^.!?\n]+)/gi,
    valueIndex: 2,
  },
  {
    type: 'preference_use',
    regex: /\b(uso|utilizo|prefiero\s+usar)\s+([^.!?\n]+)/gi,
    valueIndex: 2,
  },
  {
    type: 'preference_color',
    regex: /\b(mi\s+color\s+es|mi\s+color\s+favorito\s+es)\s+([^.!?\n]+)/gi,
    valueIndex: 2,
  },
  {
    type: 'preference_food',
    regex: /\b(mi\s+(?:comida|plato)\s+favorito\s+es)\s+([^.!?\n]+)/gi,
    valueIndex: 2,
  },
  {
    type: 'preference_team',
    regex: /\b(mi\s+equipo\s+es|soy\s+hincha\s+de|soy\s+fan\s+del)\s+([^.!?\n]+)/gi,
    valueIndex: 2,
  },
  {
    type: 'profile_name',
    regex: /\b(mi\s+nombre\s+es)\s+([^.!?\n]+)/gi,
    valueIndex: 2,
  },
];

function normalizeCandidate(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function dedupeCandidates(candidates: MemoryCandidate[]): MemoryCandidate[] {
  const seen = new Set<string>();
  const result: MemoryCandidate[] = [];
  for (const candidate of candidates) {
    const fingerprint = `${candidate.type}|${candidate.text.toLowerCase()}`;
    if (!seen.has(fingerprint) && candidate.text.length > 0) {
      seen.add(fingerprint);
      result.push(candidate);
    }
  }
  return result;
}

export function extractMemoryCandidates(message: string): MemoryCandidate[] {
  if (!message || typeof message !== 'string') {
    return [];
  }

  const text = String(message);
  const candidates: MemoryCandidate[] = [];

  const emailMatcher = new RegExp(emailRegex);
  let match: RegExpExecArray | null;
  while ((match = emailMatcher.exec(text)) !== null) {
    const raw = match[0];
    candidates.push({ type: 'contact_email', text: normalizeCandidate(raw) });
  }

  const phoneMatcher = new RegExp(phoneRegex);
  while ((match = phoneMatcher.exec(text)) !== null) {
    const raw = match[0];
    const digits = raw.replace(/[^\d+]/g, '');
    if (digits.length >= 8) {
      candidates.push({ type: 'contact_phone', text: normalizeCandidate(raw) });
    }
  }

  for (const pattern of preferencePatterns) {
    const regex = new RegExp(pattern.regex);
    let prefMatch: RegExpExecArray | null;
    while ((prefMatch = regex.exec(text)) !== null) {
      const valueIdx = pattern.valueIndex ?? 1;
      const raw = prefMatch[valueIdx] ?? prefMatch[0];
      const normalized = normalizeCandidate(raw);
      if (normalized.length > 0) {
        candidates.push({ type: pattern.type, text: normalized });
      }
    }
  }

  return dedupeCandidates(candidates);
}

export function shouldRemember(entry: MemoryCandidate): boolean {
  if (!entry.text || entry.text.length < 3) {
    return false;
  }

  if (entry.text.split(' ').length > 40) {
    return false;
  }

  switch (entry.type) {
    case 'contact_email':
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry.text.toLowerCase());
    case 'contact_phone':
      return entry.text.replace(/\D+/g, '').length >= 8;
    default:
      return true;
  }
}
