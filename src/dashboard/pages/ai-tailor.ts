/**
 * AI Tailor for Job Page
 *
 * Three phases:
 *  1. Pick    — select resume + paste job description
 *  2. Process — spinner while Claude tailors
 *  3. Results — original vs tailored comparison cards + match score + keywords added
 */

import { supabase } from '../../lib/supabase/client';
import { getResumes, createAiSession, getAiSessionsByType, deleteAiSession } from '../../lib/supabase/db';
import type { ResumeRow, AiSessionRow, TailorResult, TailorItem } from '../../lib/supabase/types';
import type { User } from '@supabase/supabase-js';

// ── State ──────────────────────────────────────────────────────

interface TailorState {
  resumes: ResumeRow[];
  selected: ResumeRow | null;
  jobDescription: string;
  sessions: AiSessionRow[];
  activeSession: AiSessionRow | null;
  result: TailorResult | null;
}

const state: TailorState = {
  resumes: [],
  selected: null,
  jobDescription: '',
  sessions: [],
  activeSession: null,
  result: null,
};

let rootContainer: HTMLElement;
let currentUser: User;

// ── Entry Point ────────────────────────────────────────────────

export async function renderAiTailor(container: HTMLElement, user: User): Promise<void> {
  rootContainer = container;
  currentUser = user;

  state.resumes = [];
  state.selected = null;
  state.jobDescription = '';
  state.sessions = [];
  state.activeSession = null;
  state.result = null;

  await renderPicker();
}

// ── Phase 1: Picker ────────────────────────────────────────────

async function renderPicker(): Promise<void> {
  rootContainer.innerHTML = `
    <div class="ai-tailor-page">
      <div class="dash-header">
        <div>
          <button class="review-back-link" id="back-to-tools">← AI Tools</button>
          <h1 class="dash-greeting">Tailor for Job</h1>
          <p class="dash-subtitle">Select a resume and paste a job description — Claude will tailor your resume to maximize your match.</p>
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

      <div id="job-desc-section" style="display:none">
        <div class="tailor-jd-wrap">
          <label class="tailor-jd-label" for="job-desc-input">Job Description</label>
          <p class="tailor-jd-hint">Paste the full job posting below. The more detail you include, the better the tailoring.</p>
          <textarea
            id="job-desc-input"
            class="tailor-jd-textarea"
            placeholder="Paste the job description here…"
            rows="10"
          ></textarea>
          <div id="jd-char-count" class="tailor-jd-charcount">0 characters</div>
        </div>
      </div>

      <div id="picker-actions" style="margin-top:1.5rem;display:none">
        <button class="btn-start-review" id="start-tailor-btn" disabled>Tailor Resume</button>
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
        <p class="review-empty-sub">Upload a resume first, then come back to tailor it for a job.</p>
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

  content.querySelectorAll<HTMLElement>('.resume-picker-card').forEach((card) => {
    card.addEventListener('click', () => selectResume(card));
  });
}

async function selectResume(card: HTMLElement): Promise<void> {
  rootContainer.querySelectorAll('.resume-picker-card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');

  const idx = parseInt(card.dataset.idx ?? '0', 10);
  state.selected = state.resumes[idx];

  // Show job description textarea
  const jdSection = rootContainer.querySelector<HTMLElement>('#job-desc-section')!;
  jdSection.style.display = 'block';

  const actions = rootContainer.querySelector<HTMLElement>('#picker-actions')!;
  actions.style.display = 'block';

  const startBtn = rootContainer.querySelector<HTMLButtonElement>('#start-tailor-btn')!;
  const textarea = rootContainer.querySelector<HTMLTextAreaElement>('#job-desc-input')!;
  const charCount = rootContainer.querySelector<HTMLElement>('#jd-char-count')!;

  // Update button state when job description changes
  textarea.addEventListener('input', () => {
    state.jobDescription = textarea.value;
    const len = textarea.value.length;
    charCount.textContent = `${len.toLocaleString()} character${len !== 1 ? 's' : ''}`;
    startBtn.disabled = textarea.value.trim().length < 50;
  });

  // Restore previously typed job description if user re-selects a card
  if (state.jobDescription) {
    textarea.value = state.jobDescription;
    const len = state.jobDescription.length;
    charCount.textContent = `${len.toLocaleString()} character${len !== 1 ? 's' : ''}`;
    startBtn.disabled = state.jobDescription.trim().length < 50;
  }

  startBtn.onclick = () => startProcessing();

  // Load past tailoring sessions for this resume
  const historySection = rootContainer.querySelector<HTMLElement>('#history-section')!;
  historySection.style.display = 'block';
  historySection.innerHTML = `<div class="skeleton skeleton-text" style="width:30%;margin-bottom:.5rem"></div>`;

  const { data: sessions } = await getAiSessionsByType(currentUser.id, 'tailor', state.selected.id);
  state.sessions = sessions ?? [];

  if (state.sessions.length === 0) {
    historySection.innerHTML = '';
    return;
  }

  historySection.innerHTML = `
    <div class="history-section">
      <div class="history-title">Past Tailoring Sessions</div>
      <div class="history-list">
        ${state.sessions.map((s, i) => {
          const score = (s.output_data as TailorResult | null)?.job_match_score;
          return `
            <div class="history-row">
              <span class="history-date">${formatDate(s.created_at)}</span>
              ${score != null ? `<span class="history-score tailor-match-badge">${score}% match</span>` : ''}
              <button class="history-load-btn" data-session-idx="${i}">Load</button>
            </div>
          `;
        }).join('')}
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
  state.result = session.output_data as unknown as TailorResult;
  // Restore job description from saved input_data if available
  const inputData = session.input_data as { job_description?: string } | null;
  if (inputData?.job_description) state.jobDescription = inputData.job_description;
  renderResults();
}

// ── Phase 2: Processing ────────────────────────────────────────

async function startProcessing(): Promise<void> {
  if (!state.selected || state.jobDescription.trim().length < 50) return;

  rootContainer.innerHTML = `
    <div class="ai-tailor-page">
      <div class="review-processing">
        <div class="review-spinner"></div>
        <div class="review-processing-title">Tailoring your resume…</div>
        <div class="review-processing-sub">Claude is customizing <strong>${escHtml(state.selected.title)}</strong> for your job posting. This takes 15–30 seconds.</div>
      </div>
    </div>
  `;

  try {
    // Get a fresh session token right before calling the edge function
    const { data: { session: authSession } } = await supabase.auth.getSession();

    const { data: fnResult, error: fnError } = await supabase.functions.invoke('tailor-resume', {
      body: {
        resume_id: state.selected.id,
        job_description: state.jobDescription,
      },
      headers: authSession ? { Authorization: `Bearer ${authSession.access_token}` } : {},
    });

    if (fnError || !fnResult?.data) {
      let msg = fnResult?.error ?? fnError?.message ?? 'AI tailoring failed. Please retry.';
      if (fnError && 'context' in fnError) {
        try {
          const body = await (fnError as { context: Response }).context.json();
          msg = body?.error ?? msg;
        } catch { /* ignore */ }
      }
      showProcessingError(msg);
      return;
    }

    const result = fnResult.data as TailorResult;

    // Save to ai_sessions — store job description in input_data for history reload
    const { data: session } = await createAiSession({
      user_id: currentUser.id,
      resume_id: state.selected.id,
      session_type: 'tailor',
      input_data: {
        ...(state.selected.parsed_content ?? {}),
        job_description: state.jobDescription,
      },
      output_data: result as unknown as Record<string, unknown>,
    });

    state.activeSession = session;
    state.result = result;
    renderResults();

  } catch (err) {
    showProcessingError('Unexpected error. Please try again.');
    console.error('[ai-tailor] processing error:', err);
  }
}

function showProcessingError(msg: string): void {
  rootContainer.innerHTML = `
    <div class="ai-tailor-page">
      <div class="review-processing">
        <div class="review-processing-error">
          <div class="review-error-icon">⚠</div>
          <div class="review-processing-title">Tailoring failed</div>
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
  const score = result.job_match_score ?? 0;

  rootContainer.innerHTML = `
    <div class="ai-tailor-page">

      <!-- Action bar -->
      <div class="rewrite-action-bar">
        <button class="review-action-btn secondary" id="btn-back">← Back</button>
        <span class="review-resume-label">${escHtml(resume.title)}</span>
        <div class="review-action-right">
          <button class="review-action-btn secondary" id="btn-rerun">Re-run Tailor</button>
          <button class="review-action-btn danger" id="btn-delete">Delete</button>
        </div>
      </div>

      <!-- Match score + summary card -->
      <div class="tailor-header-card">
        <div class="tailor-score-wrap">
          <div class="tailor-score-circle" style="--score-color:${matchColor(score)}">
            <span class="tailor-score-number">${score}%</span>
            <span class="tailor-score-label">match</span>
          </div>
        </div>
        <div class="tailor-header-body">
          <div class="rewrite-card-heading">Tailoring Summary</div>
          <p class="rewrite-summary-text">${escHtml(result.overall_summary)}</p>
        </div>
      </div>

      <!-- Keywords added -->
      ${result.keywords_added?.length ? `
        <div class="tailor-keywords-card">
          <div class="rewrite-card-heading">Keywords Added</div>
          <div class="tailor-keywords-chips">
            ${result.keywords_added.map((k) => `<span class="tailor-keyword-chip">${escHtml(k)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Key changes -->
      ${result.key_changes?.length ? `
        <div class="rewrite-improvements-card">
          <div class="rewrite-card-heading">Key Changes</div>
          <ul class="rewrite-key-improvements-list">
            ${result.key_changes.map((c) => `<li><span class="improvement-icon">↑</span>${escHtml(c)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- Tailor items -->
      <div class="rewrite-items">
        ${result.items?.length
          ? result.items.map((item) => renderTailorItemCard(item)).join('')
          : '<p class="muted-note">No changes were needed — your resume already matches this job well!</p>'
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

function renderTailorItemCard(item: TailorItem): string {
  return `
    <div class="rewrite-item-card">
      <div class="rewrite-item-header">
        <div class="rewrite-item-meta">
          <span class="rewrite-item-section-tag tailor-tag">${escHtml(sectionLabel(item.section))}</span>
          <span class="rewrite-item-label">${escHtml(item.label)}</span>
        </div>
        <button class="copy-btn" data-copy="${escAttr(item.tailored)}">Copy</button>
      </div>

      <div class="rewrite-columns">
        <div class="rewrite-col-original">
          <div class="rewrite-col-label">Original</div>
          <div class="rewrite-col-text">${escHtml(item.original)}</div>
        </div>
        <div class="rewrite-col-tailored">
          <div class="rewrite-col-label">Tailored</div>
          <div class="rewrite-col-text">${escHtml(item.tailored)}</div>
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
      <div class="confirm-dialog-title">Delete This Tailored Version?</div>
      <p class="confirm-dialog-body">This tailoring session will be permanently deleted. This cannot be undone.</p>
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

function matchColor(score: number): string {
  if (score >= 80) return '#7CA491';  // accent green
  if (score >= 60) return '#c9a227';  // amber
  return '#e05c5c';                   // red
}

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
