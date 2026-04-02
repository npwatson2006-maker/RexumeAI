/**
 * My Resumes Page
 *
 * Two phases:
 *  1. List  — grid of all saved resumes with open/delete actions
 *  2. Detail — read-only view of a single resume's parsed content
 */

import { getResumes, deleteResume, deleteResumeFile } from '../../lib/supabase/db';
import type { ResumeRow, ParsedResume } from '../../lib/supabase/types';
import type { User } from '@supabase/supabase-js';

// ── State ──────────────────────────────────────────────────────

interface ResumesState {
  resumes: ResumeRow[];
  selected: ResumeRow | null;
}

const state: ResumesState = {
  resumes: [],
  selected: null,
};

let rootContainer: HTMLElement;
let currentUser: User;

// ── Helpers ───────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Entry Point ───────────────────────────────────────────────

export async function renderResumes(container: HTMLElement, user: User): Promise<void> {
  rootContainer = container;
  currentUser = user;
  state.resumes = [];
  state.selected = null;

  await renderList();
}

// ── Phase 1: List ─────────────────────────────────────────────

async function renderList(): Promise<void> {
  rootContainer.innerHTML = `
    <div class="my-resumes-page">
      <div class="dash-header my-resumes-header">
        <div>
          <h1 class="dash-greeting">My Resumes</h1>
          <p class="dash-subtitle">All your saved resumes in one place.</p>
        </div>
        <button class="my-resumes-upload-btn" id="upload-new-btn">+ Upload New</button>
      </div>

      <div id="resumes-grid" class="my-resumes-grid">
        ${[1, 2, 3].map(() => `
          <div class="my-resumes-card skeleton-card-wrap">
            <div class="skeleton skeleton-text lg" style="width:65%;margin-bottom:.75rem"></div>
            <div class="skeleton skeleton-text sm" style="width:40%;margin-bottom:1.5rem"></div>
            <div style="display:flex;gap:.5rem">
              <div class="skeleton" style="height:32px;width:70px;border-radius:6px"></div>
              <div class="skeleton" style="height:32px;width:70px;border-radius:6px"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  rootContainer.querySelector('#upload-new-btn')!.addEventListener('click', () => {
    window.location.hash = 'upload';
  });

  const { data, error } = await getResumes(currentUser.id);
  state.resumes = data;

  renderGrid(error);
}

function renderGrid(error: string | null): void {
  const grid = rootContainer.querySelector<HTMLElement>('#resumes-grid')!;

  if (error) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon">⚠️</div>
        <p>Failed to load resumes. Please refresh and try again.</p>
      </div>
    `;
    return;
  }

  if (state.resumes.length === 0) {
    grid.innerHTML = `
      <div class="my-resumes-empty" style="grid-column:1/-1">
        <div class="my-resumes-empty-icon">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="8" y="4" width="32" height="40" rx="3"/>
            <polyline points="30 4 30 14 40 14"/>
            <line x1="16" y1="22" x2="32" y2="22"/>
            <line x1="16" y1="30" x2="24" y2="30"/>
          </svg>
        </div>
        <p class="my-resumes-empty-title">No resumes yet</p>
        <p class="my-resumes-empty-sub">Upload your first resume to get started.</p>
        <button class="btn-upload-link" id="go-upload-empty">Upload Resume</button>
      </div>
    `;
    grid.querySelector('#go-upload-empty')!.addEventListener('click', () => {
      window.location.hash = 'upload';
    });
    return;
  }

  grid.innerHTML = state.resumes.map((r) => buildCardHtml(r)).join('');

  // Wire up card buttons
  grid.querySelectorAll<HTMLElement>('.my-resumes-card').forEach((card) => {
    const id = card.dataset.id!;
    const resume = state.resumes.find((r) => r.id === id)!;

    card.querySelector('.my-resumes-open-btn')!.addEventListener('click', () => {
      state.selected = resume;
      renderDetail(resume);
    });

    card.querySelector('.my-resumes-delete-btn')!.addEventListener('click', () => {
      showDeleteConfirm(card, resume);
    });
  });
}

function buildCardHtml(r: ResumeRow): string {
  return `
    <div class="my-resumes-card" data-id="${escHtml(r.id)}">
      <div class="my-resumes-card-body">
        <div class="my-resumes-card-title">${escHtml(r.title)}</div>
        <div class="my-resumes-card-date">Saved ${formatDate(r.created_at)}</div>
      </div>
      <div class="my-resumes-card-actions">
        <button class="my-resumes-open-btn">Open</button>
        <button class="my-resumes-delete-btn">Delete</button>
      </div>
    </div>
  `;
}

function showDeleteConfirm(card: HTMLElement, resume: ResumeRow): void {
  const actions = card.querySelector<HTMLElement>('.my-resumes-card-actions')!;
  actions.innerHTML = `
    <span class="my-resumes-confirm-text">Delete this resume?</span>
    <button class="my-resumes-cancel-btn">Cancel</button>
    <button class="my-resumes-confirm-delete-btn">Delete</button>
  `;

  actions.querySelector('.my-resumes-cancel-btn')!.addEventListener('click', () => {
    actions.innerHTML = `
      <button class="my-resumes-open-btn">Open</button>
      <button class="my-resumes-delete-btn">Delete</button>
    `;
    // Re-wire
    actions.querySelector('.my-resumes-open-btn')!.addEventListener('click', () => {
      state.selected = resume;
      renderDetail(resume);
    });
    actions.querySelector('.my-resumes-delete-btn')!.addEventListener('click', () => {
      showDeleteConfirm(card, resume);
    });
  });

  actions.querySelector('.my-resumes-confirm-delete-btn')!.addEventListener('click', async () => {
    const confirmBtn = actions.querySelector<HTMLButtonElement>('.my-resumes-confirm-delete-btn')!;
    const cancelBtn = actions.querySelector<HTMLButtonElement>('.my-resumes-cancel-btn')!;
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmBtn.textContent = 'Deleting…';

    const { error: dbError } = await deleteResume(resume.id);
    if (dbError) {
      actions.innerHTML = `<span class="my-resumes-error-text">Delete failed. Try again.</span>`;
      return;
    }

    if (resume.original_file_url) {
      await deleteResumeFile(resume.original_file_url);
    }

    // Animate out
    card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.96)';
    setTimeout(() => {
      card.remove();
      state.resumes = state.resumes.filter((r) => r.id !== resume.id);
      // Show empty state if last card removed
      const grid = rootContainer.querySelector<HTMLElement>('#resumes-grid')!;
      if (grid && state.resumes.length === 0) {
        renderGrid(null);
      }
    }, 200);
  });
}

// ── Phase 2: Detail ───────────────────────────────────────────

function renderDetail(resume: ResumeRow): void {
  const parsed = resume.parsed_content as ParsedResume | null;

  rootContainer.innerHTML = `
    <div class="my-resumes-page">
      <div class="dash-header my-resumes-header">
        <div>
          <button class="review-back-link" id="back-to-list">← My Resumes</button>
          <h1 class="dash-greeting">${escHtml(resume.title)}</h1>
          <p class="dash-subtitle">Saved ${formatDate(resume.created_at)}</p>
        </div>
        <div class="resume-detail-actions">
          <button class="my-resumes-upload-btn" id="use-ai-tools-btn">Use in AI Tools ↗</button>
          <button class="resume-export-btn" id="export-btn">Export</button>
        </div>
      </div>

      <div class="resume-detail-content">
        ${parsed ? renderParsedContent(parsed) : `
          <div class="empty-state">
            <div class="empty-state-icon">📄</div>
            <p>No preview available for this resume.</p>
          </div>
        `}
      </div>
    </div>
  `;

  rootContainer.querySelector('#back-to-list')!.addEventListener('click', () => {
    renderList().then(() => {
      // Re-populate grid from cached state (avoid refetch)
      renderGrid(null);
    });
  });

  rootContainer.querySelector('#use-ai-tools-btn')!.addEventListener('click', () => {
    window.location.hash = 'ai-tools';
  });

  rootContainer.querySelector('#export-btn')!.addEventListener('click', () => {
    window.location.hash = `export/${resume.id}`;
  });
}

function renderParsedContent(p: ParsedResume): string {
  const sections: string[] = [];

  // Contact info
  const contactFields = [
    p.full_name && `<span class="resume-detail-name">${escHtml(p.full_name)}</span>`,
    p.email && `<a href="mailto:${escHtml(p.email)}" class="resume-detail-link">${escHtml(p.email)}</a>`,
    p.phone && `<span>${escHtml(p.phone)}</span>`,
    p.location && `<span>${escHtml(p.location)}</span>`,
    p.linkedin && `<a href="${escHtml(p.linkedin)}" class="resume-detail-link" target="_blank" rel="noopener">LinkedIn</a>`,
    p.website && `<a href="${escHtml(p.website)}" class="resume-detail-link" target="_blank" rel="noopener">Website</a>`,
  ].filter(Boolean);

  if (contactFields.length) {
    sections.push(`
      <div class="resume-detail-section">
        <div class="resume-detail-contact">${contactFields.join('<span class="resume-detail-sep">·</span>')}</div>
      </div>
    `);
  }

  // Summary
  if (p.summary) {
    sections.push(`
      <div class="resume-detail-section">
        <h3 class="resume-detail-heading">Summary</h3>
        <p class="resume-detail-body">${escHtml(p.summary)}</p>
      </div>
    `);
  }

  // Experience
  if (p.experience?.length) {
    const items = p.experience.map((exp) => `
      <div class="resume-detail-item">
        <div class="resume-detail-item-header">
          <div>
            <div class="resume-detail-item-title">${escHtml(exp.title)}</div>
            <div class="resume-detail-item-sub">${escHtml(exp.company)}${exp.location ? ` · ${escHtml(exp.location)}` : ''}</div>
          </div>
          <div class="resume-detail-item-dates">${escHtml(exp.start_date)} – ${escHtml(exp.end_date)}</div>
        </div>
        ${exp.description ? `<p class="resume-detail-body">${escHtml(exp.description)}</p>` : ''}
      </div>
    `).join('');

    sections.push(`
      <div class="resume-detail-section">
        <h3 class="resume-detail-heading">Experience</h3>
        ${items}
      </div>
    `);
  }

  // Education
  if (p.education?.length) {
    const items = p.education.map((edu) => `
      <div class="resume-detail-item">
        <div class="resume-detail-item-header">
          <div>
            <div class="resume-detail-item-title">${escHtml(edu.degree)}${edu.field_of_study ? ` in ${escHtml(edu.field_of_study)}` : ''}</div>
            <div class="resume-detail-item-sub">${escHtml(edu.institution)}${edu.gpa ? ` · GPA: ${escHtml(String(edu.gpa))}` : ''}</div>
          </div>
          <div class="resume-detail-item-dates">${edu.start_date ? escHtml(edu.start_date) : ''} – ${edu.end_date ? escHtml(edu.end_date) : ''}</div>
        </div>
      </div>
    `).join('');

    sections.push(`
      <div class="resume-detail-section">
        <h3 class="resume-detail-heading">Education</h3>
        ${items}
      </div>
    `);
  }

  // Skills & Languages
  const allTags = [...(p.skills ?? []), ...(p.languages ?? [])];
  if (allTags.length) {
    sections.push(`
      <div class="resume-detail-section">
        <h3 class="resume-detail-heading">Skills & Languages</h3>
        <div class="resume-detail-tags">
          ${allTags.map((t) => `<span class="resume-detail-tag">${escHtml(t)}</span>`).join('')}
        </div>
      </div>
    `);
  }

  // Certifications
  if (p.certifications?.length) {
    const items = p.certifications.map((cert) => `
      <div class="resume-detail-item">
        <div class="resume-detail-item-title">${escHtml(cert.name)}</div>
        <div class="resume-detail-item-sub">${cert.issuer ? escHtml(cert.issuer) : ''}${cert.date ? ` · ${escHtml(cert.date)}` : ''}</div>
      </div>
    `).join('');

    sections.push(`
      <div class="resume-detail-section">
        <h3 class="resume-detail-heading">Certifications</h3>
        ${items}
      </div>
    `);
  }

  // Projects
  if (p.projects?.length) {
    const items = p.projects.map((proj) => `
      <div class="resume-detail-item">
        <div class="resume-detail-item-title">
          ${proj.url
            ? `<a href="${escHtml(proj.url)}" class="resume-detail-link" target="_blank" rel="noopener">${escHtml(proj.name)}</a>`
            : escHtml(proj.name)
          }
        </div>
        ${proj.description ? `<p class="resume-detail-body">${escHtml(proj.description)}</p>` : ''}
      </div>
    `).join('');

    sections.push(`
      <div class="resume-detail-section">
        <h3 class="resume-detail-heading">Projects</h3>
        ${items}
      </div>
    `);
  }

  // Activities
  if (p.activities?.length) {
    const items = p.activities.map((act) => `
      <div class="resume-detail-item">
        <div class="resume-detail-item-header">
          <div>
            <span class="resume-detail-item-title">${escHtml(act.organization)}</span>
            ${act.role ? `<span class="resume-detail-item-sub"> — ${escHtml(act.role)}</span>` : ''}
          </div>
          <div class="resume-detail-item-date">${escHtml(act.start_date)}${act.end_date ? ` – ${escHtml(act.end_date)}` : ''}</div>
        </div>
        ${act.description ? `<p class="resume-detail-body">${escHtml(act.description)}</p>` : ''}
      </div>
    `).join('');

    sections.push(`
      <div class="resume-detail-section">
        <h3 class="resume-detail-heading">Activities &amp; Organizations</h3>
        ${items}
      </div>
    `);
  }

  return sections.join('');
}
