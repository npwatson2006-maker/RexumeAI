/**
 * Upload Resume Page
 *
 * Three phases:
 *  1. Drop Zone   — drag-and-drop or click to select file
 *  2. Processing  — 4 animated steps (extract → upload → DB → AI parse)
 *  3. Preview     — editable structured form, save or discard
 */

import { supabase } from '../../lib/supabase/client';
import { createResume, updateResume, deleteResume, deleteResumeFile } from '../../lib/supabase/db';
import { extractText, isAcceptedType, formatFileSize, MAX_FILE_SIZE_BYTES, ExtractionError } from '../../lib/parsing/extractor';
import type { ParsedResume, ParsedResumeExperience, ParsedResumeEducation, ParsedResumeCertification, ParsedResumeProject } from '../../lib/supabase/types';
import type { User } from '@supabase/supabase-js';

// ── Upload state ────────────────────────────────────────────────

interface UploadState {
  file: File | null;
  extractedText: string;
  storagePath: string;
  resumeId: string;
  parsedData: ParsedResume | null;
  accessToken: string;
}

const state: UploadState = {
  file: null,
  extractedText: '',
  storagePath: '',
  resumeId: '',
  parsedData: null,
  accessToken: '',
};

// ── Phase 1: Drop Zone ─────────────────────────────────────────

function renderDropZone(root: HTMLElement): void {
  root.innerHTML = `
    <div class="upload-page">
      <div class="upload-header">
        <h1 class="upload-title">Upload Your Resume</h1>
        <p class="upload-subtitle">Supports PDF, Word (.docx), and plain text (.txt) — up to 10 MB</p>
      </div>

      <div class="drop-zone" id="drop-zone" role="button" tabindex="0" aria-label="Drop zone for resume upload">
        <div class="drop-zone-inner">
          <div class="drop-zone-icon">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="8" y="4" width="32" height="40" rx="3"/>
              <polyline points="30 4 30 14 40 14"/>
              <line x1="24" y1="22" x2="24" y2="36"/>
              <polyline points="18 28 24 22 30 28"/>
            </svg>
          </div>
          <p class="drop-zone-label">Drag &amp; drop your resume here</p>
          <p class="drop-zone-sub">or <button class="drop-zone-browse" id="browse-btn" type="button">browse files</button></p>
          <p class="drop-zone-formats">PDF · DOCX · TXT</p>
        </div>
        <input type="file" id="file-input" class="file-input-hidden" accept=".pdf,.docx,.txt" aria-hidden="true"/>
      </div>

      <div id="file-preview-strip" class="file-preview-strip" style="display:none"></div>
      <div id="upload-error" class="upload-error" style="display:none"></div>

      <button class="upload-cta" id="upload-cta" disabled>
        Upload &amp; Analyze
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
      </button>
    </div>
  `;

  const dropZone = root.querySelector<HTMLElement>('#drop-zone')!;
  const fileInput = root.querySelector<HTMLInputElement>('#file-input')!;
  const browseBtn = root.querySelector<HTMLButtonElement>('#browse-btn')!;
  const uploadCta = root.querySelector<HTMLButtonElement>('#upload-cta')!;

  // Click anywhere on drop zone → open file picker
  dropZone.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id !== 'browse-btn') fileInput.click();
  });
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });
  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  // Drag events
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file) handleFileSelected(file, root);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFileSelected(file, root);
  });

  uploadCta.addEventListener('click', () => {
    if (state.file) startProcessing(root);
  });
}

function handleFileSelected(file: File, root: HTMLElement): void {
  const errorEl = root.querySelector<HTMLElement>('#upload-error')!;
  const previewStrip = root.querySelector<HTMLElement>('#file-preview-strip')!;
  const uploadCta = root.querySelector<HTMLButtonElement>('#upload-cta')!;

  // Validate
  if (file.size > MAX_FILE_SIZE_BYTES) {
    showDropZoneError(errorEl, `File too large (${formatFileSize(file.size)}). Maximum allowed size is 10 MB.`);
    return;
  }
  if (!isAcceptedType(file)) {
    showDropZoneError(errorEl, 'Unsupported file type. Please upload a PDF, Word document (.docx), or plain text file (.txt).');
    return;
  }

  errorEl.style.display = 'none';
  state.file = file;

  // File preview strip
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  previewStrip.style.display = 'flex';
  previewStrip.innerHTML = `
    <div class="file-preview">
      <div class="file-preview-icon ${ext}">${ext.toUpperCase()}</div>
      <div class="file-preview-info">
        <div class="file-preview-name">${escapeHtml(file.name)}</div>
        <div class="file-preview-size">${formatFileSize(file.size)}</div>
      </div>
      <button class="file-preview-remove" id="remove-file" aria-label="Remove file">&times;</button>
    </div>
  `;

  previewStrip.querySelector('#remove-file')!.addEventListener('click', () => {
    state.file = null;
    previewStrip.style.display = 'none';
    uploadCta.disabled = true;
  });

  uploadCta.disabled = false;
}

function showDropZoneError(el: HTMLElement, msg: string): void {
  el.textContent = msg;
  el.style.display = 'block';
}

// ── Phase 2: Processing ────────────────────────────────────────

type StepStatus = 'pending' | 'active' | 'done' | 'error';

interface Step {
  id: string;
  label: string;
  status: StepStatus;
  errorMsg?: string;
}

const STEPS: Step[] = [
  { id: 'extract', label: 'Extract text from file',    status: 'pending' },
  { id: 'upload',  label: 'Upload file to storage',    status: 'pending' },
  { id: 'db',      label: 'Create resume record',      status: 'pending' },
  { id: 'parse',   label: 'AI analysis with Claude',   status: 'pending' },
];

function renderProcessing(root: HTMLElement): void {
  // Reset steps
  STEPS.forEach((s) => { s.status = 'pending'; s.errorMsg = undefined; });

  root.innerHTML = `
    <div class="upload-page">
      <div class="upload-header">
        <h1 class="upload-title">Analyzing Your Resume…</h1>
        <p class="upload-subtitle">This usually takes 10–20 seconds. Please don't close the page.</p>
      </div>
      <div class="processing-card">
        <div class="processing-steps" id="processing-steps">
          ${STEPS.map((s) => renderStepHtml(s)).join('')}
        </div>
        <div id="processing-error" class="processing-error" style="display:none"></div>
      </div>
    </div>
  `;
}

function renderStepHtml(step: Step): string {
  const icons: Record<StepStatus, string> = {
    pending: `<span class="step-dot pending"></span>`,
    active:  `<span class="step-dot active"><span class="step-spinner"></span></span>`,
    done:    `<span class="step-dot done"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 8 7 12 13 4"/></svg></span>`,
    error:   `<span class="step-dot error"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg></span>`,
  };
  return `
    <div class="step-row" id="step-${step.id}">
      ${icons[step.status]}
      <div class="step-content">
        <span class="step-label">${step.label}</span>
        ${step.errorMsg ? `<span class="step-error-msg">${escapeHtml(step.errorMsg)}</span>` : ''}
      </div>
    </div>
  `;
}

function updateStepEl(root: HTMLElement, stepId: string, status: StepStatus, errorMsg?: string): void {
  const step = STEPS.find((s) => s.id === stepId)!;
  step.status = status;
  step.errorMsg = errorMsg;
  const el = root.querySelector(`#step-${stepId}`);
  if (el) el.outerHTML = renderStepHtml(step);
}

async function startProcessing(root: HTMLElement): Promise<void> {
  const file = state.file!;
  renderProcessing(root);

  // ── Step 1: Extract text ──
  updateStepEl(root, 'extract', 'active');
  let text: string;
  try {
    text = await extractText(file);
    if (!text.trim()) throw new ExtractionError('No readable text found in this file. Try a different format.');
    state.extractedText = text;
    updateStepEl(root, 'extract', 'done');
  } catch (err) {
    const msg = err instanceof ExtractionError ? err.message : 'Could not read file text.';
    updateStepEl(root, 'extract', 'error', msg);
    showProcessingError(root, msg, () => startProcessing(root));
    return;
  }

  // ── Step 2: Upload file to storage ──
  updateStepEl(root, 'upload', 'active');
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  state.accessToken = session?.access_token ?? '';
  const userId = user!.id;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${userId}/${Date.now()}_${safeName}`;
  const { error: storageError } = await supabase.storage
    .from('resumes')
    .upload(storagePath, file, { upsert: false });

  if (storageError) {
    updateStepEl(root, 'upload', 'error', storageError.message);
    showProcessingError(root, 'File upload failed. Please try again.', () => startProcessing(root));
    return;
  }
  state.storagePath = storagePath;
  updateStepEl(root, 'upload', 'done');

  // ── Step 3: Create DB record ──
  updateStepEl(root, 'db', 'active');
  const draftTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
  const { data: resumeRow, error: dbError } = await createResume({
    user_id: userId,
    title: draftTitle,
    original_file_url: storagePath,
    parsed_content: null,
  });

  if (dbError || !resumeRow) {
    updateStepEl(root, 'db', 'error', dbError ?? 'Unknown DB error');
    // Clean up orphaned storage file
    await supabase.storage.from('resumes').remove([storagePath]);
    showProcessingError(root, 'Could not create resume record. Please try again.', () => startProcessing(root));
    return;
  }
  state.resumeId = resumeRow.id;
  updateStepEl(root, 'db', 'done');

  // ── Step 4: AI parse via Edge Function ──
  updateStepEl(root, 'parse', 'active');
  const { data: parseResult, error: fnError } = await supabase.functions.invoke('parse-resume', {
    body: { text: state.extractedText },
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
  });

  if (fnError || !parseResult?.data) {
    let msg = parseResult?.error ?? fnError?.message ?? 'AI parsing failed. Please retry.';
    // Try to extract the real error body from FunctionsHttpError
    if (fnError && 'context' in fnError) {
      try {
        const body = await (fnError as { context: Response }).context.json();
        msg = body?.error ?? msg;
      } catch { /* ignore */ }
    }
    console.error('[upload] parse-resume error:', msg, fnError);
    updateStepEl(root, 'parse', 'error', msg);
    showProcessingError(root, msg, () => retryParse(root));
    return;
  }

  state.parsedData = parseResult.data as ParsedResume;
  updateStepEl(root, 'parse', 'done');

  // Transition to preview after a brief pause
  setTimeout(() => renderPreview(root), 600);
}

async function retryParse(root: HTMLElement): Promise<void> {
  STEPS.find((s) => s.id === 'parse')!.status = 'pending';
  const stepsContainer = root.querySelector('#processing-steps');
  if (stepsContainer) {
    stepsContainer.innerHTML = STEPS.map((s) => renderStepHtml(s)).join('');
  }
  const errEl = root.querySelector<HTMLElement>('#processing-error');
  if (errEl) errEl.style.display = 'none';

  updateStepEl(root, 'parse', 'active');
  const { data: parseResult, error: fnError } = await supabase.functions.invoke('parse-resume', {
    body: { text: state.extractedText },
    headers: state.accessToken ? { Authorization: `Bearer ${state.accessToken}` } : {},
  });

  if (fnError || !parseResult?.data) {
    const msg = parseResult?.error ?? fnError?.message ?? 'AI parsing failed. Please retry.';
    updateStepEl(root, 'parse', 'error', msg);
    showProcessingError(root, msg, () => retryParse(root));
    return;
  }

  state.parsedData = parseResult.data as ParsedResume;
  updateStepEl(root, 'parse', 'done');
  setTimeout(() => renderPreview(root), 600);
}

function showProcessingError(root: HTMLElement, msg: string, onRetry: () => void): void {
  const errEl = root.querySelector<HTMLElement>('#processing-error');
  if (!errEl) return;
  errEl.style.display = 'flex';
  errEl.innerHTML = `
    <span>${escapeHtml(msg)}</span>
    <button class="processing-retry-btn" id="retry-btn">Retry</button>
    <button class="processing-cancel-btn" id="cancel-btn">Cancel</button>
  `;
  errEl.querySelector('#retry-btn')!.addEventListener('click', onRetry);
  errEl.querySelector('#cancel-btn')!.addEventListener('click', () => {
    renderDropZone(root);
  });
}

// ── Phase 3: Editable Preview ──────────────────────────────────

function renderPreview(root: HTMLElement): void {
  const p = state.parsedData!;

  root.innerHTML = `
    <div class="upload-page preview-mode">
      <div class="upload-header preview-header">
        <div>
          <h1 class="upload-title">Review &amp; Edit</h1>
          <p class="upload-subtitle">AI parsed your resume. Review, edit, then save.</p>
        </div>
        <div class="preview-actions-top">
          <button class="btn-discard" id="discard-btn">Discard</button>
          <button class="btn-save" id="save-btn">Save Resume</button>
        </div>
      </div>

      <div class="resume-preview" id="resume-preview">

        <!-- Title -->
        <div class="preview-section">
          <div class="preview-section-label">Resume Title</div>
          <input class="preview-title-input" id="resume-title" type="text"
            value="${escapeAttr(p.full_name ? `${p.full_name}'s Resume` : state.file?.name?.replace(/\.[^/.]+$/, '') ?? 'My Resume')}"
            placeholder="Resume Title" />
        </div>

        <!-- Personal Info -->
        <div class="preview-section">
          <div class="preview-section-label">Personal Info</div>
          <div class="preview-grid-2">
            <div class="preview-field">
              <label>Full Name</label>
              <input type="text" data-field="full_name" value="${escapeAttr(p.full_name ?? '')}" placeholder="Full Name" />
            </div>
            <div class="preview-field">
              <label>Email</label>
              <input type="email" data-field="email" value="${escapeAttr(p.email ?? '')}" placeholder="Email" />
            </div>
            <div class="preview-field">
              <label>Phone</label>
              <input type="tel" data-field="phone" value="${escapeAttr(p.phone ?? '')}" placeholder="Phone" />
            </div>
            <div class="preview-field">
              <label>Location</label>
              <input type="text" data-field="location" value="${escapeAttr(p.location ?? '')}" placeholder="City, State" />
            </div>
            <div class="preview-field">
              <label>LinkedIn</label>
              <input type="url" data-field="linkedin" value="${escapeAttr(p.linkedin ?? '')}" placeholder="linkedin.com/in/..." />
            </div>
            <div class="preview-field">
              <label>Website</label>
              <input type="url" data-field="website" value="${escapeAttr(p.website ?? '')}" placeholder="yoursite.com" />
            </div>
          </div>
        </div>

        <!-- Summary -->
        <div class="preview-section">
          <div class="preview-section-label">Summary</div>
          <textarea class="preview-textarea" data-field="summary" rows="4" placeholder="Professional summary…">${escapeHtml(p.summary ?? '')}</textarea>
        </div>

        <!-- Skills -->
        <div class="preview-section">
          <div class="preview-section-label">Skills</div>
          <div class="tag-list" id="skills-list">
            ${(p.skills ?? []).map((s, i) => chipHtml('skill', i, s)).join('')}
          </div>
          <div class="tag-input-row">
            <input class="tag-input" id="skill-input" type="text" placeholder="Add skill…" />
            <button class="tag-add-btn" id="add-skill-btn">Add</button>
          </div>
        </div>

        <!-- Languages -->
        <div class="preview-section">
          <div class="preview-section-label">Languages</div>
          <div class="tag-list" id="languages-list">
            ${(p.languages ?? []).map((l, i) => chipHtml('lang', i, l)).join('')}
          </div>
          <div class="tag-input-row">
            <input class="tag-input" id="lang-input" type="text" placeholder="Add language…" />
            <button class="tag-add-btn" id="add-lang-btn">Add</button>
          </div>
        </div>

        <!-- Experience -->
        <div class="preview-section">
          <div class="preview-section-label">Experience</div>
          <div id="experience-list">
            ${(p.experience ?? []).map((exp, i) => experienceCardHtml(exp, i)).join('')}
          </div>
          <button class="add-card-btn" id="add-exp-btn">+ Add Experience</button>
        </div>

        <!-- Education -->
        <div class="preview-section">
          <div class="preview-section-label">Education</div>
          <div id="education-list">
            ${(p.education ?? []).map((edu, i) => educationCardHtml(edu, i)).join('')}
          </div>
          <button class="add-card-btn" id="add-edu-btn">+ Add Education</button>
        </div>

        <!-- Certifications -->
        <div class="preview-section">
          <div class="preview-section-label">Certifications</div>
          <div id="certs-list">
            ${(p.certifications ?? []).map((c, i) => certCardHtml(c, i)).join('')}
          </div>
          <button class="add-card-btn" id="add-cert-btn">+ Add Certification</button>
        </div>

        <!-- Projects -->
        <div class="preview-section">
          <div class="preview-section-label">Projects</div>
          <div id="projects-list">
            ${(p.projects ?? []).map((proj, i) => projectCardHtml(proj, i)).join('')}
          </div>
          <button class="add-card-btn" id="add-proj-btn">+ Add Project</button>
        </div>

      </div><!-- /resume-preview -->

      <div class="preview-actions-bottom">
        <button class="btn-discard" id="discard-btn-2">Discard</button>
        <button class="btn-save" id="save-btn-2">Save Resume</button>
      </div>
    </div>
  `;

  wirePreviewEvents(root);
}

// ── Helpers: card HTML ─────────────────────────────────────────

function chipHtml(kind: string, idx: number, value: string): string {
  return `<span class="tag-chip" data-kind="${kind}" data-idx="${idx}">${escapeHtml(value)}<button class="chip-remove" aria-label="Remove">&times;</button></span>`;
}

function experienceCardHtml(exp: ParsedResumeExperience, idx: number): string {
  return `
    <div class="preview-card" data-exp-idx="${idx}">
      <button class="card-remove-btn" data-remove-exp="${idx}" aria-label="Remove">&times;</button>
      <div class="preview-grid-2">
        <div class="preview-field"><label>Company</label><input type="text" data-exp="${idx}" data-key="company" value="${escapeAttr(exp.company)}" placeholder="Company" /></div>
        <div class="preview-field"><label>Title</label><input type="text" data-exp="${idx}" data-key="title" value="${escapeAttr(exp.title)}" placeholder="Job Title" /></div>
        <div class="preview-field"><label>Start Date</label><input type="text" data-exp="${idx}" data-key="start_date" value="${escapeAttr(exp.start_date)}" placeholder="e.g. Jan 2022" /></div>
        <div class="preview-field"><label>End Date</label><input type="text" data-exp="${idx}" data-key="end_date" value="${escapeAttr(exp.end_date)}" placeholder="e.g. Present" /></div>
        <div class="preview-field"><label>Location</label><input type="text" data-exp="${idx}" data-key="location" value="${escapeAttr(exp.location ?? '')}" placeholder="City, State" /></div>
      </div>
      <div class="preview-field full-width"><label>Description</label><textarea data-exp="${idx}" data-key="description" rows="3" placeholder="Role description…">${escapeHtml(exp.description)}</textarea></div>
    </div>
  `;
}

function educationCardHtml(edu: ParsedResumeEducation, idx: number): string {
  return `
    <div class="preview-card" data-edu-idx="${idx}">
      <button class="card-remove-btn" data-remove-edu="${idx}" aria-label="Remove">&times;</button>
      <div class="preview-grid-2">
        <div class="preview-field"><label>Institution</label><input type="text" data-edu="${idx}" data-key="institution" value="${escapeAttr(edu.institution)}" placeholder="School name" /></div>
        <div class="preview-field"><label>Degree</label><input type="text" data-edu="${idx}" data-key="degree" value="${escapeAttr(edu.degree)}" placeholder="e.g. B.S." /></div>
        <div class="preview-field"><label>Field of Study</label><input type="text" data-edu="${idx}" data-key="field_of_study" value="${escapeAttr(edu.field_of_study ?? '')}" placeholder="Computer Science" /></div>
        <div class="preview-field"><label>GPA</label><input type="text" data-edu="${idx}" data-key="gpa" value="${escapeAttr(edu.gpa ?? '')}" placeholder="3.8 / 4.0" /></div>
        <div class="preview-field"><label>Start</label><input type="text" data-edu="${idx}" data-key="start_date" value="${escapeAttr(edu.start_date ?? '')}" placeholder="Aug 2020" /></div>
        <div class="preview-field"><label>End</label><input type="text" data-edu="${idx}" data-key="end_date" value="${escapeAttr(edu.end_date ?? '')}" placeholder="May 2024" /></div>
      </div>
    </div>
  `;
}

function certCardHtml(cert: ParsedResumeCertification, idx: number): string {
  return `
    <div class="preview-card" data-cert-idx="${idx}">
      <button class="card-remove-btn" data-remove-cert="${idx}" aria-label="Remove">&times;</button>
      <div class="preview-grid-2">
        <div class="preview-field"><label>Name</label><input type="text" data-cert="${idx}" data-key="name" value="${escapeAttr(cert.name)}" placeholder="Certification name" /></div>
        <div class="preview-field"><label>Issuer</label><input type="text" data-cert="${idx}" data-key="issuer" value="${escapeAttr(cert.issuer ?? '')}" placeholder="Issuing org" /></div>
        <div class="preview-field"><label>Date</label><input type="text" data-cert="${idx}" data-key="date" value="${escapeAttr(cert.date ?? '')}" placeholder="Month Year" /></div>
      </div>
    </div>
  `;
}

function projectCardHtml(proj: ParsedResumeProject, idx: number): string {
  return `
    <div class="preview-card" data-proj-idx="${idx}">
      <button class="card-remove-btn" data-remove-proj="${idx}" aria-label="Remove">&times;</button>
      <div class="preview-grid-2">
        <div class="preview-field"><label>Project Name</label><input type="text" data-proj="${idx}" data-key="name" value="${escapeAttr(proj.name)}" placeholder="Project name" /></div>
        <div class="preview-field"><label>URL</label><input type="url" data-proj="${idx}" data-key="url" value="${escapeAttr(proj.url ?? '')}" placeholder="github.com/..." /></div>
      </div>
      <div class="preview-field full-width"><label>Description</label><textarea data-proj="${idx}" data-key="description" rows="2" placeholder="What you built…">${escapeHtml(proj.description)}</textarea></div>
    </div>
  `;
}

// ── Wire preview interactions ──────────────────────────────────

function wirePreviewEvents(root: HTMLElement): void {
  const p = state.parsedData!;

  // ── Simple scalar field inputs ──
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-field]').forEach((el) => {
    el.addEventListener('input', () => {
      const key = el.dataset.field as keyof ParsedResume;
      (p as Record<string, unknown>)[key] = el.value;
    });
  });

  // ── Skills chips ──
  wireTagList(root, 'skills-list', 'skill', p.skills ?? [], (arr) => { p.skills = arr; }, 'skill-input', 'add-skill-btn');

  // ── Languages chips ──
  wireTagList(root, 'languages-list', 'lang', p.languages ?? [], (arr) => { p.languages = arr; }, 'lang-input', 'add-lang-btn');

  // ── Experience ──
  wireCardList<ParsedResumeExperience>(
    root, 'experience-list', 'exp', p.experience ?? [],
    (items) => { p.experience = items; },
    'add-exp-btn',
    () => ({ company: '', title: '', start_date: '', end_date: 'Present', description: '', location: null }),
    experienceCardHtml
  );

  // ── Education ──
  wireCardList<ParsedResumeEducation>(
    root, 'education-list', 'edu', p.education ?? [],
    (items) => { p.education = items; },
    'add-edu-btn',
    () => ({ institution: '', degree: '', field_of_study: null, start_date: null, end_date: null, gpa: null }),
    educationCardHtml
  );

  // ── Certifications ──
  wireCardList<ParsedResumeCertification>(
    root, 'certs-list', 'cert', p.certifications ?? [],
    (items) => { p.certifications = items; },
    'add-cert-btn',
    () => ({ name: '', issuer: null, date: null }),
    certCardHtml
  );

  // ── Projects ──
  wireCardList<ParsedResumeProject>(
    root, 'projects-list', 'proj', p.projects ?? [],
    (items) => { p.projects = items; },
    'add-proj-btn',
    () => ({ name: '', description: '', url: null }),
    projectCardHtml
  );

  // ── Save buttons ──
  const saveHandler = () => handleSave(root);
  root.querySelector('#save-btn')!.addEventListener('click', saveHandler);
  root.querySelector('#save-btn-2')!.addEventListener('click', saveHandler);

  // ── Discard buttons ──
  const discardHandler = () => handleDiscard(root);
  root.querySelector('#discard-btn')!.addEventListener('click', discardHandler);
  root.querySelector('#discard-btn-2')!.addEventListener('click', discardHandler);
}

function wireTagList(
  root: HTMLElement,
  listId: string,
  kind: string,
  items: string[],
  onUpdate: (arr: string[]) => void,
  inputId: string,
  addBtnId: string
): void {
  const listEl = root.querySelector<HTMLElement>(`#${listId}`)!;

  function rerender() {
    listEl.innerHTML = items.map((v, i) => chipHtml(kind, i, v)).join('');
    listEl.querySelectorAll('.chip-remove').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        items.splice(i, 1);
        onUpdate(items);
        rerender();
      });
    });
  }
  rerender();

  const input = root.querySelector<HTMLInputElement>(`#${inputId}`)!;
  const addBtn = root.querySelector<HTMLButtonElement>(`#${addBtnId}`)!;

  function addTag() {
    const val = input.value.trim();
    if (!val) return;
    items.push(val);
    onUpdate(items);
    input.value = '';
    rerender();
  }
  addBtn.addEventListener('click', addTag);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
}

function wireCardList<T extends Record<string, unknown>>(
  root: HTMLElement,
  listId: string,
  dataKey: string,
  items: T[],
  onUpdate: (arr: T[]) => void,
  addBtnId: string,
  newItem: () => T,
  cardHtmlFn: (item: T, idx: number) => string
): void {
  const listEl = root.querySelector<HTMLElement>(`#${listId}`)!;

  function rerender() {
    listEl.innerHTML = items.map((item, i) => cardHtmlFn(item, i)).join('');

    // Wire remove buttons
    listEl.querySelectorAll<HTMLButtonElement>(`[data-remove-${dataKey}]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset[`remove${capitalize(dataKey)}`] ?? '0', 10);
        items.splice(idx, 1);
        onUpdate(items);
        rerender();
      });
    });

    // Wire field inputs
    listEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(`[data-${dataKey}]`).forEach((el) => {
      el.addEventListener('input', () => {
        const idx = parseInt((el as HTMLElement).dataset[dataKey] ?? '0', 10);
        const key = (el as HTMLElement).dataset.key!;
        if (items[idx]) (items[idx] as Record<string, unknown>)[key] = el.value;
      });
    });
  }
  rerender();

  root.querySelector<HTMLButtonElement>(`#${addBtnId}`)!.addEventListener('click', () => {
    items.push(newItem());
    onUpdate(items);
    rerender();
    // Scroll to new card
    const cards = listEl.querySelectorAll('.preview-card');
    cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

// ── Save / Discard ─────────────────────────────────────────────

async function handleSave(root: HTMLElement): Promise<void> {
  const saveBtn = root.querySelector<HTMLButtonElement>('#save-btn') ?? root.querySelector<HTMLButtonElement>('#save-btn-2');
  const saveBtn2 = root.querySelector<HTMLButtonElement>('#save-btn-2');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
  if (saveBtn2) { saveBtn2.disabled = true; saveBtn2.textContent = 'Saving…'; }

  const titleInput = root.querySelector<HTMLInputElement>('#resume-title');
  const title = titleInput?.value.trim() || (state.parsedData?.full_name ? `${state.parsedData.full_name}'s Resume` : 'My Resume');

  const { error } = await updateResume(state.resumeId, {
    title,
    parsed_content: state.parsedData as unknown as Record<string, unknown>,
  });

  if (error) {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Resume'; }
    if (saveBtn2) { saveBtn2.disabled = false; saveBtn2.textContent = 'Save Resume'; }
    const preview = root.querySelector<HTMLElement>('#resume-preview');
    if (preview) {
      const errBanner = document.createElement('div');
      errBanner.className = 'save-error-banner';
      errBanner.textContent = `Save failed: ${error}. Please try again.`;
      preview.prepend(errBanner);
      setTimeout(() => errBanner.remove(), 5000);
    }
    return;
  }

  window.location.hash = 'home';
}

async function handleDiscard(root: HTMLElement): Promise<void> {
  const confirmed = window.confirm('Discard this resume? The uploaded file and all parsed data will be permanently deleted.');
  if (!confirmed) return;

  // Clean up DB row
  if (state.resumeId) await deleteResume(state.resumeId);
  // Clean up storage file
  if (state.storagePath) await deleteResumeFile(state.storagePath);

  window.location.hash = 'home';
}

// ── Public entry point ─────────────────────────────────────────

export async function renderUpload(container: HTMLElement, _user: User): Promise<void> {
  // Reset state on each page load
  state.file = null;
  state.extractedText = '';
  state.storagePath = '';
  state.resumeId = '';
  state.parsedData = null;
  state.accessToken = '';

  renderDropZone(container);
}

// ── Utility ────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
