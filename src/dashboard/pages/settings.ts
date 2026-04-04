/**
 * Settings Page
 *
 * Sections:
 * 1. Profile — edit display name (email is read-only)
 * 2. Account — change password, sign out
 * 3. Danger Zone — delete account (confirmation required)
 */

import { supabase } from '../../lib/supabase/client';
import { updatePassword, signOut } from '../../lib/supabase/auth';
import type { ProfileRow } from '../../lib/supabase/types';
import type { User } from '@supabase/supabase-js';

// ── Helpers ───────────────────────────────────────────────────

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  const existing = document.getElementById('settings-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'settings-toast';
  toast.className = `settings-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function setButtonLoading(btn: HTMLButtonElement, loading: boolean, defaultText: string): void {
  btn.disabled = loading;
  btn.textContent = loading ? 'Saving…' : defaultText;
}

// ── Main render ───────────────────────────────────────────────

export async function renderSettings(container: HTMLElement, user: User): Promise<void> {
  // Skeleton while fetching profile
  container.innerHTML = `
    <div class="settings-page">
      <div class="dash-header">
        <h1 class="dash-greeting">Settings</h1>
        <p class="dash-subtitle">Manage your profile and account.</p>
      </div>
      <div class="settings-body">
        <div class="skeleton" style="height:200px;border-radius:12px;margin-bottom:1.25rem"></div>
        <div class="skeleton" style="height:220px;border-radius:12px;margin-bottom:1.25rem"></div>
        <div class="skeleton" style="height:120px;border-radius:12px"></div>
      </div>
    </div>
  `;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error || !profile) {
    container.innerHTML = `
      <div class="settings-page">
        <div class="dash-header">
          <h1 class="dash-greeting">Settings</h1>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <p>Could not load your profile. Please refresh.</p>
        </div>
      </div>
    `;
    return;
  }

  renderSettingsPage(container, user, profile as ProfileRow);
}

function renderSettingsPage(container: HTMLElement, user: User, profile: ProfileRow): void {
  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  container.innerHTML = `
    <div class="settings-page">
      <div class="dash-header">
        <h1 class="dash-greeting">Settings</h1>
        <p class="dash-subtitle">Manage your profile and account.</p>
      </div>

      <div class="settings-body">

        <!-- ── Profile Card ── -->
        <div class="settings-card">
          <div class="settings-card-header">
            <div class="settings-card-title">Profile</div>
            <div class="settings-card-sub">Member since ${memberSince}</div>
          </div>

          <div class="settings-avatar-row">
            <div class="settings-avatar">
              ${profile.full_name ? profile.full_name.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div class="settings-avatar-info">
              <div class="settings-avatar-name">${profile.full_name || '—'}</div>
              <div class="settings-avatar-email">${user.email}</div>
            </div>
          </div>

          <div class="settings-form">
            <div class="settings-field">
              <label class="settings-label" for="input-full-name">Display Name</label>
              <input
                class="settings-input"
                id="input-full-name"
                type="text"
                placeholder="Your full name"
                value="${profile.full_name ?? ''}"
                maxlength="80"
              />
            </div>
            <div class="settings-field">
              <label class="settings-label" for="input-email">Email</label>
              <input
                class="settings-input"
                id="input-email"
                type="email"
                value="${user.email ?? ''}"
                disabled
              />
              <div class="settings-field-hint">Email cannot be changed here.</div>
            </div>
            <div class="settings-form-actions">
              <button class="settings-save-btn" id="save-profile-btn">Save Changes</button>
            </div>
          </div>
        </div>

        <!-- ── Password Card ── -->
        <div class="settings-card">
          <div class="settings-card-header">
            <div class="settings-card-title">Change Password</div>
          </div>

          <div class="settings-form">
            <div class="settings-field">
              <label class="settings-label" for="input-new-password">New Password</label>
              <input
                class="settings-input"
                id="input-new-password"
                type="password"
                placeholder="At least 8 characters"
                minlength="8"
                autocomplete="new-password"
              />
            </div>
            <div class="settings-field">
              <label class="settings-label" for="input-confirm-password">Confirm Password</label>
              <input
                class="settings-input"
                id="input-confirm-password"
                type="password"
                placeholder="Repeat your new password"
                minlength="8"
                autocomplete="new-password"
              />
            </div>
            <div class="settings-form-actions">
              <button class="settings-save-btn" id="save-password-btn">Update Password</button>
            </div>
          </div>
        </div>

        <!-- ── Danger Zone ── -->
        <div class="settings-card settings-danger-card">
          <div class="settings-card-header">
            <div class="settings-card-title settings-danger-title">Danger Zone</div>
          </div>
          <div class="settings-danger-row">
            <div>
              <div class="settings-danger-label">Sign out of your account</div>
              <div class="settings-field-hint">You will be redirected to the login page.</div>
            </div>
            <button class="settings-danger-btn" id="signout-btn">Sign Out</button>
          </div>
        </div>

      </div>
    </div>
  `;

  wireSettingsEvents(container, user, profile);
}

// ── Event wiring ──────────────────────────────────────────────

function wireSettingsEvents(container: HTMLElement, user: User, profile: ProfileRow): void {
  // ── Save profile ──
  const saveProfileBtn = container.querySelector<HTMLButtonElement>('#save-profile-btn')!;
  saveProfileBtn.addEventListener('click', async () => {
    const nameInput = container.querySelector<HTMLInputElement>('#input-full-name')!;
    const newName = nameInput.value.trim();

    if (!newName) {
      showToast('Display name cannot be empty.', 'error');
      return;
    }

    setButtonLoading(saveProfileBtn, true, 'Save Changes');
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: newName, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    setButtonLoading(saveProfileBtn, false, 'Save Changes');

    if (error) {
      showToast('Failed to save profile. Please try again.', 'error');
    } else {
      // Update the avatar initial and name display without a full re-render
      const avatarEl = container.querySelector<HTMLElement>('.settings-avatar');
      const nameEl = container.querySelector<HTMLElement>('.settings-avatar-name');
      if (avatarEl) avatarEl.textContent = newName.charAt(0).toUpperCase();
      if (nameEl) nameEl.textContent = newName;
      showToast('Profile saved!');
    }
  });

  // ── Save password ──
  const savePasswordBtn = container.querySelector<HTMLButtonElement>('#save-password-btn')!;
  savePasswordBtn.addEventListener('click', async () => {
    const newPwd = container.querySelector<HTMLInputElement>('#input-new-password')!.value;
    const confirmPwd = container.querySelector<HTMLInputElement>('#input-confirm-password')!.value;

    if (newPwd.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }
    if (newPwd !== confirmPwd) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    setButtonLoading(savePasswordBtn, true, 'Update Password');
    const { error } = await updatePassword(newPwd);
    setButtonLoading(savePasswordBtn, false, 'Update Password');

    if (error) {
      showToast(error.message ?? 'Failed to update password.', 'error');
    } else {
      // Clear the password fields
      container.querySelector<HTMLInputElement>('#input-new-password')!.value = '';
      container.querySelector<HTMLInputElement>('#input-confirm-password')!.value = '';
      showToast('Password updated!');
    }
  });

  // ── Sign out ──
  const signoutBtn = container.querySelector<HTMLButtonElement>('#signout-btn')!;
  signoutBtn.addEventListener('click', async () => {
    signoutBtn.disabled = true;
    signoutBtn.textContent = 'Signing out…';
    await signOut();
    // onAuthStateChange in index.ts will redirect to /
  });
}
