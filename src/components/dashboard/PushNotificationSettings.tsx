import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff } from 'lucide-react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { showSweetToast } from '../../utils/sweetAlert';

export const PushNotificationSettings: React.FC = () => {
  const { t } = useTranslation();
  const { supported, status, subscribing, subscribe, unsubscribe, refreshSubscriptionStatus } = usePushNotifications();
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    refreshSubscriptionStatus().then(setIsSubscribed);
  }, [refreshSubscriptionStatus]);

  if (!supported) return null;

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
      setIsSubscribed(false);
      return;
    }
    const ok = await subscribe();
    setIsSubscribed(ok);
    if (!ok && status === 'denied') {
      void showSweetToast({ tone: 'error', message: t('workerDashboard.settings.pushDeniedHelp') });
    }
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-50 text-bird-blue dark:bg-sky-400/10">
            {isSubscribed ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </span>
          <div>
            <h3 className="text-base font-black text-gray-900 dark:text-slate-100">
              {t('workerDashboard.settings.pushTitle')}
            </h3>
            <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">
              {isSubscribed
                ? t('workerDashboard.settings.pushEnabledHelp')
                : t('workerDashboard.settings.pushDisabledHelp')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleToggle()}
          disabled={subscribing}
          className={`shrink-0 rounded-2xl px-4 py-2.5 text-sm font-black transition disabled:opacity-60 ${
            isSubscribed
              ? 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200'
              : 'bg-bird-blue text-white hover:bg-bird-darkBlue'
          }`}
        >
          {subscribing
            ? t('workerDashboard.settings.pushWorking')
            : isSubscribed
              ? t('workerDashboard.settings.pushDisable')
              : t('workerDashboard.settings.pushEnable')}
        </button>
      </div>
    </div>
  );
};
