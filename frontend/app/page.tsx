'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import Logo from '@/components/ui/Logo';
import { useScrollReveal, useScrollY } from '@/lib/hooks/useScrollReveal';
import { getPublishedEvents, type ChapelEvent } from '@/lib/api/eventsService';
import { getPublishedSermons, type Sermon } from '@/lib/api/sermonsService';

/* ─── Tag → fallback gradient (used when no flyer uploaded) ─── */
const TAG_GRADIENTS: Record<string, [string, string]> = {
  midweek:      ['#5000AA', '#9B00FF'],
  sunday:       ['#2D0062', '#7C00E0'],
  special:      ['#8B00FF', '#E040FF'],
  conference:   ['#1A0060', '#6000CC'],
  announcement: ['#3D0099', '#A000FF'],
};

/* ─── Sermon tag → colour for the play-button icon when no thumbnail ─── */
const SERMON_TAG_COLOR: Record<string, string> = {
  midweek: '#7C3AED',
  sunday:  '#6D28D9',
  special: '#A855F7',
};

/* ─── Scroll reveal wrapper ─── */
function Reveal({
  children, delay = 0, dir = 'up', className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  dir?: 'up' | 'left' | 'scale';
  className?: string;
}) {
  const { ref, visible } = useScrollReveal<HTMLDivElement>();
  const base = dir === 'left'  ? 'sr-hidden-left'  :
               dir === 'scale' ? 'sr-hidden-scale'  : 'sr-hidden';
  const show = dir === 'left'  ? 'sr-visible-left'  :
               dir === 'scale' ? 'sr-visible-scale'  : 'sr-visible';
  return (
    <div
      ref={ref}
      className={`${base} ${visible ? show : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ─── Helpers ─── */
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-NG', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

/* ─── Event card — flyer blending ─── */
function EventCard({ ev, delay, onOpenFlyer }: { ev: ChapelEvent; delay: number; onOpenFlyer: (url: string) => void }) {
  const [from, to] = TAG_GRADIENTS[ev.tag] ?? ['#5000AA', '#9B00FF'];
  const timeStr = fmtTime(ev.event_time);

  return (
    <Reveal delay={delay}>
      {ev.flyer_url ? (
        <button type="button" onClick={() => ev.flyer_url && onOpenFlyer(ev.flyer_url)} className="block w-full h-full text-left focus:outline-none">
          <EventCardInner ev={ev} from={from} to={to} timeStr={timeStr} />
        </button>
      ) : (
        <EventCardInner ev={ev} from={from} to={to} timeStr={timeStr} />
      )}
    </Reveal>
  );
}

function EventCardInner({ ev, from, to, timeStr }: { ev: ChapelEvent; from: string; to: string; timeStr: string | null }) {
  return (
    <div className="glass-card card-lift overflow-hidden h-[420px] group cursor-pointer select-none relative flex flex-col justify-end">
      
      {/* ── Background: Flyer or Gradient ── */}
      <div className="absolute inset-0">
        {ev.flyer_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ev.flyer_url}
              alt={ev.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Purple brand tint */}
            <div className="absolute inset-0 pointer-events-none mix-blend-multiply"
                 style={{ background: 'rgba(80,0,180,0.18)' }}/>
            {/* Bottom gradient so text is readable */}
            <div className="absolute inset-0 pointer-events-none"
                 style={{ background: 'linear-gradient(to top, rgba(15,0,30,0.98) 0%, rgba(30,0,60,0.85) 40%, transparent 100%)' }}/>
          </>
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}/>
            <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.07] w-32 h-32"
                 viewBox="0 0 48 48" fill="white" aria-hidden>
              <rect x="20" y="4"  width="8"  height="40" rx="2"/>
              <rect x="4"  y="18" width="40" height="8"  rx="2"/>
            </svg>
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent pointer-events-none"/>
            <div className="absolute inset-0 pointer-events-none"
                 style={{ background: 'linear-gradient(to top, rgba(15,0,30,0.9) 0%, transparent 60%)' }}/>
          </>
        )}
      </div>

      {/* Hover shine */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/12 to-transparent
                      opacity-0 group-hover:opacity-100 -translate-x-full group-hover:translate-x-full
                      transition-all duration-700 pointer-events-none z-20"/>

      {/* ── Foreground Text ── */}
      <div className="relative z-10 px-5 pb-5 pt-12 space-y-2">
        <span className="inline-flex px-2.5 py-0.5 rounded-full text-white/90 text-[10px]
                         font-bold tracking-widest uppercase shadow-sm"
              style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)' }}>
          {ev.tag}
        </span>
        <h3 className="text-white font-black text-lg leading-snug line-clamp-2" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
          {ev.title}
        </h3>
        
        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-white/80" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
            <svg className="w-3.5 h-3.5 shrink-0 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            {fmtDate(ev.event_date)}
          </div>
          {timeStr && (
            <div className="flex items-center gap-2 text-sm font-bold text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
              <svg className="w-3.5 h-3.5 shrink-0 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              {timeStr}
            </div>
          )}
        </div>
        
        {ev.description && (
          <p className="text-xs text-white/60 leading-relaxed line-clamp-2 pt-1" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
            {ev.description}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Shimmer skeleton for loading state ─── */
function EventSkeleton() {
  return (
    <div className="glass-card overflow-hidden h-[420px] flex flex-col justify-end p-5">
      <div className="h-3 w-20 rounded-full shimmer-loading mb-3"/>
      <div className="h-5 w-3/4 rounded-full shimmer-loading mb-4"/>
      <div className="h-3 w-1/2 rounded-full shimmer-loading mb-2"/>
      <div className="h-3 w-1/3 rounded-full shimmer-loading"/>
    </div>
  );
}

/* ─── Countdown banner for featured events ─── */
function CountdownBanner({ event, onOpenFlyer }: { event: ChapelEvent; onOpenFlyer: (url: string) => void }) {
  const getTarget = () => {
    const [y, m, d] = event.event_date.split('-').map(Number);
    const [h = 0, min = 0] = (event.event_time ?? '').split(':').map(Number);
    return new Date(y, m - 1, d, h, min, 0).getTime();
  };

  const calc = () => {
    const diff = getTarget() - Date.now();
    if (diff <= 0) return null;
    return {
      days:    Math.floor(diff / 86_400_000),
      hours:   Math.floor((diff % 86_400_000) / 3_600_000),
      minutes: Math.floor((diff % 3_600_000)  / 60_000),
      seconds: Math.floor((diff % 60_000)     / 1_000),
    };
  };

  const [time, setTime] = useState(calc);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      const t = calc();
      if (!t) { setIsLive(true); setTime(null); }
      else setTime(t);
    }, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.event_date, event.event_time]);

  if (!time && !isLive) return null;

  const timeStr = fmtTime(event.event_time);

  return (
    <section className="py-6 px-5 sm:px-8 max-w-5xl mx-auto">
      <Reveal>
        <button type="button" onClick={() => event.flyer_url && onOpenFlyer(event.flyer_url)} className="block w-full text-left group focus:outline-none">
          <div className="relative rounded-3xl overflow-hidden p-6 sm:p-10 flex flex-col justify-center min-h-[320px] shadow-[0_16px_40px_rgba(0,0,0,0.4)] transition-transform duration-300 group-hover:scale-[1.01]"
               style={{ background: 'rgba(20,0,40,0.8)' }}>
          
          {/* Big Full-Bleed Flyer Background */}
          {event.flyer_url && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={event.flyer_url}
                alt={event.title}
                className="absolute inset-0 w-full h-full object-cover opacity-90"
              />
              {/* Multiply overlay for purple hue */}
              <div className="absolute inset-0 pointer-events-none mix-blend-multiply"
                   style={{ background: 'rgba(80,0,180,0.4)' }} />
              {/* Subtle radial gradient to slightly darken the center/left for text readability without losing the image */}
              <div className="absolute inset-0 pointer-events-none"
                   style={{ background: 'radial-gradient(circle at 30% 50%, rgba(10,0,30,0.6) 0%, rgba(10,0,30,0.1) 80%, transparent 100%)' }} />
            </>
          )}

          {/* Ambient orb */}
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl pointer-events-none"
               style={{ background: 'rgba(180,0,255,0.20)' }} aria-hidden/>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 relative z-10">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black
                              uppercase tracking-widest mb-3 backdrop-blur-md"
                   style={{ background: 'rgba(139,0,255,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                {isLive ? '🎉 Happening Now' : '🔥 Upcoming Event'}
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>
                {event.title}
              </h3>
              <p className="text-sm font-semibold text-white/90 mt-1.5" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
                {fmtDate(event.event_date)}{timeStr ? ` · ${timeStr}` : ''}
              </p>
            </div>
            {isLive && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl font-bold text-sm
                              text-white self-start sm:self-auto"
                   style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)' }}>
                <span className="w-2 h-2 rounded-full bg-white animate-ping-slow"/>
                Event is Live!
              </div>
            )}
          </div>

          {/* Countdown digits */}
          {!isLive && time && (
            <div className="grid grid-cols-4 gap-3 sm:gap-4 relative z-10 w-full sm:max-w-md mt-2">
              {([
                { label: 'DAYS',    value: time.days },
                { label: 'HOURS',   value: time.hours },
                { label: 'MIN',     value: time.minutes },
                { label: 'SEC',     value: time.seconds },
              ] as const).map(({ label, value }) => (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <div className="w-full rounded-2xl py-4 sm:py-5 flex items-center justify-center
                                  text-3xl sm:text-4xl font-black text-white tabular-nums relative overflow-hidden"
                       style={{
                         background: 'rgba(255,255,255,0.08)',
                         backdropFilter: 'blur(24px) saturate(200%)',
                         WebkitBackdropFilter: 'blur(24px) saturate(200%)',
                         border: '1px solid rgba(255,255,255,0.25)',
                         boxShadow: '0 1px 0 rgba(255,255,255,0.3) inset, 0 12px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05) inset',
                       }}>
                    {/* Specular highlight for liquid glass */}
                    <div className="absolute inset-0 pointer-events-none z-0" style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.02) 40%, transparent 100%)'
                    }} />
                    <span className="relative z-10" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                      {String(value).padStart(2, '0')}
                    </span>
                  </div>
                  <span className="text-[10px] font-black tracking-widest text-white/90 drop-shadow-md">{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        </button>
      </Reveal>
    </section>
  );
}

/* ─── Sermon card — live data ─── */
function SermonCard({ s, delay }: { s: Sermon; delay: number }) {
  const accentColor = SERMON_TAG_COLOR[s.tag] ?? '#7C3AED';
  const hasAudio  = !!s.audio_url;
  const hasVideo  = !!s.video_url;
  const hasMedia  = hasAudio || hasVideo;
  const actionHref = s.audio_url ?? s.video_url ?? '#';

  const formattedDate = new Date(s.service_date + 'T00:00:00').toLocaleDateString('en-NG', {
    month: 'short', year: 'numeric',
  });

  return (
    <Reveal delay={delay}>
      <div className="glass-card card-lift p-4 flex items-center gap-4 group select-none">
        {/* Thumbnail or play icon */}
        {s.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={s.thumbnail_url}
            alt={s.title}
            className="w-12 h-12 rounded-2xl object-cover shrink-0 shadow-sm"
          />
        ) : (
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0
                          shadow-[0_4px_16px_rgba(139,0,255,0.35)] btn-liquid"
               style={{ background: `linear-gradient(135deg, ${accentColor}, #C084FC)` }}>
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        )}

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm text-foreground truncate leading-tight">{s.title}</p>
          <p className="text-xs text-muted mt-0.5 truncate">
            {s.speaker} · {formattedDate}
            {s.duration_minutes ? ` · ${s.duration_minutes} min` : ''}
          </p>
          {/* Audio / Video badge */}
          {hasMedia && (
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold uppercase
                             tracking-wide text-primary/70">
              {hasAudio ? (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/>
                  </svg>
                  Audio
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                  </svg>
                  Video
                </>
              )}
            </span>
          )}
        </div>

        {/* Download / Watch button */}
        {hasMedia && (
          <a
            href={actionHref}
            download={hasAudio}
            target={hasVideo ? '_blank' : undefined}
            rel={hasVideo ? 'noopener noreferrer' : undefined}
            className="w-9 h-9 rounded-xl glass-purple flex items-center justify-center
                       text-primary hover:bg-primary/20 transition-colors shrink-0"
            aria-label={hasAudio ? 'Download audio' : 'Watch video'}
            onClick={(e) => e.stopPropagation()}
          >
            {hasAudio ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
            )}
          </a>
        )}
      </div>
    </Reveal>
  );
}

/* ─── Sermon skeleton ─── */
function SermonSkeleton() {
  return (
    <div className="glass-card p-4 flex items-center gap-4">
      <div className="w-12 h-12 rounded-2xl shimmer-loading shrink-0"/>
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-3/4 rounded-full shimmer-loading"/>
        <div className="h-2.5 w-1/2 rounded-full shimmer-loading"/>
      </div>
    </div>
  );
}

/* ─── Main page ─── */
export default function LandingPage() {
  const scrollY = useScrollY();
  const [greeting, setGreeting] = useState('');
  const [mounted, setMounted] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  // Events — live from API
  const [events, setEvents] = useState<ChapelEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Sermons — live from API
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [sermonsLoading, setSermonsLoading] = useState(true);

  // Flyer Lightbox Modal
  const [selectedFlyer, setSelectedFlyer] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening');
  }, []);

  useEffect(() => {
    setNavScrolled(scrollY > 60);
  }, [scrollY]);

  useEffect(() => {
    getPublishedEvents()
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, []);

  useEffect(() => {
    getPublishedSermons()
      .then(setSermons)
      .catch(() => setSermons([]))
      .finally(() => setSermonsLoading(false));
  }, []);

  // First featured event that hasn't passed yet — drives countdown
  const today = new Date().toISOString().slice(0, 10);
  const featuredEvent = events.find(
    (e) => e.is_featured && e.event_date >= today
  ) ?? null;

  // Parallax: hero orbs drift opposite to scroll
  const parallaxY = scrollY * 0.35;

  return (
    <div className="min-h-dvh bg-background font-sans overflow-x-hidden">

      {/* ════════════════════════════════════════════
          STICKY NAV — morphs on scroll
          ════════════════════════════════════════════ */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-500
                       ${navScrolled
                         ? 'py-3 glass-panel shadow-[0_1px_0_rgba(255,255,255,0.3)_inset,0_8px_32px_rgba(0,0,0,0.12)]'
                         : 'py-5 bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo
              size={navScrolled ? 34 : 38}
              variant={navScrolled ? 'color' : 'white'}
              className="transition-all duration-300"
            />
            <span className={`font-black text-sm transition-colors duration-300
                              ${navScrolled ? 'text-foreground' : 'text-white'}`}>
              VU Chapel
            </span>
          </Link>

          <div className="hidden sm:flex items-center gap-5">
            {['Events', 'Sermons'].map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`}
                 className={`text-sm font-semibold transition-colors duration-300
                              ${navScrolled ? 'text-muted hover:text-foreground' : 'text-white/70 hover:text-white'}`}>
                {item}
              </a>
            ))}
          </div>

          <Link href="/registration"
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold
                            transition-all duration-300 active:scale-95
                            ${navScrolled
                              ? 'bg-primary text-white shadow-[0_4px_14px_rgba(139,0,255,0.35)] btn-liquid'
                              : 'bg-white/15 border border-white/25 text-white hover:bg-white/22 glass-purple'}`}>
            Register
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
          </Link>
        </div>
      </nav>

      {/* ════════════════════════════════════════════
          HERO — full screen, purple gradient
          ════════════════════════════════════════════ */}
      <section ref={heroRef}
               className="relative overflow-hidden bg-purple-gradient min-h-dvh flex flex-col pt-16">

        {/* Parallax ambient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          <div className="absolute -top-32 -left-20 w-[500px] h-[500px] rounded-full blur-[100px]"
               style={{ background: 'rgba(200,80,255,0.28)', transform: `translateY(${parallaxY * 0.4}px)` }}/>
          <div className="absolute -bottom-20 -right-16 w-[420px] h-[420px] rounded-full blur-[80px]"
               style={{ background: 'rgba(40,0,180,0.35)', transform: `translateY(${-parallaxY * 0.25}px)` }}/>
          <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full blur-[60px]"
               style={{ background: 'rgba(255,100,220,0.15)', transform: `translateY(${parallaxY * 0.2}px)` }}/>
        </div>

        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
             style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '30px 30px' }}
             aria-hidden/>

        {/* Subtle church window arch */}
        <div className="absolute right-4 top-16 w-48 h-64 sm:w-72 sm:h-96 opacity-[0.07] pointer-events-none select-none"
             aria-hidden>
          <svg viewBox="0 0 200 280" fill="none">
            <path d="M20,270 L20,110 C20,28 180,28 180,110 L180,270 Z" stroke="white" strokeWidth="2.5" fill="none"/>
            <path d="M50,270 L50,128 C50,78 150,78 150,128 L150,270 Z" stroke="white" strokeWidth="1.5" fill="none"/>
            <circle cx="100" cy="82" r="32" stroke="white" strokeWidth="1.5" fill="none"/>
            <line x1="100" y1="50" x2="100" y2="114" stroke="white" strokeWidth="1"/>
            <line x1="68"  y1="82" x2="132" y2="82"  stroke="white" strokeWidth="1"/>
          </svg>
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center
                        text-center px-5 sm:px-8 pb-24 pt-8">

          {/* Logo — pop in */}
          <div className="animate-logo-pop mb-6 sm:mb-8">
            <Logo size={100} variant="white" showText={false} className="drop-shadow-[0_0_40px_rgba(200,100,255,0.6)]"/>
          </div>

          <p className="animate-hero-entrance text-white/55 text-xs sm:text-sm font-bold
                        tracking-[0.22em] uppercase mb-3"
             style={{ animationDelay: '0.15s' }}>
            {mounted ? greeting : 'Welcome'} · VU Chapel Attendance
          </p>

          <h1 className="animate-hero-entrance font-black text-white leading-tight tracking-tight
                          text-4xl sm:text-5xl lg:text-6xl max-w-2xl mb-4 sm:mb-5"
              style={{ animationDelay: '0.25s' }}>
            Where Faith Meets{' '}
            <span className="bg-gradient-to-r from-[#D080FF] to-[#FF80D0] bg-clip-text text-transparent">
              Excellence
            </span>
          </h1>

          <p className="animate-hero-entrance text-white/60 text-base sm:text-lg
                        max-w-md leading-relaxed mb-8 sm:mb-10"
             style={{ animationDelay: '0.35s' }}>
            Register your attendance, explore upcoming services, and
            download sermons — all in one place.
          </p>

          {/* CTA buttons */}
          <div className="animate-slide-up-spring flex flex-col sm:flex-row flex-wrap justify-center gap-3 w-full max-w-[320px] sm:max-w-[700px] sm:w-auto"
               style={{ animationDelay: '0.45s' }}>
            <Link href="/registration"
                  className="btn-liquid flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl
                             bg-white text-[#8B00FF] text-base font-black
                             shadow-[0_8px_32px_rgba(0,0,0,0.28),0_1px_0_rgba(255,255,255,0.6)_inset]
                             active:scale-95 touch-manipulation">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
              </svg>
              Register Now
            </Link>

            <Link href="/lookup"
               className="flex items-center justify-center gap-2 px-7 py-4 rounded-2xl
                          glass-purple border border-white/20 text-white text-base font-bold
                          active:scale-95 touch-manipulation">
              Check Service
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </Link>

            <Link href="/resume"
               className="flex items-center justify-center gap-2 px-7 py-4 rounded-2xl
                          glass-purple border border-white/20 text-white text-base font-bold
                          active:scale-95 touch-manipulation">
              Resume Capture
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </Link>

            <Link href="/portal"
               className="flex items-center justify-center gap-2 px-7 py-4 rounded-2xl
                          glass-purple border border-white/20 text-white text-base font-bold
                          active:scale-95 touch-manipulation">
              My Attendance
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
            </Link>
          </div>

          {/* Scripture */}
          <p className="animate-hero-entrance mt-10 sm:mt-14 text-white/35 text-xs italic max-w-xs leading-relaxed"
             style={{ animationDelay: '0.55s' }}>
            "I was glad when they said unto me, Let us go into the house of the Lord."
            <span className="block not-italic font-semibold mt-1 text-white/25">— Psalm 122:1</span>
          </p>
        </div>

        {/* Bottom wave */}
        <div className="absolute bottom-0 inset-x-0 pointer-events-none h-24 sm:h-32" aria-hidden>
          <svg viewBox="0 0 1440 96" fill="none" preserveAspectRatio="none" className="w-full h-full">
            <path d="M0 96 C480 20 960 20 1440 96 L1440 96 L0 96 Z" fill="var(--color-background)"/>
          </svg>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          COUNTDOWN BANNER — featured event only
          ════════════════════════════════════════════ */}
      {featuredEvent && <CountdownBanner event={featuredEvent} onOpenFlyer={setSelectedFlyer} />}

      {/* ════════════════════════════════════════════
          QUICK STATS STRIP
          ════════════════════════════════════════════ */}
      <section className="py-8 px-5 sm:px-8">
        <Reveal>
          <div className="max-w-3xl mx-auto glass-card p-5 sm:p-6">
            <div className="grid grid-cols-3 gap-4 sm:gap-6 text-center divide-x divide-border/50">
              {[
                { value: '3', label: 'Service Groups', icon: '⛪' },
                { value: '2×', label: 'Weekly Services', icon: '📅' },
                { value: '100%', label: 'Secure & Verified', icon: '🔒' },
              ].map((s) => (
                <div key={s.label} className="px-2">
                  <div className="text-xl sm:text-2xl mb-0.5">{s.icon}</div>
                  <p className="text-xl sm:text-2xl font-black text-primary">{s.value}</p>
                  <p className="text-[10px] sm:text-xs text-muted font-semibold leading-tight mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ════════════════════════════════════════════
          HOW IT WORKS
          ════════════════════════════════════════════ */}
      <section className="py-12 px-5 sm:px-8 max-w-5xl mx-auto">
        <Reveal>
          <p className="section-label mb-1.5 text-center">Simple & Secure</p>
          <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight text-center mb-8">
            How It Works
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: '01', icon: '📝', title: 'Register',     desc: 'Fill your details and capture face samples for secure ID' },
            { step: '02', icon: '📷', title: 'Face Scan',    desc: 'Protocol member scans your face at the chapel entrance' },
            { step: '03', icon: '✅', title: 'Attendance',   desc: 'Your attendance is instantly recorded and tracked' },
          ].map((item, i) => (
            <Reveal key={item.step} delay={i * 100}>
              <div className="glass-card p-6 text-center card-lift h-full">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center
                                text-2xl mx-auto mb-4">
                  {item.icon}
                </div>
                <span className="text-xs font-black text-primary/50 tracking-widest">STEP {item.step}</span>
                <h3 className="text-base font-black text-foreground mt-1 mb-2">{item.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{item.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════
          UPCOMING EVENTS
          ════════════════════════════════════════════ */}
      <section id="events" className="py-12 px-5 sm:px-8 max-w-5xl mx-auto">
        <Reveal>
          <div className="flex items-end justify-between mb-7">
            <div>
              <p className="section-label mb-1.5">What&apos;s On</p>
              <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                Upcoming Services
              </h2>
            </div>
            <span className="text-xs font-bold text-primary bg-primary-muted
                             px-3 py-1.5 rounded-full border border-primary/15">
              {new Date().getFullYear()}
            </span>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {eventsLoading
            ? [0, 1, 2].map((k) => <EventSkeleton key={k} />)
            : events.length > 0
              ? events.map((ev, i) => <EventCard key={ev.id} ev={ev} delay={i * 100} onOpenFlyer={setSelectedFlyer} />)
              : (
                  <div className="col-span-full text-center py-12 text-muted text-sm">
                    No upcoming events at this time. Check back soon.
                  </div>
                )
          }
        </div>
      </section>

      {/* ════════════════════════════════════════════
          SERMON LIBRARY
          ════════════════════════════════════════════ */}
      <section id="sermons" className="py-12 px-5 sm:px-8 max-w-5xl mx-auto">
        <div className="relative rounded-3xl overflow-hidden bg-purple-gradient-soft
                        border border-primary/10 p-7 sm:p-10">
          {/* Decorative orb */}
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-primary/6
                          blur-3xl pointer-events-none" aria-hidden/>

          <Reveal>
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="section-label text-primary/60 mb-1.5">Messages</p>
                <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                  Sermon Library
                </h2>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-primary flex items-center justify-center
                              shadow-[0_4px_16px_rgba(139,0,255,0.40)] btn-liquid shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                        d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/>
                </svg>
              </div>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 gap-3">
            {sermonsLoading
              ? [0, 1, 2, 3].map((k) => <SermonSkeleton key={k} />)
              : sermons.length > 0
                ? sermons.map((s, i) => <SermonCard key={s.id} s={s} delay={i * 80} />)
                : (
                    <div className="col-span-2 text-center py-10 text-muted text-sm">
                      Sermons will appear here once uploaded.
                    </div>
                  )
            }
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          ATTENDANCE CTA
          ════════════════════════════════════════════ */}
      <section className="py-10 px-5 sm:px-8 max-w-5xl mx-auto">
        <Reveal dir="scale">
          <div className="relative rounded-3xl overflow-hidden bg-purple-gradient p-7 sm:p-10
                          flex flex-col sm:flex-row items-center justify-between gap-6">
            {/* Orbs */}
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white/8 blur-2xl pointer-events-none" aria-hidden/>
            <div className="absolute bottom-0 left-0 w-36 h-36 rounded-full bg-white/5 blur-2xl pointer-events-none" aria-hidden/>
            {/* Specular */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none" aria-hidden/>

            <div className="relative z-10 text-center sm:text-left">
              <h3 className="text-xl sm:text-2xl font-black text-white mb-1">
                Ready to take attendance?
              </h3>
              <p className="text-white/60 text-sm">Protocol members can mark live attendance below.</p>
            </div>

            <Link href="/protocol-member/login"
                  className="relative z-10 btn-liquid flex items-center gap-2.5 px-7 py-3.5
                             rounded-2xl bg-white text-[#8B00FF] font-black text-sm shrink-0
                             shadow-[0_4px_20px_rgba(0,0,0,0.22)] touch-manipulation">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              Protocol Scanner
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ════════════════════════════════════════════
          FOOTER
          ════════════════════════════════════════════ */}
      <footer className="py-10 px-5 sm:px-8 border-t border-border/40 mt-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center
                        justify-between gap-5 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <Logo size={36} variant="color" showText={false}/>
            <div>
              <p className="font-black text-sm text-foreground">VU Chapel</p>
              <p className="text-[10px] text-muted font-semibold tracking-widest uppercase">
                Attendance System
              </p>
            </div>
          </div>

          <p className="text-xs text-muted order-3 sm:order-2">
            Built &amp; powered by{' '}
            <span className="font-bold text-primary">Dash &amp; Co.</span>
            {' '}in collaboration with{' '}
            <span className="font-bold text-primary">FY Creative</span>
          </p>

          <Link href="/admin/login"
                className="text-xs text-muted/45 hover:text-muted transition-colors
                           underline underline-offset-2 order-2 sm:order-3">
            Staff &amp; Admin
          </Link>
        </div>
      </footer>

      {/* ════════════════════════════════════════════
          FLYER LIGHTBOX MODAL
          ════════════════════════════════════════════ */}
      {selectedFlyer && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-pointer" 
            onClick={() => setSelectedFlyer(null)}
          />
          
          {/* Modal Content */}
          <div className="relative z-10 max-w-5xl w-full max-h-[90vh] flex flex-col items-center animate-in zoom-in-95 duration-300">
            <button 
              type="button"
              onClick={() => setSelectedFlyer(null)}
              className="absolute -top-12 right-0 sm:-right-12 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors backdrop-blur-md border border-white/20"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={selectedFlyer} 
              alt="Event Flyer" 
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.6)]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
