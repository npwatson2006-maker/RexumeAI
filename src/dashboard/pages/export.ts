/**
 * Export Resume Page
 *
 * Reached via #export/{resumeId}
 * Shows a template picker — user selects a template, then downloads their resume.
 * Templates are placeholders for now; download logic will be added per template later.
 */

import { getResume } from '../../lib/supabase/db';
import type { ResumeRow } from '../../lib/supabase/types';
import type { User } from '@supabase/supabase-js';
import { renderExportPreview } from './export-preview';

// ── Template definitions ──────────────────────────────────────
// Add real templates here as they are built. Set `available: false` for placeholders.

interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  available: boolean;
  preview: string; // inline SVG or HTML for the mini preview
}

const TEMPLATES: TemplateConfig[] = [
  {
    id: 'kelley',
    name: 'Kelley',
    description: 'Indiana University Kelley School of Business official format.',
    available: true,
    preview: buildPreview({ headerHeight: 44, accent: '#990000' }),
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Bold header with a two-column layout.',
    available: false,
    preview: buildPreview({ headerHeight: 64, accent: '#6d28d9', twoCol: true }),
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Simple and spacious. Lets your content shine.',
    available: false,
    preview: buildPreview({ headerHeight: 40, accent: '#374151' }),
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'High contrast with a strong visual hierarchy.',
    available: false,
    preview: buildPreview({ headerHeight: 72, accent: '#be123c', darkHeader: true }),
  },
];

// ── Mini preview builder ───────────────────────────────────────
// Generates a simple SVG thumbnail that gives a feel for each layout.

interface PreviewOptions {
  headerHeight: number;
  accent: string;
  twoCol?: boolean;
  darkHeader?: boolean;
}

function buildPreview(opts: PreviewOptions): string {
  const W = 120, H = 160;
  const { headerHeight, accent, twoCol = false, darkHeader = false } = opts;
  const headerFill = darkHeader ? accent : accent + '22';
  const headerText = darkHeader ? '#ffffff' : accent;
  const lineColor = '#d1d5db';
  const lineH = 4, lineR = 2;
  const bodyY = headerHeight + 8;

  function line(y: number, x: number, w: number, opacity = 1) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${lineH}" rx="${lineR}" fill="${lineColor}" opacity="${opacity}"/>`;
  }

  function sectionLines(startY: number, x: number, w: number, count: number, gap = 9): string {
    return Array.from({ length: count }, (_, i) => line(startY + i * gap, x, w * (i % 2 === 0 ? 1 : 0.72))).join('');
  }

  let body = '';
  if (twoCol) {
    // Left sidebar + right content
    const sideW = 34, gap = 4, mainX = sideW + gap, mainW = W - mainX - 4;
    body = `
      <rect x="2" y="${bodyY}" width="${sideW}" height="${H - bodyY - 4}" rx="2" fill="${accent}11"/>
      ${sectionLines(bodyY + 6, 4, sideW - 4, 4, 9)}
      ${sectionLines(bodyY + 6, mainX, mainW, 5, 9)}
      ${sectionLines(bodyY + 56, mainX, mainW, 4, 9)}
    `;
  } else {
    body = `
      ${sectionLines(bodyY, 8, W - 16, 2, 9)}
      ${sectionLines(bodyY + 26, 8, W - 16, 3, 9)}
      ${sectionLines(bodyY + 60, 8, W - 16, 3, 9)}
      ${sectionLines(bodyY + 96, 8, W - 16, 2, 9)}
    `;
  }

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" rx="4" fill="#f9fafb"/>
    <rect width="${W}" height="${headerHeight}" rx="4" fill="${headerFill}"/>
    <rect x="0" y="${headerHeight - 4}" width="${W}" height="4" fill="${headerFill}"/>
    <rect x="8" y="12" width="52" height="7" rx="2" fill="${headerText}" opacity="0.9"/>
    <rect x="8" y="24" width="36" height="4" rx="2" fill="${headerText}" opacity="0.5"/>
    <rect x="8" y="33" width="60" height="3" rx="1.5" fill="${headerText}" opacity="0.35"/>
    ${body}
  </svg>`;
}

// ── Entry Point ───────────────────────────────────────────────

export async function renderExport(container: HTMLElement, _user: User, resumeId: string | null): Promise<void> {
  // Sub-route: "{resumeId}/preview/{templateId}" → preview page
  if (resumeId && resumeId.includes('/preview/')) {
    const parts = resumeId.split('/');
    if (parts.length === 3 && parts[1] === 'preview') {
      return renderExportPreview(container, _user, parts[0], parts[2]);
    }
  }
  // Render skeleton while we fetch the resume
  container.innerHTML = `
    <div class="export-page">
      <div class="dash-header export-header">
        <div>
          <button class="review-back-link" id="back-btn">← My Resumes</button>
          <div class="skeleton skeleton-text lg" style="width:220px;margin-top:.5rem"></div>
          <div class="skeleton skeleton-text sm" style="width:140px;margin-top:.4rem"></div>
        </div>
      </div>
      <div class="export-templates-grid">
        ${[1, 2, 3, 4].map(() => `
          <div class="export-template-card skeleton-card-wrap">
            <div class="skeleton" style="height:160px;border-radius:8px;margin-bottom:.75rem"></div>
            <div class="skeleton skeleton-text lg" style="width:55%;margin-bottom:.4rem"></div>
            <div class="skeleton skeleton-text sm" style="width:80%"></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelector('#back-btn')!.addEventListener('click', () => {
    window.location.hash = 'resumes';
  });

  if (!resumeId) {
    renderError(container, 'No resume specified.');
    return;
  }

  const { data: resume, error } = await getResume(resumeId);

  if (error || !resume) {
    renderError(container, 'Resume not found. It may have been deleted.');
    return;
  }

  renderTemplatePicker(container, resume);
}

// ── Error state ───────────────────────────────────────────────

function renderError(container: HTMLElement, message: string): void {
  container.innerHTML = `
    <div class="export-page">
      <div class="dash-header">
        <button class="review-back-link" id="back-btn">← My Resumes</button>
        <h1 class="dash-greeting" style="margin-top:.5rem">Export Resume</h1>
      </div>
      <div class="empty-state" style="margin-top:2rem">
        <div class="empty-state-icon">⚠️</div>
        <p>${message}</p>
      </div>
    </div>
  `;
  container.querySelector('#back-btn')!.addEventListener('click', () => {
    window.location.hash = 'resumes';
  });
}

// ── Template picker ───────────────────────────────────────────

function renderTemplatePicker(container: HTMLElement, resume: ResumeRow): void {
  container.innerHTML = `
    <div class="export-page">
      <div class="dash-header export-header">
        <div>
          <button class="review-back-link" id="back-btn">← My Resumes</button>
          <h1 class="dash-greeting" style="margin-top:.5rem">Export Resume</h1>
          <p class="dash-subtitle">Choose a template for <strong>${resume.title}</strong></p>
        </div>
      </div>

      <div class="export-templates-label">
        <span>Templates</span>
        <span class="export-coming-soon-tag">More coming soon</span>
      </div>

      <div class="export-templates-grid">
        ${TEMPLATES.map((t) => `
          <div class="export-template-card ${t.available ? '' : 'export-template-unavailable'}" data-template="${t.id}">
            <div class="export-template-preview">
              ${t.preview}
              ${!t.available ? '<div class="export-template-overlay"><span class="export-template-soon">Coming Soon</span></div>' : ''}
            </div>
            <div class="export-template-info">
              <div class="export-template-name">${t.name}</div>
              <div class="export-template-desc">${t.description}</div>
            </div>
            <button class="export-select-btn" data-template="${t.id}" ${!t.available ? 'disabled' : ''}>
              ${t.available ? 'Preview' : 'Coming Soon'}
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelector('#back-btn')!.addEventListener('click', () => {
    window.location.hash = 'resumes';
  });

  // Wire template selection — navigate to preview page
  container.querySelectorAll<HTMLButtonElement>('.export-select-btn:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      const templateId = btn.dataset.template!;
      window.location.hash = `export/${resume.id}/preview/${templateId}`;
    });
  });
}
