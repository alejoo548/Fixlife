import { useState } from "react";
import {
  forgotPassword,
  verifyResetToken,
  resetPassword
} from "../services/authService";
import { showSweetToast } from '../utils/sweetAlert';

interface WorkerForgotPasswordProps {
  onBack?: () => void;
}

const WorkerForgotPassword: React.FC<WorkerForgotPasswordProps> = ({ onBack }) => {

  const [step, setStep] = useState(1);

  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      void showSweetToast({ tone: 'error', message: "Please enter your email" });
      return;
    }

    setLoading(true);

    try {
      await forgotPassword(email.trim());
      void showSweetToast({ tone: 'success', message: "Verification code sent to your email" });
      setStep(2);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || "Error sending email. Please try again.";
      void showSweetToast({ tone: 'error', message: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyToken = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token.trim()) {
      void showSweetToast({ tone: 'error', message: "Please enter the verification code" });
      return;
    }

    setLoading(true);

    try {
      await verifyResetToken(email.trim(), token.trim());
      void showSweetToast({ tone: 'success', message: "Code verified successfully" });
      setStep(3);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.response?.data?.message || "Invalid or expired code";
      void showSweetToast({ tone: 'error', message: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password.trim() || !confirmPassword.trim()) {
      void showSweetToast({ tone: 'error', message: "Please fill in all fields" });
      return;
    }

    if (password.length < 8) {
      void showSweetToast({ tone: 'error', message: "Password must be at least 8 characters" });
      return;
    }

    if (password !== confirmPassword) {
      void showSweetToast({ tone: 'error', message: "Passwords do not match" });
      return;
    }

    setLoading(true);

    try {
      await resetPassword(email.trim(), token.trim(), password);
      void showSweetToast({ tone: 'success', message: "Password successfully updated! You can now log in." });
      
      // Esperar 1.5 segundos antes de volver al login
      setTimeout(() => {
        if (onBack) onBack();
      }, 1500);

    } catch (error: any) {
      const errorMsg = error.response?.data?.error || "Error resetting password. Please try again.";
      void showSweetToast({ tone: 'error', message: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">

      <h2 className="text-2xl font-bold text-gray-900 text-center">
        Recover password
      </h2>

      {step === 1 && (
        <form onSubmit={handleSendEmail} className="flex flex-col gap-4">

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-orange"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Send code"}
          </button>

        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleVerifyToken} className="flex flex-col gap-4">

          <input
            type="text"
            placeholder="Enter verification code"
            value={token}
            onChange={(e)=>setToken(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-orange"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Verifying..." : "Verify code"}
          </button>

        </form>
      )}

      {step === 3 && (
        <form onSubmit={handleResetPassword} className="flex flex-col gap-4">

          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-orange"
          />

          <input
            type="password"
            placeholder="Confirm password"
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
            {loading ? "Saving..." : "Reset password"}
          </button>

        </form>
      )}

      {onBack && (
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-bird-orange transition-colors self-center"
        >
          &larr; Back to login
        </button>
      )}

    </div>
  );
};

export default WorkerForgotPassword;
