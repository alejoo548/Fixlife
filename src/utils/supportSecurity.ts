const UNSAFE_SUPPORT_PATTERN = /[<>]|javascript:|on\w+\s*=|data:text\/html/i;
const CONTROL_CHARS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const INVISIBLE_CHARS_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

export const sanitizeSupportTextInput = (value: string, maxLen = 2000, singleLine = false) => {
  const normalized = String(value || '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS_PATTERN, '')
    .replace(INVISIBLE_CHARS_PATTERN, '');

  const cleaned = singleLine ? normalized.replace(/\s+/g, ' ') : normalized;
  return cleaned.slice(0, maxLen);
};

export const hasUnsafeSupportText = (value: string) => UNSAFE_SUPPORT_PATTERN.test(value || '');

export const getSafeSupportDisplayText = (value: string) =>
  hasUnsafeSupportText(value) ? '[Message blocked for security]' : sanitizeSupportTextInput(value, 2000);
