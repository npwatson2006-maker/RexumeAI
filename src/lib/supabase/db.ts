/**
 * Database helpers
 *
 * All reads and writes go through here — keeps DB logic out of UI components.
 * RLS policies on each table enforce that users can only touch their own rows.
 */

import { supabase } from './client';
import type {
  ProfileRow,
  ProfileUpdate,
  ResumeInsert,
  ResumeRow,
  ResumeUpdate,
  AiSessionInsert,
  AiSessionRow,
  AiSessionType,
} from './types';

// ─────────────────────────────────────────────────────────────
//  profiles
// ─────────────────────────────────────────────────────────────

/** Fetch the current user's profile */
export async function getProfile(userId: string): Promise<{ data: ProfileRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  return {
    data: data ?? null,
    error: error ? error.message : null,
  };
}

/** Update the current user's profile */
export async function updateProfile(
  userId: string,
  updates: ProfileUpdate
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  return { error: error ? error.message : null };
}

// ─────────────────────────────────────────────────────────────
//  resumes
// ─────────────────────────────────────────────────────────────

/** Get all resumes belonging to the current user */
export async function getResumes(userId: string): Promise<{ data: ResumeRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return {
    data: data ?? [],
    error: error ? error.message : null,
  };
}

/** Get a single resume by ID */
export async function getResume(id: string): Promise<{ data: ResumeRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', id)
    .single();

  return {
    data: data ?? null,
    error: error ? error.message : null,
  };
}

/** Save a new resume record (e.g. after upload or paste) */
export async function createResume(
  resume: ResumeInsert
): Promise<{ data: ResumeRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('resumes')
    .insert(resume)
    .select()
    .single();

  return {
    data: data ?? null,
    error: error ? error.message : null,
  };
}

/** Update resume metadata or parsed content */
export async function updateResume(
  id: string,
  updates: ResumeUpdate
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('resumes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  return { error: error ? error.message : null };
}

/** Delete a resume */
export async function deleteResume(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('resumes')
    .delete()
    .eq('id', id);

  return { error: error ? error.message : null };
}

// ─────────────────────────────────────────────────────────────
//  ai_sessions
// ─────────────────────────────────────────────────────────────

/** Record a new AI session (review, rewrite, tailor) */
export async function createAiSession(
  session: AiSessionInsert
): Promise<{ data: AiSessionRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('ai_sessions')
    .insert(session)
    .select()
    .single();

  return {
    data: data ?? null,
    error: error ? error.message : null,
  };
}

/** Get all AI sessions for a user, optionally filtered by resume */
export async function getAiSessions(
  userId: string,
  resumeId?: string
): Promise<{ data: AiSessionRow[]; error: string | null }> {
  let query = supabase
    .from('ai_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (resumeId) {
    query = query.eq('resume_id', resumeId);
  }

  const { data, error } = await query;

  return {
    data: data ?? [],
    error: error ? error.message : null,
  };
}

/** Get AI sessions for a user filtered by session type, optionally by resume */
export async function getAiSessionsByType(
  userId: string,
  sessionType: AiSessionType,
  resumeId?: string
): Promise<{ data: AiSessionRow[]; error: string | null }> {
  let query = supabase
    .from('ai_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('session_type', sessionType)
    .order('created_at', { ascending: false });

  if (resumeId) {
    query = query.eq('resume_id', resumeId);
  }

  const { data, error } = await query;

  return {
    data: data ?? [],
    error: error ? error.message : null,
  };
}

/** Delete an AI session by ID */
export async function deleteAiSession(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('ai_sessions')
    .delete()
    .eq('id', id);

  return { error: error ? error.message : null };
}

// ─────────────────────────────────────────────────────────────
//  Real-time subscriptions
// ─────────────────────────────────────────────────────────────

/**
 * Subscribe to real-time updates on a user's resumes.
 * Returns an unsubscribe function — call it on component cleanup.
 *
 * Example:
 *   const unsub = subscribeToResumes(userId, (payload) => { ... });
 *   // later: unsub();
 */
export function subscribeToResumes(
  userId: string,
  onUpdate: (payload: unknown) => void
) {
  const channel = supabase
    .channel(`resumes:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'resumes',
        filter: `user_id=eq.${userId}`,
      },
      onUpdate
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ─────────────────────────────────────────────────────────────
//  Supabase Storage helpers (resumes bucket)
// ─────────────────────────────────────────────────────────────

/** Delete a file from the private resumes storage bucket */
export async function deleteResumeFile(
  storagePath: string  // e.g. "{user_id}/{timestamp}_{filename}"
): Promise<{ error: string | null }> {
  const { error } = await supabase.storage
    .from('resumes')
    .remove([storagePath]);
  return { error: error ? error.message : null };
}

/** Get a short-lived signed URL for a private resume file */
export async function getResumeSignedUrl(
  storagePath: string,
  expiresIn = 3600  // seconds
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage
    .from('resumes')
    .createSignedUrl(storagePath, expiresIn);
  return {
    url: data?.signedUrl ?? null,
    error: error ? error.message : null,
  };
}
