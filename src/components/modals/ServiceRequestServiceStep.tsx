import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { localizeClientServiceDescription, localizeClientServiceName } from '../../utils/clientTranslations';

interface ServiceOptionCard {
  id_service: number;
  name: string;
  description: string | null;
  icon: string | null;
}

interface ServiceRequestServiceStepProps {
  servicesLoading: boolean;
  services: ServiceOptionCard[];
  onSelectService: (serviceName: string) => void;
}

export function ServiceRequestServiceStep({
  servicesLoading,
  services,
  onSelectService,
}: ServiceRequestServiceStepProps) {
  const { t, i18n } = useTranslation();

  return (
    <motion.div
      key="step0"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="p-6 pb-24"
    >
      <h1 className="mb-1 text-3xl font-black tracking-tight text-slate-900">
        {t('serviceRequest.serviceStep.title')}
      </h1>
      <p className="mb-6 font-medium text-slate-500">{t('serviceRequest.serviceStep.subtitle')}</p>

      {servicesLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-bird-blue/20 border-t-bird-blue" />
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm font-medium text-gray-500">
          {t('serviceRequest.serviceStep.empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((service) => {
            const localizedName = localizeClientServiceName(service.name, i18n.language);
            const localizedDescription = service.description
              ? localizeClientServiceDescription(service.description, i18n.language)
              : null;

            return (
            <motion.button
              key={service.id_service}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectService(service.name)}
              className="flex w-full items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition-all hover:bg-gray-50"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50">
                {service.icon ? (
                  /^(https?:|data:image\/|\/)/i.test(service.icon) ? (
                    <img src={service.icon} alt={localizedName} className="h-6 w-6 object-contain" />
                  ) : (
                    <span className="text-2xl leading-none">
                      {service.icon.length <= 2 ? service.icon : 'FX'}
                    </span>
                  )
                ) : (
                  <div className="h-6 w-6 rounded-full bg-gray-200" />
                )}
              </div>
              <div className="flex flex-1 flex-col">
                <span className="text-[15px] font-bold text-gray-900">{localizedName}</span>
                {localizedDescription && (
                  <span className="line-clamp-1 text-xs font-medium text-slate-500">{localizedDescription}</span>
                )}
              </div>
              <div className="text-gray-300">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </motion.button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
