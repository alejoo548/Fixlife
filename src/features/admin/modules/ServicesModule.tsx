import { useCallback, useEffect, useMemo, useState } from 'react';
import { DollarSign, Plus, Trash2 } from 'lucide-react';
import { adminApi } from '../api/adminApi';
import { AdminCard, DataTable, EmptyState, FormSection, Skeleton, StatusBadge } from '../components/AdminUI';
import { showSweetAlert, showSweetConfirm, showSweetToast } from '../../../utils/sweetAlert';

type Service = {
  id_service: number;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: number;
  request_count: number;
  completed_count: number;
  cancelled_count: number;
  paid_volume: number;
  last_request_at: string | null;
};

type ServiceForm = {
  name: string;
  description: string;
  icon: string;
};

const emptyForm: ServiceForm = {
  name: '',
  description: '',
  icon: '',
};
const SERVICES_CONFIRM_BUILD_MARKER = 'services-sweet-confirm-v2';

const getErrorMessage = (reason: unknown, fallback: string) =>
  reason instanceof Error ? reason.message : fallback;

export default function ServicesModule() {
  const [rows, setRows] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await adminApi.get<{ services: Service[] }>(adminApi.endpoints.services);
      setRows(payload.services || []);
    } catch (reason) {
      const message = getErrorMessage(reason, 'Could not load services.');
      setError(message);
      showSweetAlert({ tone: 'error', title: 'Could not load services', message });
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
    if (!form.name.trim()) {
      showSweetAlert({
        tone: 'warning',
        title: 'Service name required',
        message: 'Add a clear service name before saving this category.',
      });
      return;
    }

    setSaving(true);
    setError('');
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim(),
        icon: form.icon.trim(),
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
        title: editing ? 'Service updated' : 'Service created',
        message: 'The service catalog was saved.',
      });
    } catch (reason) {
      const message = getErrorMessage(reason, 'Could not save service.');
      setError(message);
      showSweetAlert({ tone: 'error', title: 'Could not save service', message });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (service: Service) => {
    const isActive = Boolean(service.is_active);
    const confirmed = isActive
      ? await showSweetConfirm({
          tone: 'warning',
          title: 'Deactivate service?',
          message: `"${service.name}" will stop appearing as an available category, but its request history stays intact.`,
          confirmText: 'Deactivate service',
          cancelText: 'Keep active',
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
        title: isActive ? 'Service deactivated' : 'Service activated',
        message: `"${service.name}" is now ${isActive ? 'inactive' : 'active'}.`,
      });
    } catch (reason) {
      const message = getErrorMessage(reason, 'Could not update service.');
      setError(message);
      showSweetAlert({ tone: 'error', title: 'Could not update service', message });
    }
  };

  const remove = async (service: Service) => {
    if (service.request_count > 0) {
      showSweetAlert({
        tone: 'warning',
        title: 'Deactivate instead',
        message: `"${service.name}" has request history, so it cannot be deleted safely. Deactivate it to hide it from new requests.`,
        confirmText: 'Got it',
      });
      return;
    }

    const confirmed = await showSweetConfirm({
      tone: 'warning',
      title: 'Delete service?',
      message: `"${service.name}" will be permanently removed from the catalog.`,
      confirmText: 'Delete service',
      cancelText: 'Keep service',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await adminApi.delete(`${adminApi.endpoints.services}/${service.id_service}`);
      if (editing?.id_service === service.id_service) reset();
      await load();
      showSweetToast({
        tone: 'success',
        title: 'Service deleted',
        message: `"${service.name}" was removed from the catalog.`,
      });
    } catch (reason) {
      const message = getErrorMessage(reason, 'Could not delete service.');
      setError(message);
      showSweetAlert({ tone: 'error', title: 'Could not delete service', message });
    }
  };

  const edit = (service: Service) => {
    setEditing(service);
    setForm({
      name: service.name,
      description: service.description || '',
      icon: service.icon || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const columns = useMemo(
    () => [
      {
        key: 'name',
        label: 'Service',
        render: (service: Service) => (
          <div className="admin-primary-cell">
            <strong>{service.name}</strong>
            <span>{service.description || 'No description'}</span>
          </div>
        ),
      },
      {
        key: 'requests',
        label: 'Requests',
        render: (service: Service) => <strong>{service.request_count}</strong>,
      },
      {
        key: 'completed',
        label: 'Completed',
        render: (service: Service) =>
          `${service.completed_count} (${
            service.request_count ? Math.round((service.completed_count / service.request_count) * 100) : 0
          }%)`,
      },
      {
        key: 'volume',
        label: 'Paid volume',
        render: (service: Service) => (
          <span className="admin-rating-inline">
            <DollarSign size={14} />
            {service.paid_volume.toFixed(2)}
          </span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        render: (service: Service) => <StatusBadge status={service.is_active ? 'active' : 'inactive'} />,
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (service: Service) => (
          <div className="admin-action-row">
            <button
              className="admin-button admin-button--secondary admin-button--small"
              onClick={(event) => {
                event.stopPropagation();
                void toggle(service);
              }}
            >
              {service.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <button
              className="admin-button admin-button--danger admin-button--small"
              onClick={(event) => {
                event.stopPropagation();
                void remove(service);
              }}
              title={service.request_count > 0 ? 'Services with request history should be deactivated.' : 'Delete service'}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ),
      },
    ],
    [editing?.id_service]
  );

  return (
    <div className="admin-page-stack" data-build-marker={SERVICES_CONFIRM_BUILD_MARKER}>
      <AdminCard>
        <div className="admin-section-heading">
          <div>
            <p className="admin-section-title">{editing ? 'Edit service' : 'Add service'}</p>
            <p className="admin-muted">Operational category. Historical services should be deactivated, not deleted.</p>
          </div>
          <Plus />
        </div>

        <FormSection title="Essential information">
          <label className="admin-field">
            <span>Name</span>
            <input
              value={form.name}
              maxLength={100}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="admin-field admin-field--wide">
            <span>Description</span>
            <textarea
              value={form.description}
              maxLength={500}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <details className="admin-advanced admin-field--wide">
            <summary>Advanced presentation</summary>
            <label className="admin-field">
              <span>Icon value</span>
              <input
                value={form.icon}
                maxLength={100}
                onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))}
              />
            </label>
          </details>
        </FormSection>

        {error && <div className="admin-inline-error">{error}</div>}

        <div className="admin-action-row">
          {editing && (
            <button className="admin-button admin-button--secondary" onClick={reset}>
              Cancel
            </button>
          )}
          <button className="admin-button" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Create service'}
          </button>
        </div>
      </AdminCard>

      {loading ? (
        <Skeleton rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState title="No services" description="Create first service category." />
      ) : (
        <DataTable rows={rows} rowKey={(service) => service.id_service} onRowClick={edit} columns={columns} />
      )}
    </div>
  );
}
