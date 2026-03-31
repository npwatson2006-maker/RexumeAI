/**
 * Supabase Auth helpers
 *
 * Wraps sign-up, login, logout, and session management.
 * Every function returns a typed { data, error } object — callers
 * are responsible for handling the error branch.
 */

import { supabase } from './client';
import type { ProfileInsert } from './types';

// ─────────────────────────────────────────────────────────────
//  Sign Up
//  Creates an auth user + inserts a row into public.profiles
// ─────────────────────────────────────────────────────────────

export interface SignUpParams {
  email: string;
  password: string;
  fullName: string;
}

export async function signUp({ email, password, fullName }: SignUpParams) {
  // 1. Create the auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Pass user metadata so the DB trigger (or manual insert below) can pick it up
      data: { full_name: fullName },
    },
  });

  if (authError || !authData.user) {
    return { data: null, error: authError };
  }

  // 2. Insert a corresponding profiles row
  // (If you set up a Postgres trigger this is automatic — keep both for safety)
  const profile: ProfileInsert = {
    user_id: authData.user.id,
    email,
    full_name: fullName,
    avatar_url: null,
    has_dismissed_welcome: false,
  };

  const { error: profileError } = await supabase
    .from('profiles')
    .insert(profile);

  if (profileError) {
    // Log but don't fail — auth user was created successfully
    console.warn('[auth] Profile insert failed:', profileError.message);
  }

  return { data: authData, error: null };
}

// ─────────────────────────────────────────────────────────────
//  Sign In (email + password)
// ─────────────────────────────────────────────────────────────

export interface SignInParams {
  email: string;
  password: string;
}

export async function signIn({ email, password }: SignInParams) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

// ─────────────────────────────────────────────────────────────
//  Sign Out
// ─────────────────────────────────────────────────────────────

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

// ─────────────────────────────────────────────────────────────
//  Get current session / user
// ─────────────────────────────────────────────────────────────

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  return { session: data.session, error };
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  return { user: data.user, error };
}

// ─────────────────────────────────────────────────────────────
//  Auth state change listener
//  Call this once on app init to react to login/logout events
// ─────────────────────────────────────────────────────────────

export function onAuthStateChange(
  callback: (event: string, session: unknown) => void
) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  // Return the unsubscribe function so callers can clean up
  return data.subscription.unsubscribe;
}

// ─────────────────────────────────────────────────────────────
//  Password reset
// ─────────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  return { error };
}
