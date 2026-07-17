import { useProfanityGuard } from '../../hooks/useProfanityGuard';

interface FilteredInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onChange: (value: string) => void;
  warningClassName?: string;
}

/**
 * Drop-in replacement for `<input>` (text/search/etc.) that strips offensive
 * words live as the user types or pastes. Use FilteredTextArea for multi-line
 * fields and PasswordInput for password fields (which must never be scanned).
 */
const FilteredInput: React.FC<FilteredInputProps> = ({ onChange, warningClassName, ...inputProps }) => {
  const { warning, guardValue } = useProfanityGuard();

  return (
    <div>
      <input {...inputProps} onChange={(e) => onChange(guardValue(e.target.value))} />
      {warning && (
        <p className={warningClassName ?? 'mt-1 text-xs font-medium text-red-500'}>{warning}</p>
      )}
    </div>
  );
};

export default FilteredInput;
