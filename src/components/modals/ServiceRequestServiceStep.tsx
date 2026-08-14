import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { localizeClientServiceDescription, localizeClientServiceName } from '../../utils/clientTranslations';
import { normalizeImageUrl } from '../../utils/imageUrls';

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
            <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 mb-1 tracking-tight">{t('serviceRequest.serviceStep.title')}</h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium mb-6">{t('serviceRequest.serviceStep.subtitle')}</p>

            {servicesLoading ? (
                <div className="flex justify-center py-8">
                    <div className="h-6 w-6 rounded-full border-2 border-bird-blue/20 border-t-bird-blue animate-spin" />
                </div>
            ) : services.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 px-4 py-6 text-center text-sm font-medium text-gray-500 dark:text-slate-400">
                    {t('serviceRequest.serviceStep.empty')}
                </div>
            ) : (
                <div className="space-y-3">
                    {services.map((cat) => {
                        const localizedName = localizeClientServiceName(cat.name, i18n.language);
                        const localizedDescription = cat.description
                            ? localizeClientServiceDescription(cat.description, i18n.language)
                            : null;

                        return (
                        <motion.button
                            key={cat.id_service}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => onSelectService(cat.name)}
                            className="w-full flex items-center p-4 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm transition-all gap-4 text-left"
                        >
                            <div className="w-12 h-12 rounded-xl bg-gray-50 dark:bg-slate-700 flex items-center justify-center shrink-0 border border-gray-100 dark:border-white/10">
                                {cat.icon ? (
                                    /^(https?:|data:image\/|\/)/i.test(cat.icon) ? (
                                        <img src={normalizeImageUrl(cat.icon)} alt={localizedName} className="w-6 h-6 object-contain" />
                                    ) : (
                                        <span className="text-2xl leading-none">
                                            {cat.icon.length <= 3 ? cat.icon : '🧰'}
                                        </span>
                                    )
                                ) : (
                                    <div className="w-6 h-6 bg-gray-200 dark:bg-slate-600 rounded-full" />
                                )}
                            </div>
                            <div className="flex flex-col flex-1">
                                <span className="font-bold text-gray-900 dark:text-slate-100 text-[15px]">{localizedName}</span>
                                {localizedDescription && <span className="text-xs font-medium text-slate-500 dark:text-slate-400 line-clamp-1">{localizedDescription}</span>}
                            </div>
                            <div className="text-gray-300 dark:text-slate-500">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
