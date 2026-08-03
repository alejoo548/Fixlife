export type ContentModerationDecision = {
  allowed: boolean;
  reason: string | null;
  riskType: 'adult_content' | 'clean';
  matches: string[];
};

const ADULT_CONTENT_TERMS = [
  'nude',
  'nudes',
  'naked',
  'nsfw',
  'porn',
  'porno',
  'pornografia',
  'pornographic',
  'xxx',
  'sexual',
  'sex',
  'sexy',
  'sexting',
  'desnudo',
  'desnuda',
  'desnudos',
  'desnudas',
  'sin ropa',
  'sin censura',
  'pack',
  'packs',
  'onlyfans',
  'explicit',
  'erotic',
  'erotico',
  'erotica',
  'intimo',
  'intima',
  'lenceria',
  'lingerie',
  'fetish',
  'fetiche',
];

const normalizeForModeration = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[_\-+.]+/g, ' ')
    .toLowerCase();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findAdultContentMatches = (value: unknown) => {
  const normalized = normalizeForModeration(value);
  if (!normalized) return [];

  return ADULT_CONTENT_TERMS.filter((term) => {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`, 'i');
    return pattern.test(normalized);
  });
};

export const moderateUploadedContent = (input: {
  originalFilename?: string;
  fieldName?: string;
  ocrText?: string;
}): ContentModerationDecision => {
  const normalizedFilename = normalizeForModeration(input.originalFilename);
  const matches = Array.from(
    new Set([
      ...findAdultContentMatches(input.originalFilename),
      ...findAdultContentMatches(input.ocrText),
    ])
  );

  if (matches.length > 0) {
    return {
      allowed: false,
      riskType: 'adult_content',
      reason: 'This upload appears to violate Fixlife content policy.',
      matches,
    };
  }

  if (/\b(adult|private|hot|18\s*\+)\b/i.test(normalizedFilename)) {
    return {
      allowed: false,
      riskType: 'adult_content',
      reason: 'This upload filename appears to violate Fixlife content policy.',
      matches: ['suspicious_filename'],
    };
  }

  return {
    allowed: true,
    riskType: 'clean',
    reason: null,
    matches: [],
  };
};
