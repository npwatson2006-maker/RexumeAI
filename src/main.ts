/**
 * RexumeAI — App Entry Point
 *
 * Handles auth state and connects the landing page CTAs
 * to Supabase sign-up / login flows.
 */

import { inject, track } from '@vercel/analytics';
import { signUp, signIn, signOut, onAuthStateChange, getSession, sendPasswordResetEmail, updatePassword } from './lib/supabase/auth';

// Initialise Vercel Analytics (page-view tracking)
inject();

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────

interface AuthModalState {
  mode: 'signup' | 'login';
}

// ─────────────────────────────────────────────────────────────
//  Auth Modal
//  A lightweight modal injected into the page — no framework needed.
// ─────────────────────────────────────────────────────────────

function createAuthModal(): void {
  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.innerHTML = `
    <div class="auth-backdrop"></div>
    <div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button class="auth-close" aria-label="Close">&times;</button>

      <div class="auth-logo">
        <img src="/RexumeNewLogo-Photoroom.png" alt="RexumeAI" />
        <span>RexumeAI</span>
      </div>

      <!-- ── Main view: signup / login ── -->
      <div id="auth-main-view">
        <h2 id="auth-title" class="auth-title">Create your account</h2>
        <p class="auth-subtitle">Start optimizing your resume with AI</p>

        <form id="auth-form" novalidate>
          <div class="auth-field" id="field-fullname">
            <label for="auth-fullname">Full name</label>
            <input id="auth-fullname" name="fullname" type="text" placeholder="Jane Smith" autocomplete="name" />
          </div>
          <div class="auth-field">
            <label for="auth-email">Email</label>
            <input id="auth-email" name="email" type="email" placeholder="you@university.edu" autocomplete="email" required />
          </div>
          <div class="auth-field">
            <label for="auth-password">Password</label>
            <input id="auth-password" name="password" type="password" placeholder="At least 8 characters" autocomplete="new-password" required />
          </div>
          <div class="auth-forgot-wrap" id="auth-forgot-wrap" style="display:none">
            <button type="button" id="auth-forgot-link" class="auth-forgot-link">Forgot password?</button>
          </div>
          <p class="auth-error" id="auth-error" hidden></p>
          <button type="submit" class="auth-submit" id="auth-submit-btn">Get started free</button>
        </form>

        <p class="auth-toggle">
          Already have an account?
          <button type="button" id="auth-mode-toggle">Sign in</button>
        </p>
      </div>

      <!-- ── Forgot password view ── -->
      <div id="auth-forgot-view" style="display:none">
        <h2 class="auth-title">Reset password</h2>
        <p class="auth-subtitle">Enter your email and we'll send you a reset link.</p>
        <form id="auth-forgot-form" novalidate>
          <div class="auth-field">
            <label for="forgot-email">Email</label>
            <input id="forgot-email" type="email" placeholder="you@university.edu" autocomplete="email" required />
          </div>
          <p class="auth-error" id="forgot-error" hidden></p>
          <button type="submit" class="auth-submit" id="forgot-submit-btn">Send reset email</button>
        </form>
        <p class="auth-toggle">
          <button type="button" id="auth-back-to-login">← Back to sign in</button>
        </p>
      </div>

      <!-- ── Reset password view (after clicking email link) ── -->
      <div id="auth-reset-view" style="display:none">
        <h2 class="auth-title">Set new password</h2>
        <p class="auth-subtitle">Choose a strong new password for your account.</p>
        <form id="auth-reset-form" novalidate>
          <div class="auth-field">
            <label for="reset-password">New password</label>
            <input id="reset-password" type="password" placeholder="At least 8 characters" autocomplete="new-password" required />
          </div>
          <p class="auth-error" id="reset-error" hidden></p>
          <button type="submit" class="auth-submit" id="reset-submit-btn">Set new password</button>
        </form>
      </div>

    </div>
  `;
  document.body.appendChild(modal);
  injectAuthStyles();
  bindAuthModalEvents(modal);
}

function injectAuthStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    #auth-modal { position: fixed; inset: 0; z-index: 9999; display: none; align-items: center; justify-content: center; }
    #auth-modal.open { display: flex; }
    .auth-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.80); backdrop-filter: blur(6px); }
    .auth-card {
      position: relative; z-index: 1;
      background: #0d0d0d; border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px; padding: 2.5rem 2rem;
      width: 100%; max-width: 420px; margin: 1rem;
      color: #fff; font-family: 'DM Sans', sans-serif;
    }
    .auth-close {
      position: absolute; top: 1rem; right: 1rem;
      background: none; border: none; color: #888; font-size: 1.5rem;
      cursor: pointer; line-height: 1;
    }
    .auth-close:hover { color: #fff; }
    .auth-logo { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem; }
    .auth-logo img { height: 32px; width: auto; }
    .auth-logo span { font-family: 'Unbounded', sans-serif; font-weight: 900; font-size: 1rem; }
    .auth-title { font-family: 'Unbounded', sans-serif; font-size: 1.35rem; font-weight: 700; margin: 0 0 0.35rem; }
    .auth-subtitle { color: #888; font-size: 0.9rem; margin: 0 0 1.5rem; }
    .auth-field { margin-bottom: 1rem; }
    .auth-field label { display: block; font-size: 0.85rem; color: #aaa; margin-bottom: 0.35rem; }
    .auth-field input {
      width: 100%; background: #1a1a1a; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px; padding: 0.65rem 0.85rem;
      color: #fff; font-size: 0.95rem; font-family: inherit;
      box-sizing: border-box; transition: border-color 0.2s;
    }
    .auth-field input:focus { outline: none; border-color: #7CA491; }
    .auth-error { color: #ff6b6b; font-size: 0.85rem; margin: 0 0 0.75rem; }
    .auth-submit {
      width: 100%; padding: 0.75rem; background: #153750;
      color: #fff; border: none; border-radius: 6px;
      font-size: 1rem; font-weight: 600; font-family: inherit;
      cursor: pointer; transition: opacity 0.2s;
      margin-top: 0.5rem;
    }
    .auth-submit:hover { opacity: 0.88; }
    .auth-submit:disabled { opacity: 0.5; cursor: not-allowed; }
    .auth-toggle { text-align: center; font-size: 0.88rem; color: #888; margin-top: 1.25rem; }
    .auth-toggle button { background: none; border: none; color: #7CA491; cursor: pointer; font-size: inherit; text-decoration: underline; }
    .auth-success { text-align: center; padding: 1rem 0; }
    .auth-success h3 { color: #7CA491; margin-bottom: 0.5rem; }
    .auth-forgot-wrap { text-align: right; margin-top: -0.25rem; margin-bottom: 0.75rem; }
    .auth-forgot-link { background: none; border: none; color: #7CA491; cursor: pointer; font-size: 0.82rem; text-decoration: underline; padding: 0; }
    .auth-forgot-link:hover { color: #a8c5b8; }
  `;
  document.head.appendChild(style);
}

function showAuthView(modal: HTMLElement, view: 'main' | 'forgot' | 'reset'): void {
  modal.querySelector<HTMLElement>('#auth-main-view')!.style.display   = view === 'main'   ? '' : 'none';
  modal.querySelector<HTMLElement>('#auth-forgot-view')!.style.display = view === 'forgot' ? '' : 'none';
  modal.querySelector<HTMLElement>('#auth-reset-view')!.style.display  = view === 'reset'  ? '' : 'none';
}

function bindAuthModalEvents(modal: HTMLElement): void {
  const state: AuthModalState = { mode: 'signup' };

  // ── Main view elements ──
  const form          = modal.querySelector<HTMLFormElement>('#auth-form')!;
  const errorEl       = modal.querySelector<HTMLElement>('#auth-error')!;
  const submitBtn     = modal.querySelector<HTMLButtonElement>('#auth-submit-btn')!;
  const modeToggle    = modal.querySelector<HTMLButtonElement>('#auth-mode-toggle')!;
  const titleEl       = modal.querySelector<HTMLElement>('#auth-title')!;
  const subtitleEl    = modal.querySelector<HTMLElement>('#auth-main-view .auth-subtitle')!;
  const fullnameField = modal.querySelector<HTMLElement>('#field-fullname')!;
  const forgotWrap    = modal.querySelector<HTMLElement>('#auth-forgot-wrap')!;
  const forgotLink    = modal.querySelector<HTMLButtonElement>('#auth-forgot-link')!;
  const backdrop      = modal.querySelector<HTMLElement>('.auth-backdrop')!;
  const closeBtn      = modal.querySelector<HTMLButtonElement>('.auth-close')!;

  // ── Forgot-password view elements ──
  const forgotForm      = modal.querySelector<HTMLFormElement>('#auth-forgot-form')!;
  const forgotErrorEl   = modal.querySelector<HTMLElement>('#forgot-error')!;
  const forgotSubmitBtn = modal.querySelector<HTMLButtonElement>('#forgot-submit-btn')!;
  const backToLogin     = modal.querySelector<HTMLButtonElement>('#auth-back-to-login')!;

  // ── Reset-password view elements ──
  const resetForm      = modal.querySelector<HTMLFormElement>('#auth-reset-form')!;
  const resetErrorEl   = modal.querySelector<HTMLElement>('#reset-error')!;
  const resetSubmitBtn = modal.querySelector<HTMLButtonElement>('#reset-submit-btn')!;

  // Close handlers
  backdrop.addEventListener('click', closeAuthModal);
  closeBtn.addEventListener('click', closeAuthModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAuthModal(); });

  // Toggle between sign-up and login
  modeToggle.addEventListener('click', () => {
    state.mode = state.mode === 'signup' ? 'login' : 'signup';
    updateModalMode(state.mode, { titleEl, subtitleEl, fullnameField, forgotWrap, modeToggle, submitBtn });
    clearError(errorEl);
  });

  // Forgot password link → show forgot view
  forgotLink.addEventListener('click', () => {
    showAuthView(modal, 'forgot');
    clearError(forgotErrorEl);
  });

  // Back to login from forgot view
  backToLogin.addEventListener('click', () => {
    showAuthView(modal, 'main');
    state.mode = 'login';
    updateModalMode('login', { titleEl, subtitleEl, fullnameField, forgotWrap, modeToggle, submitBtn });
  });

  // Main form submission (signup / login)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(errorEl);

    const email    = (modal.querySelector<HTMLInputElement>('#auth-email')!).value.trim();
    const password = (modal.querySelector<HTMLInputElement>('#auth-password')!).value;
    const fullName = (modal.querySelector<HTMLInputElement>('#auth-fullname')!).value.trim();

    if (!email || !password) {
      showError(errorEl, 'Email and password are required.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = state.mode === 'signup' ? 'Creating account…' : 'Signing in…';

    try {
      if (state.mode === 'signup') {
        track('signup_started');
        const { error } = await signUp({ email, password, fullName });
        if (error) { showError(errorEl, error.message); return; }
        track('signup_completed');
        showSuccess(form, 'Check your email to confirm your account!');
      } else {
        const { error } = await signIn({ email, password });
        if (error) { showError(errorEl, error.message); return; }
        track('login_completed');
        closeAuthModal();
        updateNavForLoggedInUser();
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = state.mode === 'signup' ? 'Get started free' : 'Sign in';
    }
  });

  // Forgot password form submission
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(forgotErrorEl);

    const email = (modal.querySelector<HTMLInputElement>('#forgot-email')!).value.trim();
    if (!email) { showError(forgotErrorEl, 'Please enter your email.'); return; }

    forgotSubmitBtn.disabled = true;
    forgotSubmitBtn.textContent = 'Sending…';

    try {
      const { error } = await sendPasswordResetEmail(email);
      if (error) { showError(forgotErrorEl, error.message); return; }
      showSuccess(forgotForm, 'Check your email for a password reset link.');
    } finally {
      forgotSubmitBtn.disabled = false;
      forgotSubmitBtn.textContent = 'Send reset email';
    }
  });

  // Reset password form submission
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(resetErrorEl);

    const newPassword = (modal.querySelector<HTMLInputElement>('#reset-password')!).value;
    if (!newPassword || newPassword.length < 8) {
      showError(resetErrorEl, 'Password must be at least 8 characters.');
      return;
    }

    resetSubmitBtn.disabled = true;
    resetSubmitBtn.textContent = 'Saving…';

    try {
      const { error } = await updatePassword(newPassword);
      if (error) { showError(resetErrorEl, error.message); return; }
      showSuccess(resetForm, 'Password updated! Redirecting…');
      setTimeout(() => { window.location.href = '/dashboard.html'; }, 1500);
    } finally {
      resetSubmitBtn.disabled = false;
      resetSubmitBtn.textContent = 'Set new password';
    }
  });
}

function updateModalMode(
  mode: 'signup' | 'login',
  els: { titleEl: HTMLElement; subtitleEl: HTMLElement; fullnameField: HTMLElement; forgotWrap: HTMLElement; modeToggle: HTMLButtonElement; submitBtn: HTMLButtonElement }
): void {
  if (mode === 'login') {
    els.titleEl.textContent = 'Welcome back';
    els.subtitleEl.textContent = 'Sign in to your RexumeAI account';
    els.fullnameField.style.display = 'none';
    els.forgotWrap.style.display = '';
    els.submitBtn.textContent = 'Sign in';
    els.modeToggle.textContent = 'Create an account';
    els.modeToggle.previousSibling!.textContent = "Don't have an account? ";
  } else {
    els.titleEl.textContent = 'Create your account';
    els.subtitleEl.textContent = 'Start optimizing your resume with AI';
    els.fullnameField.style.display = '';
    els.forgotWrap.style.display = 'none';
    els.submitBtn.textContent = 'Get started free';
    els.modeToggle.textContent = 'Sign in';
    els.modeToggle.previousSibling!.textContent = 'Already have an account? ';
  }
}

function showError(el: HTMLElement, msg: string): void {
  el.textContent = msg;
  el.hidden = false;
}

function clearError(el: HTMLElement): void {
  el.textContent = '';
  el.hidden = true;
}

function showSuccess(form: HTMLFormElement, msg: string): void {
  form.innerHTML = `<div class="auth-success"><h3>You're in! 🎉</h3><p>${msg}</p></div>`;
}

export function openAuthModal(mode: 'signup' | 'login' | 'reset' = 'signup'): void {
  const modal = document.getElementById('auth-modal')!;
  modal.classList.add('open');

  if (mode === 'reset') {
    showAuthView(modal, 'reset');
    return;
  }

  showAuthView(modal, 'main');
  const modeToggle = modal.querySelector<HTMLButtonElement>('#auth-mode-toggle')!;
  if (modeToggle) {
    const titleEl       = modal.querySelector<HTMLElement>('#auth-title')!;
    const subtitleEl    = modal.querySelector<HTMLElement>('#auth-main-view .auth-subtitle')!;
    const fullnameField = modal.querySelector<HTMLElement>('#field-fullname')!;
    const forgotWrap    = modal.querySelector<HTMLElement>('#auth-forgot-wrap')!;
    const submitBtn     = modal.querySelector<HTMLButtonElement>('#auth-submit-btn')!;
    updateModalMode(mode, { titleEl, subtitleEl, fullnameField, forgotWrap, modeToggle, submitBtn });
  }
}

function closeAuthModal(): void {
  document.getElementById('auth-modal')?.classList.remove('open');
}

// ─────────────────────────────────────────────────────────────
//  Nav updates based on auth state
// ─────────────────────────────────────────────────────────────

function updateNavForLoggedInUser(): void {
  const navCta = document.querySelector<HTMLElement>('.nav-cta');
  if (navCta) {
    navCta.textContent = 'Dashboard →';
    navCta.removeEventListener('click', handleNavCtaClick);
    navCta.addEventListener('click', () => { window.location.href = '/dashboard'; });
  }
}

function updateNavForGuest(): void {
  const navCta = document.querySelector<HTMLElement>('.nav-cta');
  if (navCta) {
    navCta.textContent = 'Get Started Free';
    navCta.addEventListener('click', handleNavCtaClick);
  }
}

function handleNavCtaClick(e: Event): void {
  e.preventDefault();
  openAuthModal('signup');
}

// ─────────────────────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Inject the modal into the DOM
  createAuthModal();

  // If this is a password recovery redirect (from the reset email link),
  // hand off to the dedicated reset-password page rather than logging in.
  if (window.location.hash.includes('type=recovery')) {
    window.location.href = '/reset-password.html' + window.location.hash;
    return;
  }

  // Check if user is already logged in
  const { session } = await getSession();
  if (session) {
    // Already authenticated — send them straight to the dashboard
    window.location.href = '/dashboard.html';
    return;
  } else {
    updateNavForGuest();
  }

  // React to future login/logout events
  onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') {
      // Guard against recovery tokens firing SIGNED_IN before PASSWORD_RECOVERY
      if (window.location.hash.includes('type=recovery')) return;
      window.location.href = '/dashboard.html';
    }
    if (event === 'PASSWORD_RECOVERY') {
      window.location.href = '/reset-password.html' + window.location.hash;
    }
    if (event === 'SIGNED_OUT') updateNavForGuest();
  });

  // Wire up all CTA buttons on the landing page
  document.querySelectorAll<HTMLElement>('[data-auth-cta]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const mode = (btn.dataset.authCta as 'signup' | 'login') ?? 'signup';
      const label = btn.textContent?.trim() ?? 'unknown';
      track('cta_clicked', { label, mode });
      openAuthModal(mode);
    });
  });

  // Wire up sign-out links
  document.querySelectorAll<HTMLElement>('[data-auth-signout]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await signOut();
    });
  });
}

// Run once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
