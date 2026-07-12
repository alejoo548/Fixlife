import { BANNED_WORDS, SAFE_WORDS, LEET_MAP } from './profanityWords';

/**
 * Profanity detection engine. Works purely on normalized word comparisons
 * (no substring search across whole strings) so a banned word that happens
 * to occur inside a longer, unrelated word ("computadora" contains "puta")
 * is never flagged -- only actual standalone words/tokens are checked.
 *
 * Evasion techniques handled by normalization: case mixing, accents,
 * leetspeak digits/symbols (put4, p@ta, pvt4), separators inside a token
 * (p.u.t.a, p-u-t-a, p_u_t_a, p#uta), repeated characters (puuuutaaa),
 * a single "*" standing in for one hidden letter (p*ta), and letters spaced
 * out one at a time ("p u t a"), which is handled by merging runs of
 * single-character words joined by lone spaces before comparison.
 */

const stripAccents = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const applyLeetMap = (value: string) =>
  value
    .split('')
    .map((ch) => LEET_MAP[ch] ?? ch)
    .join('');

const collapseRepeats = (value: string) => value.replace(/(.)\1+/g, '$1');

/** Normalizes a single token down to a canonical lowercase form. `*` is preserved as a single-letter wildcard. */
export const normalizeToken = (raw: string): string => {
  let value = raw.toLowerCase();
  value = stripAccents(value);
  value = applyLeetMap(value);
  value = value.replace(/[^a-z*]/g, '');
  value = collapseRepeats(value);
  return value;
};

const buildCanonicalSet = (words: string[]) =>
  new Set(words.map((w) => normalizeToken(w)).filter(Boolean));

const BANNED_SET = buildCanonicalSet(BANNED_WORDS);
const SAFE_SET = buildCanonicalSet(SAFE_WORDS);
const BANNED_LIST = Array.from(BANNED_SET);

/** Matches a normalized token containing `*` wildcards against the banned list (same length, wildcard = any letter). */
const wildcardMatch = (normalized: string): string | null => {
  if (!normalized.includes('*')) return null;
  const pattern = new RegExp(`^${normalized.split('').map((c) => (c === '*' ? '.' : c)).join('')}$`);
  for (const banned of BANNED_LIST) {
    if (banned.length === normalized.length && pattern.test(banned)) return banned;
  }
  return null;
};

/** A token is "flaggable" if it exactly matches (or wildcard-matches) a banned word and isn't an explicit safe word. */
const matchBannedToken = (normalized: string): string | null => {
  if (!normalized || SAFE_SET.has(normalized)) return null;
  if (BANNED_SET.has(normalized)) return normalized;
  return wildcardMatch(normalized);
};

interface WordChunk {
  raw: string;
  isWhitespace: boolean;
  normalized: string;
}

const tokenizeWithWhitespace = (text: string): WordChunk[] =>
  text
    .split(/(\s+)/)
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => ({
      raw: chunk,
      isWhitespace: /^\s+$/.test(chunk),
      normalized: /^\s+$/.test(chunk) ? '' : normalizeToken(chunk),
    }));

/**
 * Finds runs of single-character word-chunks joined by exactly one plain
 * space (i.e. "p u t a", not "p   u" or "p\nu") and reports any banned word
 * found as a substring of the run once concatenated. Returns the chunk
 * indexes (word chunks only) that make up each match, so callers can flag
 * exactly those.
 */
const findSpacedOutMatches = (chunks: WordChunk[]): Array<{ indexes: number[]; word: string }> => {
  const results: Array<{ indexes: number[]; word: string }> = [];
  let i = 0;
  while (i < chunks.length) {
    if (chunks[i].isWhitespace || chunks[i].normalized.length !== 1) {
      i += 1;
      continue;
    }
    const runIndexes = [i];
    let merged = chunks[i].normalized;
    let j = i + 1;
    while (
      j + 1 < chunks.length &&
      chunks[j].isWhitespace &&
      chunks[j].raw === ' ' &&
      !chunks[j + 1].isWhitespace &&
      chunks[j + 1].normalized.length === 1
    ) {
      merged += chunks[j + 1].normalized;
      runIndexes.push(j + 1);
      j += 2;
    }
    if (merged.length >= 2) {
      for (const banned of BANNED_LIST) {
        if (merged.includes(banned)) {
          const start = merged.indexOf(banned);
          results.push({ indexes: runIndexes.slice(start, start + banned.length), word: banned });
        }
      }
    }
    i = runIndexes[runIndexes.length - 1] + 1;
  }
  return results;
};

export interface ProfanityScanResult {
  hasProfanity: boolean;
  matches: string[];
}

const scan = (text: string) => {
  const chunks = tokenizeWithWhitespace(String(text ?? '').normalize('NFKC'));
  const flagged = new Array(chunks.length).fill(false);
  const matches = new Set<string>();

  chunks.forEach((chunk, i) => {
    if (chunk.isWhitespace) return;
    const hit = matchBannedToken(chunk.normalized);
    if (hit) {
      flagged[i] = true;
      matches.add(hit);
    }
  });

  for (const { indexes, word } of findSpacedOutMatches(chunks)) {
    indexes.forEach((idx) => {
      flagged[idx] = true;
    });
    matches.add(word);
  }

  return { chunks, flagged, matches };
};

/** Detects profanity anywhere in the given text. Safe against the standard evasion tricks above. */
export const scanProfanity = (text: string): ProfanityScanResult => {
  const { matches } = scan(text);
  return { hasProfanity: matches.size > 0, matches: Array.from(matches) };
};

export const containsProfanity = (text: string): boolean => scanProfanity(text).hasProfanity;

/** Strips flagged words from the text (used to auto-clean input as the user types/pastes). */
export const filterProfanity = (text: string): { clean: string; wasFiltered: boolean } => {
  const { chunks, flagged } = scan(text);

  let wasFiltered = false;
  const clean = chunks
    .map((chunk, idx) => {
      if (flagged[idx]) {
        wasFiltered = true;
        return '';
      }
      return chunk.raw;
    })
    .join('')
    .replace(/[ \t]{2,}/g, ' ');

  return { clean, wasFiltered };
};
