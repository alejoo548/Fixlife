import { useCallback, useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../config/api';
import { getToken } from '../utils/session';

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

export type PushSupportState = 'unsupported' | 'default' | 'granted' | 'denied';

export function usePushNotifications() {
  const [status, setStatus] = useState<PushSupportState>('default');
  const [subscribing, setSubscribing] = useState(false);

  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  useEffect(() => {
    if (!supported) {
      setStatus('unsupported');
      return;
    }
    setStatus(Notification.permission as PushSupportState);
  }, [supported]);

  const refreshSubscriptionStatus = useCallback(async () => {
    if (!supported) return false;
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    return Boolean(subscription);
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) return false;
    setSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      setStatus(permission as PushSupportState);
      if (permission !== 'granted') return false;

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const keyRes = await fetch(API_ENDPOINTS.notifications.pushPublicKey, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const keyPayload = await keyRes.json();
      if (!keyRes.ok || !keyPayload?.public_key) return false;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyPayload.public_key),
        });
      }

      const json = subscription.toJSON();
      await fetch(API_ENDPOINTS.notifications.pushSubscribe, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });

      return true;
    } catch {
      return false;
    } finally {
      setSubscribing(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await fetch(API_ENDPOINTS.notifications.pushUnsubscribe, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ endpoint }),
    });
  }, [supported]);

  return { supported, status, subscribing, subscribe, unsubscribe, refreshSubscriptionStatus };
}
