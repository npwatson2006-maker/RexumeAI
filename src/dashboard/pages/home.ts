/**
 * Dashboard Home Page
 *
 * Sections:
 * 1. Welcome header (greeting from profiles.full_name)
 * 2. Welcome card (new users, dismissable)
 * 3. Quick action buttons
 * 4. Stats overview (resumes count, sessions count, last active)
 * 5. Saved resumes (up to 5)
 * 6. Recent AI sessions (up to 5)
 */

import { supabase } from '../../lib/supabase/client';
import type { ProfileRow, ResumeRow, AiSessionRow } from '../../lib/supabase/types';
import type { User } from '@supabase/supabase-js';

// ── Helpers ──────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  return formatDate(iso);
}

function skeleton(extraClass = ''): string {
  return `<div class="skeleton ${extraClass}"></div>`;
}

// ── Section renderers ─────────────────────────────────────────

function renderWelcomeCard(container: HTMLElement, profile: ProfileRow): void {
  if (profile.has_dismissed_welcome) return;

  const card = document.createElement('div');
  card.className = 'welcome-card';
  card.id = 'welcome-card';
  card.innerHTML = `
    <button class="welcome-card-close" id="welcome-dismiss" aria-label="Dismiss">&times;</button>
    <h3>Welcome to RexumeAI! Here's how to get started.</h3>
    <div class="welcome-steps">
      <div class="welcome-step"><span class="welcome-step-num">1</span>Upload your resume</div>
      <div class="welcome-step"><span class="welcome-step-num">2</span>Run an AI review</div>
      <div class="welcome-step"><span class="welcome-step-num">3</span>Tailor for a job posting</div>
      <div class="welcome-step"><span class="welcome-step-num">4</span>Download your optimized resume</div>
    </div>
    <button class="welcome-get-started" data-page="upload">
      Get Started →
    </button>
  `;
  container.appendChild(card);

  // Dismiss handler
  const dismissBtn = card.querySelector<HTMLButtonElement>('#welcome-dismiss')!;
  const getStarted = card.querySelector<HTMLButtonElement>('.welcome-get-started')!;

  async function dismiss() {
    card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-8px)';
    setTimeout(() => card.remove(), 250);
    // Persist to Supabase
    await supabase
      .from('profiles')
      .update({ has_dismissed_welcome: true, updated_at: new Date().toISOString() })
      .eq('user_id', profile.user_id);
  }

  dismissBtn.addEventListener('click', dismiss);
  getStarted.addEventListener('click', () => {
    dismiss();
    window.location.hash = 'upload';
  });
}

function renderQuickActions(container: HTMLElement): void {
  const section = document.createElement('div');
  section.innerHTML = `
    <p class="section-title">Quick Actions</p>
    <div class="quick-actions">
      <div class="action-card" data-page="upload">
        <div class="action-card-icon upload">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div>
          <div class="action-card-label">Upload Resume</div>
          <div class="action-card-desc">Import your existing resume to get started</div>
        </div>
        <span class="action-card-arrow">↗</span>
      </div>
      <div class="action-card" data-page="ai-tools">
        <div class="action-card-icon review">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
        <div>
          <div class="action-card-label">AI Review</div>
          <div class="action-card-desc">Get a full ATS and quality analysis</div>
        </div>
        <span class="action-card-arrow">↗</span>
      </div>
      <div class="action-card" data-page="ai-tools">
        <div class="action-card-icon tailor">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/>
          </svg>
        </div>
        <div>
          <div class="action-card-label">Tailor for a Job</div>
          <div class="action-card-desc">Match your resume to a specific role</div>
        </div>
        <span class="action-card-arrow">↗</span>
      </div>
    </div>
  `;
  container.appendChild(section);

  // Wire action card clicks to navigation
  section.querySelectorAll<HTMLElement>('.action-card').forEach((card) => {
    card.addEventListener('click', () => {
      const page = card.dataset.page;
      if (page) window.location.hash = page;
    });
  });
}

function renderStatsSkeletons(container: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'stats-row';
  row.innerHTML = `
    ${skeleton('skeleton-stat')}
    ${skeleton('skeleton-stat')}
    ${skeleton('skeleton-stat')}
  `;
  container.appendChild(row);
  return row;
}

function renderStats(
  placeholder: HTMLElement,
  resumeCount: number,
  sessionCount: number,
  lastActive: string | null
): void {
  placeholder.innerHTML = `
    <div class="stat-card">
      <div class="stat-card-value">${resumeCount}</div>
      <div class="stat-card-label">Resumes Saved</div>
      ${resumeCount === 0 ? '<div class="stat-card-sub">Upload your first resume to get started</div>' : ''}
    </div>
    <div class="stat-card">
      <div class="stat-card-value">${sessionCount}</div>
      <div class="stat-card-label">AI Sessions</div>
      ${sessionCount === 0 ? '<div class="stat-card-sub">Run your first AI review to see results</div>' : ''}
    </div>
    <div class="stat-card">
      <div class="stat-card-value">${lastActive ? timeAgo(lastActive) : '—'}</div>
      <div class="stat-card-label">Last Active</div>
      ${!lastActive ? '<div class="stat-card-sub">No activity yet</div>' : ''}
    </div>
  `;
}

function renderResumeSection(container: HTMLElement, resumes: ResumeRow[] | null, error: string | null): void {
  const section = document.createElement('div');
  section.className = 'dash-section';

  if (error) {
    section.innerHTML = `
      <div class="dash-section-header"><h3>Saved Resumes</h3></div>
      <div class="error-state">Failed to load resumes. Please refresh.</div>
    `;
    container.appendChild(section);
    return;
  }

  const hasResumes = resumes && resumes.length > 0;
  section.innerHTML = `
    <div class="dash-section-header">
      <h3>Saved Resumes</h3>
      ${hasResumes ? '<a href="#" class="view-all-link" data-page="resumes">View All →</a>' : ''}
    </div>
    ${hasResumes ? resumes!.slice(0, 5).map((r) => `
      <div class="resume-item">
        <div class="resume-item-info">
          <div class="resume-item-title">${r.title}</div>
          <div class="resume-item-date">${formatDate(r.created_at)}</div>
        </div>
        <button class="resume-item-btn">Open</button>
      </div>
    `).join('') : `
      <div class="empty-state">
        <div class="empty-state-icon">📄</div>
        <p>No resumes yet — <a href="#" data-page="upload">upload your first one!</a></p>
      </div>
    `}
  `;
  container.appendChild(section);

  // Wire "View All" and empty-state links
  section.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = el.dataset.page!;
    });
  });
}

function renderSessionSection(container: HTMLElement, sessions: AiSessionRow[] | null, resumeMap: Map<string, string>, error: string | null): void {
  const section = document.createElement('div');
  section.className = 'dash-section';

  if (error) {
    section.innerHTML = `
      <div class="dash-section-header"><h3>Recent AI Sessions</h3></div>
      <div class="error-state">Failed to load sessions. Please refresh.</div>
    `;
    container.appendChild(section);
    return;
  }

  const hasSessions = sessions && sessions.length > 0;
  section.innerHTML = `
    <div class="dash-section-header">
      <h3>Recent AI Sessions</h3>
      ${hasSessions ? '<a href="#" class="view-all-link" data-page="ai-tools">View All →</a>' : ''}
    </div>
    ${hasSessions ? sessions!.slice(0, 5).map((s) => `
      <div class="session-item">
        <span class="session-badge ${s.session_type}">${s.session_type}</span>
        <div class="session-item-info">
          <div class="session-item-resume">${s.resume_id ? (resumeMap.get(s.resume_id) ?? 'Unknown resume') : 'No resume'}</div>
          <div class="session-item-date">${timeAgo(s.created_at)}</div>
        </div>
      </div>
    `).join('') : `
      <div class="empty-state">
        <div class="empty-state-icon">✨</div>
        <p>No AI sessions yet — <a href="#" data-page="ai-tools">try reviewing a resume!</a></p>
      </div>
    `}
  `;
  container.appendChild(section);

  section.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = el.dataset.page!;
    });
  });
}

// ── Main render ───────────────────────────────────────────────

export async function renderHome(container: HTMLElement, user: User): Promise<void> {
  const userId = user.id;

  // 1. Render greeting skeleton while data loads
  container.innerHTML = `
    <div class="dash-header">
      ${skeleton('skeleton-text lg')}
      ${skeleton('skeleton-text sm')}
    </div>
  `;

  // 2. Fetch profile, resumes, sessions in parallel
  const [
    { data: profile, error: profileError },
    { data: resumes, error: resumeError },
    { data: sessions, error: sessionError },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).single(),
    supabase.from('resumes').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('ai_sessions').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ]);

  // 3. Clear skeleton, build real UI
  container.innerHTML = '';

  // ── Welcome header ──
  const firstName = profile?.full_name?.split(' ')[0] ?? null;
  const greeting = firstName ? `Hey <span class="accent">${firstName}</span>, welcome back!` : 'Hey there, welcome!';
  const header = document.createElement('div');
  header.className = 'dash-header';
  header.innerHTML = `
    <h1 class="dash-greeting">${greeting}</h1>
    <p class="dash-subtitle">Here's what's happening with your resumes.</p>
  `;
  container.appendChild(header);

  // ── Welcome card (new users) ──
  if (profile && !profileError) {
    renderWelcomeCard(container, profile as ProfileRow);
  }

  // ── Quick actions ──
  renderQuickActions(container);

  // ── Stats ──
  const statsPlaceholder = renderStatsSkeletons(container);
  const resumeCount   = resumes?.length ?? 0;
  const sessionCount  = sessions?.length ?? 0;
  const lastActiveArr = [
    ...(resumes ?? []).map((r) => r.updated_at),
    ...(sessions ?? []).map((s) => s.created_at),
  ].sort().reverse();
  renderStats(statsPlaceholder, resumeCount, sessionCount, lastActiveArr[0] ?? null);

  // ── Two-column section ──
  const columns = document.createElement('div');
  columns.className = 'dash-columns';
  container.appendChild(columns);

  // Build resume title lookup for sessions
  const resumeMap = new Map<string, string>(
    (resumes ?? []).map((r) => [r.id, r.title])
  );

  renderResumeSection(columns, resumes as ResumeRow[] | null, resumeError ? resumeError.message : null);
  renderSessionSection(columns, sessions as AiSessionRow[] | null, resumeMap, sessionError ? sessionError.message : null);
}
