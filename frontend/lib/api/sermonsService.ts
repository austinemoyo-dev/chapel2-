import api from './client';

export type SermonTag = 'midweek' | 'sunday' | 'special';

export interface Sermon {
  id: string;
  title: string;
  speaker: string;
  description: string;
  service_date: string;       // "YYYY-MM-DD"
  tag: SermonTag;
  audio_url: string | null;   // absolute URL or null
  video_url: string | null;   // YouTube/Vimeo URL or null
  thumbnail_url: string | null;
  duration_minutes: number | null;
  is_published: boolean;
  sort_order: number;
}

export interface AdminSermon extends Sermon {
  audio_file: string | null;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
}

/** GET /api/sermons/ — published sermons for the public church website */
export const getPublishedSermons = () =>
  api.get<Sermon[]>('/api/sermons/');

/** GET /api/admin/sermons/ — all sermons including drafts */
export const adminListSermons = () =>
  api.get<AdminSermon[]>('/api/admin/sermons/');

/** POST /api/admin/sermons/ — create (FormData for file uploads) */
export const adminCreateSermon = (formData: FormData) =>
  api.upload<AdminSermon>('/api/admin/sermons/', formData);

/** PATCH /api/admin/sermons/{id}/ — update (FormData for file uploads) */
export const adminUpdateSermon = (id: string, formData: FormData) =>
  api.patch<AdminSermon>(`/api/admin/sermons/${id}/`, formData);

/** DELETE /api/admin/sermons/{id}/ */
export const adminDeleteSermon = (id: string) =>
  api.delete<{ message: string }>(`/api/admin/sermons/${id}/`);
