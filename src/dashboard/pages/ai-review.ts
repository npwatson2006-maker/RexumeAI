/**
 * AI Resume Review Page
 *
 * Three phases:
 *  1. Pick    — grid of saved resumes + past review history
 *  2. Process — spinner while Claude analyzes
 *  3. Results — side-by-side annotated resume + scores/feedback
 */

import { supabase } from '../../lib/supabase/client';
import { getResumes, createAiSession, getAiSessionsByType, deleteAiSession } from '../../lib/supabase/db';
import type { ResumeRow, AiSessionRow, ReviewResult, ReviewAnnotation, ParsedResume } from '../../lib/supabase/types';
import type { User } from '@supabase/supabase-js';

// ── State ──────────────────────────────────────────────────────

interface ReviewState {
  resumes: ResumeRow[];
  selected: ResumeRow | null;
  sessions: AiSessionRow[];
  activeSession: AiSessionRow | null;
  result: ReviewResult | null;
}

const state: ReviewState = {
  resumes: [],
  selected: null,
  sessions: [],
  activeSession: null,
  result: null,
};

let rootContainer: HTMLElement;
let currentUser: User;

// ── Entry Point ────────────────────────────────────────────────

export async function renderAiReview(container: HTMLElement, user: User): Promise<void> {
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
    <div class="ai-review-page">
      <div class="dash-header">
        <div>
          <button class="review-back-link" id="back-to-tools">← AI Tools</button>
          <h1 class="dash-greeting">Resume Review</h1>
          <p class="dash-subtitle">Select a resume to get a detailed AI-powered analysis.</p>
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
        <button class="btn-start-review" id="start-review-btn" disabled>Start Review</button>
      </div>

      <div id="history-section" style="display:none"></div>
    </div>
  `;

  rootContainer.querySelector('#back-to-tools')!.addEventListener('click', () => {
    window.location.hash = 'ai-tools';
  });

  // Fetch resumes
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
        <p class="review-empty-sub">Upload a resume first, then come back to run a review.</p>
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
  // Deselect all
  rootContainer.querySelectorAll('.resume-picker-card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');

  const idx = parseInt(card.dataset.idx ?? '0', 10);
  state.selected = state.resumes[idx];

  const startBtn = rootContainer.querySelector<HTMLButtonElement>('#start-review-btn')!;
  startBtn.disabled = false;
  startBtn.onclick = () => startProcessing();

  // Load past reviews for this resume
  const historySection = rootContainer.querySelector<HTMLElement>('#history-section')!;
  historySection.style.display = 'block';
  historySection.innerHTML = `<div class="skeleton skeleton-text" style="width:30%;margin-bottom:.5rem"></div>`;

  const { data: sessions } = await getAiSessionsByType(currentUser.id, 'review', state.selected.id);
  state.sessions = sessions ?? [];

  if (state.sessions.length === 0) {
    historySection.innerHTML = '';
    return;
  }

  historySection.innerHTML = `
    <div class="history-section">
      <div class="history-title">Past Reviews</div>
      <div class="history-list">
        ${state.sessions.map((s, i) => {
          const score = (s.output_data as ReviewResult | null)?.overall_score;
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
      const idx = parseInt(btn.dataset.sessionIdx ?? '0', 10);
      loadSession(state.sessions[idx]);
    });
  });
}

function loadSession(session: AiSessionRow): void {
  state.activeSession = session;
  state.result = session.output_data as unknown as ReviewResult;
  renderResults();
}

// ── Phase 2: Processing ────────────────────────────────────────

async function startProcessing(): Promise<void> {
  if (!state.selected) return;

  rootContainer.innerHTML = `
    <div class="ai-review-page">
      <div class="review-processing">
        <div class="review-spinner"></div>
        <div class="review-processing-title">Analyzing your resume…</div>
        <div class="review-processing-sub">Claude is reviewing <strong>${escHtml(state.selected.title)}</strong>. This takes 15–30 seconds.</div>
      </div>
    </div>
  `;

  try {
    // Call edge function
    const { data: fnResult, error: fnError } = await supabase.functions.invoke('review-resume', {
      body: { resume_id: state.selected.id },
    });

    let result: ReviewResult | null = null;

    if (fnError || !fnResult?.data) {
      let msg = fnResult?.error ?? fnError?.message ?? 'AI review failed. Please retry.';
      if (fnError && 'context' in fnError) {
        try {
          const body = await (fnError as { context: Response }).context.json();
          msg = body?.error ?? msg;
        } catch { /* ignore */ }
      }
      showProcessingError(msg);
      return;
    }

    result = fnResult.data as ReviewResult;

    // Save to ai_sessions
    const { data: session } = await createAiSession({
      user_id: currentUser.id,
      resume_id: state.selected.id,
      session_type: 'review',
      input_data: state.selected.parsed_content ?? null,
      output_data: result as unknown as Record<string, unknown>,
    });

    state.activeSession = session;
    state.result = result;
    renderResults();

  } catch (err) {
    showProcessingError('Unexpected error. Please try again.');
    console.error('[ai-review] processing error:', err);
  }
}

function showProcessingError(msg: string): void {
  rootContainer.innerHTML = `
    <div class="ai-review-page">
      <div class="review-processing">
        <div class="review-processing-error">
          <div class="review-error-icon">⚠</div>
          <div class="review-processing-title">Review failed</div>
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
  const parsed = resume.parsed_content as unknown as ParsedResume | null;

  rootContainer.innerHTML = `
    <div class="review-results">

      <!-- Action bar -->
      <div class="review-action-bar">
        <button class="review-action-btn secondary" id="btn-back">← Back</button>
        <span class="review-resume-label">${escHtml(resume.title)}</span>
        <div class="review-action-right">
          <button class="review-action-btn secondary" id="btn-rerun">Re-run Review</button>
          <button class="review-action-btn accent" id="btn-improve">Improve This Resume ↗</button>
          <button class="review-action-btn danger" id="btn-delete">Delete Review</button>
        </div>
      </div>

      <!-- Side-by-side panels -->
      <div class="review-panels">

        <!-- LEFT: Annotated resume -->
        <div class="review-panel-left" id="annotated-resume">
          <div class="panel-heading">Resume</div>
          ${parsed ? renderAnnotatedResume(parsed, result.annotations) : '<p class="muted-note">No parsed content available.</p>'}
        </div>

        <!-- RIGHT: Scores & feedback -->
        <div class="review-panel-right" id="scores-panel">
          ${renderScoresPanel(result)}
        </div>

      </div>
    </div>
  `;

  // Wire action bar
  rootContainer.querySelector('#btn-back')!.addEventListener('click', () => renderPicker());
  rootContainer.querySelector('#btn-rerun')!.addEventListener('click', () => startProcessing());
  rootContainer.querySelector('#btn-improve')!.addEventListener('click', () => { window.location.hash = 'ai-tools/rewrite'; });
  rootContainer.querySelector('#btn-delete')!.addEventListener('click', () => showDeleteConfirm());

  // Wire category card toggles
  rootContainer.querySelectorAll<HTMLElement>('.category-card-header').forEach((header) => {
    header.addEventListener('click', () => {
      const card = header.closest<HTMLElement>('.category-card')!;
      card.classList.toggle('expanded');
    });
  });

  // Animate score gauge after paint
  requestAnimationFrame(() => {
    const fill = rootContainer.querySelector<SVGCircleElement>('.gauge-fill');
    if (fill) {
      const offset = 314 - (result.overall_score / 100) * 314;
      fill.style.strokeDashoffset = String(offset);
      fill.style.stroke = scoreColor(result.overall_score);
    }
    // Animate category bars
    rootContainer.querySelectorAll<HTMLElement>('.category-score-fill').forEach((bar) => {
      const w = bar.dataset.width ?? '0';
      bar.style.width = `${w}%`;
    });
  });
}

// ── Annotated resume renderer ──────────────────────────────────

function buildAnnotationMap(annotations: ReviewAnnotation[]): Map<string, ReviewAnnotation[]> {
  const map = new Map<string, ReviewAnnotation[]>();
  for (const ann of annotations) {
    const key = `${ann.section}:${ann.item_index}:${ann.field}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ann);
  }
  return map;
}

function annotationHtml(anns: ReviewAnnotation[]): string {
  return anns.map((a) => {
    const icons = { strong: '✓', okay: '◉', weak: '⚠' };
    return `<div class="annotation annotation--${a.rating}">
      <span class="annotation-icon">${icons[a.rating]}</span>
      <span class="annotation-text">${escHtml(a.comment)}</span>
    </div>`;
  }).join('');
}

function annotated(key: string, content: string, annMap: Map<string, ReviewAnnotation[]>): string {
  const anns = annMap.get(key) ?? [];
  return `<div class="annotated-field">${content}${annotationHtml(anns)}</div>`;
}

function renderAnnotatedResume(parsed: ParsedResume, annotations: ReviewAnnotation[]): string {
  const annMap = buildAnnotationMap(annotations);
  const parts: string[] = [];

  // Personal Info
  parts.push(`
    <div class="resume-section">
      <div class="resume-section-label">Personal Info</div>
      <div class="resume-personal">
        <div class="personal-name">${escHtml(parsed.full_name ?? '')}</div>
        <div class="personal-details">
          ${parsed.email ? `<span>${escHtml(parsed.email)}</span>` : ''}
          ${parsed.phone ? `<span>${escHtml(parsed.phone)}</span>` : ''}
          ${parsed.location ? `<span>${escHtml(parsed.location)}</span>` : ''}
          ${parsed.linkedin ? `<span>${escHtml(parsed.linkedin)}</span>` : ''}
          ${parsed.website ? `<span>${escHtml(parsed.website)}</span>` : ''}
        </div>
      </div>
    </div>
  `);

  // Summary
  if (parsed.summary) {
    parts.push(`
      <div class="resume-section">
        <div class="resume-section-label">Summary</div>
        ${annotated('summary:0:summary', `<p class="resume-text">${escHtml(parsed.summary)}</p>`, annMap)}
      </div>
    `);
  }

  // Experience
  if (parsed.experience?.length) {
    parts.push(`
      <div class="resume-section">
        <div class="resume-section-label">Experience</div>
        ${parsed.experience.map((exp, i) => `
          <div class="resume-item">
            ${annotated(`experience:${i}:title`,
              `<div class="resume-item-title">${escHtml(exp.title)} <span class="resume-item-company">@ ${escHtml(exp.company)}</span></div>`,
              annMap)}
            <div class="resume-item-meta">${escHtml(exp.start_date)} – ${escHtml(exp.end_date)}${exp.location ? ` · ${escHtml(exp.location)}` : ''}</div>
            ${annotated(`experience:${i}:description`,
              `<p class="resume-text">${escHtml(exp.description)}</p>`,
              annMap)}
          </div>
        `).join('')}
      </div>
    `);
  }

  // Education
  if (parsed.education?.length) {
    parts.push(`
      <div class="resume-section">
        <div class="resume-section-label">Education</div>
        ${parsed.education.map((edu, i) => `
          <div class="resume-item">
            ${annotated(`education:${i}:degree`,
              `<div class="resume-item-title">${escHtml(edu.degree)}${edu.field_of_study ? ` in ${escHtml(edu.field_of_study)}` : ''}</div>`,
              annMap)}
            <div class="resume-item-company">${escHtml(edu.institution)}</div>
            <div class="resume-item-meta">
              ${edu.start_date ?? ''}${edu.end_date ? ` – ${edu.end_date}` : ''}
              ${edu.gpa ? ` · GPA: ${escHtml(edu.gpa)}` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `);
  }

  // Skills
  if (parsed.skills?.length) {
    parts.push(`
      <div class="resume-section">
        <div class="resume-section-label">Skills</div>
        ${annotated('skills:0:skills',
          `<div class="resume-skills">${parsed.skills.map((s) => `<span class="resume-skill-chip">${escHtml(s)}</span>`).join('')}</div>`,
          annMap)}
      </div>
    `);
  }

  // Certifications
  if (parsed.certifications?.length) {
    parts.push(`
      <div class="resume-section">
        <div class="resume-section-label">Certifications</div>
        ${parsed.certifications.map((c, i) => `
          <div class="resume-item">
            ${annotated(`certifications:${i}:name`,
              `<div class="resume-item-title">${escHtml(c.name)}</div>`,
              annMap)}
            ${c.issuer ? `<div class="resume-item-meta">${escHtml(c.issuer)}${c.date ? ` · ${escHtml(c.date)}` : ''}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `);
  }

  // Projects
  if (parsed.projects?.length) {
    parts.push(`
      <div class="resume-section">
        <div class="resume-section-label">Projects</div>
        ${parsed.projects.map((proj, i) => `
          <div class="resume-item">
            ${annotated(`projects:${i}:name`,
              `<div class="resume-item-title">${escHtml(proj.name)}${proj.url ? ` <a class="resume-link" href="${escAttr(proj.url)}" target="_blank" rel="noopener">${escHtml(proj.url)}</a>` : ''}</div>`,
              annMap)}
            ${annotated(`projects:${i}:description`,
              `<p class="resume-text">${escHtml(proj.description)}</p>`,
              annMap)}
          </div>
        `).join('')}
      </div>
    `);
  }

  return parts.join('');
}

// ── Scores panel renderer ──────────────────────────────────────

function renderScoresPanel(result: ReviewResult): string {
  const score = result.overall_score;
  const circumference = 314;
  // Start at full offset (animated to real value in renderResults)
  const startOffset = circumference;

  const categoryLabels: Record<string, string> = {
    content_strength: 'Content Strength',
    formatting_structure: 'Formatting & Structure',
    keywords_ats: 'Keywords & ATS',
    grammar_clarity: 'Grammar & Clarity',
    impact_action_verbs: 'Action Verbs & Impact',
    bullet_point_strength: 'Bullet Point Strength',
  };

  const categoryHtml = Object.entries(result.categories).map(([key, cat]) => `
    <div class="category-card">
      <div class="category-card-header">
        <span class="category-name">${categoryLabels[key] ?? key}</span>
        <span class="category-score-badge" style="color:${scoreColor(cat.score)}">${cat.score}</span>
        <span class="category-chevron">›</span>
      </div>
      <div class="category-card-body">
        <div class="category-score-bar">
          <div class="category-score-fill" data-width="${cat.score}" style="width:0%"></div>
        </div>
        <p class="category-feedback">${escHtml(cat.feedback)}</p>
        ${cat.suggestions.length ? `
          <div class="category-suggestions">
            <div class="suggestions-label">Suggestions</div>
            <ul class="suggestions-list">
              ${cat.suggestions.map((s) => `<li>${escHtml(s)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        ${cat.missing_keywords?.length ? `
          <div class="category-extras">
            <div class="extras-label">Missing Keywords</div>
            <div class="extras-chips">${cat.missing_keywords.map((k) => `<span class="extra-chip">${escHtml(k)}</span>`).join('')}</div>
          </div>
        ` : ''}
        ${cat.weak_verbs_found?.length ? `
          <div class="category-extras">
            <div class="extras-label">Weak Verbs Found</div>
            <ul class="extras-list">${cat.weak_verbs_found.map((v) => `<li>${escHtml(v)}</li>`).join('')}</ul>
          </div>
        ` : ''}
        ${cat.bullets_without_metrics?.length ? `
          <div class="category-extras">
            <div class="extras-label">Bullets Lacking Metrics</div>
            <ul class="extras-list">${cat.bullets_without_metrics.map((b) => `<li>${escHtml(b)}</li>`).join('')}</ul>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');

  return `
    <div class="panel-heading">Analysis</div>

    <!-- Overall score gauge -->
    <div class="score-gauge-wrap">
      <svg viewBox="0 0 120 120" class="score-gauge" aria-label="Overall score: ${score} out of 100">
        <circle cx="60" cy="60" r="50" class="gauge-track"/>
        <circle cx="60" cy="60" r="50" class="gauge-fill"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${startOffset}"
          style="stroke:${scoreColor(score)}"/>
        <text x="60" y="58" class="gauge-score">${score}</text>
        <text x="60" y="74" class="gauge-label">/100</text>
      </svg>
      <div class="score-summary">${escHtml(result.summary)}</div>
    </div>

    <!-- Top Strengths -->
    <div class="scores-section">
      <div class="scores-section-title strengths-title">Top Strengths</div>
      <ul class="strengths-list">
        ${result.top_strengths.map((s) => `<li><span class="strength-icon">✓</span>${escHtml(s)}</li>`).join('')}
      </ul>
    </div>

    <!-- Top Improvements -->
    <div class="scores-section">
      <div class="scores-section-title improvements-title">Top Improvements</div>
      <ul class="improvements-list">
        ${result.top_improvements.map((s) => `<li><span class="improvement-icon">↑</span>${escHtml(s)}</li>`).join('')}
      </ul>
    </div>

    <!-- Category breakdown -->
    <div class="scores-section">
      <div class="scores-section-title">Category Breakdown</div>
      <div class="category-cards">${categoryHtml}</div>
    </div>
  `;
}

// ── Delete confirm dialog ──────────────────────────────────────

function showDeleteConfirm(): void {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-dialog-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <div class="confirm-dialog-title">Delete This Review?</div>
      <p class="confirm-dialog-body">This review will be permanently deleted. This cannot be undone.</p>
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
  if (score >= 80) return '#7CA491';  // accent green
  if (score >= 50) return '#c9a227';  // amber
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
