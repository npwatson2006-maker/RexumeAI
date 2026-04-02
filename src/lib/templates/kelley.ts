/**
 * Kelley School of Business Resume Template
 *
 * Generates a DOCX file that matches the official Indiana University
 * Kelley School of Business Undergraduate Career Services resume format.
 *
 * Spec: Times New Roman throughout, US Letter, 0.8" top/bottom margins,
 *       1.0" left/right margins. Sections: EDUCATION, EXPERIENCE, SKILLS/INTERESTS.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  TabStopType,
  UnderlineType,
  LevelFormat,
  convertInchesToTwip,
} from 'docx';
import type { ParsedResume, ParsedResumeExperience, ParsedResumeEducation, ParsedResumeActivity } from '../supabase/types';

// ── Constants ──────────────────────────────────────────────────

const TNR = 'Times New Roman';
const CONTENT_WIDTH_DXA = 9360; // 6.5 inches in DXA (twips)
const BULLET_NUM_ID = 1;

// ── Primitive helpers ──────────────────────────────────────────

function tnr(
  text: string,
  opts: { bold?: boolean; italic?: boolean; underline?: boolean; size?: number } = {}
): TextRun {
  return new TextRun({
    text,
    font: TNR,
    bold: opts.bold ?? false,
    italics: opts.italic ?? false,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    size: opts.size ?? 22, // 22 half-points = 11pt
  });
}

function emptyPara(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: '', font: TNR, size: 22 })],
  });
}

// ── Header block ───────────────────────────────────────────────

function namePara(name: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: name.toUpperCase(),
        font: TNR,
        bold: true,
        size: 32, // 32 half-points = 16pt
      }),
    ],
  });
}

function contactPara(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [tnr(text)],
  });
}

// ── Horizontal rule ────────────────────────────────────────────
// Implemented as a paragraph with a thick bottom border (2pt ≈ size 16).

function hrPara(): Paragraph {
  return new Paragraph({
    children: [],
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 16,
        color: '000000',
        space: 1,
      },
    },
  });
}

// ── Section headers ────────────────────────────────────────────

function sectionHeader(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [tnr(text.toUpperCase(), { bold: true, underline: true })],
  });
}

// ── Education helpers ──────────────────────────────────────────

/**
 * Line 1: "Institution Name - City, ST         End Date"
 * Institution is bold; date is pushed to the right via a right-aligned tab stop.
 */
function eduInstitutionPara(edu: ParsedResumeEducation): Paragraph {
  const date = edu.end_date ?? '';
  const locationPart = edu.field_of_study ? '' : ''; // location not in ParsedResume; omit
  const institutionText = edu.institution;

  return new Paragraph({
    tabStops: [
      { type: TabStopType.RIGHT, position: 9360 },
    ],
    children: [
      tnr(institutionText, { bold: true }),
      ...(date ? [tnr('\t', {}), tnr(date)] : []),
    ],
    contextualSpacing: true,
  });
}

/**
 * Line 2: "Degree in Field of Study          GPA: X.XX/4.00"
 */
function eduDegreePara(edu: ParsedResumeEducation): Paragraph {
  const degree = edu.field_of_study
    ? `${edu.degree}, ${edu.field_of_study}`
    : edu.degree;
  const gpa = edu.gpa ? `GPA: ${formatGpa(edu.gpa)}` : '';

  return new Paragraph({
    tabStops: [
      { type: TabStopType.RIGHT, position: 9360 },
    ],
    children: [
      tnr(degree),
      ...(gpa ? [tnr('\t', {}), tnr(gpa, { bold: true })] : []),
    ],
    contextualSpacing: true,
  });
}

/**
 * Line 3: "Major: <value>"  (only if field_of_study is present)
 */
function eduMajorPara(fieldOfStudy: string): Paragraph {
  return new Paragraph({
    children: [
      tnr('Major: ', { bold: true }),
      tnr(fieldOfStudy),
    ],
    contextualSpacing: true,
  });
}

function formatGpa(raw: string): string {
  // Ensure it looks like X.XX/4.00
  if (raw.includes('/')) return raw;
  const num = parseFloat(raw);
  if (!isNaN(num)) return `${num.toFixed(2)}/4.00`;
  return raw;
}

// ── Experience / Activity helpers ──────────────────────────────

/**
 * Line 1: "Company Name - Location          Start Date – End Date"
 * Company name is bold; date is right-aligned.
 */
function entryHeaderPara(exp: ParsedResumeExperience): Paragraph {
  const orgParts: string[] = [exp.company];
  if (exp.location) orgParts.push(` - ${exp.location}`);
  const dateRange = formatDateRange(exp.start_date, exp.end_date);

  return new Paragraph({
    tabStops: [
      { type: TabStopType.RIGHT, position: 9360 },
    ],
    children: [
      tnr(exp.company, { bold: true }),
      ...(exp.location ? [tnr(` - ${exp.location}`)] : []),
      ...(dateRange ? [tnr('\t', {}), tnr(dateRange)] : []),
    ],
    contextualSpacing: true,
  });
}

/** Line 2: italic role title */
function rolePara(title: string): Paragraph {
  return new Paragraph({
    children: [tnr(title, { italic: true })],
    contextualSpacing: true,
  });
}

/** Bullet point paragraph */
function bulletPara(text: string): Paragraph {
  return new Paragraph({
    style: 'ListParagraph',
    numbering: { reference: 'kelley-bullets', level: 0 },
    children: [tnr(text)],
    spacing: { after: 0, line: 240, lineRule: 'auto' as any },
    indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.25) },
  });
}

/** Split a description string (newline- or bullet-delimited) into individual bullet strings. */
function splitBullets(description: string): string[] {
  return description
    .split(/\n|•|●/)
    .map((s) => s.replace(/^[-–—*]\s*/, '').trim())
    .filter((s) => s.length > 0);
}

function formatDateRange(start: string, end: string): string {
  if (!start && !end) return '';
  if (!start) return end;
  if (!end || end.toLowerCase() === 'present') return `${start} - Present`;
  return `${start} - ${end}`;
}

// ── Section builders ───────────────────────────────────────────

function buildEducationSection(education: ParsedResumeEducation[]): Paragraph[] {
  const paras: Paragraph[] = [sectionHeader('EDUCATION')];

  education.forEach((edu, idx) => {
    if (idx > 0) paras.push(emptyPara()); // blank line between entries
    paras.push(eduInstitutionPara(edu));
    paras.push(eduDegreePara(edu));
    if (edu.field_of_study) {
      paras.push(eduMajorPara(edu.field_of_study));
    }
  });

  return paras;
}

function buildExperienceSection(experience: ParsedResumeExperience[]): Paragraph[] {
  if (experience.length === 0) return [];

  const paras: Paragraph[] = [sectionHeader('EXPERIENCE')];

  experience.forEach((exp, idx) => {
    if (idx > 0) paras.push(emptyPara());
    paras.push(entryHeaderPara(exp));
    paras.push(rolePara(exp.title));
    const bullets = splitBullets(exp.description);
    bullets.forEach((b) => paras.push(bulletPara(b)));
  });

  return paras;
}

function buildActivitiesSection(activities: ParsedResumeActivity[]): Paragraph[] {
  if (activities.length === 0) return [];

  const paras: Paragraph[] = [sectionHeader('ACTIVITIES & ORGANIZATIONS')];

  activities.forEach((act, idx) => {
    if (idx > 0) paras.push(emptyPara());
    const dateRange = formatDateRange(act.start_date, act.end_date);
    paras.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
      children: [
        tnr(act.organization, { bold: true }),
        ...(dateRange ? [tnr('\t', {}), tnr(dateRange)] : []),
      ],
      contextualSpacing: true,
    }));
    paras.push(rolePara(act.role));
    const bullets = splitBullets(act.description);
    bullets.forEach((b) => paras.push(bulletPara(b)));
  });

  return paras;
}

function buildSkillsSection(skills: string[]): Paragraph[] {
  if (skills.length === 0) return [];
  return [
    sectionHeader('SKILLS/INTERESTS'),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [tnr(skills.join(' * '))],
    }),
  ];
}

// ── Main export function ───────────────────────────────────────

export async function generateKelleyDocx(data: ParsedResume, fileName: string): Promise<void> {
  const children: Paragraph[] = [
    // ── Header ──
    namePara(data.full_name || 'YOUR NAME'),
    emptyPara(),
    ...(data.email ? [contactPara(data.email)] : []),
    ...(data.phone ? [contactPara(data.phone)] : []),
    ...(data.linkedin ? [contactPara(data.linkedin)] : []),
    hrPara(),

    // ── Education ──
    ...buildEducationSection(data.education ?? []),
    emptyPara(),

    // ── Experience ──
    ...buildExperienceSection(data.experience ?? []),
    emptyPara(),

    // ── Skills/Interests ──
    ...buildSkillsSection(data.skills ?? []),
    emptyPara(),

    // ── Activities & Organizations ──
    ...buildActivitiesSection(data.activities ?? []),
  ];

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'kelley-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u00B7',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: {
                    left: convertInchesToTwip(0.25),
                    hanging: convertInchesToTwip(0.25),
                  },
                  spacing: { after: 0, line: 240 },
                },
                run: {
                  font: 'Symbol',
                  size: 22,
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1152,    // 0.8 inches in DXA
              bottom: 1152,
              left: 1440,   // 1.0 inch
              right: 1440,
            },
            size: {
              width: 12240, // 8.5 inches
              height: 15840, // 11 inches
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName.replace(/[^a-z0-9_\- ]/gi, '_')}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
