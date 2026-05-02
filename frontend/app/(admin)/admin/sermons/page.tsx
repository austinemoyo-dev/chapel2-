'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/providers/ToastProvider';
import {
  adminListSermons,
  adminCreateSermon,
  adminUpdateSermon,
  adminDeleteSermon,
  type AdminSermon,
  type SermonTag,
} from '@/lib/api/sermonsService';
import { ApiError } from '@/lib/api/client';

// ─── Tag display config ────────────────────────────────────────────────────────
const TAG_OPTIONS: { value: SermonTag; label: string; color: string }[] = [
  { value: 'midweek', label: 'Midweek', color: '#7C3AED' },
  { value: 'sunday',  label: 'Sunday',  color: '#6D28D9' },
  { value: 'special', label: 'Special', color: '#A855F7' },
];

const TAG_BG: Record<SermonTag, string> = {
  midweek: 'linear-gradient(135deg, #5000AA, #9B00FF)',
  sunday:  'linear-gradient(135deg, #2D0062, #7C00E0)',
  special: 'linear-gradient(135deg, #8B00FF, #E040FF)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ─── Empty form ───────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  title:            '',
  speaker:          '',
  description:      '',
  service_date:     '',
  tag:              'sunday' as SermonTag,
  video_url:        '',
  duration_minutes: '' as number | '',
  sort_order:       0,
  is_published:     true,
};

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminSermonsPage() {
  const { addToast } = useToast();
  const audioInputRef     = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const [sermons, setSermons]           = useState<AdminSermon[]>([]);
  const [loading, setLoading]           = useState(true);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editing, setEditing]           = useState<AdminSermon | null>(null);
  const [saving, setSaving]             = useState(false);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [form, setForm]                 = useState(EMPTY_FORM);
  const [mediaMode, setMediaMode]       = useState<'audio' | 'video'>('audio');
  const [audioFile, setAudioFile]       = useState<File | null>(null);
  const [thumbFile, setThumbFile]       = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [removeAudio, setRemoveAudio]   = useState(false);
  const [removeThumb, setRemoveThumb]   = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = async () => {
    try {
      setSermons(await adminListSermons());
    } catch {
      addToast('Failed to load sermons', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Open modal ─────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setMediaMode('audio');
    setAudioFile(null);
    setThumbFile(null);
    setThumbPreview(null);
    setRemoveAudio(false);
    setRemoveThumb(false);
    setModalOpen(true);
  };

  const openEdit = (s: AdminSermon) => {
    setEditing(s);
    setForm({
      title:            s.title,
      speaker:          s.speaker,
      description:      s.description,
      service_date:     s.service_date,
      tag:              s.tag,
      video_url:        s.video_url ?? '',
      duration_minutes: s.duration_minutes ?? '',
      sort_order:       s.sort_order,
      is_published:     s.is_published,
    });
    setMediaMode(s.audio_url ? 'audio' : 'video');
    setAudioFile(null);
    setThumbFile(null);
    setThumbPreview(s.thumbnail_url ?? null);
    setRemoveAudio(false);
    setRemoveThumb(false);
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditing(null); };

  // ── Thumbnail file ─────────────────────────────────────────────────────────
  const handleThumb = (file: File | null) => {
    if (!file) return;
    setThumbFile(file);
    setRemoveThumb(false);
    setThumbPreview(URL.createObjectURL(file));
  };

  const clearThumb = () => {
    setThumbFile(null);
    setThumbPreview(null);
    setRemoveThumb(true);
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.title.trim())   { addToast('Title is required', 'error');       return; }
    if (!form.speaker.trim()) { addToast('Speaker is required', 'error');     return; }
    if (!form.service_date)   { addToast('Service date is required', 'error'); return; }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title',        form.title.trim());
      fd.append('speaker',      form.speaker.trim());
      fd.append('description',  form.description.trim());
      fd.append('service_date', form.service_date);
      fd.append('tag',          form.tag);
      fd.append('sort_order',   String(form.sort_order));
      fd.append('is_published', form.is_published ? 'true' : 'false');
      if (form.duration_minutes !== '') fd.append('duration_minutes', String(form.duration_minutes));

      if (mediaMode === 'audio' && audioFile) {
        fd.append('audio_file', audioFile);
        fd.append('video_url', '');
      } else if (mediaMode === 'video') {
        fd.append('video_url', form.video_url);
        if (removeAudio) fd.append('remove_audio', 'true');
      }

      if (thumbFile)       fd.append('thumbnail', thumbFile);
      if (removeThumb)     fd.append('remove_thumbnail', 'true');

      if (editing) {
        await adminUpdateSermon(editing.id, fd);
        addToast('Sermon updated', 'success');
      } else {
        await adminCreateSermon(fd);
        addToast('Sermon created', 'success');
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
      await adminDeleteSermon(id);
      addToast('Sermon deleted', 'success');
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
          <h1 className="text-2xl font-black text-foreground tracking-tight">Sermon Library</h1>
          <p className="text-sm text-muted mt-0.5">Upload and manage sermons shown on the church website</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white
                     shadow-[0_4px_16px_rgba(124,58,237,0.35)]"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
          </svg>
          Add Sermon
        </button>
      </div>

      {/* Sermon list */}
      {loading ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((k) => (
            <div key={k} className="rounded-3xl border border-border bg-surface animate-pulse">
              <div className="h-28 bg-surface-3 rounded-t-3xl"/>
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 rounded-full bg-surface-3"/>
                <div className="h-3 w-1/2 rounded-full bg-surface-3"/>
              </div>
            </div>
          ))}
        </div>
      ) : sermons.length === 0 ? (
        <div className="text-center py-20 text-muted">
          <div className="w-16 h-16 rounded-3xl bg-primary/8 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/>
            </svg>
          </div>
          <p className="font-semibold">No sermons yet</p>
          <p className="text-sm mt-1">Upload your first sermon to display it on the website</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {sermons.map((s) => (
            <div key={s.id} className="rounded-3xl overflow-hidden border border-border bg-surface
                                        shadow-[var(--shadow-card)] flex flex-col">
              {/* Header — thumbnail or tag gradient */}
              <div className="relative h-28 shrink-0 overflow-hidden">
                {s.thumbnail_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.thumbnail_url} alt={s.title} className="absolute inset-0 w-full h-full object-cover"/>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent pointer-events-none"/>
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center"
                       style={{ background: TAG_BG[s.tag] }}>
                    <svg className="w-10 h-10 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/>
                    </svg>
                  </div>
                )}

                {/* Badges */}
                <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1.5 z-10">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold
                                    ${s.is_published ? 'bg-success/80 text-white' : 'bg-black/50 text-white/70'}`}>
                    {s.is_published ? 'Published' : 'Draft'}
                  </span>
                  {/* Media type badge */}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/50 text-white/80">
                    {s.audio_url ? '🎵 Audio' : s.video_url ? '🎬 Video' : '—'}
                  </span>
                </div>

                {/* Tag bottom-left */}
                <div className="absolute bottom-2 left-3 z-10">
                  <span className="text-white/80 text-[10px] font-bold uppercase tracking-widest">
                    {s.tag}
                  </span>
                </div>
              </div>

              {/* Details */}
              <div className="p-4 flex-1 flex flex-col gap-1">
                <p className="font-black text-sm text-foreground leading-snug line-clamp-2">{s.title}</p>
                <p className="text-xs text-muted">
                  {s.speaker} · {fmtDate(s.service_date)}
                  {s.duration_minutes ? ` · ${s.duration_minutes} min` : ''}
                </p>
                {s.description && (
                  <p className="text-xs text-muted/80 line-clamp-2 mt-0.5">{s.description}</p>
                )}
              </div>

              {/* Actions */}
              {confirmDeleteId === s.id ? (
                <div className="px-4 pb-4 flex items-center gap-2">
                  <p className="text-xs text-danger font-semibold flex-1">Delete this sermon?</p>
                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={deletingId === s.id}
                    className="px-3 py-1.5 rounded-xl bg-danger text-white text-xs font-bold disabled:opacity-50"
                  >
                    {deletingId === s.id ? '…' : 'Yes, delete'}
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-1.5 rounded-xl bg-surface-2 text-muted text-xs font-bold">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="px-4 pb-4 flex gap-2">
                  <button onClick={() => openEdit(s)}
                          className="flex-1 py-2 rounded-2xl text-xs font-bold text-primary
                                     bg-primary/8 border border-primary/15 hover:bg-primary/14 transition-colors">
                    Edit
                  </button>
                  <button onClick={() => setConfirmDeleteId(s.id)}
                          className="flex-1 py-2 rounded-2xl text-xs font-bold text-danger
                                     bg-danger-muted border border-danger/15 hover:bg-danger/10 transition-colors">
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
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"/>

          <div className="relative z-10 w-full sm:max-w-lg rounded-t-[2rem] sm:rounded-[2rem]
                          bg-[rgba(255,255,255,0.96)] backdrop-blur-3xl overflow-hidden
                          shadow-[0_-4px_40px_rgba(0,0,0,0.18)] animate-slide-up-fade
                          max-h-[92dvh] flex flex-col">

            {/* Modal header */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-border/40 shrink-0">
              <h2 className="text-lg font-black text-foreground tracking-tight">
                {editing ? 'Edit Sermon' : 'New Sermon'}
              </h2>
              <button onClick={closeModal}
                      className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center
                                 text-muted hover:text-foreground transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted">
                  Sermon Title <span className="text-danger">*</span>
                </label>
                <input type="text" placeholder="e.g. Walking in Purpose"
                       value={form.title}
                       onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                       className="w-full input-glass rounded-2xl px-4 py-3 text-sm text-foreground
                                  placeholder:text-muted/40 focus:outline-none"
                       style={{ fontSize: '16px' }}/>
              </div>

              {/* Speaker + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted">
                    Speaker <span className="text-danger">*</span>
                  </label>
                  <input type="text" placeholder="Chaplain"
                         value={form.speaker}
                         onChange={(e) => setForm((p) => ({ ...p, speaker: e.target.value }))}
                         className="w-full input-glass rounded-2xl px-4 py-3 text-sm text-foreground
                                    placeholder:text-muted/40 focus:outline-none"
                         style={{ fontSize: '16px' }}/>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted">
                    Service Date <span className="text-danger">*</span>
                  </label>
                  <input type="date" value={form.service_date}
                         onChange={(e) => setForm((p) => ({ ...p, service_date: e.target.value }))}
                         className="w-full input-glass rounded-2xl px-4 py-3 text-sm text-foreground
                                    focus:outline-none"
                         style={{ fontSize: '16px' }}/>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted">Description</label>
                <textarea rows={2} placeholder="Brief description of the sermon…"
                          value={form.description}
                          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                          className="w-full input-glass rounded-2xl px-4 py-3 text-sm text-foreground
                                     placeholder:text-muted/40 focus:outline-none resize-none"
                          style={{ fontSize: '16px' }}/>
              </div>

              {/* Tag + Duration */}
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted">Category</label>
                  <div className="flex gap-2 flex-wrap">
                    {TAG_OPTIONS.map((opt) => (
                      <button key={opt.value} type="button"
                              onClick={() => setForm((p) => ({ ...p, tag: opt.value }))}
                              className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                              style={
                                form.tag === opt.value
                                  ? { background: opt.color, color: 'white', boxShadow: `0 4px 12px ${opt.color}44` }
                                  : { background: 'rgba(0,0,0,0.05)', color: '#6E6A8A', border: '1.5px solid rgba(0,0,0,0.08)' }
                              }>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted">
                    Duration (min)
                  </label>
                  <input type="number" min={1} placeholder="45"
                         value={form.duration_minutes}
                         onChange={(e) => setForm((p) => ({ ...p, duration_minutes: e.target.value ? Number(e.target.value) : '' }))}
                         className="w-full input-glass rounded-2xl px-4 py-3 text-sm text-foreground
                                    placeholder:text-muted/40 focus:outline-none"
                         style={{ fontSize: '16px' }}/>
                </div>
              </div>

              {/* Media mode toggle */}
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted">Media</label>
                <div className="flex rounded-2xl overflow-hidden border border-border">
                  <button type="button"
                          onClick={() => setMediaMode('audio')}
                          className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5
                                      transition-colors ${mediaMode === 'audio'
                                        ? 'bg-primary text-white'
                                        : 'bg-surface-2 text-muted hover:text-foreground'}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/>
                    </svg>
                    Upload Audio File
                  </button>
                  <button type="button"
                          onClick={() => setMediaMode('video')}
                          className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5
                                      transition-colors ${mediaMode === 'video'
                                        ? 'bg-primary text-white'
                                        : 'bg-surface-2 text-muted hover:text-foreground'}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                    </svg>
                    Video Link
                  </button>
                </div>

                {mediaMode === 'audio' ? (
                  audioFile ? (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-success-muted
                                    border border-success/20">
                      <svg className="w-5 h-5 text-success shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <span className="text-xs text-success font-semibold flex-1 truncate">{audioFile.name}</span>
                      <button type="button" onClick={() => { setAudioFile(null); setRemoveAudio(true); if (audioInputRef.current) audioInputRef.current.value = ''; }}
                              className="text-xs text-danger font-bold">Remove</button>
                    </div>
                  ) : editing?.audio_url && !removeAudio ? (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface-2 border border-border">
                      <svg className="w-5 h-5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/>
                      </svg>
                      <span className="text-xs text-muted flex-1">Current audio file</span>
                      <button type="button" onClick={() => { setRemoveAudio(true); if (audioInputRef.current) audioInputRef.current.value = ''; }}
                              className="text-xs text-danger font-bold">Remove</button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center gap-2 p-5 rounded-2xl cursor-pointer
                                      border-2 border-dashed border-primary/25 hover:border-primary/50
                                      bg-primary/3 hover:bg-primary/5 transition-all">
                      <svg className="w-7 h-7 text-primary/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                      </svg>
                      <span className="text-sm font-semibold text-muted">Upload audio file</span>
                      <span className="text-xs text-muted/60">MP3, WAV, M4A — up to 100 MB</span>
                      <input ref={audioInputRef} type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/m4a,audio/*"
                             className="hidden"
                             onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}/>
                    </label>
                  )
                ) : (
                  <input type="url" placeholder="https://youtube.com/watch?v=..."
                         value={form.video_url}
                         onChange={(e) => setForm((p) => ({ ...p, video_url: e.target.value }))}
                         className="w-full input-glass rounded-2xl px-4 py-3 text-sm text-foreground
                                    placeholder:text-muted/40 focus:outline-none"
                         style={{ fontSize: '16px' }}/>
                )}
              </div>

              {/* Thumbnail */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted">
                  Thumbnail Image <span className="text-muted/50 normal-case font-normal">(optional)</span>
                </label>
                {thumbPreview ? (
                  <div className="relative rounded-2xl overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbPreview} alt="Thumbnail" className="w-full h-28 object-cover rounded-2xl"/>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-2xl pointer-events-none"/>
                    <div className="absolute bottom-2 inset-x-3 flex justify-end z-10">
                      <button type="button" onClick={clearThumb}
                              className="px-3 py-1 rounded-xl bg-danger text-white text-xs font-bold">
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer
                                    border border-dashed border-primary/25 hover:border-primary/50
                                    bg-primary/3 hover:bg-primary/5 transition-all">
                    <svg className="w-5 h-5 text-primary/50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M13.5 12h.008v.008H13.5V12z"/>
                    </svg>
                    <span className="text-xs text-muted font-semibold">Upload thumbnail (JPEG/PNG/WebP, max 5 MB)</span>
                    <input ref={thumbnailInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                           className="hidden"
                           onChange={(e) => handleThumb(e.target.files?.[0] ?? null)}/>
                  </label>
                )}
              </div>

              {/* Published + Sort */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-surface-2 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-foreground">Published</p>
                    <p className="text-[10px] text-muted">Visible on site</p>
                  </div>
                  <button type="button"
                          onClick={() => setForm((p) => ({ ...p, is_published: !p.is_published }))}
                          className={`relative w-10 h-5 rounded-full transition-colors duration-300
                                      ${form.is_published ? 'bg-success' : 'bg-border'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white
                                      shadow-sm transition-transform duration-300
                                      ${form.is_published ? 'translate-x-5' : 'translate-x-0'}`}/>
                  </button>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted">Sort Order</label>
                  <input type="number" min={0} value={form.sort_order}
                         onChange={(e) => setForm((p) => ({ ...p, sort_order: Number(e.target.value) }))}
                         className="w-full input-glass rounded-2xl px-4 py-3 text-sm text-foreground
                                    focus:outline-none"
                         style={{ fontSize: '16px' }}/>
                  <p className="text-[10px] text-muted px-1">0 = shown first</p>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-border/40 flex gap-3 shrink-0">
              <button onClick={closeModal}
                      className="flex-1 py-3 rounded-2xl text-sm font-bold text-muted bg-surface-2
                                 border border-border hover:bg-surface-3 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                      className="flex-1 py-3 rounded-2xl text-sm font-bold text-white
                                 shadow-[0_4px_16px_rgba(124,58,237,0.35)] disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)' }}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Upload Sermon'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
