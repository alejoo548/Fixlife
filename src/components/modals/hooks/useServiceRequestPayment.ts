import { useState } from 'react';
import { API_ENDPOINTS } from '../../../config/api';
import { getToken } from '../../../utils/session';
import type { ServiceRequestHistoryStatus } from './useServiceRequestHistory';

type PaymentMethod = 'card' | 'paypal' | 'cash';

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
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const handleSecurePayment = (request: TRequest) => {
    const token = getToken();
    if (!token) {
      showToast('error', 'Login required.');
      return;
    }

    setPaymentError(null);
    onOpenCheckout?.(request.id_request);
  };

  const fail = (message: string) => {
    setPaymentError(message);
    showToast('error', message);
  };

  const confirmPaymentThroughModal = async () => {
    const token = getToken();
    if (!token || !paymentModalRequest) {
      fail('Login required.');
      return;
    }

    setPaymentError(null);

    if (paymentMethod === 'paypal') {
      fail('PayPal is visible in the demo but not configured yet. Use card checkout for now.');
      return;
    }

    if (paymentMethod === 'cash') {
      setPaymentBusyId(paymentModalRequest.id_request);
      try {
        const checkoutRes = await fetch(API_ENDPOINTS.services.paymentCheckout(paymentModalRequest.id_request), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ payment_method: 'cash' }),
        });
        const checkoutPayload = await checkoutRes.json();
        if (!checkoutRes.ok || !checkoutPayload?.success) {
          fail(checkoutPayload?.error || 'Could not select cash payment.');
          return;
        }

        showToast('success', 'Pagaras en efectivo directamente al profesional. El confirmara el cobro al finalizar.');
        setPaymentModalRequest(null);
        await fetchMyRequests(historyStatus, true);
      } catch {
        fail('Network error selecting cash payment.');
      } finally {
        setPaymentBusyId(null);
      }
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
      fail('Complete all card payment fields first.');
      return;
    }

    setPaymentBusyId(paymentModalRequest.id_request);
    try {
      const checkoutRes = await fetch(API_ENDPOINTS.services.paymentCheckout(paymentModalRequest.id_request), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ payment_method: 'paypal' }),
      });
      const checkoutPayload = await checkoutRes.json();
      if (!checkoutRes.ok || !checkoutPayload?.success) {
        fail(checkoutPayload?.error || 'Could not initialize payment.');
        return;
      }

      const payRes = await fetch(API_ENDPOINTS.services.confirmPayment(paymentModalRequest.id_request), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ payment_method: 'paypal' }),
      });
      const payPayload = await payRes.json();
      if (!payRes.ok || !payPayload?.success) {
        fail(payPayload?.error || 'Could not confirm payment.');
        return;
      }

      showToast('success', 'Payment completed. Final service approval is now available.');
      setPaymentModalRequest(null);
      await fetchMyRequests(historyStatus, true);
    } catch {
      fail('Network error processing payment.');
    } finally {
      setPaymentBusyId(null);
    }
  };

  return {
    confirmPaymentThroughModal,
    handleSecurePayment,
    paymentBusyId,
    paymentError,
    paymentForm,
    paymentMethod,
    paymentModalRequest,
    setPaymentError,
    setPaymentForm,
    setPaymentMethod,
    setPaymentModalRequest,
  };
};
