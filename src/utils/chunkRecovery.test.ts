import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installChunkRecovery, isChunkLoadError, recoverFromChunkError } from './chunkRecovery';

describe('chunk recovery', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('recognizes dynamic import failures', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/view.js'))).toBe(true);
    expect(isChunkLoadError(new Error('API request failed'))).toBe(false);
  });

  it('reloads once inside cooldown window', () => {
    const reload = vi.fn();
    const error = new TypeError('Failed to fetch dynamically imported module: /assets/view.js');

    expect(recoverFromChunkError(error, reload, 100_000)).toBe(true);
    expect(recoverFromChunkError(error, reload, 100_001)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('handles Vite preload errors and removes listener', () => {
    const reload = vi.fn();
    const uninstall = installChunkRecovery(reload);
    const event = new Event('vite:preloadError', { cancelable: true });
    Object.defineProperty(event, 'payload', {
      value: new Error('Importing a module script failed'),
    });

    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();

    uninstall();
  });
});
