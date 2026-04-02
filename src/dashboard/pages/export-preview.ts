/**
 * Export Preview Page
 *
 * Reached via #export/{resumeId}/preview/{templateId}
 * Shows a live HTML preview of the resume with section/item toggles.
 * A separate "Download DOCX" button exports only the visible entries.
 */

import { getResume } from '../../lib/supabase/db';
import type { ResumeRow } from '../../lib/supabase/types';
import type { ParsedResume } from '../../lib/supabase/types';
import type { User } from '@supabase/supabase-js';
import { generateKelleyDocx } from '../../lib/templates/kelley';
import {
  defaultVisibility,
  isVisible,
  applyVisibility,
  renderKelleyPreviewHTML,
} from '../../lib/templates/kelley-preview';
import type { VisibilityState } from '../../lib/templates/kelley-preview';

// ── Module state ──────────────────────────────────────────────

interface PreviewPageState {
  resume: ResumeRow;
  templateId: string;
  parsed: ParsedResume;
  visibility: VisibilityState;
}

let state: PreviewPageState | null = null;

// ── Entry Point ───────────────────────────────────────────────

export async function renderExportPreview(
  container: HTMLElement,
  _user: User,
  resumeId: string,
  templateId: string
): Promise<void> {
  // Apply full-width mode on the page container
  container.classList.add('preview-page-mode');

  // Loading skeleton while fetching
  container.innerHTML = `
    <div class="preview-page-layout">
      <div class="preview-left-panel">
        <div class="skeleton skeleton-text" style="width:80px;height:1.5rem"></div>
        <div class="skeleton skeleton-text lg" style="width:160px;margin-top:.5rem"></div>
        <div class="skeleton" style="height:2.5rem;border-radius:8px;margin-top:.25rem"></div>
        <div style="display:flex;flex-direction:column;gap:.4rem;margin-top:.5rem">
          ${[1,2,3,4].map(() => `<div class="skeleton" style="height:2.5rem;border-radius:8px"></div>`).join('')}
        </div>
      </div>
      <div class="preview-right-panel">
        <div class="preview-doc-wrap">
          <div class="skeleton skeleton-text lg" style="width:50%;margin:0 auto 1rem"></div>
          <div class="skeleton skeleton-text" style="width:70%;margin:0 auto .5rem"></div>
          <hr style="margin:.75rem 0;border:1px solid #e5e7eb">
          ${[1,2,3,4,5,6].map(() => `<div class="skeleton skeleton-text" style="width:${70 + Math.floor(Math.random()*25)}%;margin-bottom:.5rem"></div>`).join('')}
        </div>
      </div>
    </div>
  `;

  const { data: resume, error } = await getResume(resumeId);

  if (error || !resume) {
    container.innerHTML = `
      <div class="export-page">
        <div class="dash-header">
          <button class="review-back-link" id="back-btn">← My Resumes</button>
          <h1 class="dash-greeting" style="margin-top:.5rem">Preview</h1>
        </div>
        <div class="empty-state" style="margin-top:2rem">
          <div class="empty-state-icon">⚠️</div>
          <p>Resume not found. It may have been deleted.</p>
        </div>
      </div>
    `;
    container.querySelector('#back-btn')!.addEventListener('click', () => {
      window.location.hash = 'resumes';
    });
    return;
  }

  const parsed = resume.parsed_content as ParsedResume | null;

  if (!parsed) {
    container.innerHTML = `
      <div class="export-page">
        <div class="dash-header">
          <button class="review-back-link" id="back-btn">← Templates</button>
          <h1 class="dash-greeting" style="margin-top:.5rem">Preview</h1>
        </div>
        <div class="empty-state" style="margin-top:2rem">
          <div class="empty-state-icon">⚠️</div>
          <p>Resume data is not available. Try re-uploading your resume.</p>
        </div>
      </div>
    `;
    container.querySelector('#back-btn')!.addEventListener('click', () => {
      window.location.hash = `export/${resumeId}`;
    });
    return;
  }

  state = {
    resume,
    templateId,
    parsed,
    visibility: defaultVisibility(parsed),
  };

  renderPreviewPage(container);
}

// ── Page render ───────────────────────────────────────────────

function renderPreviewPage(container: HTMLElement): void {
  if (!state) return;
  const { resume, templateId, parsed, visibility } = state;

  const templateLabel = templateId.charAt(0).toUpperCase() + templateId.slice(1);

  container.innerHTML = `
    <div class="preview-page-layout">
      <div class="preview-left-panel">
        <button class="review-back-link" id="back-to-templates">← Templates</button>

        <div class="preview-resume-meta">
          <div class="preview-resume-title">${escHtml(resume.title)}</div>
          <span class="preview-template-badge">${escHtml(templateLabel)}</span>
        </div>

        <button class="preview-download-btn" id="download-docx-btn">Download DOCX</button>

        <div class="toggle-panel-label">Include in resume</div>
        <div class="toggle-panel" id="toggle-panel">
          ${renderTogglePanel(parsed, visibility)}
        </div>
      </div>

      <div class="preview-right-panel">
        <div class="preview-doc-wrap" id="preview-doc-wrap">
          ${renderDocPreview(templateId, parsed, visibility)}
        </div>
      </div>
    </div>
  `;

  wireListeners(container);
}

// ── Toggle panel HTML ─────────────────────────────────────────

interface SectionDef {
  key: string;
  label: string;
  items: { label: string }[];
}

function getSectionDefs(parsed: ParsedResume): SectionDef[] {
  const defs: SectionDef[] = [];

  if (parsed.summary) {
    defs.push({ key: 'summary', label: 'Summary', items: [] });
  }
  if (parsed.education?.length) {
    defs.push({
      key: 'education',
      label: 'Education',
      items: parsed.education.map(e => ({
        label: [e.institution, e.degree].filter(Boolean).join(' – '),
      })),
    });
  }
  if (parsed.experience?.length) {
    defs.push({
      key: 'experience',
      label: 'Experience',
      items: parsed.experience.map(e => ({
        label: [e.company, e.title].filter(Boolean).join(' – '),
      })),
    });
  }
  if (parsed.skills?.length) {
    defs.push({
      key: 'skills',
      label: 'Skills',
      items: parsed.skills.map(s => ({ label: s })),
    });
  }
  if (parsed.certifications?.length) {
    defs.push({
      key: 'certifications',
      label: 'Certifications',
      items: parsed.certifications.map(c => ({ label: c.name })),
    });
  }
  if (parsed.languages?.length) {
    defs.push({
      key: 'languages',
      label: 'Languages',
      items: parsed.languages.map(l => ({ label: l })),
    });
  }
  if (parsed.projects?.length) {
    defs.push({
      key: 'projects',
      label: 'Projects',
      items: parsed.projects.map(p => ({ label: p.name })),
    });
  }
  if (parsed.activities?.length) {
    defs.push({
      key: 'activities',
      label: 'Activities & Organizations',
      items: parsed.activities.map(a => ({
        label: [a.organization, a.role].filter(Boolean).join(' – '),
      })),
    });
  }

  return defs;
}

function renderTogglePanel(parsed: ParsedResume, visibility: VisibilityState): string {
  const defs = getSectionDefs(parsed);
  if (defs.length === 0) return '<p style="font-size:.8rem;color:var(--text-secondary)">No sections found.</p>';

  return defs.map(def => {
    const sectionOn = isVisible(visibility, def.key);
    const itemsHtml = def.items.length > 0 ? `
      <div class="toggle-items" id="toggle-items-${def.key}">
        ${def.items.map((item, i) => {
          const itemOn = sectionOn && isVisible(visibility, def.key, i);
          return `
            <div class="toggle-item${!sectionOn ? ' dimmed' : ''}">
              <span class="toggle-item-label" title="${escHtml(item.label)}">${escHtml(item.label)}</span>
              <label class="toggle-switch sm">
                <input type="checkbox" ${itemOn ? 'checked' : ''} ${!sectionOn ? 'disabled' : ''}
                  data-section="${def.key}" data-index="${i}">
                <span class="toggle-track"></span>
              </label>
            </div>`;
        }).join('')}
      </div>` : '';

    return `
      <div class="toggle-section">
        <div class="toggle-section-header">
          <span class="toggle-section-name">${escHtml(def.label)}</span>
          <label class="toggle-switch">
            <input type="checkbox" ${sectionOn ? 'checked' : ''} data-section="${def.key}">
            <span class="toggle-track"></span>
          </label>
        </div>
        ${itemsHtml}
      </div>`;
  }).join('');
}

// ── Document preview ──────────────────────────────────────────

function renderDocPreview(templateId: string, parsed: ParsedResume, visibility: VisibilityState): string {
  if (templateId === 'kelley') {
    return renderKelleyPreviewHTML(parsed, visibility);
  }
  return '<p class="preview-unavailable">Preview not available for this template.</p>';
}

// ── Event wiring ──────────────────────────────────────────────

function wireListeners(container: HTMLElement): void {
  // Back to template picker
  container.querySelector('#back-to-templates')!.addEventListener('click', () => {
    window.location.hash = `export/${state!.resume.id}`;
  });

  // Download button
  container.querySelector('#download-docx-btn')!.addEventListener('click', handleDownload);

  // Section-level toggles (data-section only, no data-index)
  container.querySelectorAll<HTMLInputElement>(
    '#toggle-panel input[data-section]:not([data-index])'
  ).forEach(cb => {
    cb.addEventListener('change', () => {
      if (!state) return;
      const section = cb.dataset.section!;
      state.visibility.sections[section] = cb.checked;
      updateItemTogglesForSection(container, section, cb.checked);
      updatePreview(container);
    });
  });

  // Item-level toggles (data-section + data-index)
  container.querySelectorAll<HTMLInputElement>(
    '#toggle-panel input[data-section][data-index]'
  ).forEach(cb => {
    cb.addEventListener('change', () => {
      if (!state) return;
      const section = cb.dataset.section!;
      const index = parseInt(cb.dataset.index!);
      if (!state.visibility.items[section]) {
        state.visibility.items[section] = {};
      }
      state.visibility.items[section][index] = cb.checked;
      updatePreview(container);
    });
  });
}

function updateItemTogglesForSection(container: HTMLElement, section: string, enabled: boolean): void {
  const itemsEl = container.querySelector(`#toggle-items-${section}`);
  if (!itemsEl) return;
  itemsEl.querySelectorAll<HTMLInputElement>('input[data-index]').forEach(cb => {
    cb.disabled = !enabled;
  });
  itemsEl.querySelectorAll<HTMLElement>('.toggle-item').forEach(el => {
    if (enabled) {
      el.classList.remove('dimmed');
    } else {
      el.classList.add('dimmed');
    }
  });
}

function updatePreview(container: HTMLElement): void {
  if (!state) return;
  const docWrap = container.querySelector<HTMLElement>('#preview-doc-wrap');
  if (!docWrap) return;
  docWrap.innerHTML = renderDocPreview(state.templateId, state.parsed, state.visibility);
}

// ── Download handler ──────────────────────────────────────────

async function handleDownload(): Promise<void> {
  if (!state) return;
  const btn = document.querySelector<HTMLButtonElement>('#download-docx-btn');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = 'Generating…';

  try {
    const filtered = applyVisibility(state.parsed, state.visibility);
    if (state.templateId === 'kelley') {
      await generateKelleyDocx(filtered, state.resume.title);
    }
  } catch (err) {
    console.error('Export failed:', err);
    alert('Failed to generate the resume. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Download DOCX';
  }
}

// ── Helpers ───────────────────────────────────────────────────

function escHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
