import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API_ENDPOINTS } from '../../config/api';
import { AuthMode } from '../../types';
import { showSweetToast } from '../../utils/sweetAlert';
import { translateApiError } from '../../utils/apiError';
import { useAuth } from '../../context/AuthContext';
import { setAuthSession } from '../../utils/session';
import ForgotPassword from '../../pages/ForgotPassword';
import ReCAPTCHA from 'react-google-recaptcha';
import PasswordInput from '../common/PasswordInput';

declare global {
  interface Window {
    google?: any;
  }
}

let gsiInitialized = false;
const nameRegex = /^[\p{L}]+(?:[\p{L}\s]*[\p{L}])?$/u;
const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+com$/i;
const phoneRegex = /^\d{4}-\d{4}$/;

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

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode: AuthMode;
  onAdminLogin?: () => void;
  onClientLogin?: () => void;
  onWorkerLogin?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode, onAdminLogin, onClientLogin, onWorkerLogin }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  type AuthView = AuthMode | 'forgot';
  const [view, setView] = useState<AuthView>(initialMode);

  const [formData, setFormData] = useState({
  name: '',
  lastname: '',
  username: '',
  phone_number: '',
  email: '',
  password: '',
  confirmPassword: ''
});

const { login } = useAuth();
const [captchaToken, setCaptchaToken] = useState<string | null>(null);
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
const rawGoogleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const googleClientId = rawGoogleClientId === '463100180400-hsrvp3o9dp41g6hv7e2oecg5uv5iq'
  ? '463100180400-hsrvp3o9dp41g6hv7e2oecg5uv5iq6te.apps.googleusercontent.com'
  : rawGoogleClientId;
const enableGoogleLogin = import.meta.env.VITE_ENABLE_GOOGLE_LOGIN === 'true';
const isGoogleAuthEnabled = enableGoogleLogin && Boolean(googleClientId?.endsWith('.apps.googleusercontent.com'));
const isCaptchaEnabled = Boolean(recaptchaSiteKey);
const [isDesktop, setIsDesktop] = useState(() => {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= 768;
});

const loadGoogleGsiScript = () =>
  new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-fixlife-gsi="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GSI script failed to load')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client?hl=en';
    script.async = true;
    script.defer = true;
    script.dataset.fixlifeGsi = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('GSI script failed to load'));
    document.head.appendChild(script);
  });

const GoogleSignInButton = ({ onCredential }: { onCredential: (credential: string) => void }) => {
  const [ready, setReady] = useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // Keep latest callback in a ref so the effect never needs to re-run when it changes
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    if (!isGoogleAuthEnabled || !googleClientId) return;
    let cancelled = false;

    const setup = async () => {
      try {
        await loadGoogleGsiScript();
        if (cancelled) return;

        const google = window.google;
        if (!google?.accounts?.id || !containerRef.current) return;

        if (!gsiInitialized) {
          google.accounts.id.initialize({
            client_id: googleClientId,
            callback: (resp: any) => {
              const credential = String(resp?.credential || '');
              if (credential) onCredentialRef.current(credential);
            },
          });
          gsiInitialized = true;
        }

        containerRef.current.innerHTML = '';
        google.accounts.id.renderButton(containerRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 320,
          locale: 'en',
        });

        setReady(true);
      } catch (e) {
        // keep silent; fallback text below
      }
    };

    setup();
    return () => { cancelled = true; };
  }, []); // run once — callback stays current via onCredentialRef

  if (!isGoogleAuthEnabled || !googleClientId) return null;

  return (
    <div className="w-full flex justify-center">
      <div ref={containerRef} />
      {!ready && (
        <button
          type="button"
          className="flex items-center justify-center gap-3 py-2.5 rounded-lg bg-white border border-gray-200 text-gray-800 font-bold text-xs hover:bg-gray-50 transition-colors shadow-sm"
          onClick={() => {
            // no-op fallback
          }}
        >
          <span aria-hidden="true" className="text-base font-black text-bird-blue">G</span>
          {t('auth.googleFallback')}
        </button>
      )}
    </div>
  );
};

const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const { name, value } = e.target;
  const nextValue =
    name === 'name' || name === 'lastname'
      ? sanitizeNameInput(value)
      : name === 'phone_number'
        ? formatPhoneInput(value)
        : value;

  setFormData({
    ...formData,
    [name]: nextValue
  });
};

  useEffect(() => {
    if (isOpen) {
      setView(initialMode);
    }
  }, [initialMode, isOpen]);

  useEffect(() => {
    if (view !== 'signup') {
      setCaptchaToken(null);
    }
  }, [view]);

  useEffect(() => {
    const updateViewport = () => {
      setIsDesktop(window.innerWidth >= 768);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (view === 'signup') {
      void showSweetToast({ tone: 'success', message: t('auth.messages.accountCreated') });
    } else {
      void showSweetToast({ tone: 'success', message: t('auth.messages.welcomeBack') });
    }
    setTimeout(() => onClose(), 1500);
  };

  if (!isOpen) return null;

  const isSignup = view === 'signup';
  const toggleView = () => setView(isSignup ? 'signin' : 'signup');

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();

  if (formData.password !== formData.confirmPassword) {
    void showSweetToast({ tone: 'error', message: t('auth.messages.passwordsDoNotMatch') });
    return;
  }

  const trimmedName = normalizeNameCase(formData.name);
  const trimmedLastname = normalizeNameCase(formData.lastname);
  const trimmedEmail = formData.email.trim().toLowerCase();
  const trimmedPhone = formData.phone_number.trim();

  if (!nameRegex.test(trimmedName) || trimmedName.length < 2 || trimmedName.length > 16) {
    void showSweetToast({ tone: 'error', message: 'Name must be 2-16 characters and contain letters only.' });
    return;
  }

  if (!nameRegex.test(trimmedLastname) || trimmedLastname.length < 2 || trimmedLastname.length > 16) {
    void showSweetToast({ tone: 'error', message: 'Lastname must be 2-16 characters and contain letters only.' });
    return;
  }

  if (!emailRegex.test(trimmedEmail)) {
    void showSweetToast({ tone: 'error', message: 'Email must be a valid .com address.' });
    return;
  }

  if (!phoneRegex.test(trimmedPhone)) {
    void showSweetToast({ tone: 'error', message: 'Phone must contain exactly 8 digits, like 6074-6649.' });
    return;
  }

  if (isCaptchaEnabled && !captchaToken) {
    void showSweetToast({ tone: 'error', message: t('auth.messages.completeCaptcha') });
    return;
  }

  try {
    const res = await fetch(API_ENDPOINTS.auth.registerUser, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: trimmedName,
        lastname: trimmedLastname,
        username: formData.username,
        phone_number: trimmedPhone,
        email: trimmedEmail,
        password: formData.password,
        ...(isCaptchaEnabled ? { captchaToken } : {}),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      void showSweetToast({ tone: 'error', message: translateApiError(data, 'auth.messages.registrationFailed') });
      return;
    }

    login(data.user, data.token);
    void showSweetToast({ tone: 'success', message: t('auth.messages.accountCreated') });

    setCaptchaToken(null);
    onClose();
    setTimeout(() => onClientLogin?.(), 100);
  } catch (err) {
    console.error(err);
    void showSweetToast({ tone: 'error', message: t('auth.messages.connectionError') });
  }
};

const handleAuthSuccess = (data: any) => {
  const role = String(data.user?.rol ?? data.user?.role ?? '').toLowerCase();

  if (role === 'admin' || role === 'root') {
    setAuthSession(data.user, data.token, 'admin');
    void showSweetToast({ tone: 'success', message: t('auth.messages.adminSessionReady') });
    onClose();
    setTimeout(() => {
      if (onAdminLogin) {
        onAdminLogin();
        return;
      }
      navigate('/admin-dashboard', { replace: true });
    }, 100);
    return;
  }

  if (data.user?.rol === 'worker' || data.user?.role === 'worker') {
    setAuthSession(data.user, data.token, 'worker');
    void showSweetToast({ tone: 'success', message: t('auth.messages.workerSessionReady') });
    onClose();
    setTimeout(() => {
      if (onWorkerLogin) {
        onWorkerLogin();
        return;
      }
      navigate('/pro-dashboard', { replace: true });
    }, 100);
    return;
  }

  login(data.user, data.token);
  void showSweetToast({ tone: 'success', message: t('auth.messages.welcomeBack') });
  onClose();
  setTimeout(() => onClientLogin?.(), 100);
};

const handleGoogleSignin = async (credential: string) => {
  try {
    const res = await fetch(API_ENDPOINTS.auth.google, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });

    const data = await res.json();

    if (!res.ok) {
      void showSweetToast({ tone: 'error', message: translateApiError(data, 'auth.messages.googleLoginFailed') });
      return;
    }

    handleAuthSuccess(data);
  } catch (err) {
    console.error(err);
    void showSweetToast({ tone: 'error', message: t('auth.messages.connectionError') });
  }
};

const handleSignin = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();

  if (!formData.email || !formData.password) {
  void showSweetToast({ tone: 'error', message: t('auth.messages.emailPasswordRequired') });
  return;
}

const signinEmail = formData.email.trim().toLowerCase();
if (!emailRegex.test(signinEmail)) {
  void showSweetToast({ tone: 'error', message: t('auth.messages.invalidEmailFormat') });
  return;
}

  try {
    const res = await fetch(API_ENDPOINTS.auth.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: signinEmail,
        password: formData.password,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      void showSweetToast({ tone: 'error', message: translateApiError(data, 'auth.messages.loginFailed') });
      return;
    }

    handleAuthSuccess(data);
  } catch (err) {
    console.error(err);
    void showSweetToast({ tone: 'error', message: t('auth.messages.connectionError') });
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
        <ForgotPassword onBack={() => setView('signin')} />
      </div>
    </div>
  );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {isDesktop ? (
        <div className="relative z-[101] w-full max-w-[850px] h-[520px] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden text-gray-900 dark:text-slate-100 ring-1 ring-gray-200 dark:ring-white/10 animate-zoom-in">
          <div
            className={`absolute top-0 bottom-0 left-0 w-1/2 bg-gradient-to-br from-bird-blue to-bird-darkBlue z-20 ${transitionClass}`}
            style={{
              transform: isSignup ? 'translateX(0%)' : 'translateX(100%)',
            }}
          >
            <div className="absolute top-[-20%] -left-[20%] w-60 h-60 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-[-20%] -right-[20%] w-60 h-60 bg-bird-yellow/20 rounded-full blur-3xl pointer-events-none" />
          </div>

          <div
            className={`absolute top-0 left-0 w-1/2 h-full z-30 flex flex-col items-center justify-center text-center px-12 gap-6 ${transitionClass}
             ${isSignup ? 'translate-x-0 opacity-100 pointer-events-auto' : '-translate-x-[20%] opacity-0 pointer-events-none'}`}
          >
            <h2 className="text-4xl font-bold tracking-tight text-white">{t('auth.welcomeBackTitle')}</h2>
            <p className="text-sm text-blue-100/80 leading-relaxed">
              {t('auth.welcomeBackDescription')}
            </p>
            <button onClick={toggleView} className="mt-2 px-10 py-3 rounded-full border border-white/40 bg-white/10 text-white font-semibold hover:bg-white hover:text-bird-blue transition-all duration-300 backdrop-blur-sm">
              {t('auth.actions.signIn')}
            </button>
          </div>

          <div
            className={`absolute top-0 left-1/2 w-1/2 h-full z-10 flex flex-col items-center justify-center px-10 ${transitionClass}
             ${isSignup ? 'translate-x-0 opacity-100 z-10' : 'translate-x-[20%] opacity-0 z-0'}`}
          >
            <h2 className="text-3xl font-bold mb-4 text-bird-blue dark:text-sky-400">{t('auth.createAccountTitle')}</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">{t('auth.registerWithEmail')}</p>
            <form className="w-full flex flex-col gap-2.5" onSubmit={handleSignup}>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                  <input type="text" name="name" maxLength={16} value={formData.name} onChange={handleChange} placeholder={t('auth.fields.firstName')} className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                </div>
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                  <input type="text" name="lastname" maxLength={16} value={formData.lastname} onChange={handleChange} placeholder={t('auth.fields.lastName')} className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                  <input type="text" name="username" maxLength={30} value={formData.username} onChange={handleChange} placeholder={t('auth.fields.username')} className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                </div>
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                  <input type="tel" name="phone_number" maxLength={9} value={formData.phone_number} onChange={handleChange} placeholder="6074-6649" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                <input type="email" name="email" maxLength={254} value={formData.email} onChange={handleChange} placeholder={t('auth.fields.email')} className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                  <PasswordInput maxLength={128}  name="password" value={formData.password} onChange={handleChange} placeholder={t('auth.fields.password')} className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                </div>
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                  <PasswordInput maxLength={128}  name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder={t('auth.fields.confirm')} className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                </div>
              </div>

              {isCaptchaEnabled && (
                <div className="flex justify-center pt-1">
                  <ReCAPTCHA
                    sitekey={recaptchaSiteKey!}
                    hl="en"
                    onChange={(value) => setCaptchaToken(value || null)}
                  />
                </div>
              )}

              <button className="mt-2 w-full py-3 rounded-full bg-bird-yellow text-gray-900 font-bold text-sm tracking-wide shadow-lg shadow-bird-yellow/20 hover:bg-bird-orange hover:scale-[1.02] transition-all duration-300">
                {t('auth.actions.signUp')}
              </button>
            </form>
          </div>

          <div
            className={`absolute top-0 left-1/2 w-1/2 h-full z-30 flex flex-col items-center justify-center text-center px-12 gap-6 ${transitionClass}
             ${!isSignup ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-[20%] opacity-0 pointer-events-none'}`}
          >
            <h2 className="text-4xl font-bold tracking-tight text-white">{t('auth.helloFriendTitle')}</h2>
            <p className="text-sm text-blue-100/80 leading-relaxed">
              {t('auth.helloFriendDescription')}
            </p>
            <button onClick={toggleView} className="mt-2 px-10 py-3 rounded-full border border-white/40 bg-white/10 text-white font-semibold hover:bg-white hover:text-bird-blue transition-all duration-300 backdrop-blur-sm">
              {t('auth.actions.signUp')}
            </button>
          </div>

          <div
            className={`absolute top-0 left-0 w-1/2 h-full z-10 flex flex-col items-center justify-center px-14 ${transitionClass}
             ${!isSignup ? 'translate-x-0 opacity-100 z-10' : '-translate-x-[20%] opacity-0 z-0'}`}
          >
            <h2 className="text-3xl font-bold mb-6 text-bird-blue dark:text-sky-400">{t('auth.signInTitle')}</h2>
            <div className="flex flex-col gap-3 w-full mb-6">
              <GoogleSignInButton onCredential={handleGoogleSignin} />
            </div>

            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">{t('auth.signInWithEmail')}</p>
            <form className="w-full flex flex-col gap-3" onSubmit={handleSignin}>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                <input type="email" name="email" maxLength={254} value={formData.email} onChange={handleChange} placeholder={t('auth.fields.email')} className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                <PasswordInput maxLength={128}  name="password" value={formData.password} onChange={handleChange} placeholder={t('auth.fields.password')} className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
              </div>
              <button type="button" onClick={() => setView('forgot')} className="text-xs text-gray-500 dark:text-slate-400 hover:text-bird-blue transition-colors self-end my-1"> {t('auth.forgotPassword')} </button>
              <button className="w-full py-3.5 rounded-full bg-bird-blue text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-blue/20 hover:bg-bird-darkBlue hover:scale-[1.02] transition-all duration-300">
                {t('auth.actions.signIn')}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="relative z-[101] w-full max-w-[380px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col min-h-[600px] animate-zoom-in">
          <div className="absolute inset-0 pointer-events-none">
            <div className={`absolute top-[-20%] left-[-20%] w-[300px] h-[300px] rounded-full blur-[80px] transition-all duration-700 ${isSignup ? 'bg-bird-yellow/20 translate-x-[50%]' : 'bg-bird-blue/20 translate-x-0'}`} />
            <div className={`absolute bottom-[-10%] right-[-10%] w-[250px] h-[250px] rounded-full blur-[60px] transition-all duration-700 ${isSignup ? 'bg-bird-orange/10' : 'bg-bird-darkBlue/20'}`} />
          </div>

          <div className="relative z-10 flex flex-col h-full p-6 overflow-y-auto custom-scrollbar">
            <div className="w-full h-12 bg-gray-100 dark:bg-slate-800 rounded-full p-1 flex relative mb-6 shrink-0 backdrop-blur-sm border border-gray-200 dark:border-white/10">
              <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full shadow-lg transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isSignup ? 'left-[50%] bg-bird-yellow' : 'left-1 bg-bird-blue'}`} />
              <button onClick={() => setView('signin')} className={`flex-1 relative z-10 text-xs font-bold tracking-wide transition-colors duration-300 flex items-center justify-center ${!isSignup ? 'text-white' : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100'}`}>
                {t('auth.actions.signIn')}
              </button>
              <button onClick={() => setView('signup')} className={`flex-1 relative z-10 text-xs font-bold tracking-wide transition-colors duration-300 flex items-center justify-center ${isSignup ? 'text-gray-900' : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100'}`}>
                {t('auth.actions.signUp')}
              </button>
            </div>

            <div className="flex-1 flex flex-col justify-center transition-all duration-500">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">
                  {isSignup ? t('auth.createAccountTitle') : t('auth.welcomeBackMobileTitle')}
                </h2>
                <p className="text-xs text-gray-600 dark:text-slate-400 px-4">
                  {isSignup ? t('auth.createAccountMobileDescription') : t('auth.signInMobileDescription')}
                </p>
              </div>

              {!isSignup && (
                <div className="flex flex-col gap-3 mb-6">
                  <GoogleSignInButton onCredential={handleGoogleSignin} />
                </div>
              )}

              <div className="relative flex py-2 items-center mb-6">
                <div className="flex-grow border-t border-gray-200 dark:border-white/10"></div>
                <span className="flex-shrink-0 mx-4 text-xs text-gray-500 dark:text-slate-400">{t('auth.continueWithEmail')}</span>
                <div className="flex-grow border-t border-gray-200 dark:border-white/10"></div>
              </div>

              <form className="flex flex-col gap-3" onSubmit={isSignup ? handleSignup : handleSignin}>
                {isSignup && (
                  <div className="animate-fade-in-up space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                        <input type="text" name="name" maxLength={16} value={formData.name} onChange={handleChange} placeholder={t('auth.fields.name')} className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                      </div>
                      <div className="bg-gray-50 dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                        <input type="text" name="lastname" maxLength={16} value={formData.lastname} onChange={handleChange} placeholder={t('auth.fields.surname')} className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                      <input type="text" name="username" maxLength={30} value={formData.username} onChange={handleChange} placeholder={t('auth.fields.username')} className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                      <input type="tel" name="phone_number" maxLength={9} value={formData.phone_number} onChange={handleChange} placeholder="6074-6649" className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                  <input type="email" name="email" maxLength={254} value={formData.email} onChange={handleChange} placeholder={t('auth.fields.emailAddress')} className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="bg-gray-50 dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors">
                    <PasswordInput maxLength={128}  name="password" value={formData.password} onChange={handleChange} placeholder={t('auth.fields.password')} className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                  </div>
                  {isSignup && (
                    <div className="bg-gray-50 dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10 focus-within:border-bird-blue/50 transition-colors animate-fade-in-up">
                      <PasswordInput maxLength={128}  name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder={t('auth.fields.confirmPassword')} className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-100 outline-none placeholder-gray-500 dark:placeholder-slate-400" />
                    </div>
                  )}
                </div>

                {isSignup && isCaptchaEnabled && (
                  <div className="flex justify-center pt-2">
                    <ReCAPTCHA
                      sitekey={recaptchaSiteKey!}
                      hl="en"
                      onChange={(value) => setCaptchaToken(value || null)}
                    />
                  </div>
                )}

                {!isSignup && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setView('forgot')} className="text-xs text-gray-500 dark:text-slate-400 hover:text-bird-blue transition-colors self-end my-1"> {t('auth.forgotPassword')}</button>
                  </div>
                )}

                <button className={`mt-4 w-full py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all duration-300 ${isSignup ? 'bg-gradient-to-r from-bird-yellow to-bird-orange text-gray-900 shadow-bird-yellow/20' : 'bg-gradient-to-r from-bird-blue to-bird-darkBlue text-white shadow-bird-blue/20'}`}>
                  {isSignup ? t('auth.createAccountTitle') : t('auth.signInButton')}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
