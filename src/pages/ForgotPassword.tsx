import { useState } from "react";
import {
  forgotPassword,
  verifyResetToken,
  resetPassword
} from "../services/authService";
import { Notyf } from 'notyf';
import 'notyf/notyf.min.css';

interface ForgotPasswordProps {
  onBack?: () => void;
}

const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onBack }) => {

  const [step, setStep] = useState(1);

  const notyf = new Notyf({
    position: { x: 'right', y: 'bottom' },
    ripple: true,
  });

  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await forgotPassword(email.trim());
      notyf.success("Verification code sent to your email");
      setStep(2);
    } catch (error: any) {
      notyf.error(error.response?.data?.error || "Error sending email");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await verifyResetToken(email.trim(), token.trim());
      notyf.success("Token verified");
      setStep(3);
    } catch (error: any) {
      const msg = error.response?.data?.message || error.response?.data?.error || "Invalid or expired token";
      notyf.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      notyf.error("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      await resetPassword(email.trim(), token.trim(), password);

      notyf.success("Password successfully updated");

      if (onBack) onBack();

    } catch (error: any) {
      notyf.error(error.response?.data?.error || "Error resetting password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">

      <h2 className="text-2xl font-bold text-gray-900 text-center">
        Recover password
      </h2>

      {}

      {step === 1 && (
        <form onSubmit={handleSendEmail} className="flex flex-col gap-4">

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-blue"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-bird-blue text-white font-bold"
          >
            {loading ? "Sending..." : "Send code"}
          </button>

        </form>
      )}

      {}

      {step === 2 && (
        <form onSubmit={handleVerifyToken} className="flex flex-col gap-4">

          <input
            type="text"
            placeholder="Enter verification code"
            value={token}
            onChange={(e)=>setToken(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-blue"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-bird-blue text-white font-bold"
          >
            {loading ? "Verifying..." : "Verify code"}
          </button>

        </form>
      )}

      {}

      {step === 3 && (
        <form onSubmit={handleResetPassword} className="flex flex-col gap-4">

          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-blue"
          />

          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e)=>setConfirmPassword(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-bird-blue"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-bird-blue text-white font-bold"
          >
            {loading ? "Saving..." : "Reset password"}
          </button>

        </form>
      )}

      {onBack && (
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-bird-blue self-center"
        >
          ← Back to login
        </button>
      )}

    </div>
  );
};

export default ForgotPassword;