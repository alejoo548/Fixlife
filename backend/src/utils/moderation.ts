type ModerationCategory = 'threat' | 'sexual' | 'harassment' | 'profanity' | 'spam';

type ModerationResult = {
  ok: boolean;
  category?: ModerationCategory;
  reason?: string;
};

const normalizeForModeration = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])\1{2,}/gi, '$1$1')
    .toLowerCase();

const threatPatterns = [
  /\b(te\s+voy\s+a\s+matar|voy\s+a\s+matar|matarte|amenaza|amenazarte|te\s+amenazo)\b/i,
  /\b(kill\s+you|i\s+will\s+kill|threat|threaten)\b/i,
  /\b(cuchillo|navaja|pistola|arma|knife|gun)\b/i,
];

const sexualPatterns = [
  /\b(pene|verga|pija|vagina|ano|culo|xxx|porno|porn|sexual|sexo|desnudo|desnuda)\b/i,
  /\b(dick|penis|vulva|asshole|anal|nude|naked)\b/i,
];

const harassmentPatterns = [
  /\b(trans|gay|lesbiana|lesbian|homosexual)\b.{0,24}\b(asco|mierda|idiota|estupido|puta|puto|maricon|pervertido)\b/i,
  /\b(asco|mierda|idiota|estupido|puta|puto|maricon|pervertido)\b.{0,24}\b(trans|gay|lesbiana|lesbian|homosexual)\b/i,
];

// Standalone vulgar/insulting language — unlike harassmentPatterns above,
// these block on their own regardless of whether an identity term is nearby,
// since generic profanity/insults aimed at a named person are still abusive.
const profanityPatterns = [
  /\b(puta|puto|putas|putos|pendejo|pendeja|cabron|cabrona|marica|maricon|mariconazo|hp|hdp|hijueputa|hijoeputa|imbecil|gilipollas|joder|cono|malparido|malparida|zorra|perra|estupido|estupida|idiota|mierda|verga|pito)\b/i,
  /\b(fuck|fucking|shit|bitch|asshole|bastard|motherfucker|slut|whore|cunt|dumbass|jackass)\b/i,
];

const spamPatterns = [
  /\bhttps?:\/\/\S+/i,
  /\bwww\.\S+/i,
  /\b[a-z0-9.-]+\.(com|net|org|site|xyz|info|online)\b/i,
];

export const moderateUserText = (
  value: unknown,
  options: { allowLinks?: boolean; allowHelpSeeking?: boolean } = {}
): ModerationResult => {
  const text = normalizeForModeration(value);
  if (!text) return { ok: true };

  const patterns: Array<[ModerationCategory, RegExp[]]> = [
    ['threat', threatPatterns],
    ['sexual', sexualPatterns],
    ['harassment', harassmentPatterns],
    ['profanity', profanityPatterns],
  ];

  if (!options.allowLinks) {
    patterns.push(['spam', spamPatterns]);
  }

  for (const [category, categoryPatterns] of patterns) {
    if (categoryPatterns.some((pattern) => pattern.test(text))) {
      return {
        ok: false,
        category,
        reason:
          category === 'spam'
            ? 'Links are not allowed in this field.'
            : 'This text contains unsafe, explicit, threatening, or harassing content.',
      };
    }
  }

  return { ok: true };
};
