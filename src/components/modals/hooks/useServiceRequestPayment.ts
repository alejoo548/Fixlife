import { useState } from 'react';
import { API_ENDPOINTS } from '../../../config/api';
import { getToken } from '../../../utils/session';
import type { ServiceRequestHistoryStatus } from './useServiceRequestHistory';

type PaymentMethod = 'card' | 'paypal';

type PaymentForm = {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
};

interface PaymentRequestLike {
  id_request: number;
}

interface UseServiceRequestPaymentOptions {
  fetchMyRequests: (status?: ServiceRequestHistoryStatus, silent?: boolean) => Promise<void>;
  historyStatus: ServiceRequestHistoryStatus;
  onOpenCheckout?: (requestId: number) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

const initialPaymentForm: PaymentForm = {
  fullName: '',
  email: '',
  phone: '',
  city: '',
  country: 'Guatemala',
  cardNumber: '',
  expiry: '',
  cvv: '',
};

export const useServiceRequestPayment = <TRequest extends PaymentRequestLike>({
  fetchMyRequests,
  historyStatus,
  onOpenCheckout,
  showToast,
}: UseServiceRequestPaymentOptions) => {
  const [paymentModalRequest, setPaymentModalRequest] = useState<TRequest | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(initialPaymentForm);
  const [paymentBusyId, setPaymentBusyId] = useState<number | null>(null);

  const handleSecurePayment = (request: TRequest) => {
    const token = getToken();
    if (!token) {
      showToast('error', 'Login required.');
      return;
    }

    onOpenCheckout?.(request.id_request);
  };

  const confirmPaymentThroughModal = async () => {
    const token = getToken();
    if (!token || !paymentModalRequest) {
      showToast('error', 'Login required.');
      return;
    }

    if (paymentMethod === 'paypal') {
      showToast('error', 'PayPal is visible in the demo but not configured yet. Use card checkout for now.');
      return;
    }

    if (
      !paymentForm.fullName.trim() ||
      !paymentForm.email.trim() ||
      !paymentForm.phone.trim() ||
      !paymentForm.city.trim() ||
      !paymentForm.country.trim() ||
      !paymentForm.cardNumber.trim() ||
      !paymentForm.expiry.trim() ||
      !paymentForm.cvv.trim()
    ) {
      showToast('error', 'Complete all card payment fields first.');
      return;
    }

    setPaymentBusyId(paymentModalRequest.id_request);
    try {
      const checkoutRes = await fetch(API_ENDPOINTS.services.paymentCheckout(paymentModalRequest.id_request), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const checkoutPayload = await checkoutRes.json();
      if (!checkoutRes.ok || !checkoutPayload?.success) {
        showToast('error', checkoutPayload?.error || 'Could not initialize payment.');
        return;
      }

      const payRes = await fetch(API_ENDPOINTS.services.confirmPayment(paymentModalRequest.id_request), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payPayload = await payRes.json();
      if (!payRes.ok || !payPayload?.success) {
        showToast('error', payPayload?.error || 'Could not confirm payment.');
        return;
      }

      showToast('success', 'Payment secured. Your pro can now start the job.');
      setPaymentModalRequest(null);
      await fetchMyRequests(historyStatus, true);
    } catch {
      showToast('error', 'Network error processing payment.');
    } finally {
      setPaymentBusyId(null);
    }
  };

  return {
    confirmPaymentThroughModal,
    handleSecurePayment,
    paymentBusyId,
    paymentForm,
    paymentMethod,
    paymentModalRequest,
    setPaymentForm,
    setPaymentMethod,
    setPaymentModalRequest,
  };
};
