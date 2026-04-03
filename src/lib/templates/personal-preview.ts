/**
 * Personal Template — HTML Preview Renderer
 *
 * Provides an HTML renderer that mirrors the Personal DOCX spec for
 * live in-browser preview. Re-uses VisibilityState helpers from kelley-preview.ts.
 */

import type {
  ParsedResume,
  ParsedResumeExperience,
  ParsedResumeEducation,
  ParsedResumeActivity,
  ParsedResumeProject,
  ParsedResumeCertification,
} from '../supabase/types';
import { isVisible } from './kelley-preview';
import type { VisibilityState } from './kelley-preview';

// ── Helpers ───────────────────────────────────────────────────

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

function formatDateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return '';
  if (!start) return esc(end);
  if (!end || end.toLowerCase() === 'present') return `${esc(start)} - Present`;
  return `${esc(start)} - ${esc(end)}`;
}

// ── Section renderers ─────────────────────────────────────────

function renderPersonalEducation(items: ParsedResumeEducation[], state: VisibilityState): string {
  if (!isVisible(state, 'education')) return '';
  const visible = items.filter((_, i) => isVisible(state, 'education', i));
  if (visible.length === 0) return '';

  const rows = visible.map(edu => {
    const degreeText = edu.field_of_study
      ? `${esc(edu.degree)}, ${esc(edu.field_of_study)}`
      : esc(edu.degree);
    const gpa = edu.gpa ? `GPA: ${esc(edu.gpa)}` : '';

    return `
      <div class="personal-entry">
        <div class="personal-entry-line1">
          <span class="personal-bold">${esc(edu.institution)}</span>
          ${edu.end_date ? `<span class="personal-italic">${esc(edu.end_date)}</span>` : ''}
        </div>
        <div class="personal-entry-line2">
          <span class="personal-italic">${degreeText}</span>
          ${gpa ? `<span class="personal-bold">${esc(gpa)}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="personal-section-title">EDUCATION &amp; ACADEMIC HONORS</div>
    <div class="personal-thin-rule"></div>
    ${rows}`;
}

function renderPersonalExperience(items: ParsedResumeExperience[], state: VisibilityState): string {
  if (!isVisible(state, 'experience')) return '';
  const visible = items.filter((_, i) => isVisible(state, 'experience', i));
  if (visible.length === 0) return '';

  const rows = visible.map(exp => {
    const dateRange = formatDateRange(exp.start_date, exp.end_date);
    const bullets = exp.description ? splitBullets(exp.description) : [];
    const bulletHtml = bullets.length > 0
      ? `<ul class="personal-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
      : '';

    return `
      <div class="personal-entry">
        <div class="personal-entry-line1">
          <span class="personal-bold">${esc(exp.company)}${exp.location ? ` <span class="personal-regular">| ${esc(exp.location)}</span>` : ''}</span>
        </div>
        <div class="personal-entry-line2">
          <span>${esc(exp.title)}</span>
          ${dateRange ? `<span>${dateRange}</span>` : ''}
        </div>
        ${bulletHtml}
      </div>`;
  }).join('');

  return `
    <div class="personal-section-title">EXPERIENCE</div>
    <div class="personal-thin-rule"></div>
    ${rows}`;
}

function renderPersonalActivities(items: ParsedResumeActivity[], state: VisibilityState): string {
  if (!isVisible(state, 'activities')) return '';
  const visible = items.filter((_, i) => isVisible(state, 'activities', i));
  if (visible.length === 0) return '';

  const rows = visible.map(act => {
    const dateRange = formatDateRange(act.start_date, act.end_date);
    const bullets = act.description ? splitBullets(act.description) : [];
    const bulletHtml = bullets.length > 0
      ? `<ul class="personal-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
      : '';

    return `
      <div class="personal-entry">
        <div class="personal-entry-line1">
          <span class="personal-bold">${esc(act.organization)}</span>
        </div>
        <div class="personal-entry-line2">
          <span>${esc(act.role)}</span>
          ${dateRange ? `<span>${dateRange}</span>` : ''}
        </div>
        ${bulletHtml}
      </div>`;
  }).join('');

  return `
    <div class="personal-section-title">LEADERSHIP &amp; INVOLVEMENT</div>
    <div class="personal-thin-rule"></div>
    ${rows}`;
}

function renderPersonalProjects(items: ParsedResumeProject[], state: VisibilityState): string {
  if (!isVisible(state, 'projects')) return '';
  const visible = items.filter((_, i) => isVisible(state, 'projects', i));
  if (visible.length === 0) return '';

  const rows = visible.map(proj => {
    const bullets = proj.description ? splitBullets(proj.description) : [];
    const bulletHtml = bullets.length > 0
      ? `<ul class="personal-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
      : '';

    return `
      <div class="personal-entry">
        <div class="personal-entry-line1">
          <span class="personal-bold">${esc(proj.name)}</span>
          ${proj.url ? `<span class="personal-italic personal-url-small">${esc(proj.url)}</span>` : ''}
        </div>
        ${bulletHtml}
      </div>`;
  }).join('');

  return `
    <div class="personal-section-title">PROJECTS</div>
    <div class="personal-thin-rule"></div>
    ${rows}`;
}

function renderPersonalSkills(
  skills: string[],
  languages: string[],
  certifications: ParsedResumeCertification[],
  state: VisibilityState
): string {
  const visibleSkills = isVisible(state, 'skills')
    ? skills.filter((_, i) => isVisible(state, 'skills', i))
    : [];
  const visibleLangs = isVisible(state, 'languages')
    ? languages.filter((_, i) => isVisible(state, 'languages', i))
    : [];
  const visibleCerts = isVisible(state, 'certifications')
    ? certifications.filter((_, i) => isVisible(state, 'certifications', i))
    : [];

  const allItems = [
    ...visibleSkills,
    ...visibleLangs,
    ...visibleCerts.map(c => c.name),
  ].filter(Boolean);

  if (allItems.length === 0) return '';

  return `
    <div class="personal-section-title">SKILLS &amp; INTERESTS</div>
    <div class="personal-thin-rule"></div>
    <div class="personal-skills-line">${allItems.map(esc).join(' | ')}</div>`;
}

// ── Main renderer ─────────────────────────────────────────────

export function renderPersonalPreviewHTML(data: ParsedResume, visibility: VisibilityState): string {
  const contactParts = [data.email, data.phone, data.linkedin, data.website]
    .filter(Boolean)
    .map(esc)
    .join(' | ');

  return `
    <div class="personal-doc">
      <div class="personal-name">${esc(data.full_name) || 'YOUR NAME'}</div>
      ${contactParts ? `<div class="personal-contact">${contactParts}</div>` : ''}
      <div class="personal-thick-rule"></div>
      ${renderPersonalEducation(data.education ?? [], visibility)}
      ${renderPersonalExperience(data.experience ?? [], visibility)}
      ${renderPersonalActivities(data.activities ?? [], visibility)}
      ${renderPersonalProjects(data.projects ?? [], visibility)}
      ${renderPersonalSkills(data.skills ?? [], data.languages ?? [], data.certifications ?? [], visibility)}
    </div>`;
}
