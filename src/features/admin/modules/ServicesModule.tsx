import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { DollarSign, Image as ImageIcon, Plus, Trash2, Upload } from 'lucide-react';
import { adminApi } from '../api/adminApi';
import { AdminCard, AdminNumberInput, DataTable, EmptyState, FormSection, Skeleton, StatusBadge } from '../components/AdminUI';
import { showSweetAlert, showSweetConfirm, showSweetToast } from '../../../utils/sweetAlert';
import { getAuthUser } from '../../../utils/session';
import { adminErrorMessage, adminServiceDescription, adminServiceName, useAdminT } from '../adminI18n';

type Service = {
  id_service: number;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: number;
  min_budget: number | null;
  max_budget: number | null;
  request_count: number;
  worker_count: number;
  card_count: number;
  completed_count: number;
  cancelled_count: number;
  paid_volume: number;
  last_request_at: string | null;
};

type ServiceForm = {
  name: string;
  description: string;
  icon: string;
  min_budget: string;
  max_budget: string;
};

const emptyForm: ServiceForm = {
  name: '',
  description: '',
  icon: '',
  min_budget: '25',
  max_budget: '500',
};
const SERVICE_ICON_OPTIONS = [
  { value: '🧰', label: 'General repair' },
  { value: '🔧', label: 'Tools' },
  { value: '🧹', label: 'Cleaning' },
  { value: '🌿', label: 'Garden' },
  { value: '⚡', label: 'Electrical' },
  { value: '🚰', label: 'Plumbing' },
  { value: '🎨', label: 'Painting' },
  { value: '🧱', label: 'Construction' },
  { value: '🔥', label: 'Gas' },
  { value: '❄️', label: 'AC / cooling' },
  { value: '🔐', label: 'Security' },
  { value: '🤝', label: 'Assistance' },
] as const;
const SERVICE_ICON_OPTIONS_CLEAN = [
  { value: '🧰', labelKey: 'services.iconOptions.generalRepair' },
  { value: '🔧', labelKey: 'services.iconOptions.tools' },
  { value: '🧹', labelKey: 'services.iconOptions.cleaning' },
  { value: '🌿', labelKey: 'services.iconOptions.garden' },
  { value: '⚡', labelKey: 'services.iconOptions.electrical' },
  { value: '🚰', labelKey: 'services.iconOptions.plumbing' },
  { value: '🎨', labelKey: 'services.iconOptions.painting' },
  { value: '🧱', labelKey: 'services.iconOptions.construction' },
  { value: '🔥', labelKey: 'services.iconOptions.gas' },
  { value: '❄️', labelKey: 'services.iconOptions.acCooling' },
  { value: '🔐', labelKey: 'services.iconOptions.security' },
  { value: '🤝', labelKey: 'services.iconOptions.assistance' },
] as const;
const SERVICES_CONFIRM_BUILD_MARKER = 'services-sweet-confirm-v2';
const serviceNameRegex = /^[\p{L}\s]+$/u;
const serviceDescriptionRegex = /^[\p{L}\s]+$/u;

const getErrorMessage = (reason: unknown, fallback: string) =>
  reason instanceof Error ? reason.message : fallback;

const sanitizeServiceNameInput = (value: string) => value.replace(/[^\p{L}\s]/gu, '');
const sanitizeServiceDescriptionInput = (value: string) => value.replace(/[^\p{L}\s]/gu, '');
const isImageIcon = (value: string) => /^https?:\/\//i.test(value) || value.startsWith('/uploads/');

const ServiceIconPreview = ({ value }: { value?: string | null }) => {
  const icon = String(value || '').trim();
  if (!icon) return <ImageIcon size={18} />;
  if (isImageIcon(icon)) return <img src={icon} alt="" className="h-6 w-6 rounded-md object-cover" />;
  return <span className="text-xl leading-none">{icon}</span>;
};

export default function ServicesModule() {
  const { t, lang } = useAdminT();
  const [rows, setRows] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const isRootAdmin = getAuthUser('admin')?.rol === 'root';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await adminApi.get<{ services: Service[] }>(adminApi.endpoints.services);
      setRows(payload.services || []);
    } catch (reason) {
      const message = adminErrorMessage(reason, t('services.saveError'), t);
      setError(message);
      showSweetAlert({ tone: 'error', title: t('services.saveErrorTitle'), message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const save = async () => {
    const serviceName = form.name.trim();

    if (!serviceName) {
      showSweetAlert({
        tone: 'warning',
        title: t('services.serviceNameRequired'),
        message: t('services.serviceNameRequiredMessage'),
      });
      return;
    }

    if (!serviceNameRegex.test(serviceName)) {
      showSweetAlert({
        tone: 'warning',
        title: t('services.invalidName'),
        message: t('services.lettersOnly'),
      });
      return;
    }

    const serviceDescription = form.description.trim();
    if (serviceDescription && !serviceDescriptionRegex.test(serviceDescription)) {
      showSweetAlert({
        tone: 'warning',
        title: t('services.invalidDescription'),
        message: t('services.lettersOnly'),
      });
      return;
    }

    const minBudget = Number(form.min_budget);
    const maxBudget = Number(form.max_budget);
    if (!Number.isFinite(minBudget) || !Number.isFinite(maxBudget) || minBudget < 1 || maxBudget < minBudget) {
      showSweetAlert({
        tone: 'warning',
        title: t('services.budgetRequired'),
        message: t('services.budgetRequiredMessage'),
      });
      return;
    }

    setSaving(true);
    setError('');
    try {
      const body = {
        name: serviceName,
        description: serviceDescription,
        icon: form.icon.trim(),
        min_budget: minBudget,
        max_budget: maxBudget,
      };

      if (editing) {
        await adminApi.put(`${adminApi.endpoints.services}/${editing.id_service}`, body);
      } else {
        await adminApi.post(adminApi.endpoints.services, body);
      }

      reset();
      await load();
      showSweetToast({
        tone: 'success',
        title: editing ? t('services.serviceUpdated') : t('services.serviceCreated'),
        message: t('services.catalogSaved'),
      });
    } catch (reason) {
      const message = adminErrorMessage(reason, t('services.saveError'), t);
      setError(message);
      showSweetAlert({ tone: 'error', title: t('services.saveErrorTitle'), message });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (service: Service) => {
    const isActive = Boolean(service.is_active);
    const confirmed = isActive
      ? await showSweetConfirm({
          tone: 'warning',
          title: t('services.deactivateQuestion'),
          message: t('services.deactivateMessage', { name: service.name, count: service.worker_count }),
          confirmText: t('services.deactivateService'),
          cancelText: t('services.keepActive'),
          destructive: true,
        })
      : true;

    if (!confirmed) return;

    try {
      await adminApi.put(`${adminApi.endpoints.services}/${service.id_service}`, {
        is_active: !service.is_active,
      });
      await load();
      showSweetToast({
        tone: 'success',
        title: isActive ? t('services.serviceDeactivated') : t('services.serviceActivated'),
        message: t('services.serviceNowStatus', { name: service.name, status: isActive ? t('common.inactive') : t('common.active') }),
      });
    } catch (reason) {
      const message = adminErrorMessage(reason, t('services.updateError'), t);
      setError(message);
      showSweetAlert({ tone: 'error', title: t('services.updateErrorTitle'), message });
    }
  };

  const remove = async (service: Service) => {
    if (!isRootAdmin) {
      showSweetAlert({
        tone: 'warning',
        title: t('services.rootRequired'),
        message: t('services.rootRequiredMessage'),
        confirmText: t('common.gotIt'),
      });
      return;
    }

    if (service.request_count > 0 || service.worker_count > 0 || service.card_count > 0) {
      showSweetAlert({
        tone: 'warning',
        title: t('services.deactivateInstead'),
        message: t('services.hasAssociations', { name: service.name, workers: service.worker_count, requests: service.request_count, cards: service.card_count }),
        confirmText: t('common.gotIt'),
      });
      return;
    }

    const confirmed = await showSweetConfirm({
      tone: 'warning',
      title: t('services.deleteQuestion'),
      message: t('services.deleteMessage', { name: service.name }),
      confirmText: t('services.deleteService'),
      cancelText: t('services.keepService'),
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await adminApi.delete(`${adminApi.endpoints.services}/${service.id_service}`);
      if (editing?.id_service === service.id_service) reset();
      await load();
      showSweetToast({
        tone: 'success',
        title: t('services.serviceDeleted'),
        message: t('services.serviceDeletedMessage', { name: service.name }),
      });
    } catch (reason) {
      const message = adminErrorMessage(reason, t('services.deleteError'), t);
      setError(message);
      showSweetAlert({ tone: 'error', title: t('services.deleteErrorTitle'), message });
    }
  };

  const edit = (service: Service) => {
    setEditing(service);
    setForm({
      name: service.name,
      description: service.description || '',
      icon: service.icon || '',
      min_budget: String(service.min_budget ?? 25),
      max_budget: String(service.max_budget ?? 500),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const uploadCustomIcon = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadingIcon(true);
    try {
      const payload = new FormData();
      payload.append('image', file);
      const response = await adminApi.post<{ image?: string }>(adminApi.endpoints.uploadImageAsset, payload);
      if (!response.image) throw new Error(t('services.uploadNoUrl'));
      setForm((current) => ({ ...current, icon: response.image || '' }));
      showSweetToast({ tone: 'success', title: t('services.iconUploaded'), message: t('services.customIconSelected') });
    } catch (reason) {
      showSweetAlert({
        tone: 'error',
        title: t('services.uploadErrorTitle'),
        message: adminErrorMessage(reason, t('services.uploadErrorMessage'), t),
      });
    } finally {
      setUploadingIcon(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: 'name',
        label: t('services.service'),
        render: (service: Service) => (
          <div className="admin-primary-cell">
            <strong className="inline-flex items-center gap-2"><ServiceIconPreview value={service.icon} />{adminServiceName(service.name, lang)}</strong>
            <span>{service.description ? adminServiceDescription(service.description, lang) : t('services.noDescription')}</span>
          </div>
        ),
      },
      {
        key: 'budget',
        label: t('services.budgetRange'),
        render: (service: Service) => (
          <span className="admin-rating-inline">
            <DollarSign size={14} />
            {Number(service.min_budget ?? 0).toFixed(2)} - {Number(service.max_budget ?? 0).toFixed(2)}
          </span>
        ),
      },
      {
        key: 'requests',
        label: t('nav.requests'),
        render: (service: Service) => <strong>{service.request_count}</strong>,
      },
      {
        key: 'workers',
        label: t('overview.pros'),
        render: (service: Service) => <strong>{service.worker_count}</strong>,
      },
      {
        key: 'completed',
        label: t('common.completed'),
        render: (service: Service) =>
          `${service.completed_count} (${
            service.request_count ? Math.round((service.completed_count / service.request_count) * 100) : 0
          }%)`,
      },
      {
        key: 'volume',
        label: t('services.paidVolume'),
        render: (service: Service) => (
          <span className="admin-rating-inline">
            <DollarSign size={14} />
            {service.paid_volume.toFixed(2)}
          </span>
        ),
      },
      {
        key: 'status',
        label: t('common.status'),
        render: (service: Service) => <StatusBadge status={service.is_active ? 'active' : 'inactive'} />,
      },
      {
        key: 'actions',
        label: t('common.action'),
        render: (service: Service) => (
          <div className="admin-action-row">
            <button
              className="admin-button admin-button--secondary admin-button--small"
              onClick={(event) => {
                event.stopPropagation();
                void toggle(service);
              }}
            >
              {service.is_active ? t('users.deactivate') : t('users.activate')}
            </button>
            <button
              className="admin-button admin-button--danger admin-button--small"
              onClick={(event) => {
                event.stopPropagation();
                void remove(service);
              }}
              title={
                !isRootAdmin
            ? t('services.rootOnlyDelete')
                  : service.request_count > 0 || service.worker_count > 0 || service.card_count > 0
                    ? t('services.deactivateRecommended')
                    : t('services.deleteService')
              }
            >
              <Trash2 size={13} />
            </button>
          </div>
        ),
      },
    ],
    [editing?.id_service, isRootAdmin, t]
  );

  return (
    <div className="admin-page-stack" data-build-marker={SERVICES_CONFIRM_BUILD_MARKER}>
      <AdminCard>
        <div className="admin-section-heading">
          <div>
            <p className="admin-section-title">{editing ? t('services.editService') : t('services.addService')}</p>
            <p className="admin-muted">{t('services.note')}</p>
          </div>
          <Plus />
        </div>

        <FormSection title={t('services.essentialInformation')}>
          <label className="admin-field">
            <span>{t('services.name')}</span>
            <input
              value={form.name}
              maxLength={100}
              onChange={(event) => setForm((current) => ({ ...current, name: sanitizeServiceNameInput(event.target.value) }))}
            />
          </label>
          <label className="admin-field admin-field--wide">
            <span>{t('services.description')}</span>
            <textarea
              value={form.description}
              maxLength={500}
              onChange={(event) => setForm((current) => ({ ...current, description: sanitizeServiceDescriptionInput(event.target.value) }))}
            />
          </label>
          <details className="admin-advanced admin-field--wide">
            <summary>{t('services.advancedPresentation')}</summary>
            <div className="admin-field admin-field--wide">
              <span>{t('services.serviceIcon')}</span>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <label className="admin-field" style={{ marginBottom: 0 }}>
                  <span>{t('services.chooseIcon')}</span>
                  <select
                    value={isImageIcon(form.icon) ? '__custom__' : form.icon}
                    onChange={(event) => {
                      if (event.target.value !== '__custom__') {
                        setForm((current) => ({ ...current, icon: event.target.value }));
                      }
                    }}
                  >
                    <option value="">{t('services.noIcon')}</option>
                    {SERVICE_ICON_OPTIONS_CLEAN.map((icon) => (
                      <option key={icon.value} value={icon.value}>{icon.value} {t(icon.labelKey)}</option>
                    ))}
                    {isImageIcon(form.icon) && <option value="__custom__">{t('services.customUploadedIcon')}</option>}
                  </select>
                </label>
                <label className="admin-button admin-button--secondary inline-flex cursor-pointer items-center justify-center gap-2">
                  <Upload size={15} />
                  <span>{uploadingIcon ? t('services.uploading') : t('services.uploadIcon')}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    disabled={uploadingIcon}
                    onChange={uploadCustomIcon}
                  />
                </label>
              </div>
              <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200">
                <ServiceIconPreview value={form.icon} />
                <span>{form.icon ? t('services.selectedIcon') : t('services.noIconSelected')}</span>
              </div>
            </div>
          </details>
        </FormSection>

        <FormSection title={t('services.budgetLimits')} description={t('services.budgetLimitsNote')}>
          <label className="admin-field">
            <span>{t('services.minBudget')}</span>
            <AdminNumberInput
              value={form.min_budget}
              min={1}
              max={10000}
              decimals={2}
              onChange={(value) => setForm((current) => ({ ...current, min_budget: value }))}
            />
          </label>
          <label className="admin-field">
            <span>{t('services.maxBudget')}</span>
            <AdminNumberInput
              value={form.max_budget}
              min={1}
              max={10000}
              decimals={2}
              onChange={(value) => setForm((current) => ({ ...current, max_budget: value }))}
            />
          </label>
        </FormSection>

        {error && <div className="admin-inline-error">{error}</div>}

        <div className="admin-action-row">
          {editing && (
            <button className="admin-button admin-button--secondary" onClick={reset}>
              {t('common.cancel')}
            </button>
          )}
          <button className="admin-button" disabled={saving} onClick={() => void save()}>
            {saving ? t('common.saving') : editing ? t('services.saveChanges') : t('services.createService')}
          </button>
        </div>
      </AdminCard>

      {loading ? (
        <Skeleton rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('services.emptyTitle')} description={t('services.emptyDescription')} />
      ) : (
        <DataTable rows={rows} rowKey={(service) => service.id_service} onRowClick={edit} columns={columns} />
      )}
    </div>
  );
}
