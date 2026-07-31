import { useCallback, useRef, useState } from 'react';
import { filterProfanity, containsProfanity } from '../utils/profanityFilter';
import i18n from '../i18n';

const WARNING_TIMEOUT_MS = 2500;

/**
 * Central hook behind every profanity-guarded field in the app (FilteredInput,
 * FilteredTextArea, or any custom field that needs the same behavior). Strips
 * banned words as the user types or pastes and surfaces a short-lived warning.
 */
export const useProfanityGuard = () => {
  const [warning, setWarning] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showWarning = useCallback(() => {
    setWarning(i18n.t('common.reviewPage.validation.noOffensiveLanguage'));
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setWarning(''), WARNING_TIMEOUT_MS);
  }, []);

  /** Run on every change/paste: returns the sanitized value to store in state. */
  const guardValue = useCallback(
    (rawValue: string): string => {
      const { clean, wasFiltered } = filterProfanity(rawValue);
      if (wasFiltered) showWarning();
      return clean;
    },
    [showWarning]
  );

  return { warning, guardValue };
};

/** Final check before a form submits / before hitting the backend -- blocks anything the realtime guard missed. */
export const assertNoProfanity = (...values: Array<string | undefined | null>): boolean =>
  values.every((value) => !value || !containsProfanity(value));
