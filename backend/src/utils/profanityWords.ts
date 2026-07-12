/**
 * Centralized banned-word list for the profanity filter.
 * Add new entries here only -- both frontend (src/utils/profanityWords.ts, kept
 * as a manual mirror per this repo's sanitize.ts convention) and backend read
 * from this single list shape.
 *
 * Entries are plain lowercase root words, WITHOUT accents (accents are
 * stripped during normalization before comparison). Multi-word phrases are
 * not needed here -- the filter tokenizes text and matches individual words,
 * so "hijo de puta" is flagged via the "puta" entry alone.
 */
export const BANNED_WORDS: string[] = [
  // Spanish
  'puta', 'puto', 'putas', 'putos', 'putada', 'putazo',
  'mierda', 'mierdas',
  'imbecil', 'imbeciles',
  'idiota', 'idiotas',
  'estupido', 'estupida', 'estupidos', 'estupidas',
  'pendejo', 'pendeja', 'pendejos', 'pendejas',
  'cabron', 'cabrona', 'cabrones',
  'gilipollas',
  'joder',
  'coño', 'cono',
  'verga', 'vergas',
  'chinga', 'chingar', 'chingada', 'chingado', 'chingadera',
  'culero', 'culera', 'culeros',
  'maricon', 'mariconn', 'maricones',
  'zorra', 'zorras',
  'perra', 'perras',
  'marica',
  'polla', 'pollas',
  'follar', 'follando',
  'hijueputa', 'hijodeputa',
  'malparido', 'malparida',
  'huevon', 'huevona', 'huevones',
  'boludo', 'boluda', 'boludos',
  'pinche',
  'mamada', 'mamadas', 'mamaverga',
  'concha', 'conchatumadre',
  'carajo',

  // English
  'fuck', 'fucks', 'fucker', 'fuckers', 'fucking', 'fucked',
  'shit', 'shits', 'shitty', 'bullshit',
  'bitch', 'bitches',
  'asshole', 'assholes',
  'bastard', 'bastards',
  'cunt', 'cunts',
  'dick', 'dickhead',
  'piss', 'pissed',
  'slut', 'sluts',
  'whore', 'whores',
  'retard', 'retarded',
  'nigger', 'nigga',
  'faggot', 'fag',
  'moron', 'morons',
  'idiot', 'idiots',
  'stupid',
  'crap',
  'damn',
  'douche', 'douchebag',
];

/**
 * Words that legitimately contain a banned substring but must never be
 * flagged (e.g. "computadora" contains "puta"). Checked BEFORE the banned
 * list, keyed by their normalized (accent-stripped, lowercase) form.
 */
export const SAFE_WORDS: string[] = [
  'computadora', 'computador', 'computadoras',
  'diputado', 'diputada', 'diputados', 'diputadas',
  'reputacion', 'reputado', 'reputada',
  'disputa', 'disputas', 'disputar',
  'amputar', 'amputacion', 'amputado',
  'imputar', 'imputado', 'imputacion',
  'putativo', 'putativa',
  'instituto', 'institucion', 'institucional',
  'autopista', 'autopistas',
  'pistacho',
  'assassin', 'assassinate',
  'classic', 'class', 'passage',
  'scunthorpe',
  'shitake', 'shiitake',
  'grape', 'therapist',
  'cockpit', 'cockroach', 'peacock',
];

/** Leetspeak / common evasion character map -> canonical letter. */
export const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  '$': 's',
  '7': 't',
  '+': 't',
  '8': 'b',
  '9': 'g',
  'ñ': 'n',
  'v': 'u',
};
