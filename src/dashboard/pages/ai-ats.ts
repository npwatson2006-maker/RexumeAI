/**
 * ATS Tracker Page
 *
 * Three phases:
 *  1. Pick    — grid of saved resumes + past scan history
 *  2. Process — spinner while Claude simulates ATS parsing
 *  3. Results — ATS score, contact detection, section detection,
 *               formatting issues, keyword analysis, recommendations
 */

import { supabase } from '../../lib/supabase/client';
import { getResumes, createAiSession, getAiSessionsByType, deleteAiSession } from '../../lib/supabase/db';
import type {
  ResumeRow, AiSessionRow,
  ATSResult, ATSSectionResult, ATSFormattingIssue,
} from '../../lib/supabase/types';
import type { User } from '@supabase/supabase-js';

// ── State ──────────────────────────────────────────────────────

interface ATSState {
  resumes: ResumeRow[];
  selected: ResumeRow | null;
  sessions: AiSessionRow[];
  activeSession: AiSessionRow | null;
  result: ATSResult | null;
}

const state: ATSState = {
  resumes: [],
  selected: null,
  sessions: [],
  activeSession: null,
  result: null,
};

let rootContainer: HTMLElement;
let currentUser: User;

// ── Entry Point ────────────────────────────────────────────────

export async function renderAiAts(container: HTMLElement, user: User): Promise<void> {
  rootContainer = container;
  currentUser = user;

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
    <div class="ai-ats-page">
      <div class="dash-header">
        <div>
          <button class="review-back-link" id="back-to-tools">← AI Tools</button>
          <h1 class="dash-greeting">ATS Tracker</h1>
          <p class="dash-subtitle">See exactly what Applicant Tracking Systems detect when recruiters receive your resume — and how to score higher.</p>
        </div>
      </div>

      <div class="ats-explainer">
        <div class="ats-explainer-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <p>Over <strong>75% of resumes are rejected by ATS software</strong> before a human ever reads them. This tool simulates what Workday, Greenhouse, Lever, and similar platforms see — so you can fix the issues before applying.</p>
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
        <button class="btn-start-review" id="start-ats-btn" disabled>Run ATS Scan</button>
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
        <p class="review-empty-sub">Upload a resume first, then run an ATS scan on it.</p>
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

  const startBtn = rootContainer.querySelector<HTMLButtonElement>('#start-ats-btn')!;
  startBtn.disabled = false;
  startBtn.onclick = () => startProcessing();

  const historySection = rootContainer.querySelector<HTMLElement>('#history-section')!;
  historySection.style.display = 'block';
  historySection.innerHTML = `<div class="skeleton skeleton-text" style="width:30%;margin-bottom:.5rem"></div>`;

  const { data: sessions } = await getAiSessionsByType(currentUser.id, 'ats', state.selected.id);
  state.sessions = sessions ?? [];

  if (state.sessions.length === 0) {
    historySection.innerHTML = '';
    return;
  }

  historySection.innerHTML = `
    <div class="history-section">
      <div class="history-title">Past Scans</div>
      <div class="history-list">
        ${state.sessions.map((s, i) => {
          const score = (s.output_data as ATSResult | null)?.overall_score;
          return `
            <div class="history-row">
              <span class="history-date">${formatDate(s.created_at)}</span>
              ${score != null ? `<span class="history-score" style="color:${scoreColor(score)}">${score}/100</span>` : ''}
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
  state.result = session.output_data as unknown as ATSResult;
  renderResults();
}

// ── Phase 2: Processing ────────────────────────────────────────

async function startProcessing(): Promise<void> {
  if (!state.selected) return;

  rootContainer.innerHTML = `
    <div class="ai-ats-page">
      <div class="review-processing">
        <div class="review-spinner"></div>
        <div class="review-processing-title">Scanning with ATS simulation…</div>
        <div class="review-processing-sub">Analyzing <strong>${escHtml(state.selected.title)}</strong> through the eyes of Workday, Greenhouse, and Lever.</div>
      </div>
    </div>
  `;

  try {
    const { data: { session: authSession } } = await supabase.auth.getSession();

    const { data: fnResult, error: fnError } = await supabase.functions.invoke('ats-scan', {
      body: { resume_id: state.selected.id },
      headers: authSession ? { Authorization: `Bearer ${authSession.access_token}` } : {},
    });

    if (fnError || !fnResult?.data) {
      let msg = fnResult?.error ?? fnError?.message ?? 'ATS scan failed. Please retry.';
      if (fnError && 'context' in fnError) {
        try {
          const body = await (fnError as { context: Response }).context.json();
          msg = body?.error ?? msg;
        } catch { /* ignore */ }
      }
      showProcessingError(msg);
      return;
    }

    const result = fnResult.data as ATSResult;

    const { data: session } = await createAiSession({
      user_id: currentUser.id,
      resume_id: state.selected.id,
      session_type: 'ats',
      input_data: state.selected.parsed_content ?? null,
      output_data: result as unknown as Record<string, unknown>,
    });

    state.activeSession = session;
    state.result = result;
    renderResults();

  } catch (err) {
    showProcessingError('Unexpected error. Please try again.');
    console.error('[ai-ats] processing error:', err);
  }
}

function showProcessingError(msg: string): void {
  rootContainer.innerHTML = `
    <div class="ai-ats-page">
      <div class="review-processing">
        <div class="review-processing-error">
          <div class="review-error-icon">⚠</div>
          <div class="review-processing-title">Scan failed</div>
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
  const score = result.overall_score ?? 0;

  rootContainer.innerHTML = `
    <div class="ai-ats-page">

      <!-- Action bar -->
      <div class="rewrite-action-bar">
        <button class="review-action-btn secondary" id="btn-back">← Back</button>
        <span class="review-resume-label">${escHtml(resume.title)}</span>
        <div class="review-action-right">
          <button class="review-action-btn secondary" id="btn-rerun">Re-scan</button>
          <button class="review-action-btn danger" id="btn-delete">Delete Scan</button>
        </div>
      </div>

      <!-- Score header -->
      <div class="ats-score-header">
        <div class="ats-score-gauge-wrap">
          <svg viewBox="0 0 120 120" class="score-gauge" aria-label="ATS score: ${score} out of 100">
            <circle cx="60" cy="60" r="50" class="gauge-track"/>
            <circle cx="60" cy="60" r="50" class="gauge-fill"
              stroke-dasharray="314"
              stroke-dashoffset="314"
              style="stroke:${scoreColor(score)}"/>
            <text x="60" y="58" class="gauge-score">${score}</text>
            <text x="60" y="74" class="gauge-label">/100</text>
          </svg>
          <div class="ats-score-grade ${atsGradeClass(score)}">${atsGradeLabel(score)}</div>
        </div>
        <div class="ats-score-summary">
          <div class="rewrite-card-heading">ATS Compatibility Score</div>
          <p class="rewrite-summary-text">${escHtml(result.summary)}</p>
        </div>
      </div>

      <!-- Contact detection -->
      <div class="ats-card">
        <div class="ats-card-heading">Contact Information Detection</div>
        <div class="ats-contact-grid">
          ${renderContactRow('Full Name', result.parsed_contact?.name_detected)}
          ${renderContactRow('Email Address', result.parsed_contact?.email_detected)}
          ${renderContactRow('Phone Number', result.parsed_contact?.phone_detected)}
          ${renderContactRow('Location / City', result.parsed_contact?.location_detected)}
          ${renderContactRow('LinkedIn URL', result.parsed_contact?.linkedin_detected)}
        </div>
      </div>

      <!-- Section detection -->
      <div class="ats-card">
        <div class="ats-card-heading">Section Detection</div>
        <div class="ats-sections-list">
          ${(result.sections ?? []).map((s) => renderSectionRow(s)).join('')}
        </div>
      </div>

      <!-- Formatting issues -->
      ${result.formatting_issues?.length ? `
        <div class="ats-card">
          <div class="ats-card-heading">Formatting Issues</div>
          <div class="ats-issues-list">
            ${result.formatting_issues.map((issue) => renderIssueRow(issue)).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Keyword analysis -->
      <div class="ats-card">
        <div class="ats-card-heading">
          Keyword Analysis
          <span class="ats-keyword-score-badge" style="color:${scoreColor(result.keyword_analysis?.density_score ?? 0)}">
            Density: ${result.keyword_analysis?.density_score ?? 0}/100
          </span>
        </div>
        ${result.keyword_analysis?.found?.length ? `
          <div class="ats-keyword-subsection">
            <div class="ats-keyword-sublabel">Detected Keywords</div>
            <div class="ats-keyword-chips found">
              ${result.keyword_analysis.found.map((k) => `<span class="ats-chip found">${escHtml(k)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
        ${result.keyword_analysis?.suggested_missing?.length ? `
          <div class="ats-keyword-subsection">
            <div class="ats-keyword-sublabel">Suggested Missing Keywords</div>
            <div class="ats-keyword-chips missing">
              ${result.keyword_analysis.suggested_missing.map((k) => `<span class="ats-chip missing">${escHtml(k)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Recommendations -->
      ${result.recommendations?.length ? `
        <div class="ats-card ats-recommendations-card">
          <div class="ats-card-heading">Top Recommendations</div>
          <ol class="ats-recommendations-list">
            ${result.recommendations.map((r, i) => `
              <li>
                <span class="ats-rec-number">${i + 1}</span>
                <span>${escHtml(r)}</span>
              </li>
            `).join('')}
          </ol>
        </div>
      ` : ''}

    </div>
  `;

  rootContainer.querySelector('#btn-back')!.addEventListener('click', () => renderPicker());
  rootContainer.querySelector('#btn-rerun')!.addEventListener('click', () => startProcessing());
  rootContainer.querySelector('#btn-delete')!.addEventListener('click', () => showDeleteConfirm());

  // Animate gauge
  requestAnimationFrame(() => {
    const fill = rootContainer.querySelector<SVGCircleElement>('.gauge-fill');
    if (fill) {
      fill.style.transition = 'stroke-dashoffset 1s ease';
      fill.style.strokeDashoffset = String(314 - (score / 100) * 314);
    }
  });
}

// ── Result renderers ───────────────────────────────────────────

function renderContactRow(label: string, detected: boolean | undefined): string {
  const yes = detected === true;
  return `
    <div class="ats-contact-row">
      <span class="ats-contact-icon ${yes ? 'detected' : 'missing'}">${yes ? '✓' : '✗'}</span>
      <span class="ats-contact-label">${label}</span>
      <span class="ats-contact-status ${yes ? 'detected' : 'missing'}">${yes ? 'Detected' : 'Not detected'}</span>
    </div>
  `;
}

function renderSectionRow(s: ATSSectionResult): string {
  const confidenceClass = s.detected
    ? `confidence-${s.confidence}`
    : 'not-detected';
  const icon = s.detected ? '✓' : '✗';
  const confidenceLabel = s.detected
    ? `${s.confidence.charAt(0).toUpperCase() + s.confidence.slice(1)} confidence`
    : 'Not detected';
  return `
    <div class="ats-section-row">
      <span class="ats-section-icon ${s.detected ? 'detected' : 'missing'}">${icon}</span>
      <div class="ats-section-body">
        <div class="ats-section-name">${escHtml(s.section.charAt(0).toUpperCase() + s.section.slice(1))}</div>
        <div class="ats-section-notes">${escHtml(s.notes)}</div>
      </div>
      <span class="ats-confidence-badge ${confidenceClass}">${confidenceLabel}</span>
    </div>
  `;
}

function renderIssueRow(issue: ATSFormattingIssue): string {
  const icons = { critical: '✗', warning: '⚠', info: 'ℹ' };
  return `
    <div class="ats-issue-row severity-${issue.severity}">
      <span class="ats-issue-icon">${icons[issue.severity] ?? '•'}</span>
      <div class="ats-issue-body">
        <div class="ats-issue-title">${escHtml(issue.issue)}</div>
        <div class="ats-issue-suggestion">${escHtml(issue.suggestion)}</div>
      </div>
      <span class="ats-severity-badge ${issue.severity}">${issue.severity}</span>
    </div>
  `;
}

// ── Delete confirm dialog ──────────────────────────────────────

function showDeleteConfirm(): void {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-dialog-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <div class="confirm-dialog-title">Delete This ATS Scan?</div>
      <p class="confirm-dialog-body">This scan result will be permanently deleted. This cannot be undone.</p>
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

function scoreColor(score: number): string {
  if (score >= 80) return '#7CA491';
  if (score >= 60) return '#c9a227';
  return '#e05c5c';
}

function atsGradeLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 65) return 'Fair';
  if (score >= 50) return 'Poor';
  return 'Critical';
}

function atsGradeClass(score: number): string {
  if (score >= 80) return 'grade-good';
  if (score >= 65) return 'grade-fair';
  return 'grade-poor';
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
