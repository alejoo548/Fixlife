import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';
import { 
  LayoutDashboard, Users, Briefcase, Settings, LogOut, Search, Bell, TrendingUp, Activity, Clock, CheckCircle, Menu, X, ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight, Image as ImageIcon,
  Plus, Edit3, Trash2, Eye, XCircle, FileText, Shield, Download
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_ENDPOINTS } from '../../config/api';
import { Notyf } from 'notyf';
import 'notyf/notyf.min.css';
import {
  DEFAULT_HERO_SLIDES,
  fetchHeroSlides,
  getHeroSlides,
  HeroSlideContent,
  resetHeroSlides,
  saveHeroSlides,
  uploadHeroImageAsset,
  uploadHeroSlideImage,
} from '../../utils/heroSlides';

interface AdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Service {
  id_service: number;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean | number;
  created_at: string;
}

interface ServiceCard {
  id_card: number;
  id_service: number;
  image_url: string | null;
  badge: string | null;
  headline: string | null;
  summary: string | null;
  cta_label: string | null;
  sort_order: number;
  is_active: boolean | number;
  created_at: string;
  service_name: string;
  service_icon: string | null;
}

interface PendingWorker {
  id_user: number;
  name: string;
  lastname: string;
  email: string;
  phone_number: string;
  username: string | null;
  profile_image: string | null;
  created_at: string;
  id_worker_profile: number;
  dui_document: string | null;
  cert_document: string | null;
  dui_document_url: string | null;
  cert_document_url: string | null;
  is_verified: number;
  services: { id_service: number; name: string }[];
}

interface AdminRequestHistoryItem {
  id_request: number;
  id_user: number | null;
  id_service: number;
  service_name: string;
  description: string;
  location_text: string;
  budget: number;
  radius_km: number;
  status: 'pending' | 'assigned' | 'in_progress' | 'done' | 'cancelled' | string;
  created_at: string;
  images_count: number;
  client: { id_user: number; name: string; email: string | null } | null;
  assigned_worker: { id_worker_profile: number; name: string } | null;
}

const notyf = new Notyf({ position: { x: 'right', y: 'bottom' }, ripple: true });

const DEFAULT_REVENUE_DATA = [
  { name: 'Jan', uv: 0, pv: 0, amt: 0 },
];

const DEFAULT_TRAFFIC_DATA = [
  { name: 'Mon', Users: 0, Pros: 0 },
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('Overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { user, logout } = useAuth();

  // Services state
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceForm, setServiceForm] = useState({ name: '', description: '', icon: '' });
  const [serviceCards, setServiceCards] = useState<ServiceCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [editingCard, setEditingCard] = useState<ServiceCard | null>(null);
  const [serviceCardForm, setServiceCardForm] = useState({
    id_service: '',
    image_url: '',
    badge: 'POPULAR',
    headline: '',
    summary: '',
    cta_label: 'Learn More',
    sort_order: '1',
    is_active: true,
  });
  const [uploadingCardImage, setUploadingCardImage] = useState(false);

  // Pending Workers state
  const [pendingWorkers, setPendingWorkers] = useState<PendingWorker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Stats & Preview state
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [previewDoc, setPreviewDoc] = useState<{ url: string, name: string } | null>(null);

  // Hero Slides state
  const [heroSlidesDraft, setHeroSlidesDraft] = useState<HeroSlideContent[]>([]);
  const [unsavedSlideIds, setUnsavedSlideIds] = useState<number[]>([]);
  const [isSavingHeroSlides, setIsSavingHeroSlides] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [uploadingSlideId, setUploadingSlideId] = useState<number | null>(null);
  const [requestHistory, setRequestHistory] = useState<AdminRequestHistoryItem[]>([]);
  const [requestHistoryLoading, setRequestHistoryLoading] = useState(false);
  const [requestHistoryStatus, setRequestHistoryStatus] = useState<'all' | 'pending' | 'assigned' | 'in_progress' | 'done' | 'cancelled'>('all');

  const getToken = () => localStorage.getItem('token') || '';

  const handleLogout = () => {
    logout();
    onClose();
    window.location.replace('/');
  };

  // ─── Services API ──────────────────────────────────────────────────────
  const fetchServices = async () => {
    setServicesLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.admin.services, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setServices(data.services);
    } catch { /* silent */ } finally { setServicesLoading(false); }
  };

  const handleCreateOrUpdateService = async () => {
    const name = serviceForm.name.trim();
    if (!name) { notyf.error('Service name is required.'); return; }
    if (name.length > 100) { notyf.error('Name max 100 characters.'); return; }
    if (/<\s*script|javascript:|on\w+\s*=/i.test(`${serviceForm.name} ${serviceForm.description} ${serviceForm.icon}`)) {
      notyf.error('Scripts or unsafe HTML are not allowed.');
      return;
    }

    try {
      const url = editingService
        ? `${API_ENDPOINTS.admin.services}/${editingService.id_service}`
        : API_ENDPOINTS.admin.services;

      const res = await fetch(url, {
        method: editingService ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          name,
          description: serviceForm.description.trim() || null,
          icon: serviceForm.icon.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { notyf.error(data.error || 'Operation failed'); return; }
      notyf.success(editingService ? 'Service updated!' : 'Service created!');
      setShowServiceForm(false);
      setEditingService(null);
      setServiceForm({ name: '', description: '', icon: '' });
      fetchServices();
    } catch { notyf.error('Connection error'); }
  };

  const handleDeleteService = async (id: number) => {
    if (!confirm('Are you sure you want to delete this service? This will also remove all worker associations.')) return;
    try {
      const res = await fetch(`${API_ENDPOINTS.admin.services}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) { notyf.error(data.error || 'Delete failed'); return; }
      notyf.success('Service deleted.');
      fetchServices();
    } catch { notyf.error('Connection error'); }
  };

  const handleToggleService = async (svc: Service) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.admin.services}/${svc.id_service}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ is_active: !svc.is_active }),
      });
      const data = await res.json();
      if (!res.ok) { notyf.error(data.error || 'Update failed'); return; }
      notyf.success(svc.is_active ? 'Service paused.' : 'Service activated.');
      fetchServices();
    } catch { notyf.error('Connection error'); }
  };

  const fetchServiceCards = async () => {
    setCardsLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.admin.serviceCards, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setServiceCards(data.cards);
    } catch {
      /* silent */
    } finally {
      setCardsLoading(false);
    }
  };

  const openCreateCardForm = () => {
    if (availableCardServices.length === 0) {
      notyf.error('No available active services to create a new homepage card.');
      return;
    }
    const firstServiceId = String(availableCardServices[0].id_service);
    setEditingCard(null);
    setServiceCardForm({
      id_service: firstServiceId,
      image_url: '',
      badge: 'POPULAR',
      headline: '',
      summary: '',
      cta_label: 'Learn More',
      sort_order: String(serviceCards.length + 1),
      is_active: true,
    });
    setShowCardForm(true);
  };

  const openEditCardForm = (card: ServiceCard) => {
    setEditingCard(card);
    setServiceCardForm({
      id_service: String(card.id_service),
      image_url: card.image_url || '',
      badge: card.badge || 'POPULAR',
      headline: card.headline || '',
      summary: card.summary || '',
      cta_label: card.cta_label || 'Learn More',
      sort_order: String(card.sort_order || 1),
      is_active: !!card.is_active,
    });
    setShowCardForm(true);
  };

  const handleCreateOrUpdateCard = async () => {
    const idService = Number(serviceCardForm.id_service);
    if (!idService) {
      notyf.error('Select a service for the card.');
      return;
    }

    const unsafePattern = /<\s*script|javascript:|on\w+\s*=|data:text\/html/i;
    const valuesToCheck = [
      serviceCardForm.badge,
      serviceCardForm.headline,
      serviceCardForm.summary,
      serviceCardForm.cta_label,
      serviceCardForm.image_url,
    ];
    if (valuesToCheck.some((v) => unsafePattern.test(String(v || '')))) {
      notyf.error('Scripts or unsafe HTML are not allowed.');
      return;
    }

    if (!editingCard && serviceCards.some((card) => card.id_service === idService)) {
      notyf.error('That service already has a homepage card.');
      return;
    }

    const payload = {
      id_service: idService,
      image_url: serviceCardForm.image_url.trim() || null,
      badge: serviceCardForm.badge.trim() || 'POPULAR',
      headline: serviceCardForm.headline.trim() || null,
      summary: serviceCardForm.summary.trim() || null,
      cta_label: serviceCardForm.cta_label.trim() || 'Learn More',
      sort_order: Number(serviceCardForm.sort_order) || 1,
      is_active: serviceCardForm.is_active,
    };

    try {
      const url = editingCard
        ? `${API_ENDPOINTS.admin.serviceCards}/${editingCard.id_card}`
        : API_ENDPOINTS.admin.serviceCards;

      const res = await fetch(url, {
        method: editingCard ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        notyf.error(data.error || 'Card operation failed.');
        return;
      }
      notyf.success(editingCard ? 'Card updated.' : 'Card created.');
      setShowCardForm(false);
      setEditingCard(null);
      fetchServiceCards();
    } catch {
      notyf.error('Connection error');
    }
  };

  const handleDeleteCard = async (idCard: number) => {
    if (!confirm('Delete this homepage card?')) return;
    try {
      const res = await fetch(`${API_ENDPOINTS.admin.serviceCards}/${idCard}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) {
        notyf.error(data.error || 'Delete failed.');
        return;
      }
      notyf.success('Card deleted.');
      fetchServiceCards();
    } catch {
      notyf.error('Connection error');
    }
  };

  const handleServiceCardImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      notyf.error('Only PNG/JPG/WEBP files are allowed.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      notyf.error('Image too large. Max 8MB.');
      return;
    }

    const token = getToken();
    if (!token) {
      notyf.error('Session expired. Please sign in again.');
      return;
    }

    try {
      setUploadingCardImage(true);
      let processed: File = file;
      try {
        processed = await cropTo16x9File(file);
      } catch {
        // Fallback: if browser cannot process canvas crop, upload original file.
        processed = file;
      }
      const formData = new FormData();
      formData.append('image', processed);

      const res = await fetch(API_ENDPOINTS.admin.uploadImageAsset, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const rawText = await res.text();
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (!res.ok || !data?.success || !data?.image) {
        notyf.error(data?.error || `Could not upload image (HTTP ${res.status}).`);
        return;
      }

      setServiceCardForm((prev) => ({ ...prev, image_url: data.image }));
      notyf.success('Image uploaded.');
    } catch (error: any) {
      notyf.error(error?.message || 'Connection error uploading image.');
    } finally {
      setUploadingCardImage(false);
      event.target.value = '';
    }
  };

  // ─── Workers API ───────────────────────────────────────────────────────
  const fetchPendingWorkers = async () => {
    setWorkersLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.admin.pendingWorkers, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setPendingWorkers(data.workers);
    } catch { /* silent */ } finally { setWorkersLoading(false); }
  };

  const handleWorkerAction = async (userId: number, action: 'approve' | 'reject') => {
    setActionLoading(userId);
    try {
      const url = action === 'approve'
        ? API_ENDPOINTS.admin.approveWorker(userId)
        : API_ENDPOINTS.admin.rejectWorker(userId);
      const res = await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) { notyf.error(data.error || 'Action failed'); return; }
      notyf.success(action === 'approve' ? 'Worker approved!' : 'Worker rejected.');
      fetchPendingWorkers();
    } catch { notyf.error('Connection error'); } finally { setActionLoading(null); }
  };

  // ─── Stats API ─────────────────────────────────────────────────────────
  const fetchStats = async () => {
    try {
      const res = await fetch(API_ENDPOINTS.admin.stats, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setDashboardStats(data.stats);
    } catch { /* silent */ }
  };

  // Fetch data when tabs change
  useEffect(() => {
    fetchStats();
    if (activeTab === 'Services' || activeTab === 'Homepage Cards') {
      fetchServices();
      fetchServiceCards();
    }
    if (activeTab === 'Users & Pros') fetchPendingWorkers();
    if (activeTab === 'Requests History') fetchRequestsHistory(requestHistoryStatus);
    
    // Fetch Hero Slides if in Platform Settings
    if (activeTab === 'Platform Settings') {
      fetchHeroSlides().then((slides) => {
        if (Array.isArray(slides) && slides.length > 0) {
          setHeroSlidesDraft(slides);
          setUnsavedSlideIds([]);
        }
      });
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'Requests History') {
      fetchRequestsHistory(requestHistoryStatus);
    }
  }, [requestHistoryStatus]);

  const updateSlideField = (
    index: number,
    field: keyof Omit<HeroSlideContent, 'id'>,
    value: string
  ) => {
    const slideId = heroSlidesDraft[index]?.id;
    if (slideId && !unsavedSlideIds.includes(slideId)) {
      setUnsavedSlideIds((prev) => [...prev, slideId]);
    }
    setHeroSlidesDraft((prev) =>
      prev.map((slide, idx) => (idx === index ? { ...slide, [field]: value } : slide))
    );
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read image file.'));
      reader.readAsDataURL(file);
    });

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load selected image.'));
      img.src = src;
    });

  const cropTo16x9File = async (file: File): Promise<File> => {
    const src = await fileToDataUrl(file);
    const image = await loadImage(src);

    const targetAspect = 16 / 9;
    const sourceAspect = image.width / image.height;

    let sx = 0;
    let sy = 0;
    let sw = image.width;
    let sh = image.height;

    if (sourceAspect > targetAspect) {
      sw = Math.round(image.height * targetAspect);
      sx = Math.round((image.width - sw) / 2);
    } else if (sourceAspect < targetAspect) {
      sh = Math.round(image.width / targetAspect);
      sy = Math.round((image.height - sh) / 2);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported by browser.');

    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error('Could not process image.'));
            return;
          }
          resolve(result);
        },
        'image/jpeg',
        0.92
      );
    });

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}-16x9.jpg`, { type: 'image/jpeg' });
  };

  const handleImageUpload = async (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setSettingsNotice('Only PNG/JPG/WEBP images are allowed.');
      notyf.error('Only PNG/JPG/WEBP images are allowed.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setSettingsNotice('Image too large. Max 8MB per slide.');
      notyf.error('Image too large. Max 8MB per slide.');
      return;
    }

    const token = getToken();
    if (!token) {
      setSettingsNotice('Session expired. Please sign in again.');
      notyf.error('Session expired. Please sign in again.');
      return;
    }

    try {
      const slideId = heroSlidesDraft[index]?.id ?? null;
      setUploadingSlideId(slideId || -1);
      const cropped = await cropTo16x9File(file);

      if (slideId && slideId > 0) {
        const updatedSlides = await uploadHeroSlideImage(slideId, cropped, token);
        setHeroSlidesDraft(updatedSlides);
        setSettingsNotice(`Slide ${index + 1} image updated (16:9 auto-crop applied).`);
        setUnsavedSlideIds((prev) => (prev.includes(slideId) ? prev : [...prev, slideId]));
      } else {
        const imageUrlFromTemp = await uploadHeroImageAsset(cropped, token);
        setHeroSlidesDraft((prev) => {
          const next = prev.map((slide, idx) => (idx === index ? { ...slide, image: imageUrlFromTemp } : slide));
          return next;
        });
        const tempId = heroSlidesDraft[index]?.id;
        if (tempId) {
          setUnsavedSlideIds((prev) => (prev.includes(tempId) ? prev : [...prev, tempId]));
        }
        setSettingsNotice(`Slide ${index + 1} image uploaded. Save carousel to persist.`);
      }
      notyf.success(`Slide ${index + 1} image updated.`);
    } catch (error: any) {
      setSettingsNotice(error?.message || 'Error processing image.');
      notyf.error(error?.message || 'Error processing image.');
    } finally {
      setUploadingSlideId(null);
    }
  };

  const handleSaveHeroSlides = async () => {
    const token = getToken();
    if (!token) {
      setSettingsNotice('Session expired. Please sign in again.');
      notyf.error('Session expired. Please sign in again.');
      return;
    }

    const invalidSlide = heroSlidesDraft.find(
      (slide) =>
        !slide.image?.trim() ||
        !slide.tag?.trim() ||
        !slide.title?.trim() ||
        !slide.description?.trim() ||
        !slide.cta?.trim()
    );
    if (invalidSlide) {
      setSettingsNotice('All slides need image + text fields before saving.');
      notyf.error('All slides need image + text fields before saving.');
      return;
    }

    try {
      setIsSavingHeroSlides(true);
      const saved = await saveHeroSlides(heroSlidesDraft, token);
      setHeroSlidesDraft(saved);
      setUnsavedSlideIds([]);
      setSettingsNotice('Homepage carousel updated successfully.');
      notyf.success('Homepage carousel updated successfully.');
    } catch (error: any) {
      setSettingsNotice(error?.message || 'Could not save carousel.');
      notyf.error(error?.message || 'Could not save carousel.');
    } finally {
      setIsSavingHeroSlides(false);
    }
  };

  const handleResetHeroSlides = async () => {
    const token = getToken();
    if (!token) {
      setSettingsNotice('Session expired. Please sign in again.');
      notyf.error('Session expired. Please sign in again.');
      return;
    }

    try {
      setIsSavingHeroSlides(true);
      const restored = await saveHeroSlides(DEFAULT_HERO_SLIDES, token);
      resetHeroSlides();
      setHeroSlidesDraft(restored);
      setUnsavedSlideIds([]);
      setSettingsNotice('Carousel restored to default content.');
      notyf.success('Carousel restored to default content.');
    } catch (error: any) {
      setSettingsNotice(error?.message || 'Could not restore defaults.');
      notyf.error(error?.message || 'Could not restore defaults.');
    } finally {
      setIsSavingHeroSlides(false);
    }
  };

  const handleAddSlide = () => {
    if (heroSlidesDraft.length >= 10) {
      setSettingsNotice('Maximum 10 slides allowed.');
      notyf.error('Maximum 10 slides allowed.');
      return;
    }

    const tempId = Date.now() * -1;
    const newSlide: HeroSlideContent = {
      id: tempId,
      image: '',
      tag: 'NEW',
      title: 'New Slide Title',
      description: 'Write a short description for this new slide.',
      cta: 'Explore',
    };
    setHeroSlidesDraft((prev) => [...prev, newSlide]);
    setUnsavedSlideIds((prev) => [...prev, tempId]);
    setSettingsNotice('Slide added. Save carousel to persist changes.');
    notyf.success('Slide added.');
  };

  const handleDeleteSlide = (slideId: number) => {
    if (heroSlidesDraft.length <= 1) {
      setSettingsNotice('At least one slide is required.');
      notyf.error('At least one slide is required.');
      return;
    }

    setHeroSlidesDraft((prev) => prev.filter((slide) => slide.id !== slideId));
    setUnsavedSlideIds((prev) => prev.filter((id) => id !== slideId));
    setSettingsNotice('Slide removed. Save carousel to persist changes.');
    notyf.success('Slide removed.');
  };

  if (!isOpen) return null;

  const stats = [
    { title: "Total Users", value: dashboardStats ? String(dashboardStats.total_users) : "0", change: "+14.5%", trending: "up", icon: Users, color: "text-emerald-500", bg: "bg-emerald-50", line: "from-emerald-400 to-emerald-600" },
    { title: "Active Pros", value: dashboardStats ? String(dashboardStats.total_pros) : "0", change: "+5.2%", trending: "up", icon: Briefcase, color: "text-bird-blue", bg: "bg-bird-blue/10", line: "from-bird-blue to-bird-darkBlue" },
    { title: "Pending Approvals", value: dashboardStats ? String(dashboardStats.pending_pros) : "0", change: "", trending: "down", icon: Clock, color: "text-bird-orange", bg: "bg-bird-orange/10", line: "from-bird-orange to-red-500" },
    { title: "Services", value: dashboardStats ? String(dashboardStats.total_services) : "0", change: "", trending: "up", icon: Briefcase, color: "text-bird-yellow", bg: "bg-bird-yellow/10", line: "from-bird-yellow to-bird-gold" },
  ];

  const navItems = [
    { name: "Overview", icon: LayoutDashboard },
    { name: "Users & Pros", icon: Users },
    { name: "Services", icon: Briefcase },
    { name: "Homepage Cards", icon: ImageIcon },
    { name: "Requests History", icon: FileText },
    { name: "Finance Analytics", icon: Activity },
    { name: "Platform Settings", icon: Settings },
  ];

  const availableCardServices = useMemo(() => {
    const blocked = new Set(
      serviceCards
        .filter((c) => !editingCard || c.id_card !== editingCard.id_card)
        .map((c) => c.id_service)
    );
    return services.filter((svc) => !blocked.has(svc.id_service) && !!svc.is_active);
  }, [services, serviceCards, editingCard]);

  // ─── RENDER: Services Tab ──────────────────────────────────────────────
  const renderServicesTab = () => (
    <div className="space-y-6">
      {activeTab !== 'Homepage Cards' && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Services Management</h2>
            <p className="text-sm text-gray-500 font-medium">Create and manage service categories for workers</p>
          </div>
          <button
            onClick={() => { setShowServiceForm(true); setEditingService(null); setServiceForm({ name: '', description: '', icon: '' }); }}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-bird-blue to-bird-darkBlue text-white font-bold text-sm shadow-lg shadow-bird-blue/20 hover:scale-[1.02] transition-transform"
          >
            <Plus size={18} /> New Service
          </button>
        </div>
      )}

      {activeTab === 'Homepage Cards' && (
        <div className="rounded-3xl border border-bird-blue/20 bg-gradient-to-r from-bird-blue/10 via-white to-bird-yellow/10 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white border border-bird-blue/20 flex items-center justify-center text-bird-blue shadow-sm">
              <ImageIcon size={22} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900">Homepage Cards Manager</h2>
              <p className="text-sm text-gray-600 font-medium mt-1">
                Secure section: only active services from DB, no duplicated service cards, script-safe text fields.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Service Form Modal */}
      <AnimatePresence>
        {showServiceForm && activeTab !== 'Homepage Cards' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-gray-900">
              {editingService ? 'Edit Service' : 'Create New Service'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Service Name *</label>
                <input
                  type="text"
                  maxLength={100}
                  value={serviceForm.name}
                  onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })}
                  placeholder="e.g. Plumbing"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Icon (SVG path or emoji)</label>
                <input
                  type="text"
                  maxLength={255}
                  value={serviceForm.icon}
                  onChange={e => setServiceForm({ ...serviceForm, icon: e.target.value })}
                  placeholder="🔧 or SVG path data"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Description</label>
              <textarea
                maxLength={500}
                value={serviceForm.description}
                onChange={e => setServiceForm({ ...serviceForm, description: e.target.value })}
                placeholder="Brief description of the service..."
                rows={3}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all resize-none"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowServiceForm(false); setEditingService(null); }}
                className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateOrUpdateService}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-bird-blue to-bird-darkBlue text-white font-bold text-sm shadow-lg shadow-bird-blue/20 hover:scale-[1.02] transition-transform"
              >
                {editingService ? 'Save Changes' : 'Create Service'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Services Table */}
      {activeTab !== 'Homepage Cards' && (
      <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl overflow-hidden">
        {servicesLoading ? (
          <div className="p-12 text-center text-gray-400 font-medium">Loading services...</div>
        ) : services.length === 0 ? (
          <div className="p-12 text-center">
            <Briefcase size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium">No services yet. Create your first service above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 text-xs uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
                  <th className="px-6 py-4">Service</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Created</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {services.map((svc) => (
                  <tr key={svc.id_service} className="hover:bg-gray-50/80 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-bird-blue/10 to-bird-blue/5 flex items-center justify-center text-bird-blue font-bold shrink-0">
                          {svc.icon ? <span className="text-lg">{svc.icon.length <= 2 ? svc.icon : '⚙️'}</span> : <Briefcase size={18} />}
                        </div>
                        <span className="font-bold text-gray-900 text-sm">{svc.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-500 line-clamp-1 max-w-[200px] block">{svc.description || '—'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleService(svc)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer transition-all hover:scale-105 ${
                          svc.is_active
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            : 'bg-gray-50 text-gray-500 border-gray-200'
                        }`}
                      >
                        {svc.is_active ? <><CheckCircle size={12} /> Active</> : <><XCircle size={12} /> Paused</>}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                      {new Date(svc.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => {
                            setEditingService(svc);
                            setServiceForm({ name: svc.name, description: svc.description || '', icon: svc.icon || '' });
                            setShowServiceForm(true);
                          }}
                          className="p-2 text-gray-400 hover:text-bird-blue hover:bg-bird-blue/10 rounded-lg transition-all"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteService(svc.id_service)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Homepage Cards Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2">
        <div>
          <h3 className="text-xl font-black text-gray-900">
            {activeTab === 'Homepage Cards' ? 'Homepage Cards Manager' : 'Homepage Service Cards'}
          </h3>
          <p className="text-sm text-gray-500 font-medium">
            Cards shown in the landing page "Professional Services" section
          </p>
        </div>
        <button
          onClick={openCreateCardForm}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-bird-blue to-bird-darkBlue text-white font-bold text-sm shadow-lg shadow-bird-blue/20 hover:scale-[1.02] transition-transform"
        >
          <Plus size={16} /> New Homepage Card
        </button>
      </div>

      {/* Card Form */}
      <AnimatePresence>
        {showCardForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-gray-900">
              {editingCard ? 'Edit Homepage Card' : 'Create Homepage Card'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Service *</label>
                <select
                  value={serviceCardForm.id_service}
                  onChange={(e) => setServiceCardForm({ ...serviceCardForm, id_service: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                >
                  <option value="">Select service</option>
                  {Array.from(
                    new Map(
                      [
                        ...availableCardServices,
                        ...(editingCard ? services.filter((s) => s.id_service === editingCard.id_service) : []),
                      ].map((s) => [s.id_service, s])
                    ).values()
                  ).map((svc) => (
                    <option key={svc.id_service} value={svc.id_service}>
                      {svc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Badge</label>
                <input
                  type="text"
                  maxLength={40}
                  value={serviceCardForm.badge}
                  onChange={(e) => setServiceCardForm({ ...serviceCardForm, badge: e.target.value })}
                  placeholder="POPULAR"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Sort Order</label>
                <input
                  type="number"
                  min={1}
                  value={serviceCardForm.sort_order}
                  onChange={(e) => setServiceCardForm({ ...serviceCardForm, sort_order: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Headline</label>
                <input
                  type="text"
                  maxLength={120}
                  value={serviceCardForm.headline}
                  onChange={(e) => setServiceCardForm({ ...serviceCardForm, headline: e.target.value })}
                  placeholder="Card title in homepage"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Button Label</label>
                <input
                  type="text"
                  maxLength={60}
                  value={serviceCardForm.cta_label}
                  onChange={(e) => setServiceCardForm({ ...serviceCardForm, cta_label: e.target.value })}
                  placeholder="Learn More"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Summary</label>
              <textarea
                maxLength={255}
                rows={2}
                value={serviceCardForm.summary}
                onChange={(e) => setServiceCardForm({ ...serviceCardForm, summary: e.target.value })}
                placeholder="Short text below the title"
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all resize-none"
              />
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                Card Image (Dropify Upload)
              </label>
              <label className="block cursor-pointer">
                <div className="w-full rounded-2xl border-2 border-dashed border-gray-300 bg-gradient-to-br from-white to-sky-50 hover:from-sky-50 hover:to-blue-50 hover:border-bird-blue transition p-6 text-center">
                  <div className="text-bird-blue text-3xl font-black leading-none">+</div>
                  <div className="text-gray-900 font-black mt-1">Dropify Upload Zone</div>
                  <div className="text-xs text-gray-500">PNG/JPG/WEBP, auto-center crop to 16:9 (1600x900)</div>
                  <span className="inline-block mt-3 bg-bird-blue text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow">
                    {uploadingCardImage ? 'Uploading...' : 'Dropify Select Image'}
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleServiceCardImageUpload}
                  className="hidden"
                />
              </label>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Or paste Image URL</label>
                <input
                  type="text"
                  maxLength={255}
                  value={serviceCardForm.image_url}
                  onChange={(e) => setServiceCardForm({ ...serviceCardForm, image_url: e.target.value })}
                  placeholder="https://... (16:9 recommended)"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={serviceCardForm.is_active}
                  onChange={(e) => setServiceCardForm({ ...serviceCardForm, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Card active
              </label>
            </div>

            {serviceCardForm.image_url && (
              <div className="rounded-2xl border border-gray-200 overflow-hidden max-w-md">
                <img
                  src={serviceCardForm.image_url}
                  alt="Card preview"
                  className="w-full aspect-[16/9] object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => {
                  setShowCardForm(false);
                  setEditingCard(null);
                }}
                className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateOrUpdateCard}
                disabled={uploadingCardImage}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-bird-blue to-bird-darkBlue text-white font-bold text-sm shadow-lg shadow-bird-blue/20 hover:scale-[1.02] transition-transform"
              >
                {uploadingCardImage ? 'Uploading image...' : editingCard ? 'Save Card' : 'Create Card'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Homepage Cards List */}
      <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl overflow-hidden">
        {cardsLoading ? (
          <div className="p-10 text-center text-gray-400 font-medium">Loading homepage cards...</div>
        ) : serviceCards.length === 0 ? (
          <div className="p-10 text-center text-gray-500 font-medium">No homepage cards yet. Add one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 text-xs uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
                  <th className="px-6 py-4">Card</th>
                  <th className="px-6 py-4">Service</th>
                  <th className="px-6 py-4">Order</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {serviceCards.map((card) => (
                  <tr key={card.id_card} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 min-w-[260px]">
                        <div className="w-16 h-10 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
                          {card.image_url ? (
                            <img src={card.image_url} alt={card.headline || card.service_name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">No image</div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900 line-clamp-1">{card.headline || card.service_name}</p>
                          <p className="text-xs text-gray-500 line-clamp-1">{card.cta_label || 'Learn More'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-700">{card.service_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{card.sort_order}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                          card.is_active
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            : 'bg-gray-50 text-gray-500 border-gray-200'
                        }`}
                      >
                        {card.is_active ? <><CheckCircle size={12} /> Active</> : <><XCircle size={12} /> Paused</>}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => openEditCardForm(card)}
                          className="p-2 text-gray-400 hover:text-bird-blue hover:bg-bird-blue/10 rounded-lg transition-all"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteCard(card.id_card)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ─── RENDER: Users & Pros (Pending Workers) Tab ────────────────────────
  const renderUsersTab = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-gray-900">Pending Worker Applications</h2>
        <p className="text-sm text-gray-500 font-medium">Review and approve worker registrations</p>
      </div>

      {workersLoading ? (
        <div className="p-12 text-center text-gray-400 font-medium">Loading applications...</div>
      ) : pendingWorkers.length === 0 ? (
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl p-12 text-center">
          <CheckCircle size={48} className="mx-auto text-emerald-400 mb-4" />
          <p className="text-gray-600 font-bold text-lg mb-1">All caught up!</p>
          <p className="text-gray-500 font-medium text-sm">No pending applications at this time.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pendingWorkers.map((worker) => (
            <motion.div
              key={worker.id_user}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl overflow-hidden hover:shadow-2xl transition-shadow"
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-bird-orange/10 to-bird-yellow/10 flex items-center justify-center text-bird-orange font-black text-xl shrink-0 border border-bird-orange/10">
                  {worker.name.charAt(0)}{worker.lastname.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 text-lg truncate">{worker.name} {worker.lastname}</h3>
                  <p className="text-sm text-gray-500 truncate">{worker.email}</p>
                </div>
                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-600 border border-amber-100 shrink-0">
                  <Clock size={12} className="inline mr-1" />Pending
                </span>
              </div>

              {/* Details */}
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Phone</span>
                    <p className="font-medium text-gray-700 mt-0.5">{worker.phone_number || '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Registered</span>
                    <p className="font-medium text-gray-700 mt-0.5">{new Date(worker.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Services */}
                {worker.services && worker.services.length > 0 && (
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Specialties</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {worker.services.map(s => (
                        <span key={s.id_service} className="px-2.5 py-1 rounded-lg bg-bird-blue/10 text-bird-blue text-xs font-bold">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Documents */}
                <div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Documents</span>
                  <div className="mt-1.5 flex gap-3">
                    {worker.dui_document_url ? (
                      <button onClick={() => setPreviewDoc({ url: worker.dui_document_url!, name: 'DUI Document' })}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bird-blue/5 border border-bird-blue/10 text-bird-blue text-xs font-bold hover:bg-bird-blue/10 transition-colors">
                        <FileText size={14} /> View DUI
                      </button>
                    ) : <span className="text-xs text-gray-400 italic">No DUI uploaded</span>}
                    {worker.cert_document_url ? (
                      <button onClick={() => setPreviewDoc({ url: worker.cert_document_url!, name: 'Certificate' })}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bird-yellow/10 border border-bird-yellow/20 text-bird-gold text-xs font-bold hover:bg-bird-yellow/20 transition-colors">
                        <Shield size={14} /> View Cert
                      </button>
                    ) : <span className="text-xs text-gray-400 italic">No cert uploaded</span>}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-6 pt-0 flex gap-3">
                <button
                  disabled={actionLoading === worker.id_user}
                  onClick={() => handleWorkerAction(worker.id_user, 'approve')}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle size={16} />
                  {actionLoading === worker.id_user ? 'Processing...' : 'Approve'}
                </button>
                <button
                  disabled={actionLoading === worker.id_user}
                  onClick={() => handleWorkerAction(worker.id_user, 'reject')}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-red-200 text-red-500 font-bold text-sm hover:bg-red-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <XCircle size={16} />
                  {actionLoading === worker.id_user ? 'Processing...' : 'Reject'}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );

  // ─── RENDER: Overview Tab ────────────────────────────────────────────
  const renderRequestsHistoryTab = () => {
    const badgeClass = (statusRaw: string) => {
      const status = String(statusRaw || 'pending').toLowerCase();
      if (status === 'done') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      if (status === 'assigned') return 'bg-blue-50 text-blue-700 border-blue-200';
      if (status === 'in_progress') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      if (status === 'cancelled') return 'bg-red-50 text-red-700 border-red-200';
      return 'bg-amber-50 text-amber-700 border-amber-200';
    };

    const label = (statusRaw: string) => {
      const status = String(statusRaw || 'pending').toLowerCase();
      if (status === 'in_progress') return 'In Progress';
      return status.charAt(0).toUpperCase() + status.slice(1);
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Requests History</h2>
            <p className="text-sm text-gray-500 font-medium">Client/Admin timeline by status</p>
          </div>
          <select
            value={requestHistoryStatus}
            onChange={(e) => setRequestHistoryStatus(e.target.value as any)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {requestHistoryLoading ? (
          <div className="p-10 rounded-2xl border border-gray-200 bg-white text-gray-500 font-semibold">
            Loading request history...
          </div>
        ) : requestHistory.length === 0 ? (
          <div className="p-10 rounded-2xl border border-gray-200 bg-white text-gray-500 font-semibold">
            No requests found for this filter.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-left border-collapse min-w-[980px]">
              <thead>
                <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
                  <th className="px-4 py-3">Request</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Worker</th>
                  <th className="px-4 py-3">Budget</th>
                  <th className="px-4 py-3">Images</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requestHistory.map((request) => (
                  <tr key={request.id_request} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">#{request.id_request}</p>
                      <p className="text-xs text-gray-500 line-clamp-1">{request.location_text}</p>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-800">{request.service_name}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-800">{request.client?.name || 'Guest'}</p>
                      <p className="text-xs text-gray-500">{request.client?.email || 'No email'}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{request.assigned_worker?.name || 'Unassigned'}</td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-800">${Number(request.budget || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{request.images_count}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${badgeClass(request.status)}`}>
                        {label(request.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{new Date(request.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderOverviewTab = () => (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {stats.map((stat, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
            key={stat.title}
            className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 border border-white shadow-xl shadow-gray-200/20 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300"
          >
            <div className={`absolute -right-10 -top-10 w-32 h-32 ${stat.bg} rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700`} />
            <div className="flex justify-between items-start mb-6">
              <div className={`p-3.5 rounded-2xl ${stat.bg} ${stat.color} shadow-sm border border-white/50 backdrop-blur-md`}>
                <stat.icon size={24} />
              </div>
              {stat.change && (
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm ${
                  stat.trending === 'up' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'
                }`}>
                  {stat.trending === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {stat.change}
                </span>
              )}
            </div>
            <div className="relative z-10">
              <h3 className="text-gray-500 text-sm font-semibold mb-1">{stat.title}</h3>
              <p className="text-3xl font-black text-gray-900 tracking-tight">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="lg:col-span-2 bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl shadow-gray-200/20 p-6 flex flex-col h-[420px]"
        >
          <div className="flex justify-between items-end mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Revenue Overview</h3>
              <p className="text-sm text-gray-500 font-medium">Monthly generated income vs projected</p>
            </div>
            <select className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-xl px-4 py-2 font-medium outline-none focus:ring-2 focus:ring-bird-blue/20">
              <option>Last 6 Months</option>
              <option>This Year</option>
              <option>All Time</option>
            </select>
          </div>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={DEFAULT_REVENUE_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0090FF" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#0090FF" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFC20E" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#FFC20E" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} tickFormatter={(value) => `$${value}`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ fontWeight: 'bold' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Area type="monotone" name="Actual Revenue" dataKey="uv" stroke="#0090FF" strokeWidth={3} fillOpacity={1} fill="url(#colorUv)" />
                <Area type="monotone" name="Projected" dataKey="pv" stroke="#FFC20E" strokeWidth={3} fillOpacity={1} fill="url(#colorPv)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl shadow-gray-200/20 p-6 flex flex-col h-[420px]"
        >
          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-900">User Growth</h3>
            <p className="text-sm text-gray-500 font-medium">Weekly active registrations</p>
          </div>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboardStats?.trafficData || DEFAULT_TRAFFIC_DATA} margin={{ top: 10, right: 0, left: -25, bottom: 0 }} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: '#F3F4F6'}}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="Users" fill="#0090FF" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Pros" fill="#FF8000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="lg:col-span-2" />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-gray-900 rounded-3xl border border-gray-800 shadow-2xl p-6 flex flex-col text-white relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-bird-blue/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-bird-orange/20 rounded-full blur-3xl" />
          <h3 className="text-lg font-bold mb-8 relative z-10 flex items-center gap-2">
            <Activity size={20} className="text-bird-lightBlue" />
            Live System Health
          </h3>
          <div className="space-y-8 flex-1 relative z-10">
            {[
              { label: 'Server CPU', value: '42%', width: '42%', color: 'from-bird-lightBlue to-bird-blue' },
              { label: 'Database Load', value: '78%', width: '78%', color: 'from-bird-yellow to-bird-orange' },
              { label: 'Storage API', value: '12%', width: '12%', color: 'bg-emerald-500' },
            ].map((bar, i) => (
              <div key={bar.label}>
                <div className="flex justify-between text-sm mb-3">
                  <span className="font-semibold text-gray-400">{bar.label}</span>
                  <span className="font-bold text-white">{bar.value}</span>
                </div>
                <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden shadow-inner border border-gray-700">
                  <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: bar.width }} 
                    transition={{ duration: 1.5, delay: 0.8 + i * 0.2, ease: "easeOut" }}
                    className={`h-full rounded-full relative ${bar.color.startsWith('bg-') ? bar.color : `bg-gradient-to-r ${bar.color}`}`}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 pt-6 border-t border-gray-800 relative z-10">
            <button className="w-full py-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all backdrop-blur-md border border-white/10 flex items-center justify-center gap-2 group">
              Generate Full Report
              <ArrowUpRight size={18} className="text-gray-400 group-hover:text-white transition-colors" />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );

  // ─── RENDER: Platform Settings Tab ───────────────────────────────────────
  const renderPlatformSettingsTab = () => (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-10">
      <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 md:p-8 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Homepage Carousel Manager</h2>
            <p className="text-gray-600 mt-1">
              Update hero slides (text + image) from admin. Images are auto-cropped to 16:9.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleAddSlide}
              disabled={isSavingHeroSlides}
              className="px-4 py-2.5 rounded-xl border border-bird-blue bg-bird-blue/10 text-bird-darkBlue font-bold hover:bg-bird-blue/20 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300"
            >
              + Add Slide
            </button>
            <button
              onClick={handleResetHeroSlides}
              disabled={isSavingHeroSlides}
              className="px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 font-bold hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
            >
              Restore Default
            </button>
            <button
              onClick={handleSaveHeroSlides}
              disabled={isSavingHeroSlides}
              className="px-4 py-2.5 rounded-xl bg-bird-blue text-white font-bold hover:bg-bird-darkBlue disabled:bg-gray-300"
            >
              {isSavingHeroSlides ? 'Saving...' : 'Save Carousel'}
            </button>
          </div>
        </div>

        {settingsNotice && (
          <div className="mt-4 rounded-xl border border-bird-blue/20 bg-bird-blue/10 text-bird-darkBlue px-4 py-3 text-sm font-semibold">
            {settingsNotice}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {heroSlidesDraft.map((slide, index) => (
          <div
            key={slide.id}
            className="bg-white/80 border border-gray-200 rounded-3xl p-5 md:p-6 shadow-lg space-y-4 hover:shadow-xl transition-all"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900">Slide {index + 1}</h3>
              <div className="flex items-center gap-2">
                {unsavedSlideIds.includes(slide.id) && (
                  <span className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                    Unsaved
                  </span>
                )}
                <span className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  16:9
                </span>
                <button
                  onClick={() => handleDeleteSlide(slide.id)}
                  disabled={isSavingHeroSlides || heroSlidesDraft.length <= 1}
                  className="text-xs font-bold px-2.5 py-1 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="aspect-video rounded-2xl overflow-hidden border border-gray-200 bg-gray-100 shadow-inner">
              {slide.image ? (
                <img src={slide.image} alt={`Slide ${index + 1}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex flex-col items-center justify-center text-gray-500">
                  <div className="text-3xl font-black text-bird-blue leading-none">+</div>
                  <div className="text-sm font-bold mt-2">No image selected</div>
                  <div className="text-xs">Upload below</div>
                </div>
              )}
            </div>

            <label className="block">
              <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Replace Image</span>
              <div className="w-full rounded-2xl border-2 border-dashed border-gray-300 bg-gradient-to-br from-white to-sky-50 hover:from-sky-50 hover:to-blue-50 hover:border-bird-blue transition p-4 text-center cursor-pointer">
                <div className="text-bird-blue text-2xl font-black leading-none">+</div>
                <div className="text-gray-900 font-black mt-1">Image Upload Zone</div>
                <div className="text-xs text-gray-500">PNG/JPG/WEBP, auto-center crop to 1600 x 900</div>
                <span className="inline-block mt-3 bg-bird-blue text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow">
                  {uploadingSlideId === slide.id ? 'Uploading...' : 'Select Image'}
                </span>
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={(e) => handleImageUpload(index, e)}
                className="hidden"
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Tag</span>
                <input
                  value={slide.tag}
                  onChange={(e) => updateSlideField(index, 'tag', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Button Text</span>
                <input
                  value={slide.cta}
                  onChange={(e) => updateSlideField(index, 'cta', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"
                />
              </label>
            </div>

            <label className="block">
              <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Title</span>
              <input
                value={slide.title}
                onChange={(e) => updateSlideField(index, 'title', e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</span>
              <textarea
                value={slide.description}
                onChange={(e) => updateSlideField(index, 'description', e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );

  // ─── TAB CONTENT ROUTER ───────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      case 'Services': return renderServicesTab();
      case 'Homepage Cards': return renderServicesTab();
      case 'Users & Pros': return renderUsersTab();
      case 'Requests History': return renderRequestsHistoryTab();
      case 'Platform Settings': return renderPlatformSettingsTab();
      default: return renderOverviewTab();
    }
  };

  const fetchRequestsHistory = async (
    status: 'all' | 'pending' | 'assigned' | 'in_progress' | 'done' | 'cancelled' = requestHistoryStatus
  ) => {
    setRequestHistoryLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin.requestsHistory}?status=${status}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        setRequestHistory(data.requests);
      }
    } catch {
      // silent
    } finally {
      setRequestHistoryLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex bg-gray-50/90 backdrop-blur-xl overflow-hidden text-gray-900 font-sans">
      
      {/* Decorative Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[40vw] h-[40vw] bg-bird-blue/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[35vw] h-[35vw] bg-bird-yellow/5 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] right-[30%] w-[20vw] h-[20vw] bg-bird-orange/5 rounded-full blur-[90px]" />
      </div>

      {/* Document Preview Modal */}
      <AnimatePresence>
        {previewDoc && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in-up" style={{ animationDuration: '0.3s' }} onClick={() => setPreviewDoc(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl overflow-hidden relative z-10 w-full max-w-4xl max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50/80 backdrop-blur-md">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <FileText size={18} className="text-bird-blue" />
                  {previewDoc.name}
                </h3>
                <div className="flex items-center gap-2">
                  <a 
                    href={previewDoc.url} 
                    download 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-gradient-to-r from-bird-blue to-bird-darkBlue text-white text-sm font-bold rounded-xl shadow-lg shadow-bird-blue/20 hover:scale-[1.02] transition-all flex items-center gap-2"
                  >
                    <Download size={16} /> Download
                  </a>
                  <button onClick={() => setPreviewDoc(null)} className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-500 rounded-xl transition-colors">
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-gray-100/50 flex items-center justify-center p-4 min-h-[500px]">
                {previewDoc.url.toLowerCase().endsWith('.pdf') ? (
                  <iframe src={previewDoc.url} className="w-full h-full rounded-2xl shadow-sm border border-gray-200 bg-white" title={previewDoc.name} />
                ) : (
                  <img src={previewDoc.url} alt={previewDoc.name} className="max-w-full max-h-full object-contain rounded-2xl shadow-sm bg-white" />
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sidebar Overlay - Mobile */}
      <AnimatePresence>
        {!isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(true)}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={{ x: -280, width: 280 }}
        animate={{ x: isSidebarOpen ? 0 : -280, width: isSidebarCollapsed ? 88 : 280 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed lg:relative z-50 h-full bg-white/80 backdrop-blur-2xl border-r border-gray-200/50 shadow-2xl lg:shadow-[4px_0_24px_rgba(0,0,0,0.02)] flex flex-col"
      >
        <div className={`h-24 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between px-6'} border-b border-gray-100/50 transition-all duration-300`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-bird-blue to-bird-darkBlue flex shrink-0 items-center justify-center shadow-lg shadow-bird-blue/30 relative overflow-hidden group">
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              <span className="text-white font-black text-xl relative z-10">F</span>
            </div>
            {!isSidebarCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col overflow-hidden whitespace-nowrap">
                <span className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-700 block leading-none">Fixlife</span>
                <span className="text-[10px] font-bold text-bird-blue tracking-widest uppercase">Admin Panel</span>
              </motion.div>
            )}
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={20} />
          </button>
        </div>

        {/* Collapse Toggle */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden lg:flex absolute -right-3 top-8 w-6 h-6 bg-white border border-gray-200 rounded-full items-center justify-center text-gray-500 hover:text-bird-blue hover:border-bird-blue shadow-sm z-50 transition-all"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <nav className={`flex-1 ${isSidebarCollapsed ? 'px-3' : 'px-4'} py-8 space-y-2 overflow-y-auto custom-scrollbar`}>
          {navItems.map((item) => {
            const isActive = activeTab === item.name;
            return (
              <div key={item.name} className="relative group/nav">
                <button
                  onClick={() => setActiveTab(item.name)}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start gap-3 px-4'} py-3.5 rounded-2xl transition-all duration-300 group relative overflow-hidden
                    ${isActive 
                      ? 'text-bird-darkBlue font-bold shadow-sm border border-bird-blue/10 bg-white' 
                      : 'text-gray-500 hover:bg-white hover:text-gray-900 hover:shadow-sm font-medium border border-transparent'}`}
                >
                  {isActive && (
                    <motion.div layoutId="activeNavBg" className="absolute inset-0 bg-gradient-to-r from-bird-blue/10 to-transparent" />
                  )}
                  <item.icon size={20} className={`relative z-10 shrink-0 ${isActive ? 'text-bird-blue' : 'text-gray-400 group-hover:text-bird-blue transition-colors'}`} />
                  {!isSidebarCollapsed && <span className="relative z-10 whitespace-nowrap">{item.name}</span>}
                  {isActive && (
                    <motion.div layoutId="activeNavIndicator" className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-bird-blue rounded-r-full" />
                  )}
                </button>
                {isSidebarCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-3 py-2 bg-gray-900 text-white text-xs font-bold rounded-lg opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible transition-all whitespace-nowrap shadow-xl z-50">
                    {item.name}
                    <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* User Profile */}
        <div className={`p-4 border-t border-gray-100/50 pb-6`}>
          {!isSidebarCollapsed ? (
            <div className="bg-gray-50 rounded-2xl p-4 mb-4 flex items-center gap-3 border border-gray-100">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-bird-orange via-bird-yellow to-bird-blue p-[2px] shrink-0">
                <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-white">
                  <img src="https://randomuser.me/api/portraits/women/44.jpg" alt="Admin" className="w-full h-full object-cover" />
                </div>
              </div>
              <div className="overflow-hidden">
                <p className="font-bold text-gray-900 text-sm whitespace-nowrap truncate">{user?.name || 'System'} {user?.lastname || 'Admin'}</p>
                <p className="text-gray-500 text-xs truncate">Super Admin</p>
              </div>
            </div>
          ) : (
            <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-tr from-bird-orange via-bird-yellow to-bird-blue p-[2px] mb-4 shrink-0 cursor-pointer">
              <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-white">
                <img src="https://randomuser.me/api/portraits/women/44.jpg" alt="Admin" className="w-full h-full object-cover" />
              </div>
            </div>
          )}
          <button onClick={handleLogout} className={`w-full flex items-center justify-center ${isSidebarCollapsed ? 'p-3' : 'gap-2 px-4 py-3.5'} rounded-xl border border-gray-200 text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all font-bold shadow-sm group`}>
            <LogOut size={18} className="shrink-0 group-hover:-translate-x-1 transition-transform" />
            {!isSidebarCollapsed && <span className="whitespace-nowrap">Close Dashboard</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative z-10">
        {/* Top Header */}
        <header className="h-24 bg-white/40 backdrop-blur-xl border-b border-gray-200/50 flex items-center justify-between px-6 md:px-10 z-20 sticky top-0 shadow-[0_4px_30px_rgba(0,0,0,0.01)]">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden p-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-bird-blue hover:border-bird-blue/50 transition-colors shadow-sm"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-black text-gray-900 hidden sm:block tracking-tight">{activeTab}</h1>
              <p className="text-sm text-gray-500 hidden sm:block font-medium">Welcome back, here's what's happening today.</p>
            </div>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            <div className="relative hidden md:block group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-bird-blue transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Search users, pros, or transactions..." 
                className="w-80 pl-11 pr-4 py-2.5 bg-white/80 border border-gray-200 rounded-full text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all shadow-sm backdrop-blur-md"
              />
            </div>
            <button className="relative p-2.5 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-bird-blue hover:border-bird-blue/30 hover:shadow-md transition-all">
              <Bell size={20} />
              {pendingWorkers.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full border-[2.5px] border-white text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingWorkers.length}
                </span>
              )}
            </button>
            <div className="flex items-center gap-3 pl-4 md:pl-6 border-l border-gray-200">
              <div className="hidden md:block text-right">
                <p className="font-bold text-gray-900 text-sm">{user?.name || 'System'} {user?.lastname || 'Admin'}</p>
                <p className="text-bird-blue text-xs font-bold">Super User</p>
              </div>
              <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-bird-orange via-bird-yellow to-bird-blue p-[2px] shadow-md cursor-pointer hover:scale-105 transition-transform">
                <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-white">
                  <img src="https://randomuser.me/api/portraits/women/44.jpg" alt="Admin" className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-[1600px] mx-auto pb-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {renderTabContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
};


