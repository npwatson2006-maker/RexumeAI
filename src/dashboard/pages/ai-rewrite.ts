/**
 * AI Resume Rewrite Page
 *
 * Three phases:
 *  1. Pick    — grid of saved resumes + past rewrite history
 *  2. Process — spinner while Claude rewrites
 *  3. Results — original vs rewritten comparison cards per section
 */

import { supabase } from '../../lib/supabase/client';
import { getResumes, createAiSession, getAiSessionsByType, deleteAiSession } from '../../lib/supabase/db';
import type { ResumeRow, AiSessionRow, RewriteResult, RewriteItem } from '../../lib/supabase/types';
import type { User } from '@supabase/supabase-js';

// ── State ──────────────────────────────────────────────────────

interface RewriteState {
  resumes: ResumeRow[];
  selected: ResumeRow | null;
  sessions: AiSessionRow[];
  activeSession: AiSessionRow | null;
  result: RewriteResult | null;
}

const state: RewriteState = {
  resumes: [],
  selected: null,
  sessions: [],
  activeSession: null,
  result: null,
};

let rootContainer: HTMLElement;
let currentUser: User;

// ── Entry Point ────────────────────────────────────────────────

export async function renderAiRewrite(container: HTMLElement, user: User): Promise<void> {
  rootContainer = container;
  currentUser = user;

  // Reset state
  state.resumes = [];
  state.selected = null;
  state.sessions = [];
  state.activeSession = null;
  state.result = null;

  await renderPicker();
}

// ── Phase 1: Picker ────────────────────────────────────────────

async function renderPicker(): Promise<void> {
  rootContainer.innerHTML = `
    <div class="ai-rewrite-page">
      <div class="dash-header">
        <div>
          <button class="review-back-link" id="back-to-tools">← AI Tools</button>
          <h1 class="dash-greeting">AI Rewrite</h1>
          <p class="dash-subtitle">Select a resume and let Claude rewrite weak sections to be stronger and more impactful.</p>
        </div>
      </div>

      <div id="picker-content">
        <div class="resume-picker-grid">
          ${[1, 2, 3].map(() => `
            <div class="resume-picker-card skeleton-card-wrap">
              <div class="skeleton skeleton-text lg" style="width:60%;margin-bottom:.75rem"></div>
              <div class="skeleton skeleton-text sm" style="width:40%"></div>
            </div>
          `).join('')}
        </div>
      </div>

      <div id="picker-actions" style="margin-top:1.5rem;display:none">
        <button class="btn-start-review" id="start-rewrite-btn" disabled>Start Rewrite</button>
      </div>

      <div id="history-section" style="display:none"></div>
    </div>
  `;

  rootContainer.querySelector('#back-to-tools')!.addEventListener('click', () => {
    window.location.hash = 'ai-tools';
  });

  const { data, error } = await getResumes(currentUser.id);
  state.resumes = data ?? [];

  renderPickerGrid(error);
}

function renderPickerGrid(error: string | null): void {
  const content = rootContainer.querySelector<HTMLElement>('#picker-content')!;
  const actions = rootContainer.querySelector<HTMLElement>('#picker-actions')!;

  if (error) {
    content.innerHTML = `<div class="review-error-state">Failed to load resumes: ${escHtml(error)}</div>`;
    return;
  }

  if (state.resumes.length === 0) {
    content.innerHTML = `
      <div class="review-empty-state">
        <div class="review-empty-icon">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="8" y="4" width="32" height="40" rx="3"/>
            <polyline points="30 4 30 14 40 14"/>
            <line x1="16" y1="22" x2="32" y2="22"/>
            <line x1="16" y1="30" x2="24" y2="30"/>
          </svg>
        </div>
        <p class="review-empty-title">No resumes yet</p>
        <p class="review-empty-sub">Upload a resume first, then come back to rewrite it.</p>
        <button class="btn-upload-link" id="go-upload">Upload Resume</button>
      </div>
    `;
    content.querySelector('#go-upload')!.addEventListener('click', () => { window.location.hash = 'upload'; });
    return;
  }

  content.innerHTML = `
    <div class="resume-picker-grid" id="resume-grid">
      ${state.resumes.map((r, i) => `
        <div class="resume-picker-card" data-idx="${i}" data-id="${r.id}">
          <div class="picker-card-title">${escHtml(r.title)}</div>
          <div class="picker-card-date">${formatDate(r.created_at)}</div>
        </div>
      `).join('')}
    </div>
  `;

  actions.style.display = 'block';

  content.querySelectorAll<HTMLElement>('.resume-picker-card').forEach((card) => {
    card.addEventListener('click', () => selectResume(card));
  });
}

async function selectResume(card: HTMLElement): Promise<void> {
  rootContainer.querySelectorAll('.resume-picker-card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');

  const idx = parseInt(card.dataset.idx ?? '0', 10);
  state.selected = state.resumes[idx];

  const startBtn = rootContainer.querySelector<HTMLButtonElement>('#start-rewrite-btn')!;
  startBtn.disabled = false;
  startBtn.onclick = () => startProcessing();

  // Load past rewrites for this resume
  const historySection = rootContainer.querySelector<HTMLElement>('#history-section')!;
  historySection.style.display = 'block';
  historySection.innerHTML = `<div class="skeleton skeleton-text" style="width:30%;margin-bottom:.5rem"></div>`;

  const { data: sessions } = await getAiSessionsByType(currentUser.id, 'rewrite', state.selected.id);
  state.sessions = sessions ?? [];

  if (state.sessions.length === 0) {
    historySection.innerHTML = '';
    return;
  }

  historySection.innerHTML = `
    <div class="history-section">
      <div class="history-title">Past Rewrites</div>
      <div class="history-list">
        ${state.sessions.map((s, i) => `
          <div class="history-row">
            <span class="history-date">${formatDate(s.created_at)}</span>
            <button class="history-load-btn" data-session-idx="${i}">Load</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  historySection.querySelectorAll<HTMLButtonElement>('.history-load-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.sessionIdx ?? '0', 10);
      loadSession(state.sessions[i]);
    });
  });
}

function loadSession(session: AiSessionRow): void {
  state.activeSession = session;
  state.result = session.output_data as unknown as RewriteResult;
  renderResults();
}

// ── Phase 2: Processing ────────────────────────────────────────

async function startProcessing(): Promise<void> {
  if (!state.selected) return;

  rootContainer.innerHTML = `
    <div class="ai-rewrite-page">
      <div class="review-processing">
        <div class="review-spinner"></div>
        <div class="review-processing-title">Rewriting your resume…</div>
        <div class="review-processing-sub">Claude is improving <strong>${escHtml(state.selected.title)}</strong>. This takes 15–30 seconds.</div>
      </div>
    </div>
  `;

  try {
    // Get a fresh session token right before calling the edge function
    const { data: { session: authSession } } = await supabase.auth.getSession();

    const { data: fnResult, error: fnError } = await supabase.functions.invoke('rewrite-resume', {
      body: { resume_id: state.selected.id },
      headers: authSession ? { Authorization: `Bearer ${authSession.access_token}` } : {},
    });

    if (fnError || !fnResult?.data) {
      let msg = fnResult?.error ?? fnError?.message ?? 'AI rewrite failed. Please retry.';
      if (fnError && 'context' in fnError) {
        try {
          const body = await (fnError as { context: Response }).context.json();
          msg = body?.error ?? msg;
        } catch { /* ignore */ }
      }
      showProcessingError(msg);
      return;
    }

    const result = fnResult.data as RewriteResult;

    // Save to ai_sessions
    const { data: session } = await createAiSession({
      user_id: currentUser.id,
      resume_id: state.selected.id,
      session_type: 'rewrite',
      input_data: state.selected.parsed_content ?? null,
      output_data: result as unknown as Record<string, unknown>,
    });

    state.activeSession = session;
    state.result = result;
    renderResults();

  } catch (err) {
    showProcessingError('Unexpected error. Please try again.');
    console.error('[ai-rewrite] processing error:', err);
  }
}

function showProcessingError(msg: string): void {
  rootContainer.innerHTML = `
    <div class="ai-rewrite-page">
      <div class="review-processing">
        <div class="review-processing-error">
          <div class="review-error-icon">⚠</div>
          <div class="review-processing-title">Rewrite failed</div>
          <div class="review-processing-sub">${escHtml(msg)}</div>
          <div class="review-error-actions">
            <button class="btn-retry" id="retry-btn">Try Again</button>
            <button class="btn-back-pick" id="back-btn">← Back</button>
          </div>
        </div>
      </div>
    </div>
  `;
  rootContainer.querySelector('#retry-btn')!.addEventListener('click', startProcessing);
  rootContainer.querySelector('#back-btn')!.addEventListener('click', renderPicker);
}

// ── Phase 3: Results ───────────────────────────────────────────

function renderResults(): void {
  const result = state.result!;
  const resume = state.selected!;

  rootContainer.innerHTML = `
    <div class="ai-rewrite-page">

      <!-- Action bar -->
      <div class="rewrite-action-bar">
        <button class="review-action-btn secondary" id="btn-back">← Back</button>
        <span class="review-resume-label">${escHtml(resume.title)}</span>
        <div class="review-action-right">
          <button class="review-action-btn secondary" id="btn-rerun">Re-run Rewrite</button>
          <button class="review-action-btn danger" id="btn-delete">Delete Rewrite</button>
        </div>
      </div>

      <!-- Summary card -->
      <div class="rewrite-summary-card">
        <div class="rewrite-card-heading">Overview</div>
        <p class="rewrite-summary-text">${escHtml(result.overall_summary)}</p>
      </div>

      <!-- Key improvements card -->
      ${result.key_improvements?.length ? `
        <div class="rewrite-improvements-card">
          <div class="rewrite-card-heading">Key Improvements</div>
          <ul class="rewrite-key-improvements-list">
            ${result.key_improvements.map((k) => `<li><span class="improvement-icon">↑</span>${escHtml(k)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- Rewrite items -->
      <div class="rewrite-items">
        ${result.items?.length
          ? result.items.map((item) => renderRewriteItemCard(item)).join('')
          : '<p class="muted-note">No rewrites generated. Your resume may already be strong!</p>'
        }
      </div>

    </div>
  `;

  rootContainer.querySelector('#btn-back')!.addEventListener('click', () => renderPicker());
  rootContainer.querySelector('#btn-rerun')!.addEventListener('click', () => startProcessing());
  rootContainer.querySelector('#btn-delete')!.addEventListener('click', () => showDeleteConfirm());

  // Wire copy buttons
  rootContainer.querySelectorAll<HTMLButtonElement>('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.copy ?? '';
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      }).catch(() => {
        btn.textContent = 'Failed';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      });
    });
  });

  // Wire changes toggles
  rootContainer.querySelectorAll<HTMLElement>('.rewrite-changes-toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const card = toggle.closest<HTMLElement>('.rewrite-item-card')!;
      card.classList.toggle('changes-open');
    });
  });
}

function sectionLabel(section: string): string {
  const labels: Record<string, string> = {
    summary: 'Summary',
    experience: 'Experience',
    education: 'Education',
    skills: 'Skills',
    certifications: 'Certifications',
    projects: 'Projects',
  };
  return labels[section] ?? section;
}

function renderRewriteItemCard(item: RewriteItem): string {
  return `
    <div class="rewrite-item-card">
      <div class="rewrite-item-header">
        <div class="rewrite-item-meta">
          <span class="rewrite-item-section-tag">${escHtml(sectionLabel(item.section))}</span>
          <span class="rewrite-item-label">${escHtml(item.label)}</span>
        </div>
        <button class="copy-btn" data-copy="${escAttr(item.rewritten)}">Copy</button>
      </div>

      <div class="rewrite-columns">
        <div class="rewrite-col-original">
          <div class="rewrite-col-label">Original</div>
          <div class="rewrite-col-text">${escHtml(item.original)}</div>
        </div>
        <div class="rewrite-col-rewritten">
          <div class="rewrite-col-label">Rewritten</div>
          <div class="rewrite-col-text">${escHtml(item.rewritten)}</div>
        </div>
      </div>

      ${item.changes?.length ? `
        <div class="rewrite-changes-footer">
          <button class="rewrite-changes-toggle">
            <span class="changes-chevron">›</span> ${item.changes.length} change${item.changes.length !== 1 ? 's' : ''}
          </button>
          <ul class="rewrite-changes-list">
            ${item.changes.map((c) => `<li>${escHtml(c)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

// ── Delete confirm dialog ──────────────────────────────────────

function showDeleteConfirm(): void {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-dialog-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <div class="confirm-dialog-title">Delete This Rewrite?</div>
      <p class="confirm-dialog-body">This rewrite will be permanently deleted. This cannot be undone.</p>
      <div class="confirm-dialog-actions">
        <button class="btn-cancel" id="confirm-cancel">Cancel</button>
        <button class="btn-confirm-delete" id="confirm-delete">Delete</button>
      </div>
    </div>
  `;
  rootContainer.appendChild(overlay);

  overlay.querySelector('#confirm-cancel')!.addEventListener('click', () => overlay.remove());
  overlay.querySelector('#confirm-delete')!.addEventListener('click', async () => {
    if (state.activeSession) {
      await deleteAiSession(state.activeSession.id);
    }
    overlay.remove();
    await renderPicker();
  });
}

// ── Utilities ──────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(str: string): string {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
