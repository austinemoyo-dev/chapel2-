import api from './client';

export type EventTag = 'midweek' | 'sunday' | 'special' | 'conference' | 'announcement';

export interface ChapelEvent {
  id: string;
  title: string;
  description: string;
  event_date: string;        // "YYYY-MM-DD"
  event_time: string | null; // "HH:MM:SS" or null
  tag: EventTag;
  flyer_url: string | null;  // absolute URL or null
  is_published: boolean;
  is_featured: boolean;
  sort_order: number;
}

export interface AdminChapelEvent extends ChapelEvent {
  flyer: string | null;
  created_at: string;
  updated_at: string;
}

/** GET /api/events/ — published events for the public landing page */
export const getPublishedEvents = () =>
  api.get<ChapelEvent[]>('/api/events/');

/** GET /api/admin/events/ — all events including drafts */
export const adminListEvents = () =>
  api.get<AdminChapelEvent[]>('/api/admin/events/');

/** POST /api/admin/events/ — create event (use FormData for flyer upload) */
export const adminCreateEvent = (formData: FormData) =>
  api.upload<AdminChapelEvent>('/api/admin/events/', formData);

/** PATCH /api/admin/events/{id}/ — update event (partial, FormData for flyer) */
export const adminUpdateEvent = (id: string, formData: FormData) =>
  api.patch<AdminChapelEvent>(`/api/admin/events/${id}/`, formData);

/** DELETE /api/admin/events/{id}/ */
export const adminDeleteEvent = (id: string) =>
  api.delete<{ message: string }>(`/api/admin/events/${id}/`);
