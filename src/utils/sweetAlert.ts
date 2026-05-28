import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

type AlertTone = 'warning' | 'error' | 'success' | 'info';

export const showSweetAlert = (input: {
  title: string;
  message: string;
  tone?: AlertTone;
  confirmText?: string;
}) =>
  Swal.fire({
    icon: input.tone || 'info',
    title: input.title,
    text: input.message,
    confirmButtonText: input.confirmText || 'Got it',
    buttonsStyling: false,
    customClass: {
      popup: 'rounded-[28px] border border-slate-200 px-5 pb-6 pt-7 shadow-2xl',
      title: 'text-2xl font-black text-slate-950',
      htmlContainer: 'text-sm font-semibold leading-6 text-slate-600',
      confirmButton:
        'rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:bg-black',
    },
  });

