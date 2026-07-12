import { useProfanityGuard } from '../../hooks/useProfanityGuard';

interface FilteredTextAreaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  onChange: (value: string) => void;
  /** Class for the small warning text shown under the field when profanity gets stripped. */
  warningClassName?: string;
}

/**
 * Drop-in replacement for `<textarea>` that strips offensive words live as
 * the user types or pastes, so profanity never makes it into state (and
 * therefore never reaches a submit handler or the backend). Visual styling
 * is entirely controlled by the passed-in props/className, same as a plain
 * textarea.
 */
const FilteredTextArea: React.FC<FilteredTextAreaProps> = ({
  onChange,
  warningClassName,
  ...textareaProps
}) => {
  const { warning, guardValue } = useProfanityGuard();

  return (
    <div>
      <textarea
        {...textareaProps}
        onChange={(e) => onChange(guardValue(e.target.value))}
      />
      {warning && (
        <p className={warningClassName ?? 'mt-1 text-xs font-medium text-red-500'}>{warning}</p>
      )}
    </div>
  );
};

export default FilteredTextArea;
