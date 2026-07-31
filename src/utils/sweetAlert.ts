import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import i18n from '../i18n';

type AlertTone = 'warning' | 'error' | 'success' | 'info';

export const showSweetAlert = (input: {
  title: string;
  message: string;
  html?: string;
  tone?: AlertTone;
  confirmText?: string;
}) =>
  Swal.fire({
    icon: input.tone || 'info',
    title: input.title,
    text: input.html ? undefined : input.message,
    html: input.html,
    confirmButtonText: input.confirmText || i18n.t('common.gotIt'),
    buttonsStyling: false,
    customClass: {
      popup: 'rounded-[28px] border border-slate-200 px-5 pb-6 pt-7 shadow-2xl',
      title: 'text-2xl font-black text-slate-950',
      htmlContainer: 'text-sm font-semibold leading-6 text-slate-600',
      confirmButton:
        'rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:bg-black',
    },
  });

export const showSweetConfirm = async (input: {
  title: string;
  message: string;
  tone?: AlertTone;
  confirmText: string;
  cancelText?: string;
  destructive?: boolean;
}) => {
  const result = await Swal.fire({
    icon: input.tone || 'warning',
    title: input.title,
    text: input.message,
    showCancelButton: true,
    confirmButtonText: input.confirmText,
    cancelButtonText: input.cancelText || i18n.t('common.goBack'),
    reverseButtons: true,
    focusCancel: true,
    buttonsStyling: false,
    customClass: {
      popup: 'rounded-[28px] border border-slate-200 px-5 pb-6 pt-7 shadow-2xl',
      title: 'text-2xl font-black text-slate-950',
      htmlContainer: 'text-sm font-semibold leading-6 text-slate-600',
      actions: 'mt-6 flex w-full gap-3 px-3',
      cancelButton:
        'flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50',
      confirmButton: input.destructive
        ? 'flex-1 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:bg-red-700'
        : 'flex-1 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:bg-black',
    },
  });

  return result.isConfirmed;
};

export const showSweetToast = (input: {
  title?: string;
  message: string;
  tone?: AlertTone;
  duration?: number;
}) =>
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: input.tone || 'info',
    title: input.title || input.message,
    text: input.title ? input.message : undefined,
    showConfirmButton: false,
    timer: input.duration || 2600,
    timerProgressBar: true,
    buttonsStyling: false,
    customClass: {
      popup: 'rounded-2xl border border-slate-200 px-4 py-3 shadow-2xl',
      title: 'text-sm font-black text-slate-950',
      htmlContainer: 'text-xs font-semibold text-slate-600',
    },
  });
