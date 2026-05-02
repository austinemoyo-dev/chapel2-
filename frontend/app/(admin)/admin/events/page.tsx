'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/providers/ToastProvider';
import {
  adminListEvents,
  adminCreateEvent,
  adminUpdateEvent,
  adminDeleteEvent,
  type AdminChapelEvent,
  type EventTag,
} from '@/lib/api/eventsService';
import { ApiError } from '@/lib/api/client';

// ─── Tag display config ────────────────────────────────────────────────────────
const TAG_OPTIONS: { value: EventTag; label: string; color: string }[] = [
  { value: 'midweek',      label: 'Midweek',       color: '#7C3AED' },
  { value: 'sunday',       label: 'Sunday',        color: '#6D28D9' },
  { value: 'special',      label: 'Special',       color: '#A855F7' },
  { value: 'conference',   label: 'Conference',    color: '#4C1D95' },
  { value: 'announcement', label: 'Announcement',  color: '#9333EA' },
];

const TAG_GRADIENTS: Record<EventTag, string> = {
  midweek:      'linear-gradient(135deg, #5000AA, #9B00FF)',
  sunday:       'linear-gradient(135deg, #2D0062, #7C00E0)',
  special:      'linear-gradient(135deg, #8B00FF, #E040FF)',
  conference:   'linear-gradient(135deg, #1A0060, #6000CC)',
  announcement: 'linear-gradient(135deg, #3D0099, #A000FF)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ─── Empty form state ─────────────────────────────────────────────────────────
const EMPTY_FORM = {
  title: '',
  description: '',
  event_date: '',
  event_time: '',
  tag: 'special' as EventTag,
  sort_order: 0,
  is_published: true,
  is_featured: false,
};

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminEventsPage() {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [events, setEvents] = useState<AdminChapelEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminChapelEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [flyerFile, setFlyerFile] = useState<File | null>(null);
  const [flyerPreview, setFlyerPreview] = useState<string | null>(null);
  const [removeFlyerFlag, setRemoveFlyerFlag] = useState(false);
  const [otherFeatured, setOtherFeatured] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = async () => {
    try {
      const data = await adminListEvents();
      setEvents(data);
    } catch {
      addToast('Failed to load events', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Open modal ─────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFlyerFile(null);
    setFlyerPreview(null);
    setRemoveFlyerFlag(false);
    setOtherFeatured(null);
    setModalOpen(true);
  };

  const openEdit = (ev: AdminChapelEvent) => {
    setEditing(ev);
    setForm({
      title:        ev.title,
      description:  ev.description,
      event_date:   ev.event_date,
      event_time:   ev.event_time ?? '',
      tag:          ev.tag,
      sort_order:   ev.sort_order,
      is_published: ev.is_published,
      is_featured:  ev.is_featured,
    });
    setFlyerFile(null);
    setFlyerPreview(ev.flyer_url ?? null);
    setRemoveFlyerFlag(false);
    // Warn if another event is already featured
    const other = events.find((e) => e.is_featured && e.id !== ev.id);
    setOtherFeatured(other?.title ?? null);
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditing(null); };

  // ── Flyer ──────────────────────────────────────────────────────────────────
  const handleFlyer = (file: File | null) => {
    if (!file) return;
    setFlyerFile(file);
    setRemoveFlyerFlag(false);
    const url = URL.createObjectURL(file);
    setFlyerPreview(url);
  };

  const removeFlyer = () => {
    setFlyerFile(null);
    setFlyerPreview(null);
    setRemoveFlyerFlag(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.title.trim()) { addToast('Title is required', 'error'); return; }
    if (!form.event_date)   { addToast('Event date is required', 'error'); return; }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title',        form.title.trim());
      fd.append('description',  form.description.trim());
      fd.append('event_date',   form.event_date);
      fd.append('event_time',   form.event_time || '');
      fd.append('tag',          form.tag);
      fd.append('sort_order',   String(form.sort_order));
      fd.append('is_published', form.is_published ? 'true' : 'false');
      fd.append('is_featured',  form.is_featured  ? 'true' : 'false');
      if (flyerFile) fd.append('flyer', flyerFile);
      if (removeFlyerFlag) fd.append('remove_flyer', 'true');

      if (editing) {
        await adminUpdateEvent(editing.id, fd);
        addToast('Event updated', 'success');
      } else {
        await adminCreateEvent(fd);
        addToast('Event created', 'success');
      }
      closeModal();
      load();
    } catch (err) {
      addToast(err instanceof ApiError ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await adminDeleteEvent(id);
      addToast('Event deleted', 'success');
      setConfirmDeleteId(null);
      load();
    } catch {
      addToast('Delete failed', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Upcoming Events</h1>
          <p className="text-sm text-muted mt-0.5">Manage events shown on the public landing page</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white
                     shadow-[0_4px_16px_rgba(124,58,237,0.35)] btn-liquid"
          style={{ background: 'var(--color-primary)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
          </svg>
          Add Event
        </button>
      </div>

      {/* Event list */}
      {loading ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((k) => (
            <div key={k} className="rounded-3xl overflow-hidden border border-border bg-surface animate-pulse">
              <div className="h-36 bg-surface-3"/>
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 rounded-full bg-surface-3"/>
                <div className="h-3 w-1/2 rounded-full bg-surface-3"/>
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 text-muted glass-card rounded-[2rem]">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>
            </svg>
          </div>
          <p className="font-semibold text-foreground">No events yet</p>
          <p className="text-sm mt-1">Create your first event to display it on the landing page</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {events.map((ev) => (
            <div key={ev.id} className="glass-card card-lift flex flex-col border-0">
              {/* Flyer / gradient */}
              <div className="relative h-36 shrink-0 overflow-hidden">
                {ev.flyer_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ev.flyer_url} alt={ev.title} className="absolute inset-0 w-full h-full object-cover"/>
                    <div className="absolute inset-0 pointer-events-none"
                         style={{ background: 'rgba(80,0,180,0.18)' }}/>
                    <div className="absolute inset-0 pointer-events-none"
                         style={{ background: 'linear-gradient(to top, rgba(10,0,40,0.92) 0%, rgba(20,0,60,0.60) 50%, transparent 100%)' }}/>
                  </>
                ) : (
                  <div className="absolute inset-0" style={{ background: TAG_GRADIENTS[ev.tag] }}>
                    <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.07] w-20 h-20"
                         viewBox="0 0 48 48" fill="white" aria-hidden>
                      <rect x="20" y="4"  width="8"  height="40" rx="2"/>
                      <rect x="4"  y="18" width="40" height="8"  rx="2"/>
                    </svg>
                  </div>
                )}

                {/* Badges — top-right */}
                <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1.5 z-10">
                  {ev.is_featured && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                                     font-bold bg-yellow-400/90 text-yellow-900">
                      ⭐ Featured
                    </span>
                  )}
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold
                                    ${ev.is_published
                                      ? 'bg-success/80 text-white'
                                      : 'bg-black/50 text-white/70'}`}>
                    {ev.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>

                {/* Tag bottom-left */}
                <div className="absolute bottom-2.5 left-3 z-10">
                  <span className="text-white/80 text-[10px] font-bold uppercase tracking-widest">
                    {ev.tag}
                  </span>
                </div>
              </div>

              {/* Details */}
              <div className="p-4 flex-1 flex flex-col gap-1">
                <p className="font-black text-sm text-foreground leading-snug line-clamp-2">{ev.title}</p>
                <p className="text-xs text-muted">{fmtDate(ev.event_date)}{ev.event_time ? ` · ${fmtTime(ev.event_time)}` : ''}</p>
                {ev.description && (
                  <p className="text-xs text-muted/80 line-clamp-2 mt-0.5">{ev.description}</p>
                )}
              </div>

              {/* Actions */}
              {confirmDeleteId === ev.id ? (
                <div className="px-4 pb-4 flex items-center gap-2">
                  <p className="text-xs text-danger font-semibold flex-1">Delete this event?</p>
                  <button
                    onClick={() => handleDelete(ev.id)}
                    disabled={deletingId === ev.id}
                    className="px-3 py-1.5 rounded-xl bg-danger text-white text-xs font-bold disabled:opacity-50"
                  >
                    {deletingId === ev.id ? '…' : 'Yes, delete'}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-3 py-1.5 rounded-xl bg-surface-2 text-muted text-xs font-bold"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="px-4 pb-4 flex gap-2">
                  <button
                    onClick={() => openEdit(ev)}
                    className="flex-1 py-2 rounded-2xl text-xs font-bold text-primary
                               bg-primary/8 border border-primary/15 hover:bg-primary/14 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(ev.id)}
                    className="flex-1 py-2 rounded-2xl text-xs font-bold text-danger
                               bg-danger-muted border border-danger/15 hover:bg-danger/10 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
             onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md animate-fade-in"/>

          <div className="relative z-10 w-full sm:max-w-lg rounded-t-[2rem] sm:rounded-[2rem]
                          glass-panel overflow-hidden
                          shadow-[0_-4px_40px_rgba(0,0,0,0.2)] animate-slide-up-fade
                          max-h-[92dvh] flex flex-col">

            {/* Modal header */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-border/40 shrink-0">
              <h2 className="text-lg font-black text-foreground tracking-tight">
                {editing ? 'Edit Event' : 'New Event'}
              </h2>
              <button onClick={closeModal}
                      className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center
                                 text-muted hover:text-foreground transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Modal body — scrollable */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted">
                  Event Title <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Annual Chapel Week"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full input-glass rounded-2xl px-4 py-3 text-sm text-foreground
                             placeholder:text-muted/40 focus:outline-none"
                  style={{ fontSize: '16px' }}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted">
                  Writeup / Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Short description shown on the event card…"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full input-glass rounded-2xl px-4 py-3 text-sm text-foreground
                             placeholder:text-muted/40 focus:outline-none resize-none"
                  style={{ fontSize: '16px' }}
                />
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted">
                    Date <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.event_date}
                    onChange={(e) => setForm((p) => ({ ...p, event_date: e.target.value }))}
                    className="w-full input-glass rounded-2xl px-4 py-3 text-sm text-foreground
                               focus:outline-none"
                    style={{ fontSize: '16px' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted">
                    Time <span className="text-muted/50 normal-case font-normal">(optional)</span>
                  </label>
                  <input
                    type="time"
                    value={form.event_time}
                    onChange={(e) => setForm((p) => ({ ...p, event_time: e.target.value }))}
                    className="w-full input-glass rounded-2xl px-4 py-3 text-sm text-foreground
                               focus:outline-none"
                    style={{ fontSize: '16px' }}
                  />
                </div>
              </div>

              {/* Tag */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted">Category</label>
                <div className="flex flex-wrap gap-2">
                  {TAG_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, tag: opt.value }))}
                      className="px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200"
                      style={
                        form.tag === opt.value
                          ? { background: opt.color, color: 'white', boxShadow: `0 4px 12px ${opt.color}44` }
                          : { background: 'rgba(0,0,0,0.05)', color: '#6E6A8A', border: '1.5px solid rgba(0,0,0,0.08)' }
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Flyer upload */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted">
                  Event Flyer
                </label>
                {flyerPreview ? (
                  <div className="relative rounded-2xl overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={flyerPreview} alt="Flyer preview"
                         className="w-full h-40 object-cover rounded-2xl"/>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-2xl pointer-events-none"/>
                    <div className="absolute bottom-3 inset-x-3 flex items-center justify-between z-10">
                      <span className="text-white text-xs font-semibold">
                        {flyerFile ? flyerFile.name : 'Current flyer'}
                      </span>
                      <button
                        type="button"
                        onClick={removeFlyer}
                        className="px-3 py-1 rounded-xl bg-danger text-white text-xs font-bold"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center gap-2 p-6 rounded-2xl cursor-pointer
                                    border-2 border-dashed border-primary/25 hover:border-primary/50
                                    bg-primary/3 hover:bg-primary/6 transition-all">
                    <svg className="w-8 h-8 text-primary/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                    </svg>
                    <span className="text-sm font-semibold text-muted">Upload flyer image</span>
                    <span className="text-xs text-muted/60">JPEG, PNG, WebP — up to 5 MB</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => handleFlyer(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
              </div>

              {/* Featured toggle */}
              <div className="rounded-2xl border border-border bg-surface-2 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground">Featured Event</p>
                    <p className="text-xs text-muted mt-0.5">
                      Shows a live countdown timer on the landing page
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, is_featured: !p.is_featured }))}
                    className={`relative w-12 h-6 rounded-full transition-colors duration-300
                                ${form.is_featured ? 'bg-primary' : 'bg-border'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white
                                      shadow-sm transition-transform duration-300
                                      ${form.is_featured ? 'translate-x-6' : 'translate-x-0'}`}/>
                  </button>
                </div>
                {form.is_featured && otherFeatured && (
                  <p className="text-xs text-warning font-semibold bg-warning-muted px-3 py-2 rounded-xl">
                    ⚠️ &quot;{otherFeatured}&quot; is currently featured. Saving will replace it.
                  </p>
                )}
              </div>

              {/* Published + Sort order */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-surface-2 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-foreground">Published</p>
                    <p className="text-[10px] text-muted">Visible on site</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, is_published: !p.is_published }))}
                    className={`relative w-10 h-5 rounded-full transition-colors duration-300
                                ${form.is_published ? 'bg-success' : 'bg-border'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white
                                      shadow-sm transition-transform duration-300
                                      ${form.is_published ? 'translate-x-5' : 'translate-x-0'}`}/>
                  </button>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.sort_order}
                    onChange={(e) => setForm((p) => ({ ...p, sort_order: Number(e.target.value) }))}
                    className="w-full input-glass rounded-2xl px-4 py-3 text-sm text-foreground
                               focus:outline-none"
                    style={{ fontSize: '16px' }}
                  />
                  <p className="text-[10px] text-muted px-1">0 = shown first</p>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-border/40 flex gap-3 shrink-0">
              <button
                onClick={closeModal}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-muted bg-surface-2
                           border border-border hover:bg-surface-3 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white btn-liquid
                           shadow-[0_4px_16px_rgba(124,58,237,0.35)] disabled:opacity-50 bg-primary"
              >
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
