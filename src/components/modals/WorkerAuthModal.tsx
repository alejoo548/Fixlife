import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { showSweetToast } from '../../utils/sweetAlert';
import { translateApiError } from '../../utils/apiError';
import { motion, AnimatePresence } from 'framer-motion';
import WorkerForgotPassword from '../../pages/WorkerForgotPassword';
import { getAuthUser, getToken, setAuthSession, updateStoredAuthUser } from '../../utils/session';
import PasswordInput from '../common/PasswordInput';

interface ServiceOption {
  id_service: number;
  name: string;
  description: string | null;
  icon: string | null;
}

interface WorkerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'signin' | 'signup';
  onSuccess?: () => void;
}

const nameRegex = /^[\p{L}]+(?:[\p{L}\s]*[\p{L}])?$/u;
const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+com$/i;
const phoneRegex = /^\d{4}-\d{4}$/;
const usernameRegex = /^[a-zA-Z0-9_]+$/;
const MAX_WORKER_SPECIALTIES = 3;

const sanitizeNameInput = (value: string) => value.replace(/[^\p{L}\s]/gu, '').slice(0, 16);
const normalizeNameCase = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es')
    .replace(/(^|\s)(\p{L})/gu, (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('es')}`);
const formatPhoneInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
};

export const WorkerAuthModal: React.FC<WorkerAuthModalProps> = ({ isOpen, onClose, mode: initialMode, onSuccess }) => {
  const { t } = useTranslation();
  const [view, setView] = useState<'signin' | 'signup' | 'specialties' | 'verify' | 'upload' | 'forgot'>(initialMode);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [availableServices, setAvailableServices] = useState<ServiceOption[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    lastname: '',
    email: '',
    phone_number: '',
    password: '',
    confirmPassword: '',
    username: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [duiFile, setDuiFile] = useState<File | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [resendTimer, setResendTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setView(initialMode);
      setError('');
      setOtp('');
      setRegisteredEmail('');
      setSelectedServiceIds([]);
      // Fetch available services
      fetch(API_ENDPOINTS.services.getActive)
        .then(r => r.json())
        .then(data => { if (data.success) setAvailableServices(data.services); })
        .catch(() => {});
    }
  }, [initialMode, isOpen]);

  // Resend countdown timer
  useEffect(() => {
    if (view !== 'verify') return;
    setResendTimer(60);
    setCanResend(false);
    const interval = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [view]);

  if (!isOpen) return null;

  const isSignup = view === 'signup' || view === 'specialties' || view === 'verify' || view === 'upload';
  const toggleView = () => {
    setView(isSignup ? 'signin' : 'signup');
    setError('');
  };

  const toggleServiceSelection = (serviceId: number) => {
    setSelectedServiceIds((current) => {
      if (current.includes(serviceId)) {
        return current.filter((id) => id !== serviceId);
      }
      if (current.length >= MAX_WORKER_SPECIALTIES) {
        void showSweetToast({ tone: 'warning', message: t('workerAuth.messages.tooManyServices', { max: MAX_WORKER_SPECIALTIES }) });
        return current;
      }
      return [...current, serviceId];
    });
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.passwordsDoNotMatch') });
      setLoading(false);
      return;
    }

    const trimmedName = normalizeNameCase(formData.name);
    const trimmedLastname = normalizeNameCase(formData.lastname);
    const trimmedEmail = formData.email.trim().toLowerCase();
    const trimmedPhone = formData.phone_number.trim();
    const trimmedUsername = formData.username.trim();

    if (!nameRegex.test(trimmedName) || trimmedName.length < 2 || trimmedName.length > 16) {
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.invalidFirstName') });
      setLoading(false);
      return;
    }

    if (!nameRegex.test(trimmedLastname) || trimmedLastname.length < 2 || trimmedLastname.length > 16) {
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.invalidLastName') });
      setLoading(false);
      return;
    }

    if (trimmedUsername && (!usernameRegex.test(trimmedUsername) || trimmedUsername.length > 30)) {
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.invalidUsername') });
      setLoading(false);
      return;
    }

    if (!phoneRegex.test(trimmedPhone)) {
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.invalidPhone') });
      setLoading(false);
      return;
    }
    
    if (!emailRegex.test(trimmedEmail) || trimmedEmail.length > 100) {
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.invalidEmailLength') });
      setLoading(false);
      return;
    }

    if (formData.password.length < 8 || formData.password.length > 128) {
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.invalidPasswordLength') });
      setLoading(false);
      return;
    }

    try {
      // Client-side validation passed — move to specialties selection
      setRegisteredEmail(trimmedEmail);
      setLoading(false);
      setView('specialties');
    } catch (err) {
      console.error('[WorkerAuthModal] Error:', err);
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.connectionError') });
    } finally {
      setLoading(false);
    }
  };

  const handleSpecialtiesSubmit = async () => {
    setError('');
    setLoading(true);

    if (selectedServiceIds.length === 0) {
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.selectService') });
      setLoading(false);
      return;
    }

    if (selectedServiceIds.length > MAX_WORKER_SPECIALTIES) {
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.tooManyServices', { max: MAX_WORKER_SPECIALTIES }) });
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.auth.registerWorker, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizeNameCase(formData.name),
          lastname: normalizeNameCase(formData.lastname),
          email: formData.email.trim().toLowerCase(),
          phone_number: formData.phone_number.trim(),
          password: formData.password,
          username: formData.username.trim() || undefined,
          service_ids: selectedServiceIds,
        })
      });

      const data = await response.json();

      if (!response.ok) {
        void showSweetToast({ tone: 'error', message: translateApiError(data, 'workerAuth.messages.registrationFailed') });
        setLoading(false);
        return;
      }

      setRegisteredEmail(formData.email);
      void showSweetToast({ tone: 'success', message: t('workerAuth.messages.otpSent') });
      setView('verify');
    } catch (err) {
      console.error('[WorkerAuthModal] Error:', err);
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.connectionError') });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (otp.length !== 6) {
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.invalidOtp') });
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.auth.verifyWorkerEmail, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: registeredEmail,
          otp: otp
        })
      });

      const data = await response.json();

      if (!response.ok) {
        void showSweetToast({ tone: 'error', message: translateApiError(data, 'workerAuth.messages.verificationFailed') });
        setLoading(false);
        return;
      }

      setAuthSession(data.user, data.token, 'worker');
      void showSweetToast({ tone: 'success', message: t('workerAuth.messages.emailVerified') });
      setView('upload');
    } catch (err) {
      console.error('[WorkerAuthModal] Error verifying:', err);
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.connectionError') });
    } finally {
      setLoading(false);
    }
  };

  const handleSigninSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(API_ENDPOINTS.auth.login, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        void showSweetToast({ tone: 'error', message: translateApiError(data, 'workerAuth.messages.loginFailed') });
        setLoading(false);
        return;
      }

      const isWorker = data.user?.rol === 'worker' || data.user?.pending_worker === 1 || data.user?.pending_worker === true;
      if (!isWorker) {
        void showSweetToast({ tone: 'error', message: t('workerAuth.messages.notWorkerAccount') });
        setLoading(false);
        return;
      }

      setAuthSession(data.user, data.token, 'worker');
      void showSweetToast({ tone: 'success', message: t('workerAuth.messages.welcomeBack') });
      onClose();
      setTimeout(() => {
        onSuccess?.();
      }, 100);
    } catch (err) {
      console.error('[WorkerAuthModal] Error:', err);
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.connectionError') });
    } finally {
      setLoading(false);
    }
  };

  const handleFinishUpload = () => {
    onClose();
    setTimeout(() => {
      onSuccess?.();
    }, 100);
  };

  const handleUploadDocuments = async () => {
    if (!duiFile) {
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.duiRequired') });
      return;
    }

    if (!certFile) {
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.certRequired') });
      return;
    }

    const MAX_SIZE = 10 * 1024 * 1024;
    if (duiFile.size > MAX_SIZE) {
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.duiTooLarge') });
      return;
    }
    if (certFile && certFile.size > MAX_SIZE) {
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.certTooLarge') });
      return;
    }

    setLoading(true);
    const token = getToken('worker');

    const formData = new FormData();
    formData.append('dui_document', duiFile);
    if (certFile) formData.append('cert_document', certFile);

    try {
      const response = await fetch(`${API_URL}/api/worker/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        void showSweetToast({ tone: 'error', message: translateApiError(data, 'workerAuth.messages.uploadError') });
        setLoading(false);
        return;
      }

      // Update localStorage
      const userObj = getAuthUser('worker');
      if (userObj) {
          if (!userObj.worker_profile) userObj.worker_profile = {};
          userObj.worker_profile.dui_document = data.dui_path;
          userObj.worker_profile.cert_document = data.cert_path;
          updateStoredAuthUser(userObj, 'worker');
      }

      void showSweetToast({ tone: 'success', message: t('workerAuth.messages.uploadSuccess') });
      handleFinishUpload();
    } catch (err) {
      console.error('[WorkerAuthModal] Upload error:', err);
      void showSweetToast({ tone: 'error', message: t('workerAuth.messages.connectionError') });
    } finally {
      setLoading(false);
    }
  };

  const transitionClass = "transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]";

  if (view === 'forgot') {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-md"
          onClick={onClose}
        />

        <div className="relative bg-white dark:bg-slate-900 border border-transparent dark:border-white/10 rounded-3xl shadow-2xl p-8 w-full max-w-md animate-zoom-in">
          <WorkerForgotPassword onBack={() => setView('signin')} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in-up"
        style={{ animationDuration: '0.4s' }}
        onClick={view === 'verify' || view === 'upload' || view === 'specialties' ? undefined : onClose}
      />

      {/* DESKTOP VERSION */}
      <div className="hidden md:flex relative w-full max-w-[850px] h-[580px] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden text-gray-900 dark:text-slate-100 ring-1 ring-gray-200 dark:ring-white/10 animate-zoom-in">

        <div
          className={`absolute top-0 bottom-0 left-0 w-1/2 bg-gradient-to-br from-bird-orange to-bird-gold z-20 ${transitionClass}`}
          style={{
            transform: isSignup ? 'translateX(0%)' : 'translateX(100%)',
          }}
        >
          <div className="absolute top-[-20%] -left-[20%] w-60 h-60 bg-white/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-[-20%] -right-[20%] w-60 h-60 bg-bird-yellow/30 rounded-full blur-3xl pointer-events-none" />
        </div>

        <div
          className={`absolute top-0 left-0 w-1/2 h-full z-30 flex flex-col items-center justify-center text-center px-12 gap-6 ${transitionClass}
           ${isSignup && view !== 'upload' ? 'translate-x-0 opacity-100 pointer-events-auto' : '-translate-x-[20%] opacity-0 pointer-events-none'}`}
        >
          <h2 className="text-4xl font-bold tracking-tight text-white">{t('workerAuth.welcomeBackTitle')}</h2>
          <p className="text-sm text-white/90 leading-relaxed">
             {t('workerAuth.welcomeBackDescription')}
          </p>
          {view === 'signup' && (
            <button onClick={toggleView} className="mt-2 px-10 py-3 rounded-full border border-white/50 bg-white/10 text-white font-bold hover:bg-white hover:text-bird-orange transition-all duration-300 backdrop-blur-sm shadow-lg">
              {t('workerAuth.actions.signIn')}
            </button>
          )}
        </div>

        <div
          className={`absolute top-0 left-1/2 w-1/2 h-full z-10 flex flex-col items-center justify-center px-10 ${transitionClass}
           ${isSignup ? 'translate-x-0 opacity-100 z-10' : 'translate-x-[20%] opacity-0 z-0'}`}
        >
          <AnimatePresence mode="wait">
            {view === 'signup' && (
              <motion.div 
                key="signup-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full"
              >
                <div className="flex flex-col items-center text-center w-full">
                  <h2 className="text-3xl font-bold mb-2 text-bird-orange dark:text-amber-400">{t('workerAuth.joinTitle')}</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">{t('workerAuth.joinDescription')}</p>

                  <form className="w-full flex flex-col gap-2.5" data-tour="worker-auth-signup-form" onSubmit={handleSignupSubmit}>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors">
                        <input required value={formData.name} onChange={e => setFormData({...formData, name: sanitizeNameInput(e.target.value)})} type="text" maxLength={16} placeholder={t('workerAuth.fields.firstName')} className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                      </div>
                      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors">
                        <input required value={formData.lastname} onChange={e => setFormData({...formData, lastname: sanitizeNameInput(e.target.value)})} type="text" maxLength={16} placeholder={t('workerAuth.fields.lastName')} className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors">
                        <input value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} type="text" maxLength={30} placeholder={t('workerAuth.fields.usernameOptional')} className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                      </div>
                      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors">
                        <input required value={formData.phone_number} onChange={e => setFormData({...formData, phone_number: formatPhoneInput(e.target.value)})} type="tel" maxLength={9} placeholder="6074-6649" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                      </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors">
                      <input required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} type="email" maxLength={254} placeholder={t('workerAuth.fields.emailAddress')} className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors">
                        <PasswordInput required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}  maxLength={128} placeholder={t('workerAuth.fields.password')} className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                      </div>
                      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors">
                        <PasswordInput required value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})}  maxLength={128} placeholder={t('workerAuth.fields.confirmPassword')} className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                      </div>
                    </div>

                    <button disabled={loading} type="submit" className="mt-2 w-full py-3 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading ? t('workerAuth.actions.processing') : t('workerAuth.actions.createProAccount')}
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {view === 'specialties' && (
              <motion.div
                key="specialties-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 bg-bird-gold/10 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-bird-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold mb-2 text-bird-orange dark:text-amber-400">{t('workerAuth.specialtiesTitle')}</h2>
                <p className="text-sm text-gray-600 dark:text-slate-400 mb-2">{t('workerAuth.specialtiesDescription', { max: MAX_WORKER_SPECIALTIES })}</p>
                <p className="text-xs font-semibold text-bird-orange mb-4">{t('workerAuth.specialtiesCount', { count: selectedServiceIds.length, max: MAX_WORKER_SPECIALTIES })}</p>

                <div className="w-full grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto custom-scrollbar mb-4 px-1">
                  {availableServices.length === 0 ? (
                    <p className="col-span-2 text-sm text-gray-400 py-4">{t('workerAuth.noServices')}</p>
                  ) : availableServices.map(svc => {
                    const isSelected = selectedServiceIds.includes(svc.id_service);
                    return (
                      <button
                        key={svc.id_service}
                        type="button"
                        onClick={() => toggleServiceSelection(svc.id_service)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 ${
                          isSelected
                            ? 'bg-bird-orange/10 border-bird-orange text-bird-orange shadow-sm'
                            : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-white/10 text-gray-600 dark:text-slate-300 hover:border-gray-300 dark:hover:border-white/20'
                        }`}
                      >
                        <span className="text-base">{svc.icon && svc.icon.length <= 2 ? svc.icon : '⚙️'}</span>
                        <span className="truncate">{svc.name}</span>
                        {isSelected && (
                          <svg className="w-4 h-4 ml-auto text-bird-orange shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  disabled={loading}
                  onClick={handleSpecialtiesSubmit}
                  className="w-full py-4 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? t('workerAuth.actions.creatingAccount') : t('workerAuth.actions.continue')}
                </button>
                <button onClick={() => setView('signup')} className="mt-3 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 font-semibold transition-colors">
                  ← {t('workerAuth.goBack')}
                </button>
              </motion.div>
            )}

            {view === 'verify' && (
              <motion.div 
                key="verify-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 bg-bird-orange/10 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-bird-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold mb-2 text-bird-orange dark:text-amber-400">{t('workerAuth.verifyTitle')}</h2>
                <p className="text-sm text-gray-600 dark:text-slate-400 mb-6">
                  {t('workerAuth.verifyDescription')} <br/><span className="font-semibold text-gray-900 dark:text-slate-100">{registeredEmail}</span>
                </p>

                <form className="w-full flex flex-col gap-4 max-w-[280px]" onSubmit={handleVerifySubmit}>
                  <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors">
                    <input 
                      required 
                      value={otp} 
                      onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} 
                      type="text" 
                      placeholder={t('workerAuth.verifyPlaceholder')} 
                      className="w-full bg-transparent px-3 py-3 text-center text-xl tracking-[0.5em] font-bold text-gray-900 dark:text-slate-100 outline-none placeholder-gray-400" 
                    />
                  </div>
                  <button disabled={loading || otp.length !== 6} type="submit" className="w-full py-4 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading ? t('workerAuth.actions.verifying') : t('workerAuth.actions.verifyEmail')}
                  </button>
                </form>

                <div className="flex items-center gap-4 mt-4">
                  <button onClick={() => { setView('signup'); setOtp(''); }} className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 font-semibold transition-colors">
                    ← {t('workerAuth.goBack')}
                  </button>
                  <button 
                    disabled={!canResend || loading} 
                    onClick={async () => {
                      try {
                        setCanResend(false);
                        setResendTimer(60);
                        const res = await fetch(API_ENDPOINTS.auth.resendOtp, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email: registeredEmail })
                        });
                        const data = await res.json();
                        if (res.ok) {
                          void showSweetToast({ tone: 'success', message: t('workerAuth.messages.resendSuccess') });
                        } else {
                          void showSweetToast({ tone: 'error', message: translateApiError(data, 'workerAuth.messages.resendFailed') });
                        }
                      } catch {
                        void showSweetToast({ tone: 'error', message: t('workerAuth.messages.connectionErrorShort') });
                      }
                    }}
                    className="text-sm font-semibold transition-colors disabled:text-gray-400 text-bird-orange hover:text-bird-orange/80 disabled:cursor-not-allowed"
                  >
                    {canResend ? t('workerAuth.resendCode') : t('workerAuth.resendIn', { count: resendTimer })}
                  </button>
                </div>
              </motion.div>
            )}

            {view === 'upload' && (
              <motion.div 
                key="upload-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 bg-bird-gold/10 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-bird-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold mb-2 text-gray-900 dark:text-slate-100">{t('workerAuth.uploadTitle')}</h2>
                <p className="text-sm text-gray-600 dark:text-slate-400 mb-4 px-4">
                  {t('workerAuth.uploadDescription')}
                </p>

                <label className="w-full border-2 border-dashed border-gray-300 dark:border-white/10 rounded-2xl p-6 mb-3 bg-gray-50 dark:bg-slate-800 flex flex-col items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer group">
                  <svg className="w-10 h-10 text-gray-400 group-hover:text-bird-orange transition-colors mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">{duiFile ? duiFile.name : t('workerAuth.duiLabel')}</span>
                  <span className="text-xs text-gray-500 dark:text-slate-400 mt-1">{t('workerAuth.fileTypesHint')}</span>
                  <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setDuiFile(e.target.files?.[0] || null)} />
                </label>

                <label className="w-full border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl p-4 mb-4 bg-gray-50 dark:bg-slate-800 flex flex-col items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                  <span className="text-sm font-semibold text-gray-600 dark:text-slate-300">{certFile ? certFile.name : t('workerAuth.certLabel')}</span>
                  <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setCertFile(e.target.files?.[0] || null)} />
                </label>

                <div className="w-full flex gap-3">
                  <button onClick={handleFinishUpload} className="flex-1 py-3 rounded-full border border-gray-200 dark:border-white/10 text-gray-600 dark:text-slate-300 font-bold text-sm tracking-wide hover:bg-gray-50 dark:hover:bg-slate-800 transition-all duration-300">
                    {t('workerAuth.actions.skipForNow')}
                  </button>
                  <button disabled={loading || !duiFile || !certFile} onClick={handleUploadDocuments} className="flex-1 py-3 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading ? t('workerAuth.actions.uploading') : t('workerAuth.actions.uploadFiles')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div
          className={`absolute top-0 left-1/2 w-1/2 h-full z-30 flex flex-col items-center justify-center text-center px-12 gap-6 ${transitionClass}
           ${!isSignup ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-[20%] opacity-0 pointer-events-none'}`}
        >
          <h2 className="text-4xl font-bold tracking-tight text-white">{t('workerAuth.joinHeroTitle')}</h2>
          <p className="text-sm text-white/90 leading-relaxed">
            {t('workerAuth.joinHeroDescription')}
          </p>
          <button onClick={toggleView} data-tour="worker-auth-toggle-signup" className="mt-2 px-10 py-3 rounded-full border border-white/50 bg-white/10 text-white font-bold hover:bg-white hover:text-bird-orange transition-all duration-300 backdrop-blur-sm shadow-lg">
            {t('workerAuth.actions.signUp')}
          </button>
        </div>

        <div
          className={`absolute top-0 left-0 w-1/2 h-full z-10 flex flex-col items-center justify-center px-14 ${transitionClass}
           ${!isSignup ? 'translate-x-0 opacity-100 z-10' : '-translate-x-[20%] opacity-0 z-0'}`}
        >
          <h2 className="text-3xl font-bold mb-2 text-bird-orange dark:text-amber-400">{t('workerAuth.signInTitle')}</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-6">{t('workerAuth.signInDescription')}</p>

          <form className="w-full flex flex-col gap-4" onSubmit={handleSigninSubmit}>
            <div data-tour="worker-auth-signin-email" className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors">
              <input required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} type="email" maxLength={254} placeholder={t('workerAuth.fields.emailAddress')} className="w-full bg-transparent px-3 py-3 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
            </div>
            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors">
              <PasswordInput required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}  maxLength={128} placeholder={t('workerAuth.fields.password')} className="w-full bg-transparent px-3 py-3 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
            </div>

            <button
              type="button"
              data-tour="worker-auth-forgot-password"
              onClick={() => setView('forgot')}
              className="text-xs text-gray-500 dark:text-slate-400 hover:text-bird-orange transition-colors self-end my-1"
            >
              {t('workerAuth.forgotPassword')}
            </button>

            <button disabled={loading} type="submit" data-tour="worker-auth-signin-submit" className="w-full py-4 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? t('workerAuth.actions.processing') : t('workerAuth.actions.signIn')}
            </button>
          </form>
        </div>
      </div>

      {/* MOBILE VERSION REDACTED FOR BREVITY - FULL IMPLEMENTATION SHOULD KEEP MOBILE TOO, adding it below */}
      <div className="md:hidden relative w-full max-w-[380px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col min-h-[620px] animate-zoom-in">

        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute top-[-20%] left-[-20%] w-[300px] h-[300px] rounded-full blur-[80px] transition-all duration-700 
                ${isSignup ? 'bg-bird-yellow/30 translate-x-[50%]' : 'bg-bird-orange/20 translate-x-0'}`}
          />
          <div className={`absolute bottom-[-10%] right-[-10%] w-[250px] h-[250px] rounded-full blur-[60px] transition-all duration-700
                ${isSignup ? 'bg-bird-orange/20' : 'bg-bird-gold/20'}`}
          />
        </div>

        <div className="relative z-10 flex flex-col h-full p-6 overflow-y-auto custom-scrollbar">

          {(view === 'signin' || view === 'signup') && (
            <div className="w-full h-12 bg-gray-100 dark:bg-slate-800 rounded-full p-1 flex relative mb-6 shrink-0 backdrop-blur-sm border border-gray-200 dark:border-white/10">
              <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full shadow-lg transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]
                     ${isSignup
                  ? 'left-[50%] bg-bird-gold'
                  : 'left-1 bg-bird-orange'}`}
              />

              <button
                onClick={() => { setView('signin'); setError(''); }}
                className={`flex-1 relative z-10 text-xs font-bold tracking-wide transition-colors duration-300 flex items-center justify-center
                    ${!isSignup ? 'text-white' : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100'}`}
              >
                {t('workerAuth.actions.signIn')}
              </button>
              <button
                onClick={() => { setView('signup'); setError(''); }}
                data-tour="worker-auth-toggle-signup"
                className={`flex-1 relative z-10 text-xs font-bold tracking-wide transition-colors duration-300 flex items-center justify-center
                    ${isSignup ? 'text-white' : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100'}`}
              >
                {t('workerAuth.actions.signUp')}
              </button>
            </div>
          )}

          <div className="flex-1 flex flex-col justify-center transition-all duration-500">
            <AnimatePresence mode="wait">
              {view === 'signup' && (
                <motion.div 
                  key="mobile-signup"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="flex flex-col gap-3"
                >
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">{t('workerAuth.joinTitle')}</h2>
                    <p className="text-xs text-gray-600 dark:text-slate-400 px-4">{t('workerAuth.joinDescription')}</p>
                  </div>
                  <form className="flex flex-col gap-3" data-tour="worker-auth-signup-form" onSubmit={handleSignupSubmit}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                        <input required value={formData.name} onChange={e => setFormData({...formData, name: sanitizeNameInput(e.target.value)})} type="text" maxLength={16} placeholder={t('workerAuth.fields.firstName')} className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                        <input required value={formData.lastname} onChange={e => setFormData({...formData, lastname: sanitizeNameInput(e.target.value)})} type="text" maxLength={16} placeholder={t('workerAuth.fields.lastName')} className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                      <input value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} type="text" maxLength={30} placeholder={t('workerAuth.fields.usernameOptional')} className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                      <input required value={formData.phone_number} onChange={e => setFormData({...formData, phone_number: formatPhoneInput(e.target.value)})} type="tel" maxLength={9} placeholder="6074-6649" className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                      <input required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} type="email" maxLength={254} placeholder={t('workerAuth.fields.emailAddress')} className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="bg-white dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                        <PasswordInput required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}  maxLength={128} placeholder={t('workerAuth.fields.password')} className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10 focus-within:border-bird-orange/50 transition-colors shadow-sm animate-fade-in-up">
                        <PasswordInput required value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})}  maxLength={128} placeholder={t('workerAuth.fields.confirmPassword')} className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                      </div>
                    </div>
                    <button disabled={loading} type="submit" className="mt-4 w-full py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all duration-300 bg-gradient-to-r from-bird-yellow to-bird-gold text-gray-900 shadow-bird-yellow/20 disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading ? t('workerAuth.actions.processing') : t('workerAuth.actions.createProAccountMobile')}
                    </button>
                  </form>
                </motion.div>
              )}

              {view === 'specialties' && (
                <motion.div
                  key="mobile-specialties"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="flex flex-col items-center justify-center text-center h-full"
                >
                  <div className="w-16 h-16 bg-bird-gold/10 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-bird-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">{t('workerAuth.specialtiesTitle')}</h2>
                  <p className="text-sm text-gray-600 mb-2 px-2">{t('workerAuth.specialtiesDescription', { max: MAX_WORKER_SPECIALTIES })}</p>
                  <p className="text-xs font-semibold text-bird-orange mb-4">{t('workerAuth.specialtiesCount', { count: selectedServiceIds.length, max: MAX_WORKER_SPECIALTIES })}</p>

                  <div className="w-full grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto custom-scrollbar mb-4">
                    {availableServices.length === 0 ? (
                      <p className="col-span-2 text-sm text-gray-400 py-4">{t('workerAuth.noServices')}</p>
                    ) : availableServices.map(svc => {
                      const isSelected = selectedServiceIds.includes(svc.id_service);
                      return (
                        <button
                          key={svc.id_service}
                          type="button"
                          onClick={() => toggleServiceSelection(svc.id_service)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 ${
                            isSelected
                              ? 'bg-bird-orange/10 border-bird-orange text-bird-orange shadow-sm'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-base">{svc.icon && svc.icon.length <= 2 ? svc.icon : '⚙️'}</span>
                          <span className="truncate">{svc.name}</span>
                          {isSelected && (
                            <svg className="w-4 h-4 ml-auto text-bird-orange shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    disabled={loading}
                    onClick={handleSpecialtiesSubmit}
                    className="w-full py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all duration-300 bg-gradient-to-r from-bird-orange to-bird-gold text-white shadow-bird-orange/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? t('workerAuth.actions.creatingAccount') : t('workerAuth.actions.continue')}
                  </button>
                  <button onClick={() => setView('signup')} className="mt-3 text-sm text-gray-500 hover:text-gray-700 font-semibold transition-colors">
                    ← {t('workerAuth.goBack')}
                  </button>
                </motion.div>
              )}

              {view === 'verify' && (
                <motion.div 
                  key="mobile-verify"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="flex flex-col items-center justify-center text-center h-full"
                >
                  <div className="w-16 h-16 bg-bird-orange/10 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-8 h-8 text-bird-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('workerAuth.verifyMobileTitle')}</h2>
                  <p className="text-sm text-gray-600 mb-8">
                    {t('workerAuth.verifyMobileDescription')} <span className="font-semibold text-gray-900">{registeredEmail}</span>
                  </p>
                  <form className="w-full" onSubmit={handleVerifySubmit}>
                    <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm mb-6">
                      <input 
                        required 
                        value={otp} 
                        onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}  
                        type="text" 
                        placeholder={t('workerAuth.verifyMobilePlaceholder', { defaultValue: '000000' })} 
                        className="w-full bg-transparent text-center text-2xl tracking-[0.5em] font-bold text-gray-900 outline-none placeholder-gray-400" 
                      />
                    </div>
                    <button disabled={loading || otp.length !== 6} type="submit" className="w-full py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all duration-300 bg-gradient-to-r from-bird-orange to-bird-gold text-white shadow-bird-orange/20 disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading ? t('workerAuth.actions.verifying') : t('workerAuth.actions.verifyEmailMobile')}
                    </button>
                  </form>

                  <div className="flex items-center justify-between mt-6 w-full">
                    <button onClick={() => { setView('signup'); setOtp(''); }} className="text-sm text-gray-500 hover:text-gray-700 font-semibold transition-colors">
                      ← {t('workerAuth.goBack')}
                    </button>
                    <button 
                      disabled={!canResend || loading} 
                      onClick={async () => {
                        try {
                          setCanResend(false);
                          setResendTimer(60);
                          const res = await fetch(API_ENDPOINTS.auth.resendOtp, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: registeredEmail })
                          });
                          const data = await res.json();
                          if (res.ok) {
                            void showSweetToast({ tone: 'success', message: t('workerAuth.messages.resendSuccess') });
                          } else {
                            void showSweetToast({ tone: 'error', message: translateApiError(data, 'workerAuth.messages.resendFailed') });
                          }
                        } catch {
                          void showSweetToast({ tone: 'error', message: t('workerAuth.messages.connectionErrorShort') });
                        }
                      }}
                      className="text-sm font-semibold transition-colors disabled:text-gray-400 text-bird-orange hover:text-bird-orange/80 disabled:cursor-not-allowed"
                    >
                      {canResend ? t('workerAuth.resendCode') : t('workerAuth.resendIn', { count: resendTimer })}
                    </button>
                  </div>
                </motion.div>
              )}

              {view === 'upload' && (
                <motion.div 
                  key="mobile-upload"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="flex flex-col items-center justify-center text-center h-full"
                >
                  <div className="w-16 h-16 bg-bird-gold/10 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-8 h-8 text-bird-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('workerAuth.uploadMobileTitle')}</h2>
                  <p className="text-sm text-gray-600 mb-6 px-2">
                    {t('workerAuth.uploadMobileDescription')}
                  </p>
                  
                  <label className="w-full border-2 border-dashed border-gray-300 rounded-2xl p-6 mb-3 bg-gray-50 flex flex-col items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer">
                    <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-sm font-semibold text-gray-700">{duiFile ? duiFile.name : t('workerAuth.duiLabel')}</span>
                    <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setDuiFile(e.target.files?.[0] || null)} />
                  </label>

                  <label className="w-full border-2 border-dashed border-gray-200 rounded-2xl p-4 mb-6 bg-gray-50 flex flex-col items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer">
                    <span className="text-sm font-semibold text-gray-600">{certFile ? certFile.name : t('workerAuth.certLabel')}</span>
                    <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setCertFile(e.target.files?.[0] || null)} />
                  </label>

                  <div className="w-full flex flex-col gap-3">
                    <button disabled={loading || !duiFile || !certFile} onClick={handleUploadDocuments} className="w-full py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all duration-300 bg-gradient-to-r from-bird-orange to-bird-gold text-white shadow-bird-orange/20 disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading ? t('workerAuth.actions.uploading') : t('workerAuth.actions.uploadFilesMobile')}
                    </button>
                    <button onClick={handleFinishUpload} className="w-full py-4 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm tracking-wide hover:bg-gray-50 transition-all duration-300">
                      {t('workerAuth.actions.skipForNowMobile')}
                    </button>
                  </div>
                </motion.div>
              )}

              {view === 'signin' && (
                <motion.div 
                  key="mobile-signin"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                >
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('workerAuth.signInTitle')}</h2>
                    <p className="text-xs text-gray-600 px-4">{t('workerAuth.signInMobileDescription')}</p>
                  </div>
                  <form className="flex flex-col gap-3" onSubmit={handleSigninSubmit}>
                    <div data-tour="worker-auth-signin-email" className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                      <input required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} type="email" maxLength={254} placeholder={t('workerAuth.fields.emailAddress')} className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                    </div>
                    <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                      <PasswordInput required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}  maxLength={128} placeholder={t('workerAuth.fields.password')} className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                    </div>
                    <div className="flex justify-end mt-1">
                      <button
                        type="button"
                        data-tour="worker-auth-forgot-password"
                        onClick={() => setView('forgot')}
                        className="text-xs text-gray-600 hover:text-bird-orange transition-colors"
                      >
                        {t('workerAuth.forgotPassword')}
                      </button>
                    </div>
                    <button disabled={loading} type="submit" data-tour="worker-auth-signin-submit" className="mt-4 w-full py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all duration-300 bg-gradient-to-r from-bird-orange to-bird-gold text-white shadow-bird-orange/20 disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading ? t('workerAuth.actions.processing') : t('workerAuth.actions.signInMobile', { defaultValue: t('workerAuth.actions.signIn') })}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

    </div>
  );
};
