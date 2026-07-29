const CHUNK_RECOVERY_KEY = 'fixlife:chunk-recovery';
const CHUNK_RECOVERY_COOLDOWN_MS = 30_000;

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk [\w-]+ failed/i,
  /chunkloaderror/i,
];

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
};

export const isChunkLoadError = (error: unknown): boolean =>
  CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(errorMessage(error)));

export const recoverFromChunkError = (
  error: unknown,
  reload: () => void = () => window.location.reload(),
  now: number = Date.now(),
): boolean => {
  if (!isChunkLoadError(error)) return false;

  try {
    const lastAttempt = Number(window.sessionStorage.getItem(CHUNK_RECOVERY_KEY) || 0);
    if (Number.isFinite(lastAttempt) && now - lastAttempt < CHUNK_RECOVERY_COOLDOWN_MS) {
      return false;
    }
    window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(now));
  } catch {
    // Storage may be unavailable in private/restricted browsing. Reload still helps.
  }

  reload();
  return true;
};

export const installChunkRecovery = (
  reload: () => void = () => window.location.reload(),
): (() => void) => {
  const handlePreloadError = (event: Event) => {
    const error = (event as CustomEvent<{ payload?: unknown }>).detail?.payload;
    if (recoverFromChunkError(error, reload)) event.preventDefault();
  };

  window.addEventListener('vite:preloadError', handlePreloadError);
  return () => window.removeEventListener('vite:preloadError', handlePreloadError);
};
