import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Type,
  AlignLeft,
  List,
  Plus,
  Trash2,
  GripVertical,
  Save,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { API_ENDPOINTS } from '../../../../config/api';
import { adminApi } from '../../api/adminApi';

interface HeroTextData {
  headline_prefix: string;
  description: string;
  roles: string[];
}

const HERO_TEXT_CACHE_KEY = 'fixlife_hero_text_v1';

const DEFAULT_HERO_TEXT: HeroTextData = {
  headline_prefix: 'Meet Fixlife, your',
  description:
    'Fixlife is a personal assistant that helps you stay organized, find trusted home professionals, and get chores done. All through messages.',
  roles: ['personal assistant.', 'trusted plumber.', 'expert electrician.', 'reliable cleaner.', 'local handyman.'],
};

interface RoleItem {
  id: string;
  text: string;
}

export const HeroTextEditor: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [headline, setHeadline] = useState(DEFAULT_HERO_TEXT.headline_prefix);
  const [description, setDescription] = useState(DEFAULT_HERO_TEXT.description);
  const [roles, setRoles] = useState<RoleItem[]>(() =>
    DEFAULT_HERO_TEXT.roles.map((r, i) => ({ id: `r-${i}`, text: r }))
  );
  const [newRole, setNewRole] = useState('');
  const newRoleRef = useRef<HTMLInputElement>(null);
  const [previewIdx, setPreviewIdx] = useState(0);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const data = await adminApi.get<{ success: boolean; headline_prefix: string; description: string; roles: string[] }>(API_ENDPOINTS.admin.heroTextPublic, true);
        if (data.success) {
          setHeadline(data.headline_prefix || DEFAULT_HERO_TEXT.headline_prefix);
          setDescription(data.description || DEFAULT_HERO_TEXT.description);
          if (Array.isArray(data.roles) && data.roles.length > 0) {
            setRoles(data.roles.map((r: string, i: number) => ({ id: `r-${Date.now()}-${i}`, text: r })));
          }
        }
      } catch { /* noop */ }
      finally { setLoading(false); }
    };
    void fetch_();
  }, []);

  useEffect(() => {
    if (roles.length === 0) return;
    const interval = setInterval(() => {
      setPreviewIdx((prev) => (prev + 1) % roles.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [roles.length]);

  const handleAddRole = () => {
    const trimmed = newRole.trim();
    if (!trimmed) return;
    setRoles((prev) => [...prev, { id: `r-${Date.now()}`, text: trimmed }]);
    setNewRole('');
    newRoleRef.current?.focus();
  };

  const handleDeleteRole = (id: string) => {
    setRoles((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateRole = (id: string, text: string) => {
    setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, text } : r)));
  };

  const handleReset = () => {
    setHeadline(DEFAULT_HERO_TEXT.headline_prefix);
    setDescription(DEFAULT_HERO_TEXT.description);
    setRoles(DEFAULT_HERO_TEXT.roles.map((r, i) => ({ id: `r-reset-${i}`, text: r })));
    setError(null);
  };

  const handleSave = async () => {
    const validRoles = roles.map((r) => r.text.trim()).filter((t) => t.length > 0);
    if (!headline.trim()) { setError('Headline prefix is required.'); return; }
    if (!description.trim()) { setError('Description is required.'); return; }
    if (validRoles.length === 0) { setError('At least one carousel role is required.'); return; }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.put(API_ENDPOINTS.admin.heroText, {
        headline_prefix: headline.trim(),
        description: description.trim(),
        roles: validRoles,
      });
      // invalidate public localStorage cache
      try { localStorage.removeItem(HERO_TEXT_CACHE_KEY); } catch { /* noop */ }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to save hero text.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8 text-slate-400 dark:text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm font-semibold">Loading hero text settings…</span>
      </div>
    );
  }

  const activeRole = roles[previewIdx % Math.max(roles.length, 1)]?.text || '';

  return (
    <section className="mb-10">
      {/* Section Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bird-blue/10 dark:bg-bird-blue/20">
          <Sparkles className="h-5 w-5 text-bird-blue" />
        </div>
        <div>
          <h3 className="text-base font-black text-slate-950 dark:text-slate-100">Hero Text &amp; Carousel Roles</h3>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Edit the headline, description, and animated role labels shown in the hero section.
          </p>
        </div>
      </div>

      {/* Live Preview */}
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-6 shadow-xl">
        <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Live Preview</p>
        <div className="flex flex-col items-start gap-1">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Hero Headline</p>
          <h2 className="text-2xl font-black text-white leading-tight">
            {headline || 'Meet Fixlife, your'}
            <br />
            <AnimatePresence mode="wait">
              <motion.span
                key={previewIdx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="bg-gradient-to-r from-bird-blue via-bird-yellow to-bird-orange bg-clip-text text-transparent"
              >
                {activeRole || 'personal assistant.'}
              </motion.span>
            </AnimatePresence>
          </h2>
          <p className="mt-2 text-xs font-medium text-slate-300 leading-relaxed max-w-md">
            {description || DEFAULT_HERO_TEXT.description}
          </p>
        </div>
      </div>

      <div className="grid gap-5">
        {/* Headline prefix */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 p-5">
          <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            <Type className="h-3.5 w-3.5" />
            Headline Prefix
          </label>
          <input
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={120}
            placeholder="Meet Fixlife, your"
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none placeholder-slate-400 focus:border-bird-blue focus:ring-2 focus:ring-bird-blue/20 transition"
          />
          <p className="mt-1 text-right text-[10px] font-semibold text-slate-400">{headline.length}/120</p>
        </div>

        {/* Description */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 p-5">
          <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            <AlignLeft className="h-3.5 w-3.5" />
            Hero Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Describe what Fixlife offers…"
            className="w-full resize-none rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100 leading-relaxed outline-none placeholder-slate-400 focus:border-bird-blue focus:ring-2 focus:ring-bird-blue/20 transition"
          />
          <p className="mt-1 text-right text-[10px] font-semibold text-slate-400">{description.length}/500</p>
        </div>

        {/* Carousel Roles */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 p-5">
          <label className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            <List className="h-3.5 w-3.5" />
            Animated Role Carousel
            <span className="ml-auto rounded-full bg-bird-blue/10 dark:bg-bird-blue/20 px-2.5 py-0.5 text-[10px] font-black text-bird-blue">
              {roles.length} items
            </span>
          </label>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
            Drag rows to reorder. These labels cycle in the hero headline animation.
          </p>

          <Reorder.Group values={roles} onReorder={setRoles} className="flex flex-col gap-2 mb-4">
            {roles.map((role) => (
              <Reorder.Item key={role.id} value={role}>
                <motion.div
                  layout
                  className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 group cursor-grab active:cursor-grabbing hover:border-bird-blue/40 transition"
                >
                  <GripVertical className="h-4 w-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={role.text}
                    onChange={(e) => handleUpdateRole(role.id, e.target.value)}
                    maxLength={80}
                    className="flex-1 bg-transparent text-sm font-bold text-slate-800 dark:text-slate-100 outline-none placeholder-slate-400"
                    placeholder="e.g. personal assistant."
                  />
                  <span className="text-[10px] font-semibold text-slate-400 shrink-0">{role.text.length}/80</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteRole(role.id)}
                    disabled={roles.length <= 1}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/30 text-rose-500 transition hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-30"
                    title="Delete role"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              </Reorder.Item>
            ))}
          </Reorder.Group>

          {/* Add new role */}
          <div className="flex gap-2">
            <input
              ref={newRoleRef}
              type="text"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRole(); } }}
              maxLength={80}
              placeholder="Add new role… e.g. expert carpenter."
              className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-900 dark:text-slate-100 outline-none placeholder-slate-400 focus:border-bird-blue focus:ring-2 focus:ring-bird-blue/20 transition"
            />
            <button
              type="button"
              onClick={handleAddRole}
              disabled={!newRole.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-bird-blue hover:bg-bird-darkBlue disabled:opacity-40 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white transition active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/30 px-4 py-3 text-sm font-semibold text-rose-600 dark:text-rose-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-bird-blue hover:bg-bird-darkBlue disabled:opacity-50 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-bird-blue/20 transition active:scale-95"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
        >
          <RotateCcw className="h-4 w-4" />
          Reset to Defaults
        </button>

        <AnimatePresence>
          {saved && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-1.5 text-sm font-bold text-emerald-500 dark:text-emerald-400"
            >
              <CheckCircle2 className="h-4 w-4" />
              Saved! Changes live on reload.
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};

export default HeroTextEditor;
