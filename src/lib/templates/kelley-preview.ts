/**
 * Kelley Template — HTML Preview Renderer
 *
 * Provides visibility state management and an HTML renderer that mirrors
 * the Kelley DOCX spec for live in-browser preview.
 */

import type {
  ParsedResume,
  ParsedResumeExperience,
  ParsedResumeEducation,
  ParsedResumeCertification,
  ParsedResumeProject,
  ParsedResumeActivity,
} from '../supabase/types';

// ── Visibility state ──────────────────────────────────────────

export interface VisibilityState {
  sections: Record<string, boolean>;
  items: Record<string, Record<number, boolean>>;
}

const ARRAY_SECTIONS = ['experience', 'education', 'certifications', 'languages', 'projects', 'skills', 'activities'] as const;

export function defaultVisibility(data: ParsedResume): VisibilityState {
  const items: Record<string, Record<number, boolean>> = {};
  for (const section of ARRAY_SECTIONS) {
    const arr = data[section] as unknown[];
    if (arr && arr.length > 0) {
      items[section] = {};
      arr.forEach((_, i) => { items[section][i] = true; });
    }
  }
  return {
    sections: {
      summary: true,
      experience: true,
      education: true,
      skills: true,
      certifications: true,
      languages: true,
      projects: true,
      activities: true,
    },
    items,
  };
}

export function isVisible(state: VisibilityState, section: string, index?: number): boolean {
  if (state.sections[section] === false) return false;
  if (index !== undefined) {
    return state.items[section]?.[index] !== false;
  }
  return true;
}

export function applyVisibility(data: ParsedResume, state: VisibilityState): ParsedResume {
  return {
    ...data,
    summary: isVisible(state, 'summary') ? data.summary : null,
    experience: isVisible(state, 'experience')
      ? (data.experience ?? []).filter((_, i) => isVisible(state, 'experience', i))
      : [],
    education: isVisible(state, 'education')
      ? (data.education ?? []).filter((_, i) => isVisible(state, 'education', i))
      : [],
    skills: isVisible(state, 'skills')
      ? (data.skills ?? []).filter((_, i) => isVisible(state, 'skills', i))
      : [],
    certifications: isVisible(state, 'certifications')
      ? (data.certifications ?? []).filter((_, i) => isVisible(state, 'certifications', i))
      : [],
    languages: isVisible(state, 'languages')
      ? (data.languages ?? []).filter((_, i) => isVisible(state, 'languages', i))
      : [],
    projects: isVisible(state, 'projects')
      ? (data.projects ?? []).filter((_, i) => isVisible(state, 'projects', i))
      : [],
    activities: isVisible(state, 'activities')
      ? (data.activities ?? []).filter((_, i) => isVisible(state, 'activities', i))
      : [],
  };
}

// ── HTML renderer ─────────────────────────────────────────────

function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function splitBullets(description: string): string[] {
  return description
    .split(/\n|•|·/)
    .map(b => b.replace(/^[-–—*]\s*/, '').trim())
    .filter(b => b.length > 0);
}

function renderExperience(items: ParsedResumeExperience[], state: VisibilityState): string {
  if (!isVisible(state, 'experience')) return '';
  const visible = items.filter((_, i) => isVisible(state, 'experience', i));
  if (visible.length === 0) return '';

  const rows = visible.map(exp => {
    const dateRange = `${esc(exp.start_date)} – ${esc(exp.end_date)}`;
    const bullets = exp.description ? splitBullets(exp.description) : [];
    const bulletHtml = bullets.length > 0
      ? `<ul class="kelley-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
      : '';
    return `
      <div class="kelley-entry">
        <div class="kelley-entry-header">
          <span class="kelley-bold">${esc(exp.company)}</span>
          <span>${dateRange}</span>
        </div>
        <div class="kelley-entry-sub kelley-italic">${esc(exp.title)}${exp.location ? `, ${esc(exp.location)}` : ''}</div>
        ${bulletHtml}
      </div>`;
  }).join('');

  return `
    <div class="kelley-section-title">Experience</div>
    ${rows}`;
}

function renderEducation(items: ParsedResumeEducation[], state: VisibilityState): string {
  if (!isVisible(state, 'education')) return '';
  const visible = items.filter((_, i) => isVisible(state, 'education', i));
  if (visible.length === 0) return '';

  const rows = visible.map(edu => {
    const dateRange = edu.start_date || edu.end_date
      ? `${esc(edu.start_date ?? '')} – ${esc(edu.end_date ?? '')}`
      : '';
    const degreeField = [edu.degree, edu.field_of_study].filter(Boolean).join(', ');
    const gpa = edu.gpa ? `GPA: ${esc(edu.gpa)}` : '';
    return `
      <div class="kelley-entry">
        <div class="kelley-entry-header">
          <span class="kelley-bold">${esc(edu.institution)}</span>
          <span>${dateRange}</span>
        </div>
        <div class="kelley-entry-sub">${esc(degreeField)}${gpa ? `  |  ${gpa}` : ''}</div>
      </div>`;
  }).join('');

  return `
    <div class="kelley-section-title">Education</div>
    ${rows}`;
}

function renderSkills(skills: string[], state: VisibilityState): string {
  if (!isVisible(state, 'skills')) return '';
  const visible = skills.filter((_, i) => isVisible(state, 'skills', i));
  if (visible.length === 0) return '';

  return `
    <div class="kelley-section-title">Skills &amp; Interests</div>
    <div class="kelley-skills-list">${visible.map(esc).join(' &nbsp;*&nbsp; ')}</div>`;
}

function renderCertifications(items: ParsedResumeCertification[], state: VisibilityState): string {
  if (!isVisible(state, 'certifications')) return '';
  const visible = items.filter((_, i) => isVisible(state, 'certifications', i));
  if (visible.length === 0) return '';

  const rows = visible.map(cert => {
    const meta = [cert.issuer, cert.date].filter(Boolean).join(' · ');
    return `
      <div class="kelley-entry">
        <div class="kelley-entry-header">
          <span class="kelley-bold">${esc(cert.name)}</span>
          ${meta ? `<span>${esc(meta)}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="kelley-section-title">Certifications</div>
    ${rows}`;
}

function renderProjects(items: ParsedResumeProject[], state: VisibilityState): string {
  if (!isVisible(state, 'projects')) return '';
  const visible = items.filter((_, i) => isVisible(state, 'projects', i));
  if (visible.length === 0) return '';

  const rows = visible.map(proj => {
    const bullets = proj.description ? splitBullets(proj.description) : [];
    const bulletHtml = bullets.length > 0
      ? `<ul class="kelley-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
      : '';
    return `
      <div class="kelley-entry">
        <div class="kelley-entry-header">
          <span class="kelley-bold">${esc(proj.name)}</span>
          ${proj.url ? `<span class="kelley-url">${esc(proj.url)}</span>` : ''}
        </div>
        ${bulletHtml}
      </div>`;
  }).join('');

  return `
    <div class="kelley-section-title">Projects</div>
    ${rows}`;
}

function renderActivities(items: ParsedResumeActivity[], state: VisibilityState): string {
  if (!isVisible(state, 'activities')) return '';
  const visible = items.filter((_, i) => isVisible(state, 'activities', i));
  if (visible.length === 0) return '';

  const rows = visible.map(act => {
    const dateRange = `${esc(act.start_date)} – ${esc(act.end_date)}`;
    const bullets = act.description ? splitBullets(act.description) : [];
    const bulletHtml = bullets.length > 0
      ? `<ul class="kelley-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
      : '';
    return `
      <div class="kelley-entry">
        <div class="kelley-entry-header">
          <span class="kelley-bold">${esc(act.organization)}</span>
          <span>${dateRange}</span>
        </div>
        <div class="kelley-entry-sub kelley-italic">${esc(act.role)}</div>
        ${bulletHtml}
      </div>`;
  }).join('');

  return `
    <div class="kelley-section-title">Activities &amp; Organizations</div>
    ${rows}`;
}

function renderLanguages(languages: string[], state: VisibilityState): string {
  if (!isVisible(state, 'languages')) return '';
  const visible = languages.filter((_, i) => isVisible(state, 'languages', i));
  if (visible.length === 0) return '';

  return `
    <div class="kelley-section-title">Languages</div>
    <div class="kelley-skills-list">${visible.map(esc).join(' &nbsp;*&nbsp; ')}</div>`;
}

export function renderKelleyPreviewHTML(data: ParsedResume, visibility: VisibilityState): string {
  const contactParts = [data.email, data.phone, data.linkedin, data.website]
    .filter(Boolean)
    .map(esc)
    .join(' &nbsp;|&nbsp; ');

  const summaryHtml = isVisible(visibility, 'summary') && data.summary
    ? `<div class="kelley-summary">${esc(data.summary)}</div>`
    : '';

  return `
    <div class="kelley-doc">
      <div class="kelley-name">${esc(data.full_name) || 'YOUR NAME'}</div>
      ${contactParts ? `<div class="kelley-contact">${contactParts}</div>` : ''}
      <hr class="kelley-rule">
      ${summaryHtml}
      ${renderEducation(data.education ?? [], visibility)}
      ${renderExperience(data.experience ?? [], visibility)}
      ${renderSkills(data.skills ?? [], visibility)}
      ${renderCertifications(data.certifications ?? [], visibility)}
      ${renderProjects(data.projects ?? [], visibility)}
      ${renderActivities(data.activities ?? [], visibility)}
      ${renderLanguages(data.languages ?? [], visibility)}
    </div>`;
}
