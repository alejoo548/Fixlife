import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  forgotPassword,
  verifyResetToken,
  resetPassword
} from "../services/authService";
import { showSweetToast } from '../utils/sweetAlert';
import PasswordInput from '../components/common/PasswordInput';

interface WorkerForgotPasswordProps {
  onBack?: () => void;
}

const WorkerForgotPassword: React.FC<WorkerForgotPasswordProps> = ({ onBack }) => {
  const { t } = useTranslation();

  const [step, setStep] = useState(1);

  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      void showSweetToast({ tone: 'error', message: t('passwordRecovery.validation.emailRequired') });
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
      void showSweetToast({ tone: 'error', message: t('passwordRecovery.validation.codeRequired') });
      return;
    }

    setLoading(true);

    try {
      await verifyResetToken(email.trim(), token.trim());
      void showSweetToast({ tone: 'success', message: t('passwordRecovery.messages.codeVerified') });
      setStep(3);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.response?.data?.message || t('passwordRecovery.messages.invalidCode');
      void showSweetToast({ tone: 'error', message: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password.trim() || !confirmPassword.trim()) {
      void showSweetToast({ tone: 'error', message: t('passwordRecovery.validation.fillAllFields') });
      return;
    }

    if (password.length < 8) {
      void showSweetToast({ tone: 'error', message: t('passwordRecovery.validation.passwordLength') });
      return;
    }

    if (password !== confirmPassword) {
      void showSweetToast({ tone: 'error', message: t('passwordRecovery.validation.passwordsDoNotMatch') });
      return;
    }

    setLoading(true);

    try {
      await resetPassword(email.trim(), token.trim(), password);
      void showSweetToast({ tone: 'success', message: t('passwordRecovery.messages.passwordUpdated') });
      
      // Esperar 1.5 segundos antes de volver al login
      setTimeout(() => {
        if (onBack) onBack();
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
            placeholder={t('passwordRecovery.emailPlaceholder')}
            value={email}
            maxLength={100}
            onChange={(e)=>setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-orange"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('passwordRecovery.sending') : t('passwordRecovery.sendCode')}
          </button>

        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleVerifyToken} className="flex flex-col gap-4">

          <input
            type="text"
            placeholder={t('passwordRecovery.codePlaceholder')}
            value={token}
            maxLength={6}
            inputMode="numeric"
            onChange={(e)=>setToken(e.target.value.replace(/\D/g, ''))}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-orange"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('passwordRecovery.verifying') : t('passwordRecovery.verifyCode')}
          </button>

        </form>
      )}

      {step === 3 && (
        <form onSubmit={handleResetPassword} className="flex flex-col gap-4">

          <PasswordInput
            placeholder={t('passwordRecovery.newPasswordPlaceholder')}
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-orange"
          />

          <PasswordInput
            placeholder={t('passwordRecovery.confirmPasswordPlaceholder')}
            value={confirmPassword}
            onChange={(e)=>setConfirmPassword(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-orange"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('passwordRecovery.saving') : t('passwordRecovery.resetPassword')}
          </button>

        </form>
      )}

      {onBack && (
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-bird-orange transition-colors self-center"
        >
          &larr; {t('passwordRecovery.backToLogin')}
        </button>
      )}

    </div>
  );
};

export default WorkerForgotPassword;
