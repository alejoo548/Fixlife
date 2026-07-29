import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

type NearbyWorkerPreview = {
  id_worker_profile: number;
  name: string;
  bio: string;
  distance_km: number | null;
};

interface ServiceRequestProblemSectionProps {
  description: string;
  price: string;
  problemFilesCount: number;
  problemPreviewUrls: string[];
  nearbyWorkers: NearbyWorkerPreview[];
  noNearbyProsNotice: string;
  canSearchPros: boolean;
  canSubmitRequest: boolean;
  isSubmittingRequest: boolean;
  isAuthenticated: boolean;
  showBudget?: boolean;
  showResults?: boolean;
  showActions?: boolean;
  onDescriptionChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onPricePaste: (value: string) => void;
  onProblemFilesChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveProblemImage: (index: number) => void;
  onFindPro: () => void;
  onSubmitRequest: () => void;
}

export function ServiceRequestProblemSection({
  description,
  price,
  problemFilesCount,
  problemPreviewUrls,
  nearbyWorkers,
  noNearbyProsNotice,
  canSearchPros,
  canSubmitRequest,
  isSubmittingRequest,
  isAuthenticated,
  showBudget = true,
  showResults = true,
  showActions = true,
  onDescriptionChange,
  onPriceChange,
  onPricePaste,
  onProblemFilesChange,
  onRemoveProblemImage,
  onFindPro,
  onSubmitRequest,
}: ServiceRequestProblemSectionProps) {
  const { t } = useTranslation();

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <label className="mb-2 block text-sm font-bold text-gray-700">{t('serviceRequest.problem.title')}</label>
        <textarea
          className="h-32 w-full resize-none rounded-xl border-none bg-gray-100 p-4 text-gray-900 transition-all placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          placeholder={t('serviceRequest.problem.placeholder')}
          value={description}
          maxLength={1000}
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-sm font-bold text-slate-900">{t('serviceRequest.problem.images')}</label>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{problemFilesCount}/5</span>
        </div>
        <label className="block cursor-pointer">
          <div className="group w-full rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center transition-all duration-200 hover:border-slate-300 hover:bg-slate-100">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-slate-100 bg-white shadow-sm transition-transform group-hover:scale-110">
              <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div className="text-[15px] font-bold text-slate-900">{t('serviceRequest.problem.uploadPhotos')}</div>
            <div className="mt-1 text-[13px] text-slate-500">{t('serviceRequest.problem.imageTypes')}</div>
          </div>
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={onProblemFilesChange}
            className="hidden"
          />
        </label>

        {problemPreviewUrls.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {problemPreviewUrls.map((url, index) => (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                key={url}
                className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 shadow-sm"
              >
                <img src={url} alt={`Problem ${index + 1}`} className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      onRemoveProblemImage(index);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-red-500"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {showBudget && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <label className="mb-2 block text-sm font-bold text-slate-900">{t('serviceRequest.problem.budget')}</label>
          <div className="group relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400 transition-colors group-focus-within:text-slate-900">$</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              maxLength={7}
              aria-describedby="request-budget-help"
              className="w-full rounded-xl border-2 border-transparent bg-slate-50 py-4 pl-10 pr-16 text-lg font-bold text-slate-900 outline-none transition-all placeholder-slate-300 shadow-sm focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              value={price}
              onChange={(event) => onPriceChange(event.target.value)}
              onKeyDown={(event) => {
                if (['-', '+', 'e', 'E'].includes(event.key)) event.preventDefault();
              }}
              onPaste={(event) => {
                event.preventDefault();
                onPricePaste(event.clipboardData.getData('text'));
              }}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md border border-slate-100 bg-white px-2 py-1 text-sm font-bold text-slate-400 shadow-sm">USD</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p id="request-budget-help" className="text-xs font-semibold text-slate-500">
              {t('serviceRequest.problem.suggested')} <span className="text-slate-700">$40 - $80</span> · {t('serviceRequest.problem.maximum')} $1,000.00
            </p>
          </div>
        </motion.div>
      )}

      {showResults && nearbyWorkers.length > 0 && (
        <div className="mt-4 rounded-xl border border-gray-100 bg-white p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            {t('serviceRequest.problem.nearbyWorkers')}
          </p>
          <div className="space-y-2">
            {nearbyWorkers.slice(0, 5).map((worker) => (
              <div key={worker.id_worker_profile} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-slate-800">{worker.name}</p>
                  <p className="truncate text-xs text-gray-500">{worker.bio || t('serviceRequest.problem.availableNow')}</p>
                </div>
                <span className="text-xs font-bold text-emerald-700">
                  {worker.distance_km != null ? `${worker.distance_km.toFixed(1)} km` : '--'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showResults && noNearbyProsNotice && nearbyWorkers.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"
        >
          <p className="text-sm font-black text-amber-900">{t('serviceRequest.problem.noNearbyTitle')}</p>
          <p className="mt-1 text-sm font-semibold text-amber-800">{noNearbyProsNotice}</p>
        </motion.div>
      )}

      {showActions && (
        <div className="sticky bottom-0 z-10 mt-6 space-y-3 bg-gradient-to-t from-white via-white to-transparent pb-2 pt-4">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={onFindPro}
            disabled={!canSearchPros}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-slate-900 py-4 text-[15px] font-bold text-white shadow-lg shadow-slate-900/20 transition-all hover:bg-black disabled:opacity-50 disabled:hover:bg-slate-900"
          >
            <span>{t('serviceRequest.problem.findPro')}</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={onSubmitRequest}
            disabled={!canSubmitRequest}
            className="w-full rounded-xl border-2 border-slate-200 bg-white py-4 text-[15px] font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:bg-white disabled:opacity-50"
          >
            {!isAuthenticated
              ? t('serviceRequest.problem.loginRequired')
              : isSubmittingRequest
                ? t('serviceRequest.problem.submitting')
                : t('serviceRequest.problem.submitRequest')}
          </motion.button>
        </div>
      )}
    </>
  );
}
