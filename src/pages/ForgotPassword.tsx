import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  forgotPassword,
  verifyResetToken,
  resetPassword,
} from '../services/authService';
import { showSweetToast } from '../utils/sweetAlert';

interface ForgotPasswordProps {
  onBack?: () => void;
}

const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      void showSweetToast({ tone: 'error', message: t('passwordRecovery.messages.enterEmail') });
      return;
    }

    setLoading(true);

    try {
      await forgotPassword(email.trim());
      void showSweetToast({ tone: 'success', message: t('passwordRecovery.messages.codeSent') });
      setStep(2);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || t('passwordRecovery.messages.sendError');
      void showSweetToast({ tone: 'error', message: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyToken = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token.trim()) {
      void showSweetToast({ tone: 'error', message: t('passwordRecovery.messages.enterCode') });
      return;
    }

    setLoading(true);

    try {
      await verifyResetToken(email.trim(), token.trim());
      void showSweetToast({ tone: 'success', message: t('passwordRecovery.messages.codeVerified') });
      setStep(3);
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        t('passwordRecovery.messages.invalidCode');
      void showSweetToast({ tone: 'error', message: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password.trim() || !confirmPassword.trim()) {
      void showSweetToast({ tone: 'error', message: t('passwordRecovery.messages.fillFields') });
      return;
    }

    if (password.length < 8) {
      void showSweetToast({ tone: 'error', message: t('passwordRecovery.messages.minPassword') });
      return;
    }

    if (password !== confirmPassword) {
      void showSweetToast({ tone: 'error', message: t('passwordRecovery.messages.passwordsDoNotMatch') });
      return;
    }

    setLoading(true);

    try {
      await resetPassword(email.trim(), token.trim(), password);
      void showSweetToast({ tone: 'success', message: t('passwordRecovery.messages.resetSuccess') });

      setTimeout(() => {
        onBack?.();
      }, 1500);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || t('passwordRecovery.messages.resetError');
      void showSweetToast({ tone: 'error', message: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold text-gray-900 text-center">
        {t('passwordRecovery.title')}
      </h2>

      {step === 1 && (
        <form onSubmit={handleSendEmail} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder={t('passwordRecovery.fields.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-blue"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-bird-blue text-white font-bold"
          >
            {loading ? t('passwordRecovery.actions.sending') : t('passwordRecovery.actions.sendCode')}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleVerifyToken} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder={t('passwordRecovery.fields.code')}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-blue"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-bird-blue text-white font-bold"
          >
            {loading ? t('passwordRecovery.actions.verifying') : t('passwordRecovery.actions.verifyCode')}
          </button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
          <input
            type="password"
            placeholder={t('passwordRecovery.fields.newPassword')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-blue"
          />

          <input
            type="password"
            placeholder={t('passwordRecovery.fields.confirmPassword')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-blue"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-bird-blue text-white font-bold"
          >
            {loading ? t('passwordRecovery.actions.saving') : t('passwordRecovery.actions.resetPassword')}
          </button>
        </form>
      )}

      {onBack && (
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-bird-blue self-center"
        >
          {`← ${t('passwordRecovery.actions.backToLogin')}`}
        </button>
      )}
    </div>
  );
};

export default ForgotPassword;
