/**
 * Reset Password Page
 *
 * Handles the Supabase PASSWORD_RECOVERY flow.
 * User lands here via the link in the reset email.
 * Supabase parses the token from the URL hash and fires PASSWORD_RECOVERY.
 */

import { supabase } from './lib/supabase/client';
import { updatePassword } from './lib/supabase/auth';

// ─────────────────────────────────────────────────────────────
//  State helpers
// ─────────────────────────────────────────────────────────────

type PageState = 'loading' | 'form' | 'success' | 'expired';

function showState(state: PageState): void {
  const ids: Record<PageState, string> = {
    loading: 'state-loading',
    form:    'state-form',
    success: 'state-success',
    expired: 'state-expired',
  };
  for (const [key, id] of Object.entries(ids)) {
    const el = document.getElementById(id);
    if (el) el.style.display = key === state ? '' : 'none';
  }
}

// ─────────────────────────────────────────────────────────────
//  Form
// ─────────────────────────────────────────────────────────────

function bindForm(): void {
  const form      = document.getElementById('reset-form') as HTMLFormElement;
  const errorEl   = document.getElementById('reset-error') as HTMLElement;
  const submitBtn = document.getElementById('reset-submit-btn') as HTMLButtonElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const newPassword     = (document.getElementById('new-password') as HTMLInputElement).value;
    const confirmPassword = (document.getElementById('confirm-password') as HTMLInputElement).value;

    if (newPassword.length < 8) {
      errorEl.textContent = 'Password must be at least 8 characters.';
      errorEl.hidden = false;
      return;
    }
    if (newPassword !== confirmPassword) {
      errorEl.textContent = 'Passwords do not match.';
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    const { error } = await updatePassword(newPassword);

    if (error) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Set new password';
      return;
    }

    showState('success');
    setTimeout(() => { window.location.href = '/dashboard.html'; }, 1500);
  });
}

// ─────────────────────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────────────────────

function init(): void {
  // If no hash token is present at all, show expired state immediately
  if (!window.location.hash.includes('access_token')) {
    showState('expired');
    return;
  }

  // Give Supabase up to 8 seconds to fire PASSWORD_RECOVERY
  const timeout = setTimeout(() => {
    showState('expired');
  }, 8000);

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      clearTimeout(timeout);
      showState('form');
      bindForm();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
