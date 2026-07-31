import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ImagePlus, Send, ShieldAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_ENDPOINTS } from '../../config/api';
import { getToken } from '../../utils/session';
import { showSweetAlert, showSweetToast } from '../../utils/sweetAlert';

type ReporterRole = 'client' | 'worker';

interface ReportReason {
  value: string;
  label: string;
}

interface ServiceReportModalProps {
  open: boolean;
  idRequest: number | null;
  reporterRole: ReporterRole;
  counterpartName?: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
}

const CLIENT_REASON_VALUES = [
  'matching_issue',
  'no_show',
  'late',
  'not_responding',
  'unsafe',
  'unprofessional',
  'wrong_person',
  'payment_issue',
  'quality_issue',
  'damage',
  'other',
];

const WORKER_REASON_VALUES = [
  'client_not_available',
  'not_responding',
  'unsafe',
  'wrong_details',
  'scope_changed',
  'payment_issue',
  'unprofessional',
  'other',
];

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ServiceReportModal: React.FC<ServiceReportModalProps> = ({
  open,
  idRequest,
  reporterRole,
  counterpartName,
  onClose,
  onSubmitted,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reasons: ReportReason[] = useMemo(() => {
    const values = reporterRole === 'client' ? CLIENT_REASON_VALUES : WORKER_REASON_VALUES;
    const namespace = reporterRole === 'client' ? 'serviceReport.clientReasons' : 'serviceReport.workerReasons';
    return values.map((value) => ({ value, label: t(`${namespace}.${value}`) }));
  }, [reporterRole, t]);
  const [reason, setReason] = useState(reasons[0].value);
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const imagePreview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);

  React.useEffect(
    () => () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    },
    [imagePreview]
  );

  React.useEffect(() => {
    if (!open) return;
    setReason(reasons[0].value);
    setDescription('');
    setImage(null);
  }, [open, reporterRole]);

  if (!open || !idRequest) return null;

  const selectImage = (file: File | null) => {
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type)) {
      void showSweetToast({ tone: 'error', message: t('serviceReport.errors.invalidImageType') });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      void showSweetToast({ tone: 'error', message: t('serviceReport.errors.imageTooLarge') });
      return;
    }
    setImage(file);
  };

  const submit = async () => {
    const token = getToken(reporterRole);
    const cleanDescription = description.trim();
    if (!token) {
      void showSweetToast({ tone: 'error', message: t('serviceReport.errors.signInAgain') });
      return;
    }
    if (cleanDescription.length < 12) {
      void showSweetToast({ tone: 'error', message: t('serviceReport.errors.descriptionTooShort') });
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append('reason', reason);
      form.append('description', cleanDescription);
      if (image) form.append('report_images', image);

      const response = await fetch(API_ENDPOINTS.services.reportRequest(idRequest), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        void showSweetToast({ tone: 'error', message: payload?.error || t('serviceReport.errors.submitError') });
        return;
      }
      onClose();
      onSubmitted?.();
      await showSweetAlert({
        title: t('serviceReport.submittedTitle'),
        message: t('serviceReport.submittedMessage'),
        tone: 'success',
        confirmText: t('common.gotIt'),
      });
    } catch {
      void showSweetToast({ tone: 'error', message: t('serviceReport.errors.networkError') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10060] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-t-[30px] border border-slate-200 bg-white shadow-2xl sm:rounded-[30px]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-950 px-5 py-5 text-white">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-300">{t('serviceReport.eyebrow')}</p>
            <h3 className="mt-1 text-2xl font-black">
              {reporterRole === 'client' ? t('serviceReport.titleClient') : t('serviceReport.titleWorker')}
            </h3>
            <p className="mt-2 text-sm font-semibold leading-5 text-slate-300">
              {counterpartName ? t('serviceReport.subtitleWithName', { name: counterpartName }) : t('serviceReport.subtitleGeneric')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex gap-2">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <p className="text-xs font-bold leading-5 text-amber-900">
                {t('serviceReport.emergencyNotice')}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {reasons.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setReason(item.value)}
                className={`rounded-2xl border px-3 py-3 text-left text-sm font-black transition ${
                  reason === item.value
                    ? 'border-bird-blue bg-sky-50 text-slate-950'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="mt-5 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
            {t('serviceReport.whatHappened')}
          </label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, 1000))}
            placeholder={t('serviceReport.descriptionPlaceholder')}
            className="mt-2 min-h-[130px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold leading-6 text-slate-700 outline-none transition focus:border-bird-blue focus:ring-2 focus:ring-sky-100"
          />
          <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-400">
            <span>{t('serviceReport.minChars')}</span>
            <span>{description.length}/1000</span>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              selectImage(event.target.files?.[0] || null);
              event.target.value = '';
            }}
          />
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3">
            {imagePreview && image ? (
              <div className="flex items-center gap-3">
                <img src={imagePreview} alt={t('serviceReport.evidencePreviewAlt')} className="h-16 w-16 rounded-2xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-800">{image.name}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">{(image.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button type="button" onClick={() => setImage(null)} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-red-600">
                  {t('serviceReport.remove')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-100"
              >
                <ImagePlus className="h-4 w-4 text-bird-blue" />
                {t('serviceReport.attachEvidence')}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 bg-white p-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {t('serviceReport.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || description.trim().length < 12}
            className="flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-[0_16px_30px_rgba(220,38,38,0.2)] transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <AlertTriangle className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
            {t('serviceReport.submit')}
          </button>
        </div>
      </div>
    </div>
  );
};
