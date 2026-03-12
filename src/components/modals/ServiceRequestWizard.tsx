import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ServiceRequestData } from '../../types';
import { API_ENDPOINTS } from '../../config/api';
import { getAuthUser, getToken, isAuthenticated } from '../../utils/session';
import { Notyf } from 'notyf';
import 'notyf/notyf.min.css';

interface ServiceRequestWizardProps {
    isOpen: boolean;
    onClose: () => void;
    initialServiceId?: number;
    initialServiceName?: string;
}

interface ServiceOption {
    id_service: number;
    name: string;
    description: string | null;
    icon: string | null;
}

interface NearbyWorker {
    id_user: number;
    id_worker_profile: number;
    name: string;
    bio: string;
    profile_image: string | null;
    latitude?: number | null;
    longitude?: number | null;
    distance_km: number | null;
}

interface MyServiceRequest {
    id_request: number;
    id_service: number;
    service_name: string;
    description: string;
    location_text: string;
    initial_budget?: number | null;
    budget: number;
    final_budget?: number | null;
    radius_km: number;
    status: 'pending' | 'assigned' | 'in_progress' | 'done' | 'cancelled' | string;
    created_at: string;
    assigned_worker: { id_worker_profile: number; name: string } | null;
    proposed_budget?: number | null;
    counter_message?: string | null;
    counter_status?: 'pending' | 'accepted' | 'declined' | null;
    images: { file_name: string; url: string }[];
}

interface ChatMessage {
    id_message: number;
    id_request: number;
    sender_role: 'client' | 'worker';
    message: string | null;
    image_url: string | null;
    created_at: string;
}

const notyf = new Notyf({ position: { x: 'left', y: 'bottom' }, ripple: true });
const CHAT_POLL_MS = 2000;

declare global {
    interface Window {
        L?: any;
    }
}

const RECENT_LOCATIONS = [
    { id: 1, name: "Home", address: "123 Main Street, Apt 4B", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { id: 2, name: "Office", address: "Tech Hub, 5th Floor", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
];

export const ServiceRequestWizard: React.FC<ServiceRequestWizardProps> = ({ isOpen, onClose, initialServiceId, initialServiceName }) => {
    const [step, setStep] = useState(initialServiceId ? 1 : 0);
    const [services, setServices] = useState<ServiceOption[]>([]);
    const [servicesLoading, setServicesLoading] = useState(false);
    const [data, setData] = useState<ServiceRequestData>({
        category: initialServiceName || '',
        description: '',
        location: '',
        price: '',
        images: []
    });
    const [isSearching, setIsSearching] = useState(false);
    const [problemFiles, setProblemFiles] = useState<File[]>([]);
    const [problemPreviewUrls, setProblemPreviewUrls] = useState<string[]>([]);
    const [geoLoading, setGeoLoading] = useState(false);
    const [geoError, setGeoError] = useState<string | null>(null);
    const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [nearbyWorkers, setNearbyWorkers] = useState<NearbyWorker[]>([]);
    const [radiusKm, setRadiusKm] = useState<number>(8);
    const [leafletReady, setLeafletReady] = useState(false);
    const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
    const [myRequests, setMyRequests] = useState<MyServiceRequest[]>([]);
    const [historyStatus, setHistoryStatus] = useState<'all' | 'pending' | 'assigned' | 'in_progress' | 'done' | 'cancelled'>('all');
    const [historyLoading, setHistoryLoading] = useState(false);
    const [counterBusyId, setCounterBusyId] = useState<number | null>(null);
    const [openChatRequestId, setOpenChatRequestId] = useState<number | null>(null);
    const [chatByRequest, setChatByRequest] = useState<Record<number, ChatMessage[]>>({});
    const [chatMessage, setChatMessage] = useState<Record<number, string>>({});
    const [chatImage, setChatImage] = useState<Record<number, File | null>>({});
    const [chatBusyId, setChatBusyId] = useState<number | null>(null);
    const [ratingBusyId, setRatingBusyId] = useState<number | null>(null);
    const [ratingForm, setRatingForm] = useState<Record<number, { punctuality: number; quality: number; price_fairness: number; comment: string }>>({});
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<any>(null);
    const mapMarkersRef = useRef<any[]>([]);
    const lastToastRef = useRef<{ type: 'success' | 'error'; message: string; at: number } | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        setStep(initialServiceId ? 1 : 0);
        setData((prev) => ({
            ...prev,
            category: initialServiceName || '',
        }));
        setGeoError(null);
        setNearbyWorkers([]);
        setRadiusKm(8);
    }, [isOpen, initialServiceId, initialServiceName]);

    const fetchMyRequests = async (status: 'all' | 'pending' | 'assigned' | 'in_progress' | 'done' | 'cancelled' = historyStatus) => {
        const token = getToken();
        if (!token) {
            setMyRequests([]);
            return;
        }
        try {
            setHistoryLoading(true);
            const res = await fetch(`${API_ENDPOINTS.services.myRequests}?status=${status}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                return;
            }
            setMyRequests(Array.isArray(payload.requests) ? payload.requests : []);
        } catch {
            // silent
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        fetchMyRequests(historyStatus);
    }, [isOpen, historyStatus]);

    useEffect(() => {
        const urls = problemFiles.map((file) => URL.createObjectURL(file));
        setProblemPreviewUrls(urls);
        setData((prev) => ({ ...prev, images: urls }));

        return () => {
            urls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [problemFiles]);

    useEffect(() => {
        const fetchServices = async () => {
            setServicesLoading(true);
            try {
                const res = await fetch(API_ENDPOINTS.services.getActive);
                const payload = await res.json();
                if (payload?.success && Array.isArray(payload.services)) {
                    setServices(payload.services);
                }
            } catch (error) {
                console.error('Could not fetch services for wizard:', error);
            } finally {
                setServicesLoading(false);
            }
        };

        fetchServices();
    }, []);

    useEffect(() => {
        const loadLeaflet = async () => {
            if (window.L) {
                setLeafletReady(true);
                return;
            }

            const cssId = 'leaflet-css-cdn';
            const jsId = 'leaflet-js-cdn';

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
        if (!isOpen || !mapContainerRef.current || !window.L || !leafletReady) return;
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
    }, [isOpen, leafletReady]);

    useEffect(() => {
        if (isOpen) return;
        if (mapInstanceRef.current) {
            try {
                mapInstanceRef.current.remove();
            } catch {
                // ignore map cleanup errors
            }
            mapInstanceRef.current = null;
            mapMarkersRef.current = [];
        }
    }, [isOpen]);

    useEffect(() => {
        if (!mapInstanceRef.current || !window.L) return;
        const L = window.L;
        const map = mapInstanceRef.current;

        mapMarkersRef.current.forEach((m) => {
            try {
                map.removeLayer(m);
            } catch {
                // ignore
            }
        });
        mapMarkersRef.current = [];

        const center = currentCoords || { lat: 14.6349, lng: -90.5069 };
        map.setView([center.lat, center.lng], currentCoords ? 14 : 12);

        if (currentCoords) {
            const me = L.circleMarker([currentCoords.lat, currentCoords.lng], {
                radius: 10,
                color: '#ffffff',
                weight: 3,
                fillColor: '#38bdf8', /* sky-400 equivalent for bird-blue aesthetic */
                fillOpacity: 1,
            }).addTo(map).bindPopup('You are here');
            mapMarkersRef.current.push(me);

            const radius = L.circle([currentCoords.lat, currentCoords.lng], {
                radius: radiusKm * 1000,
                color: '#3b82f6',
                weight: 1,
                fillColor: '#3b82f6',
                fillOpacity: 0.05,
            }).addTo(map);
            mapMarkersRef.current.push(radius);
        }

        nearbyWorkers.forEach((worker) => {
            const lat = worker.latitude;
            const lng = worker.longitude;
            if (typeof lat !== 'number' || typeof lng !== 'number') return;

            const marker = L.circleMarker([lat, lng], {
                radius: 8,
                color: '#ffffff',
                weight: 2,
                fillColor: '#0284c7', /* sky-600 */
                fillOpacity: 1,
            }).addTo(map).bindPopup(
                `<b>${worker.name}</b><br/>${worker.distance_km != null ? `${worker.distance_km.toFixed(1)} km` : ''}`
            );

            mapMarkersRef.current.push(marker);
        });
    }, [currentCoords, nearbyWorkers, radiusKm]);

    const selectedServiceTitle = useMemo(() => {
        if (!data.category) return null;
        const found = services.find((svc) => svc.name === data.category);
        return found?.name || data.category;
    }, [data.category, services]);

    if (!isOpen) return null;

    const getColorClass = (color: string) => {
        const colors: Record<string, string> = {
            blue: 'group-hover:bg-bird-blue',
            yellow: 'group-hover:bg-bird-yellow',
            orange: 'group-hover:bg-bird-orange',
            green: 'group-hover:bg-green-500'
        };
        return colors[color] || colors.blue;
    };

    const showToast = (type: 'success' | 'error', message: string) => {
        const now = Date.now();
        const last = lastToastRef.current;
        if (last && last.type === type && last.message === message && now - last.at < 900) {
            return;
        }
        lastToastRef.current = { type, message, at: now };
        if (type === 'success') notyf.success(message);
        else notyf.error(message);
    };

    const handleProblemFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
        const incoming = Array.from(event.target.files || []);
        if (incoming.length === 0) return;

        const allowedMime = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
        const valid: File[] = [];

        for (const file of incoming) {
            if (!allowedMime.has(file.type)) {
                showToast('error', `Invalid file: ${file.name}. Only PNG/JPG/WEBP.`);
                continue;
            }
            if (file.size > 8 * 1024 * 1024) {
                showToast('error', `Image too large: ${file.name} (max 8MB).`);
                continue;
            }
            valid.push(file);
        }

        const totalAfterAdd = problemFiles.length + valid.length;
        if (totalAfterAdd > 5) {
            showToast('error', 'Maximum 5 problem images.');
        } else if (valid.length > 0) {
            showToast('success', `${valid.length} image(s) added.`);
        }

        setProblemFiles((prev) => [...prev, ...valid].slice(0, 5));

        event.target.value = '';
    };

    const removeProblemImage = (index: number) => {
        setProblemFiles((prev) => prev.filter((_, i) => i !== index));
        showToast('success', 'Image removed.');
    };

    const detectCurrentLocation = () => {
        if (!navigator.geolocation) {
            setGeoError('Geolocation is not supported in this browser.');
            showToast('error', 'Geolocation not supported.');
            return;
        }

        setGeoLoading(true);
        setGeoError(null);

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = Number(pos.coords.latitude.toFixed(7));
                const lng = Number(pos.coords.longitude.toFixed(7));
                setCurrentCoords({ lat, lng });
                setData((prev) => ({ ...prev, location: `${lat}, ${lng}` }));
                showToast('success', 'Current location detected.');
                setGeoLoading(false);
            },
            () => {
                setGeoError('Could not access your location. Allow permission and try again.');
                showToast('error', 'Could not read your location.');
                setGeoLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const fetchNearbyPros = async () => {
        const selectedService = services.find((svc) => svc.name === data.category);
        if (!selectedService?.id_service) {
            showToast('error', 'Select a service first.');
            return;
        }

        if (!currentCoords) {
            showToast('error', 'Use "Detect my location" first.');
            return;
        }

        try {
            const params = new URLSearchParams({
                id_service: String(selectedService.id_service),
                lat: String(currentCoords.lat),
                lng: String(currentCoords.lng),
                radius_km: String(radiusKm),
            });
            const res = await fetch(`${API_ENDPOINTS.services.nearbyWorkers}?${params.toString()}`);
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                showToast('error', payload?.error || 'Could not search nearby workers.');
                return;
            }
            setNearbyWorkers(Array.isArray(payload.workers) ? payload.workers : []);
            showToast('success', 'Nearby workers loaded.');
        } catch {
            showToast('error', 'Network error searching nearby workers.');
        }
    };

    const submitServiceRequest = async () => {
        if (!isAuthenticated() || !getToken() || !getAuthUser()) {
            showToast('error', 'You need an account and active session to create a request.');
            return;
        }

        const selectedService = services.find((svc) => svc.name === data.category);
        if (!selectedService?.id_service) {
            showToast('error', 'Select a service first.');
            return;
        }
        if (!data.location.trim()) {
            showToast('error', 'Location is required.');
            return;
        }
        if (!data.description.trim() || data.description.trim().length < 10) {
            showToast('error', 'Description must have at least 10 characters.');
            return;
        }
        const budgetValue = Number(data.price);
        if (!Number.isFinite(budgetValue) || budgetValue <= 0) {
            showToast('error', 'Budget must be greater than 0.');
            return;
        }
        if (problemFiles.length === 0) {
            showToast('error', 'Add at least one problem image.');
            return;
        }

        try {
            setIsSubmittingRequest(true);
            const form = new FormData();
            form.append('id_service', String(selectedService.id_service));
            form.append('description', data.description.trim());
            form.append('location', data.location.trim());
            form.append('budget', String(budgetValue));
            form.append('radius_km', String(radiusKm));
            if (currentCoords) {
                form.append('lat', String(currentCoords.lat));
                form.append('lng', String(currentCoords.lng));
            }
            problemFiles.forEach((file) => form.append('problem_images', file));

            const token = getToken();
            const res = await fetch(API_ENDPOINTS.services.createRequest, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                body: form,
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                if (res.status === 409 && payload?.id_request) {
                    showToast('error', `You already have an active request (#${payload.id_request}).`);
                    fetchMyRequests(historyStatus);
                    return;
                }
                showToast('error', payload?.error || 'Could not create request.');
                return;
            }

            showToast('success', `Request #${payload.request?.id_request || ''} created successfully.`);
            setProblemFiles([]);
            setData((prev) => ({ ...prev, description: '', price: '', images: [] }));
            fetchMyRequests(historyStatus);
        } catch {
            showToast('error', 'Network error creating request.');
        } finally {
            setIsSubmittingRequest(false);
        }
    };

    const statusBadgeClasses = (statusRaw: string) => {
        const status = String(statusRaw || 'pending').toLowerCase();
        if (status === 'done') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        if (status === 'assigned') return 'bg-blue-100 text-blue-700 border-blue-200';
        if (status === 'in_progress') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
        if (status === 'cancelled') return 'bg-red-100 text-red-700 border-red-200';
        return 'bg-amber-100 text-amber-700 border-amber-200';
    };

    const statusLabel = (statusRaw: string) => {
        const status = String(statusRaw || 'pending').toLowerCase();
        if (status === 'in_progress') return 'In Progress';
        return status.charAt(0).toUpperCase() + status.slice(1);
    };

    const hasPendingCounter = (request: MyServiceRequest) =>
        request.status === 'assigned' &&
        request.proposed_budget != null &&
        (request.counter_status == null || request.counter_status === 'pending');

    const getTimelineProgress = (request: MyServiceRequest) => {
        const status = String(request.status || 'pending').toLowerCase();
        const hasCounter = request.proposed_budget != null;
        const counterAccepted = request.counter_status === 'accepted';

        if (status === 'done') return 6;
        if (status === 'in_progress') return 5;
        if (status === 'cancelled') return 0;
        if (status === 'assigned') {
            if (hasCounter && !counterAccepted) return 2;
            if (counterAccepted) return 3;
            return 3;
        }
        return 0;
    };

    const counterBadge = (request: MyServiceRequest) => {
        if (request.proposed_budget == null) return null;
        if (request.counter_status === 'accepted') {
            return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Counter Accepted</span>;
        }
        if (request.counter_status === 'declined') {
            return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">Counter Declined</span>;
        }
        return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Counter Offer</span>;
    };

    const handleCounterDecision = async (request: MyServiceRequest, decision: 'accept' | 'decline') => {
        const token = getToken();
        if (!token) {
            showToast('error', 'Login required.');
            return;
        }

        setCounterBusyId(request.id_request);
        try {
            const endpoint =
                decision === 'accept'
                    ? API_ENDPOINTS.services.acceptCounter(request.id_request)
                    : API_ENDPOINTS.services.declineCounter(request.id_request);

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                showToast('error', payload?.error || `Could not ${decision} counter offer.`);
                return;
            }

            showToast('success', decision === 'accept' ? 'Counter offer accepted.' : 'Counter offer declined.');
            await fetchMyRequests(historyStatus);
        } catch {
            showToast('error', `Network error trying to ${decision} counter offer.`);
        } finally {
            setCounterBusyId(null);
        }
    };

    const fetchRequestChat = async (idRequest: number, silent = false) => {
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch(API_ENDPOINTS.services.requestChat(idRequest), {
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                if (!silent) {
                    showToast('error', payload?.error || 'Could not load chat.');
                }
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
            if (!silent) {
                showToast('error', 'Network error loading chat.');
            }
        }
    };

    const sendRequestChat = async (idRequest: number) => {
        const token = getToken();
        if (!token) return;
        const text = (chatMessage[idRequest] || '').trim();
        const image = chatImage[idRequest] || null;
        if (!text && !image) {
            showToast('error', 'Write a message or attach an image.');
            return;
        }

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
                showToast('error', payload?.error || 'Could not send message.');
                return;
            }

            setChatMessage((prev) => ({ ...prev, [idRequest]: '' }));
            setChatImage((prev) => ({ ...prev, [idRequest]: null }));
            await fetchRequestChat(idRequest, true);
        } catch {
            showToast('error', 'Network error sending message.');
        } finally {
            setChatBusyId(null);
        }
    };

    useEffect(() => {
        if (!isOpen || !openChatRequestId) return;

        const activeRequest = myRequests.find((request) => request.id_request === openChatRequestId);
        if (!activeRequest) return;

        const requestStatus = String(activeRequest.status || '').toLowerCase();
        const canUseChat =
            !!activeRequest.assigned_worker &&
            ['assigned', 'in_progress', 'done'].includes(requestStatus);

        if (!canUseChat) return;

        const interval = window.setInterval(() => {
            void fetchRequestChat(openChatRequestId, true);
        }, CHAT_POLL_MS);

        return () => window.clearInterval(interval);
    }, [isOpen, openChatRequestId, myRequests]);

    const submitRating = async (request: MyServiceRequest) => {
        const token = getToken();
        if (!token) return;

        const current = ratingForm[request.id_request] || { punctuality: 5, quality: 5, price_fairness: 5, comment: '' };
        setRatingBusyId(request.id_request);
        try {
            const res = await fetch(API_ENDPOINTS.services.requestRating(request.id_request), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(current),
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                showToast('error', payload?.error || 'Could not submit rating.');
                return;
            }
            showToast('success', 'Rating submitted.');
        } catch {
            showToast('error', 'Network error submitting rating.');
        } finally {
            setRatingBusyId(null);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex flex-col md:flex-row font-sans pointer-events-auto bg-black/5"
        >
            {/* Map View Background */}
            <div className="absolute inset-0 z-0 bg-gray-100">
                <div ref={mapContainerRef} className="absolute inset-0 z-0" />
                {!leafletReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm z-[500]">
                        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow flex items-center gap-3">
                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-4 h-4 border-2 border-bird-blue border-r-transparent rounded-full" />
                            Loading map...
                        </div>
                    </div>
                )}
                <div className="absolute top-4 right-4 md:left-[520px] md:top-4 z-[400] rounded-xl bg-white/95 border border-gray-200 shadow-xl px-4 py-3 pointer-events-auto hidden sm:block">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-gray-500">Live Map</p>
                    <p className="text-sm font-bold text-gray-900">
                        {currentCoords ? `Lat ${currentCoords.lat.toFixed(4)}, Lng ${currentCoords.lng.toFixed(4)}` : 'Detect location to center'}
                    </p>
                    <p className="text-xs text-bird-blue font-bold mt-1">
                        {nearbyWorkers.length} nearby pro(s) in {radiusKm} km
                    </p>
                </div>
            </div>

            {/* Sidebar / Bottom Sheet */}
            <motion.div
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="w-full h-[60vh] mt-auto md:mt-0 md:h-full md:w-[450px] lg:w-[500px] flex flex-col bg-white/95 backdrop-blur-lg relative z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] md:shadow-2xl overflow-hidden rounded-t-[2rem] md:rounded-none md:border-r border-gray-200"
            >
                {/* Mobile Drag Handle */}
                <div className="w-full flex justify-center pt-4 pb-0 md:hidden bg-white">
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </div>

                {/* Header */}
                <div className="h-16 md:h-20 flex items-center justify-between px-4 md:px-6 border-b border-gray-200 bg-white shrink-0">
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="flex items-center gap-2 group"
                        onClick={onClose}
                    >
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 group-hover:bg-bird-blue group-hover:text-white transition-all">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </div>
                        <span className="font-bold text-gray-900 text-lg">Fixlife</span>
                    </motion.button>

                    <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Balance</div>
                            <div className="text-sm font-bold text-bird-orange">$120.50</div>
                        </div>
                        <motion.div
                            whileHover={{ scale: 1.1, rotate: 5 }}
                            className="w-10 h-10 rounded-full bg-gradient-to-br from-bird-blue to-bird-darkBlue border-2 border-white shadow-lg cursor-pointer"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                    <AnimatePresence mode="wait">
                        {step === 0 && (
                            <motion.div
                                key="step0"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="p-6 pb-24"
                            >
                                <motion.h1
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-3xl font-bold text-gray-900 mb-2"
                                >
                                    What do you need?
                                </motion.h1>
                                <motion.p
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                    className="text-gray-600 mb-8 text-base"
                                >
                                    Choose a service and we'll find the perfect pro
                                </motion.p>

                                {/* Service Categories */}
                                <div className="grid grid-cols-2 gap-4 mb-8">
                                    {servicesLoading ? (
                                        <div className="col-span-2 text-center text-sm text-gray-500 font-semibold py-8">
                                            Loading services...
                                        </div>
                                    ) : services.length === 0 ? (
                                        <div className="col-span-2 text-center text-sm text-gray-500 font-semibold py-8">
                                            No active services available.
                                        </div>
                                    ) : services.map((cat, i) => (
                                        <motion.button
                                            key={cat.id_service}
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: i * 0.1 }}
                                            whileHover={{ scale: 1.05, y: -5 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => {
                                                setData({ ...data, category: cat.name });
                                                setStep(1);
                                            }}
                                            className="group relative bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 rounded-2xl p-6 hover:border-bird-blue transition-all shadow-sm hover:shadow-xl"
                                        >
                                            <div className={`w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 ${getColorClass(['blue', 'yellow', 'orange', 'green'][i % 4])} group-hover:text-white transition-all mb-4 shadow-sm`}>
                                                <span className="text-2xl">
                                                    {cat.icon && cat.icon.length <= 2 ? cat.icon : '🧰'}
                                                </span>
                                            </div>
                                            <h3 className="font-bold text-gray-900 text-lg mb-1 line-clamp-1">{cat.name}</h3>
                                            <div className="flex items-center justify-between text-sm gap-2">
                                                <span className="text-bird-blue font-bold text-xs uppercase tracking-wide">Available</span>
                                                <span className="text-gray-500 text-xs">Tap to continue</span>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>

                                {/* Recent Locations */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5 }}
                                >
                                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Quick Access</h3>
                                    <div className="space-y-3">
                                        {RECENT_LOCATIONS.map((loc, i) => (
                                            <motion.button
                                                key={loc.id}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.6 + i * 0.1 }}
                                                whileHover={{ x: 5 }}
                                                className="w-full flex items-center gap-4 p-4 rounded-xl bg-gray-50 border border-gray-200 hover:border-bird-blue hover:bg-bird-blue/5 transition-all text-left group"
                                            >
                                                <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 group-hover:bg-bird-blue group-hover:text-white transition-all shrink-0">
                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={loc.icon} />
                                                    </svg>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold text-gray-900">{loc.name}</div>
                                                    <div className="text-xs text-gray-500 truncate">{loc.address}</div>
                                                </div>
                                                <svg className="w-5 h-5 text-gray-400 group-hover:text-bird-blue transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </motion.button>
                                        ))}
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}

                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="p-6 pb-24 h-full flex flex-col"
                            >
                                <motion.button
                                    whileHover={{ x: -5 }}
                                    onClick={() => setStep(0)}
                                    className="text-gray-600 hover:text-gray-900 text-sm font-bold flex items-center gap-2 mb-6 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    Back
                                </motion.button>

                                <motion.h2
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-3xl font-bold text-gray-900 mb-6"
                                >
                                    Tell us more
                                </motion.h2>

                                {selectedServiceTitle && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mb-5 flex items-center justify-between gap-2 rounded-xl border border-bird-blue/20 bg-bird-blue/5 px-4 py-3"
                                    >
                                        <div>
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-bird-blue">Selected Service</p>
                                            <p className="text-sm font-bold text-gray-900">{selectedServiceTitle}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setStep(0)}
                                            className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                                        >
                                            Change
                                        </button>
                                    </motion.div>
                                )}

                                <div className="flex-1 space-y-6">
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 }}
                                    >
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <label className="block text-sm font-bold text-gray-700">Where?</label>
                                            <button
                                                type="button"
                                                onClick={detectCurrentLocation}
                                                disabled={geoLoading}
                                                className="text-xs font-bold px-3 py-1.5 rounded-lg border border-bird-blue/30 bg-bird-blue/10 text-bird-blue hover:bg-bird-blue/20 disabled:opacity-60"
                                            >
                                                {geoLoading ? 'Detecting...' : 'Detect my location'}
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Enter your address or use GPS"
                                            className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-bird-blue transition-all placeholder-gray-400"
                                            value={data.location}
                                            onChange={(e) => setData({ ...data, location: e.target.value })}
                                        />
                                        {geoError && <p className="text-xs text-red-600 mt-2 font-semibold">{geoError}</p>}

                                        <div className="mt-3">
                                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                                                Search radius
                                            </label>
                                            <select
                                                value={radiusKm}
                                                onChange={(e) => setRadiusKm(Number(e.target.value))}
                                                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-bird-blue transition-all"
                                            >
                                                <option value={3}>3 km</option>
                                                <option value={5}>5 km</option>
                                                <option value={8}>8 km</option>
                                                <option value={12}>12 km</option>
                                                <option value={15}>15 km</option>
                                            </select>
                                        </div>
                                    </motion.div>

                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.2 }}
                                    >
                                        <label className="block text-sm font-bold text-gray-700 mb-2">What's the problem?</label>
                                        <textarea
                                            className="w-full h-32 bg-gray-50 border-2 border-gray-200 rounded-xl p-4 text-gray-900 focus:outline-none focus:border-bird-blue transition-all resize-none placeholder-gray-400"
                                            placeholder="Describe what needs fixing..."
                                            value={data.description}
                                            onChange={(e) => setData({ ...data, description: e.target.value })}
                                        />
                                    </motion.div>

                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.25 }}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="block text-sm font-bold text-gray-700">Problem Images (max 5)</label>
                                            <span className="text-xs font-bold text-gray-500">{problemFiles.length}/5</span>
                                        </div>
                                        <label className="block cursor-pointer">
                                            <div className="w-full rounded-2xl border-2 border-dashed border-gray-300 bg-gradient-to-br from-white to-sky-50 hover:from-sky-50 hover:to-blue-50 hover:border-bird-blue transition p-4 text-center">
                                                <div className="text-bird-blue text-3xl font-black leading-none">+</div>
                                                <div className="text-gray-900 font-black mt-1">Dropify Upload Zone</div>
                                                <div className="text-xs text-gray-500">PNG/JPG/WEBP only, up to 5 images</div>
                                                <span className="inline-block mt-2 bg-bird-blue text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow">
                                                    Dropify Select Files
                                                </span>
                                            </div>
                                            <input
                                                type="file"
                                                multiple
                                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                                onChange={handleProblemFiles}
                                                className="hidden"
                                            />
                                        </label>

                                        {problemPreviewUrls.length > 0 && (
                                            <div className="grid grid-cols-3 gap-3 mt-3">
                                                {problemPreviewUrls.map((url, index) => (
                                                    <div key={url} className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                                                        <img src={url} alt={`Problem ${index + 1}`} className="w-full h-20 object-cover" />
                                                        <button
                                                            type="button"
                                                            onClick={() => removeProblemImage(index)}
                                                            className="absolute top-1 right-1 text-[10px] font-bold px-2 py-1 rounded-md bg-black/70 text-white hover:bg-red-600"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </motion.div>

                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 }}
                                    >
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Your budget</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-900 font-bold text-lg">$</span>
                                            <input
                                                type="number"
                                                placeholder="0"
                                                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl py-3 pl-10 pr-16 text-gray-900 font-bold text-lg focus:outline-none focus:border-bird-blue transition-all placeholder-gray-400"
                                                value={data.price}
                                                onChange={(e) => setData({ ...data, price: e.target.value })}
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">USD</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">Suggested: $40 - $80</p>
                                    </motion.div>
                                </div>

                                <motion.button
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={async () => {
                                        setIsSearching(true);
                                        await fetchNearbyPros();
                                        setTimeout(() => setIsSearching(false), 700);
                                    }}
                                    disabled={!data.price || !data.location}
                                    className="w-full mt-6 py-4 rounded-xl bg-gradient-to-r from-bird-blue to-bird-lightBlue text-white font-bold text-lg shadow-xl shadow-bird-blue/30 hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                                >
                                    <span>Find a Pro</span>
                                    <motion.svg
                                        animate={{ x: [0, 5, 0] }}
                                        transition={{ duration: 1.5, repeat: Infinity }}
                                        className="w-5 h-5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </motion.svg>
                                </motion.button>

                                <motion.button
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.45 }}
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={submitServiceRequest}
                                    disabled={isSubmittingRequest || !isAuthenticated() || !data.price || !data.location || problemFiles.length === 0}
                                    className="w-full mt-3 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold text-base shadow-lg shadow-emerald-500/30 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {!isAuthenticated() ? 'Login Required' : isSubmittingRequest ? 'Submitting...' : 'Submit Request'}
                                </motion.button>

                                {nearbyWorkers.length > 0 && (
                                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                                        <p className="text-xs uppercase tracking-wider font-bold text-emerald-700 mb-2">
                                            Nearby workers in range
                                        </p>
                                        <div className="space-y-2">
                                            {nearbyWorkers.slice(0, 5).map((worker) => (
                                                <div key={worker.id_worker_profile} className="flex items-center justify-between rounded-lg bg-white border border-emerald-100 px-3 py-2">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-gray-900 truncate">{worker.name}</p>
                                                        <p className="text-xs text-gray-500 truncate">{worker.bio || 'Available now'}</p>
                                                    </div>
                                                    <span className="text-xs font-bold text-emerald-700">
                                                        {worker.distance_km != null ? `${worker.distance_km.toFixed(1)} km` : '--'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4">
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <p className="text-xs uppercase tracking-wider font-bold text-gray-500">My Request History</p>
                                        <select
                                            value={historyStatus}
                                            onChange={(e) => setHistoryStatus(e.target.value as any)}
                                            className="text-xs font-bold rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5"
                                        >
                                            <option value="all">All</option>
                                            <option value="pending">Pending</option>
                                            <option value="assigned">Assigned</option>
                                            <option value="in_progress">In Progress</option>
                                            <option value="done">Done</option>
                                            <option value="cancelled">Cancelled</option>
                                        </select>
                                    </div>

                                    {historyLoading ? (
                                        <div className="text-sm text-gray-500">Loading history...</div>
                                    ) : myRequests.length === 0 ? (
                                        <div className="text-sm text-gray-500">No requests yet.</div>
                                    ) : (
                                        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                                            {myRequests.map((request) => {
                                                const progress = getTimelineProgress(request);
                                                const timelineSteps = ['Pending', 'Worker matched', 'Counter offer', 'Accepted', 'On the way', 'In progress', 'Done'];
                                                const pendingCounter = hasPendingCounter(request);
                                                const canUseChat = ['assigned', 'in_progress', 'done'].includes(String(request.status || '').toLowerCase()) && !!request.assigned_worker;
                                                const canRate = String(request.status || '').toLowerCase() === 'done';

                                                return (
                                                    <div key={request.id_request} className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3.5 shadow-sm">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-black text-gray-900 truncate">#{request.id_request} - {request.service_name}</p>
                                                                <p className="text-xs text-gray-600 mt-1 line-clamp-2">{request.description}</p>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-1 shrink-0">
                                                                <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${statusBadgeClasses(request.status)}`}>
                                                                    {statusLabel(request.status)}
                                                                </span>
                                                                {counterBadge(request)}
                                                            </div>
                                                        </div>

                                                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                                                            <span>${Number(request.budget || 0).toFixed(2)}</span>
                                                            <span>{new Date(request.created_at).toLocaleString()}</span>
                                                            {request.assigned_worker?.name && <span>Worker: {request.assigned_worker.name}</span>}
                                                        </div>

                                                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                                                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                                                <p className="text-[10px] uppercase font-bold text-slate-500">Initial</p>
                                                                <p className="font-black text-slate-800">${Number(request.initial_budget ?? request.budget ?? 0).toFixed(2)}</p>
                                                            </div>
                                                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5">
                                                                <p className="text-[10px] uppercase font-bold text-amber-700">Counter</p>
                                                                <p className="font-black text-amber-800">
                                                                    {request.proposed_budget != null ? `$${request.proposed_budget.toFixed(2)}` : '--'}
                                                                </p>
                                                            </div>
                                                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                                                                <p className="text-[10px] uppercase font-bold text-emerald-700">Final</p>
                                                                <p className="font-black text-emerald-800">
                                                                    {request.final_budget != null ? `$${request.final_budget.toFixed(2)}` : '--'}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-2.5">
                                                            <div className="flex items-center justify-between gap-1">
                                                                {timelineSteps.map((step, idx) => {
                                                                    const done = idx <= progress;
                                                                    return (
                                                                        <div key={`${request.id_request}-${step}`} className="flex-1 flex flex-col items-center text-center">
                                                                            <span className={`w-2.5 h-2.5 rounded-full ${done ? 'bg-bird-blue' : 'bg-gray-300'}`} />
                                                                            <span className={`mt-1 text-[9px] font-bold leading-tight ${done ? 'text-gray-700' : 'text-gray-400'}`}>
                                                                                {step}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        {request.proposed_budget != null && (
                                                            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                                                                <p className="text-[11px] uppercase tracking-wider font-bold text-amber-700">Counter offer</p>
                                                                <p className="text-sm font-black text-amber-800 mt-1">Counter offer: ${request.proposed_budget.toFixed(2)}</p>
                                                                {request.counter_message && (
                                                                    <p className="text-xs text-amber-900/80 mt-1">Message: {request.counter_message}</p>
                                                                )}

                                                                {pendingCounter && (
                                                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                                                        <button
                                                                            type="button"
                                                                            disabled={counterBusyId === request.id_request}
                                                                            onClick={() => handleCounterDecision(request, 'decline')}
                                                                            className="py-2 rounded-lg bg-white border border-red-200 text-red-600 font-bold text-xs hover:bg-red-50 disabled:opacity-50"
                                                                        >
                                                                            Decline
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={counterBusyId === request.id_request}
                                                                            onClick={() => handleCounterDecision(request, 'accept')}
                                                                            className="py-2 rounded-lg bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 disabled:opacity-50"
                                                                        >
                                                                            Accept Counter
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
                                                            <div className="flex items-center justify-between">
                                                                <p className="text-[11px] uppercase tracking-wider font-bold text-gray-500">Chat</p>
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        if (!canUseChat) return;
                                                                        const open = openChatRequestId === request.id_request;
                                                                        if (open) {
                                                                            setOpenChatRequestId(null);
                                                                        } else {
                                                                            setOpenChatRequestId(request.id_request);
                                                                            await fetchRequestChat(request.id_request);
                                                                        }
                                                                    }}
                                                                    disabled={!canUseChat}
                                                                    className="text-[11px] font-bold px-2 py-1 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {openChatRequestId === request.id_request ? 'Hide Chat' : 'Open Chat'}
                                                                </button>
                                                            </div>
                                                            {!canUseChat && (
                                                                <p className="mt-2 text-[11px] font-semibold text-amber-700">
                                                                    Chat will unlock when a worker accepts this request.
                                                                </p>
                                                            )}

                                                            {openChatRequestId === request.id_request && (
                                                                <div className="mt-2 space-y-2">
                                                                    <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-slate-50 p-3 space-y-3 flex flex-col">
                                                                        {(chatByRequest[request.id_request] || []).length === 0 ? (
                                                                            <p className="text-xs text-gray-500 font-medium text-center py-4">No messages yet. Say hi!</p>
                                                                        ) : (
                                                                            <AnimatePresence>
                                                                                {(chatByRequest[request.id_request] || []).map((msg) => {
                                                                                    const isMe = msg.sender_role === 'client';
                                                                                    return (
                                                                                        <motion.div 
                                                                                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                                            key={msg.id_message} 
                                                                                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm flex flex-col ${isMe ? 'self-end bg-gradient-to-br from-bird-blue to-blue-600 text-white rounded-tr-sm' : 'self-start bg-white border border-gray-200 text-slate-800 rounded-tl-sm'}`}
                                                                                        >
                                                                                            <p className={`font-bold text-[9px] uppercase tracking-wider mb-1 ${isMe ? 'text-blue-100' : 'text-gray-500'}`}>
                                                                                                {isMe ? 'You' : 'Pro'}
                                                                                            </p>
                                                                                            {msg.message && <p className="text-[13px] leading-relaxed">{msg.message}</p>}
                                                                                            {msg.image_url && (
                                                                                                <a href={msg.image_url} target="_blank" rel="noreferrer" className="mt-2 block rounded-lg overflow-hidden border border-black/10">
                                                                                                    <img src={msg.image_url} alt="Chat attachment" className="max-h-32 object-cover hover:scale-105 transition-transform" />
                                                                                                </a>
                                                                                            )}
                                                                                            <p className={`text-[9px] text-right mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
                                                                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                                            </p>
                                                                                        </motion.div>
                                                                                    );
                                                                                })}
                                                                            </AnimatePresence>
                                                                        )}
                                                                    </div>

                                                                    <div className="grid grid-cols-[1fr_auto] gap-2">
                                                                        <input
                                                                            type="text"
                                                                            value={chatMessage[request.id_request] || ''}
                                                                            onChange={(e) => setChatMessage((prev) => ({ ...prev, [request.id_request]: e.target.value }))}
                                                                            placeholder="Write message..."
                                                                            className="px-2.5 py-2 rounded-lg border border-gray-200 text-xs"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => sendRequestChat(request.id_request)}
                                                                            disabled={chatBusyId === request.id_request}
                                                                            className="px-3 py-2 rounded-lg bg-bird-blue text-white text-xs font-bold disabled:opacity-50"
                                                                        >
                                                                            Send
                                                                        </button>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <input
                                                                            type="file"
                                                                            accept="image/png,image/jpeg,image/jpg,image/webp"
                                                                            onChange={(e) => setChatImage((prev) => ({ ...prev, [request.id_request]: e.target.files?.[0] || null }))}
                                                                            className="text-[10px]"
                                                                        />
                                                                        {chatImage[request.id_request] && (
                                                                            <span className="text-[10px] text-gray-500 truncate">{chatImage[request.id_request]?.name}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
                                                            <p className="text-[11px] uppercase tracking-wider font-bold text-gray-500">Reputation</p>
                                                            {!canRate && (
                                                                <p className="mt-2 text-[11px] font-semibold text-amber-700">
                                                                    Rating unlocks when the job is marked as done.
                                                                </p>
                                                            )}
                                                            <div className="mt-2 grid grid-cols-3 gap-2">
                                                                {(['punctuality', 'quality', 'price_fairness'] as const).map((key) => (
                                                                    <label key={key} className="text-[10px] text-gray-600">
                                                                        <span className="block mb-1 font-bold capitalize">{key.replace('_', ' ')}</span>
                                                                        <select
                                                                            value={ratingForm[request.id_request]?.[key] ?? 5}
                                                                            onChange={(e) =>
                                                                                setRatingForm((prev) => ({
                                                                                    ...prev,
                                                                                    [request.id_request]: {
                                                                                        punctuality: prev[request.id_request]?.punctuality ?? 5,
                                                                                        quality: prev[request.id_request]?.quality ?? 5,
                                                                                        price_fairness: prev[request.id_request]?.price_fairness ?? 5,
                                                                                        comment: prev[request.id_request]?.comment ?? '',
                                                                                        [key]: Number(e.target.value),
                                                                                    },
                                                                                }))
                                                                            }
                                                                            disabled={!canRate}
                                                                            className="w-full rounded-md border border-gray-200 px-1.5 py-1 text-[10px]"
                                                                        >
                                                                            {[1, 2, 3, 4, 5].map((n) => (
                                                                                <option key={n} value={n}>{n}</option>
                                                                            ))}
                                                                        </select>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                            <textarea
                                                                value={ratingForm[request.id_request]?.comment ?? ''}
                                                                onChange={(e) =>
                                                                    setRatingForm((prev) => ({
                                                                        ...prev,
                                                                        [request.id_request]: {
                                                                            punctuality: prev[request.id_request]?.punctuality ?? 5,
                                                                            quality: prev[request.id_request]?.quality ?? 5,
                                                                            price_fairness: prev[request.id_request]?.price_fairness ?? 5,
                                                                            comment: e.target.value,
                                                                        },
                                                                    }))
                                                                }
                                                                placeholder="Comment..."
                                                                disabled={!canRate}
                                                                className="mt-2 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => submitRating(request)}
                                                                disabled={!canRate || ratingBusyId === request.id_request}
                                                                className="mt-2 w-full py-2 rounded-lg bg-slate-800 text-white text-xs font-bold disabled:opacity-50"
                                                            >
                                                                Submit Rating
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Searching Overlay */}
                    <AnimatePresence>
                        {isSearching && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-30 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center"
                            >
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                    className="w-20 h-20 border-4 border-bird-blue/20 border-t-bird-blue rounded-full mb-6"
                                />
                                <motion.h2
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-2xl font-bold text-gray-900 mb-2"
                                >
                                    Finding the best pro...
                                </motion.h2>
                                <motion.p
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                    className="text-gray-600 mb-8"
                                >
                                    This will only take a moment
                                </motion.p>
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setIsSearching(false)}
                                    className="px-6 py-2 rounded-full border-2 border-gray-200 text-gray-600 font-bold hover:border-gray-300 hover:bg-gray-50 transition-all"
                                >
                                    Cancel
                                </motion.button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>


        </motion.div>
    );
};

