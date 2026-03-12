import React, { useEffect, useMemo, useRef, useState } from 'react';
import { API_ENDPOINTS } from '../../config/api';
import { Notyf } from 'notyf';
import { motion, AnimatePresence } from 'framer-motion';
import 'notyf/notyf.min.css';

interface RequestsViewProps {
  isOnline: boolean;
  mobileView: 'list' | 'map';
  token: string | null;
}

interface WorkerRequest {
  id_request: number;
  id_service: number;
  service_name: string;
  service_icon: string | null;
  description: string;
  location_text: string;
  latitude: number | null;
  longitude: number | null;
  budget: number;
  request_status: 'open' | 'assigned' | 'in_progress' | 'done' | 'cancelled';
  worker_status: 'new' | 'accepted' | 'rejected' | 'expired';
  distance_km: number | null;
  created_at: string;
  route_url: string | null;
  proposed_budget?: number | null;
  counter_message?: string | null;
}

interface ChatMessage {
  id_message: number;
  id_request: number;
  sender_role: 'client' | 'worker';
  message: string | null;
  image_url: string | null;
  created_at: string;
}

interface WorkerRequestsPayload {
  success: boolean;
  status: string;
  worker_profile?: {
    id_worker_profile: number;
    latitude: number | null;
    longitude: number | null;
  };
  requests: WorkerRequest[];
}

declare global {
  interface Window {
    L?: any;
  }
}

const notyf = new Notyf({ position: { x: 'left', y: 'bottom' }, ripple: true });
const CHAT_POLL_MS = 2000;

export const RequestsView: React.FC<RequestsViewProps> = ({ isOnline, mobileView, token }) => {
  const [statusFilter, setStatusFilter] = useState<'new' | 'accepted' | 'rejected'>('new');
  const [requests, setRequests] = useState<WorkerRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [workerCoords, setWorkerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [chatByRequest, setChatByRequest] = useState<Record<number, ChatMessage[]>>({});
  const [chatTextByRequest, setChatTextByRequest] = useState<Record<number, string>>({});
  const [chatImageByRequest, setChatImageByRequest] = useState<Record<number, File | null>>({});
  const [chatBusyId, setChatBusyId] = useState<number | null>(null);

  // Custom Modal State
  const [counterModalOpen, setCounterModalOpen] = useState(false);
  const [counterTargetId, setCounterTargetId] = useState<number | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterNote, setCounterNote] = useState('');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const mapLayersRef = useRef<any[]>([]);
  const firstLoadRef = useRef(true);
  const knownNewIdsRef = useRef<Set<number>>(new Set());

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id_request === selectedRequestId) || requests[0] || null,
    [requests, selectedRequestId]
  );
  const canUseChatWithClient =
    !!selectedRequest &&
    ['assigned', 'in_progress', 'done'].includes(String(selectedRequest.request_status || '').toLowerCase()) &&
    String(selectedRequest.worker_status || '').toLowerCase() === 'accepted';

  useEffect(() => {
    const loadLeaflet = async () => {
      if (window.L) {
        setLeafletReady(true);
        return;
      }

      const cssId = 'leaflet-css-worker-requests';
      const jsId = 'leaflet-js-worker-requests';

      if (!document.getElementById(cssId)) {
        const link = document.createElement('link');
        link.id = cssId;
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (!document.getElementById(jsId)) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.id = jsId;
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Could not load map library'));
          document.body.appendChild(script);
        });
      }

      if (window.L) setLeafletReady(true);
    };

    loadLeaflet().catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || !window.L || !leafletReady) return;
    if (mapInstanceRef.current) return;

    const L = window.L;
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([14.6349, -90.5069], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapInstanceRef.current = map;
  }, [leafletReady]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    mapLayersRef.current.forEach((layer) => {
      try {
        map.removeLayer(layer);
      } catch {
        // ignore
      }
    });
    mapLayersRef.current = [];

    if (workerCoords) {
      const workerMarker = L.circleMarker([workerCoords.lat, workerCoords.lng], {
        radius: 10,
        color: '#ffffff',
        weight: 3,
        fillColor: '#38bdf8', // bird-blue aesthetic
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup('Your position');
      mapLayersRef.current.push(workerMarker);
    }

    requests.forEach((request) => {
      if (request.latitude == null || request.longitude == null) return;
      const isSelected = request.id_request === selectedRequest?.id_request;
      const marker = L.circleMarker([request.latitude, request.longitude], {
        radius: isSelected ? 10 : 8,
        color: '#ffffff',
        weight: 2,
        fillColor: isSelected ? '#fb923c' : '#0284c7', // sky-600
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup(
          `<b>${request.service_name}</b><br/>$${request.budget.toFixed(2)}<br/>${
            request.distance_km != null ? `${request.distance_km.toFixed(1)} km` : ''
          }`
        );
      marker.on('click', () => setSelectedRequestId(request.id_request));
      mapLayersRef.current.push(marker);
    });

    if (selectedRequest?.latitude != null && selectedRequest.longitude != null) {
      map.setView([selectedRequest.latitude, selectedRequest.longitude], 13);
    } else if (workerCoords) {
      map.setView([workerCoords.lat, workerCoords.lng], 12);
    }
  }, [requests, selectedRequest, workerCoords]);

  const fetchRequests = async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);

    try {
      const url = `${API_ENDPOINTS.worker.requests}?status=${statusFilter}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload: WorkerRequestsPayload = await res.json();
      if (!res.ok || !payload?.success) {
        if (!silent) notyf.error((payload as any)?.error || 'Could not load requests.');
        return;
      }

      const data = Array.isArray(payload.requests) ? payload.requests : [];
      setRequests(data);
      if (payload.worker_profile?.latitude != null && payload.worker_profile?.longitude != null) {
        setWorkerCoords({
          lat: Number(payload.worker_profile.latitude),
          lng: Number(payload.worker_profile.longitude),
        });
      }
      if (data.length > 0 && !selectedRequestId) {
        setSelectedRequestId(data[0].id_request);
      }

      if (statusFilter === 'new') {
        const currentIds = new Set(data.map((r) => r.id_request));
        if (!firstLoadRef.current) {
          let freshCount = 0;
          currentIds.forEach((id) => {
            if (!knownNewIdsRef.current.has(id)) freshCount += 1;
          });
          if (freshCount > 0 && isOnline) {
            notyf.success(`${freshCount} new request(s) nearby.`);
          }
        }
        knownNewIdsRef.current = currentIds;
        firstLoadRef.current = false;
      }
    } catch (error) {
      if (!silent) notyf.error('Network error loading requests.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    firstLoadRef.current = true;
    knownNewIdsRef.current = new Set();
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, token]);

  useEffect(() => {
    if (!token) return;
    if (!isOnline) return;
    const interval = window.setInterval(() => {
      fetchRequests(true);
    }, 5000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isOnline, statusFilter]);

  const handleAction = async (idRequest: number, action: 'accept' | 'reject') => {
    if (!token) return;
    setBusyId(idRequest);
    try {
      const endpoint =
        action === 'accept'
          ? API_ENDPOINTS.worker.acceptRequest(idRequest)
          : API_ENDPOINTS.worker.rejectRequest(idRequest);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        notyf.error(payload?.error || `Could not ${action} request.`);
        return;
      }
      notyf.success(action === 'accept' ? 'Request accepted.' : 'Request rejected.');
      await fetchRequests(true);
    } catch {
      notyf.error(`Network error trying to ${action} request.`);
    } finally {
      setBusyId(null);
    }
  };

  const openCounterModal = (idRequest: number, currentBudget: number) => {
    setCounterTargetId(idRequest);
    setCounterAmount(String(Math.max(1, Math.round(currentBudget))));
    setCounterNote('');
    setCounterModalOpen(true);
  };

  const confirmCounterOffer = async () => {
    if (!token || !counterTargetId) return;
    
    const amount = Number(counterAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notyf.error('Invalid amount. Must be greater than 0.');
      return;
    }

    setBusyId(counterTargetId);
    setCounterModalOpen(false); // Close modal while processing

    try {
      const res = await fetch(API_ENDPOINTS.worker.counterOffer(counterTargetId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proposed_budget: amount, counter_message: counterNote }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        notyf.error(payload?.error || 'Could not send counter offer.');
        return;
      }
      notyf.success('Counter offer sent successfully.');
      await fetchRequests(true);
    } catch {
      notyf.error('Network error sending counter offer.');
    } finally {
      setBusyId(null);
      setCounterTargetId(null);
    }
  };

  const pushPresence = async (isOnlineNow: boolean, lat?: number, lng?: number) => {
    if (!token) return;
    try {
      setPresenceBusy(true);
      await fetch(API_ENDPOINTS.worker.presence, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          is_online: isOnlineNow ? 1 : 0,
          lat,
          lng,
        }),
      });
    } catch {
      // silent
    } finally {
      setPresenceBusy(false);
    }
  };

  const fetchRequestChat = async (idRequest: number, silent = false) => {
    if (!token) return;
    try {
      const res = await fetch(API_ENDPOINTS.services.requestChat(idRequest), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        if (!silent) notyf.error(payload?.error || 'Could not load chat.');
        return;
      }
      const nextChat = Array.isArray(payload.chat) ? payload.chat : [];
      setChatByRequest((prev) => {
        const currentChat = prev[idRequest] || [];
        const currentLastId = currentChat[currentChat.length - 1]?.id_message ?? null;
        const nextLastId = nextChat[nextChat.length - 1]?.id_message ?? null;

        if (currentChat.length === nextChat.length && currentLastId === nextLastId) {
          return prev;
        }

        return { ...prev, [idRequest]: nextChat };
      });
    } catch {
      if (!silent) notyf.error('Network error loading chat.');
    }
  };

  const sendChat = async (idRequest: number) => {
    if (!token) return;
    const text = (chatTextByRequest[idRequest] || '').trim();
    const image = chatImageByRequest[idRequest] || null;
    if (!text && !image) return;

    setChatBusyId(idRequest);
    try {
      const form = new FormData();
      if (text) form.append('message', text);
      if (image) form.append('chat_images', image);

      const res = await fetch(API_ENDPOINTS.services.requestChat(idRequest), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        notyf.error(payload?.error || 'Could not send message.');
        return;
      }
      setChatTextByRequest((prev) => ({ ...prev, [idRequest]: '' }));
      setChatImageByRequest((prev) => ({ ...prev, [idRequest]: null }));
      await fetchRequestChat(idRequest, true);
    } catch {
      notyf.error('Network error sending chat message.');
    } finally {
      setChatBusyId(null);
    }
  };

  useEffect(() => {
    if (!token) return;

    if (!isOnline) {
      pushPresence(false);
      return;
    }

    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(7));
          const lng = Number(pos.coords.longitude.toFixed(7));
          setWorkerCoords({ lat, lng });
          pushPresence(true, lat, lng);
        },
        () => {
          pushPresence(true);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    } else {
      pushPresence(true);
    }

    return () => {
      if (watchId != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isOnline]);

  useEffect(() => {
    if (!selectedRequest?.id_request) return;
    if (!canUseChatWithClient) return;
    fetchRequestChat(selectedRequest.id_request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRequest?.id_request, token, canUseChatWithClient]);

  useEffect(() => {
    if (!selectedRequest?.id_request) return;
    if (!canUseChatWithClient) return;

    const interval = window.setInterval(() => {
      void fetchRequestChat(selectedRequest.id_request, true);
    }, CHAT_POLL_MS);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRequest?.id_request, token, canUseChatWithClient]);

  return (
    <>
      {/* Background Fullscreen Map */}
      <div className={`absolute inset-0 z-0 bg-gray-100`}>
        <div ref={mapContainerRef} className="absolute inset-0 z-0" />
        {!leafletReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm z-[500]">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow flex items-center gap-3">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-4 h-4 border-2 border-bird-blue border-r-transparent rounded-full" />
              Loading map...
            </div>
          </div>
        )}
      </div>

      <motion.div
        initial={mobileView === 'list' ? { y: 0 } : { y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={`w-full h-[60vh] mt-auto md:mt-0 md:h-full md:w-[400px] lg:w-[450px] flex flex-col bg-white/95 backdrop-blur-lg relative z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] md:shadow-2xl overflow-hidden rounded-t-[2rem] md:rounded-none md:border-r border-gray-200 ${
          mobileView === 'map' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Mobile Drag Handle */}
        <div className="w-full flex justify-center pt-4 pb-0 md:hidden bg-white/95">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        <div className="p-4 border-b border-gray-200 bg-white/95">
          <div className="grid grid-cols-3 gap-2">
            {(['new', 'accepted', 'rejected'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`py-2 px-2 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
                  statusFilter === tab
                    ? 'bg-bird-blue text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-500 font-semibold">
            {isOnline ? `Live updates every 5s${presenceBusy ? ' · syncing location...' : ''}` : 'Set ONLINE to receive live updates'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 pb-20 md:pb-4">
          {loading ? (
            <div className="text-center text-sm text-gray-500 font-semibold py-10">Loading requests...</div>
          ) : requests.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-70">
              <h3 className="text-lg font-bold text-gray-900 mb-2">No requests in this tab</h3>
              <p className="text-sm text-gray-600">Try another tab or keep online for new requests.</p>
            </div>
          ) : (
            requests.map((req) => {
              const selected = req.id_request === selectedRequest?.id_request;
              return (
                <button
                  key={req.id_request}
                  onClick={() => setSelectedRequestId(req.id_request)}
                  className={`w-full text-left rounded-2xl p-4 border transition shadow-sm ${
                    selected
                      ? 'border-bird-blue bg-bird-blue/5'
                      : 'border-gray-200 bg-white hover:border-bird-orange/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 text-base truncate">
                        {req.service_icon || '🧰'} {req.service_name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {req.distance_km != null ? `${req.distance_km.toFixed(1)} km` : 'No distance'}
                      </p>
                    </div>
                    <span className="font-black text-bird-orange text-lg">${req.budget.toFixed(0)}</span>
                  </div>

                  <p className="text-sm text-gray-700 mt-2 line-clamp-2">{req.description}</p>
                  <p className="text-xs text-gray-500 mt-2 truncate">{req.location_text}</p>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {statusFilter === 'new' ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(req.id_request, 'reject');
                          }}
                          disabled={busyId === req.id_request}
                          className="py-2 rounded-lg bg-gray-100 text-gray-700 font-bold text-xs hover:bg-gray-200 disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openCounterModal(req.id_request, req.budget);
                          }}
                          disabled={busyId === req.id_request}
                          className="py-2 rounded-lg bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 disabled:opacity-50 transition-colors"
                        >
                          Counter
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(req.id_request, 'accept');
                          }}
                          disabled={busyId === req.id_request}
                          className="py-2 rounded-lg bg-bird-blue text-white font-bold text-xs hover:bg-bird-darkBlue disabled:opacity-50"
                        >
                          Accept
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (req.route_url) window.open(req.route_url, '_blank', 'noopener,noreferrer');
                        }}
                        className="col-span-3 py-2 rounded-lg bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 disabled:opacity-50"
                        disabled={!req.route_url}
                      >
                        View Route
                      </button>
                    )}
                  </div>
                  {req.proposed_budget != null && (
                    <p className="text-xs text-amber-700 font-semibold mt-2">
                      Counter offer: ${req.proposed_budget.toFixed(2)}{req.counter_message ? ` · ${req.counter_message}` : ''}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </motion.div>

      <div className={`flex-1 relative overflow-hidden pointer-events-none ${mobileView === 'map' ? 'block' : 'hidden md:block'}`}>

        {selectedRequest && (
          <div className="absolute top-4 left-4 z-[500] rounded-xl bg-white/95 border border-gray-200 shadow p-3 w-[320px] max-w-[90%]">
            <p className="text-xs uppercase tracking-wider font-bold text-gray-500">Selected Request</p>
            <h3 className="text-base font-black text-gray-900 mt-1">
              {selectedRequest.service_icon || '🧰'} {selectedRequest.service_name}
            </h3>
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{selectedRequest.description}</p>
            <p className="text-xs text-gray-500 mt-1 truncate">{selectedRequest.location_text}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-lg font-black text-bird-orange">${selectedRequest.budget.toFixed(0)}</span>
              <span className="text-xs font-bold text-gray-600">
                {selectedRequest.distance_km != null ? `${selectedRequest.distance_km.toFixed(1)} km` : '--'}
              </span>
            </div>
            <button
              disabled={!selectedRequest.route_url}
              onClick={() => selectedRequest.route_url && window.open(selectedRequest.route_url, '_blank', 'noopener,noreferrer')}
              className="mt-3 w-full py-2 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 disabled:opacity-50"
            >
              Open Route to Client
            </button>

            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
              <p className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-2">Chat with client</p>
              {!canUseChatWithClient && (
                <p className="text-[11px] font-semibold text-amber-700 mb-2">
                  Chat unlocks when you accept this request.
                </p>
              )}
              <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                {(chatByRequest[selectedRequest.id_request] || []).slice(-20).map((msg) => (
                  <div key={msg.id_message} className={`text-[11px] px-2 py-1.5 rounded-md ${msg.sender_role === 'worker' ? 'bg-bird-blue/10' : 'bg-emerald-100/70'}`}>
                    <span className="font-bold mr-1">{msg.sender_role === 'worker' ? 'You:' : 'Client:'}</span>
                    {msg.message || ''}
                    {msg.image_url && (
                      <a href={msg.image_url} target="_blank" rel="noreferrer" className="ml-1 underline font-bold text-bird-blue">
                        image
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <input
                  value={chatTextByRequest[selectedRequest.id_request] || ''}
                  onChange={(e) => setChatTextByRequest((prev) => ({ ...prev, [selectedRequest.id_request]: e.target.value }))}
                  placeholder="Message..."
                  disabled={!canUseChatWithClient}
                  className="px-2 py-1.5 rounded-md border border-gray-200 text-xs"
                />
                <button
                  onClick={() => sendChat(selectedRequest.id_request)}
                  disabled={!canUseChatWithClient || chatBusyId === selectedRequest.id_request}
                  className="px-3 py-1.5 rounded-md bg-bird-blue text-white text-xs font-bold disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={(e) => setChatImageByRequest((prev) => ({ ...prev, [selectedRequest.id_request]: e.target.files?.[0] || null }))}
                disabled={!canUseChatWithClient}
                className="mt-2 text-[10px]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Custom Counter Offer Modal */}
      <AnimatePresence>
        {counterModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-gray-200"
            >
              <h3 className="text-xl font-black text-gray-900 mb-2">Counter Offer</h3>
              <p className="text-sm text-gray-500 mb-6">Propose a new price for this job. The client will review it.</p>
              
              <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-2">New Budget (USD)</label>
              <div className="relative mb-4">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-900 font-bold text-lg">$</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={counterAmount}
                  onChange={(e) => setCounterAmount(e.target.value)}
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl py-3 pl-10 pr-4 text-gray-900 font-bold focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-2">Note (Optional)</label>
              <textarea
                value={counterNote}
                onChange={(e) => setCounterNote(e.target.value)}
                maxLength={255}
                placeholder="Explain why the price changed..."
                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl py-3 px-4 resize-none h-24 text-sm focus:outline-none focus:border-amber-500 transition-colors mb-6"
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCounterModalOpen(false)}
                  className="py-3 rounded-xl border-2 border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmCounterOffer}
                  className="py-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold shadow-lg shadow-amber-500/30 hover:shadow-xl transition-all"
                >
                  Send Offer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
