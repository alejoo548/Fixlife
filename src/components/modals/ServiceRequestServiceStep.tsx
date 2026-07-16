import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

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

const SERVICE_COPY_ES: Record<string, { name: string; description: string }> = {
    'AC Installation & Repair': {
        name: 'Instalacion y reparacion de A/C',
        description: 'Instalacion, mantenimiento y reparacion de aire acondicionado.',
    },
    'Appliance Repair': {
        name: 'Reparacion de electrodomesticos',
        description: 'Reparacion de lavadoras, secadoras, estufas y aparatos del hogar.',
    },
    'Auto Mechanic': {
        name: 'Mecanica automotriz',
        description: 'Diagnostico, mantenimiento y reparaciones mecanicas para vehiculos.',
    },
    Carpentry: {
        name: 'Carpinteria',
        description: 'Madera a medida, reparacion de muebles e instalacion de puertas y ventanas.',
    },
    'Childcare / Babysitting': {
        name: 'Cuidado de ninos / Ninera',
        description: 'Cuidado seguro y confiable para ninos en casa.',
    },
    'Computer Technician': {
        name: 'Tecnico de computadoras',
        description: 'Solucion de problemas, configuracion de software y reparacion de hardware.',
    },
    'Drywall Installation': {
        name: 'Instalacion de tablaroca',
        description: 'Montaje, resane y acabado de paredes de tablaroca.',
    },
    'Elderly Care': {
        name: 'Cuidado de adultos mayores',
        description: 'Compania y apoyo basico para personas mayores.',
    },
    'Electrical Services': {
        name: 'Servicios electricos',
        description: 'Cableado, enchufes, iluminacion y diagnostico electrico.',
    },
    Gardening: {
        name: 'Jardineria',
        description: 'Cuidado del jardin, siembra, poda y mantenimiento.',
    },
    'Home Cleaning': {
        name: 'Limpieza del hogar',
        description: 'Limpieza profunda y mantenimiento regular del hogar.',
    },
    'House Painting': {
        name: 'Pintura residencial',
        description: 'Pintura interior y exterior con acabado limpio y profesional.',
    },
    'Locksmith Services': {
        name: 'Servicios de cerrajeria',
        description: 'Instalacion de cerraduras, duplicado de llaves y aperturas de emergencia.',
    },
    Masonry: {
        name: 'Mamposteria',
        description: 'Trabajo en ladrillo, reparaciones de concreto y mejoras estructurales.',
    },
    Plumbing: {
        name: 'Plomeria',
        description: 'Reparacion de fugas, instalacion de tuberias y destape de drenajes.',
    },
    'Refrigeration Repair': {
        name: 'Reparacion de refrigeracion',
        description: 'Reparacion y mantenimiento para refrigeradores y sistemas de enfriamiento.',
    },
    'Security Camera Installation': {
        name: 'Instalacion de camaras de seguridad',
        description: 'Instalacion de CCTV, configuracion y orientacion basica de monitoreo.',
    },
    Welding: {
        name: 'Soldadura',
        description: 'Fabricacion metalica, reparaciones y trabajos de soldadura a medida.',
    },
};

export function ServiceRequestServiceStep({
    servicesLoading,
    services,
    onSelectService,
}: ServiceRequestServiceStepProps) {
    const { t, i18n } = useTranslation();
    const currentLanguage = i18n.resolvedLanguage || i18n.language || 'en';
    const isSpanish = currentLanguage.startsWith('es');

    const localizeService = (name: string, description: string | null) => {
        if (!isSpanish) return { name, description };
        const match = SERVICE_COPY_ES[name];
        if (!match) return { name, description };
        return { name: match.name, description: match.description };
    };

    return (
        <motion.div
            key="step0"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-6 pb-24"
        >
            <h1 className="mb-1 text-3xl font-black tracking-tight text-slate-900">{t('serviceRequest.serviceStep.title')}</h1>
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
                        const localized = localizeService(service.name, service.description);

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
                                            <img src={service.icon} alt={localized.name} className="h-6 w-6 object-contain" />
                                        ) : (
                                            <span className="text-2xl leading-none">{service.icon.length <= 2 ? service.icon : 'FX'}</span>
                                        )
                                    ) : (
                                        <div className="h-6 w-6 rounded-full bg-gray-200" />
                                    )}
                                </div>
                                <div className="flex flex-1 flex-col">
                                    <span className="text-[15px] font-bold text-gray-900">{localized.name}</span>
                                    {localized.description && (
                                        <span className="line-clamp-1 text-xs font-medium text-slate-500">{localized.description}</span>
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
