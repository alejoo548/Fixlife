import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Class applied to the wrapping div (the bg/border "pill" the rest of the app uses around inputs). */
  wrapperClassName?: string;
  /** Class applied to the toggle button itself, in case a form needs different icon color/spacing. */
  toggleClassName?: string;
}

/**
 * Drop-in replacement for `<input type="password">` that adds a show/hide
 * eye toggle. Renders the input with the exact classes/props passed in, so
 * swapping a raw password input for this component keeps the surrounding
 * design untouched -- only the toggle button is added.
 */
const PasswordInput: React.FC<PasswordInputProps> = ({
  wrapperClassName,
  toggleClassName,
  className,
  id,
  ...inputProps
}) => {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={wrapperClassName ?? 'relative w-full'}>
      <input
        {...inputProps}
        id={inputId}
        type={visible ? 'text' : 'password'}
        className={className ? `${className} pr-10` : 'pr-10'}
      />
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-controls={inputId}
        aria-pressed={visible}
        tabIndex={0}
        className={
          toggleClassName ??
          'absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none focus:text-bird-blue transition-colors'
        }
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

export default PasswordInput;
