/**
 * Personal Resume Template
 *
 * Generates a DOCX file matching the personal resume format spec:
 * Garamond font, left-aligned 35pt name, pipe-separated contact line,
 * thick rule under name, thin rules under each section header,
 * org+location on line 1 / role+date on line 2 pattern.
 *
 * Page: US Letter, ~0.11" top, ~0.28" bottom, ~0.49" left, ~0.41" right.
 * Section order: EDUCATION & ACADEMIC HONORS → EXPERIENCE →
 *                LEADERSHIP & INVOLVEMENT → PROJECTS → SKILLS & INTERESTS
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
import type {
  ParsedResume,
  ParsedResumeExperience,
  ParsedResumeEducation,
  ParsedResumeActivity,
  ParsedResumeProject,
  ParsedResumeCertification,
} from '../supabase/types';

// ── Constants ──────────────────────────────────────────────────

const GAR = 'Garamond';

// Margins in DXA (twips)
const MARGIN_TOP    = 115;
const MARGIN_BOTTOM = 288;
const MARGIN_LEFT   = 706;
const MARGIN_RIGHT  = 583;

// Content width = page width − left margin − right margin
// 12240 − 706 − 583 = 10,951 DXA
const TAB_RIGHT = 10951;

// Font sizes in half-points
const SIZE_NAME    = 70;  // 35pt
const SIZE_CONTACT = 20;  // 10pt
const SIZE_BODY    = 20;  // 10pt
const SIZE_NORMAL  = 21;  // 10.5pt

// ── Primitive helpers ──────────────────────────────────────────

function gar(
  text: string,
  opts: { bold?: boolean; italic?: boolean; underline?: boolean; size?: number; font?: string } = {}
): TextRun {
  return new TextRun({
    text,
    font: opts.font ?? GAR,
    bold: opts.bold ?? false,
    italics: opts.italic ?? false,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    size: opts.size ?? SIZE_NORMAL,
  });
}

function emptyPara(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: '', font: GAR, size: SIZE_NORMAL })],
    spacing: { after: 0, line: 240 },
  });
}

// ── Header block ───────────────────────────────────────────────

function namePara(name: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 0, before: 0 },
    children: [
      new TextRun({
        text: name,
        font: GAR,
        bold: true,
        size: SIZE_NAME,
      }),
    ],
  });
}

function contactPara(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 0, before: 0 },
    children: [gar(text, { size: SIZE_CONTACT })],
  });
}

// ── Horizontal rules ───────────────────────────────────────────

/** Thick rule (3.55pt) — used only under the name block */
function thickRulePara(): Paragraph {
  return new Paragraph({
    children: [],
    spacing: { after: 40, before: 20 },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 28, // 3.55pt × 8 eighth-points ≈ 28
        color: '000000',
        space: 1,
      },
    },
  });
}

/** Thin rule (0.67pt) — used under every section header */
function thinRulePara(): Paragraph {
  return new Paragraph({
    children: [],
    spacing: { after: 40, before: 0 },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 5, // 0.67pt × 8 ≈ 5
        color: '000000',
        space: 1,
      },
    },
  });
}

// ── Section headers ────────────────────────────────────────────

function sectionHeader(text: string): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 100, after: 0 },
      children: [gar(text.toUpperCase(), { bold: true, size: SIZE_NORMAL })],
    }),
    thinRulePara(),
  ];
}

// ── Education helpers ──────────────────────────────────────────

function formatGpa(raw: string): string {
  if (raw.includes('/')) return raw;
  const num = parseFloat(raw);
  if (!isNaN(num)) return `${num.toFixed(2)}/4.00`;
  return raw;
}

function buildPersonalEducationSection(education: ParsedResumeEducation[]): Paragraph[] {
  if (education.length === 0) return [];

  const paras: Paragraph[] = [...sectionHeader('EDUCATION & ACADEMIC HONORS')];

  education.forEach((edu, idx) => {
    if (idx > 0) paras.push(emptyPara());

    // Line 1: Institution                              End Date
    paras.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TAB_RIGHT }],
      spacing: { after: 0, line: 240 },
      children: [
        gar(edu.institution, { bold: true }),
        ...(edu.end_date ? [gar('\t'), gar(edu.end_date, { italic: true })] : []),
      ],
    }));

    // Line 2: Degree (italic)                          GPA: X.XX/4.00 (bold)
    const degreeText = edu.field_of_study
      ? `${edu.degree}, ${edu.field_of_study}`
      : edu.degree;
    const gpa = edu.gpa ? `GPA: ${formatGpa(edu.gpa)}` : '';

    paras.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TAB_RIGHT }],
      spacing: { after: 0, line: 240 },
      children: [
        gar(degreeText, { italic: true }),
        ...(gpa ? [gar('\t'), gar(gpa, { bold: true })] : []),
      ],
    }));
  });

  return paras;
}

// ── Entry helpers (Experience / Leadership) ────────────────────

function splitBullets(description: string): string[] {
  return description
    .split(/\n|•|●/)
    .map((s) => s.replace(/^[-–—*]\s*/, '').trim())
    .filter((s) => s.length > 0);
}

function formatDateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return '';
  if (!start) return end ?? '';
  if (!end || end.toLowerCase() === 'present') return `${start} - Present`;
  return `${start} - ${end}`;
}

/**
 * Bullet paragraph using ArialMT 8pt bullet character + Garamond 10pt body.
 * Indent: left 360 DXA, hanging 360 DXA (bullet at margin, text at +360).
 */
function bulletPara(text: string): Paragraph {
  return new Paragraph({
    style: 'ListParagraph',
    numbering: { reference: 'personal-bullets', level: 0 },
    children: [gar(text, { size: SIZE_BODY })],
    spacing: { after: 0, line: 240, lineRule: 'auto' as any },
    indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.25) },
  });
}

/**
 * Line 1: Org/Company [| Location]
 * Line 2: Role Title (italic)                      Date Range (italic, right)
 */
function buildEntryParas(
  orgName: string,
  location: string | null | undefined,
  role: string,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  description: string
): Paragraph[] {
  const dateRange = formatDateRange(startDate, endDate);
  const paras: Paragraph[] = [];

  // Line 1: org + location (no date)
  paras.push(new Paragraph({
    spacing: { after: 0, line: 240 },
    children: [
      gar(orgName, { bold: true }),
      ...(location ? [gar(` | ${location}`)] : []),
    ],
  }));

  // Line 2: role (italic left) + date (italic right)
  paras.push(new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TAB_RIGHT }],
    spacing: { after: 0, line: 240 },
    children: [
      gar(role, { italic: true }),
      ...(dateRange ? [gar('\t'), gar(dateRange, { italic: true })] : []),
    ],
  }));

  // Bullets
  const bullets = splitBullets(description);
  bullets.forEach((b) => paras.push(bulletPara(b)));

  return paras;
}

// ── Section builders ───────────────────────────────────────────

function buildPersonalExperienceSection(experience: ParsedResumeExperience[]): Paragraph[] {
  if (experience.length === 0) return [];

  const paras: Paragraph[] = [...sectionHeader('EXPERIENCE')];
  experience.forEach((exp, idx) => {
    if (idx > 0) paras.push(emptyPara());
    paras.push(...buildEntryParas(exp.company, exp.location, exp.title, exp.start_date, exp.end_date, exp.description));
  });
  return paras;
}

function buildPersonalActivitiesSection(activities: ParsedResumeActivity[]): Paragraph[] {
  if (activities.length === 0) return [];

  const paras: Paragraph[] = [...sectionHeader('LEADERSHIP & INVOLVEMENT')];
  activities.forEach((act, idx) => {
    if (idx > 0) paras.push(emptyPara());
    paras.push(...buildEntryParas(act.organization, null, act.role, act.start_date, act.end_date, act.description));
  });
  return paras;
}

function buildPersonalProjectsSection(projects: ParsedResumeProject[]): Paragraph[] {
  if (projects.length === 0) return [];

  const paras: Paragraph[] = [...sectionHeader('PROJECTS')];
  projects.forEach((proj, idx) => {
    if (idx > 0) paras.push(emptyPara());

    // Line 1: project name (bold) [+ url if present, right-aligned]
    paras.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TAB_RIGHT }],
      spacing: { after: 0, line: 240 },
      children: [
        gar(proj.name, { bold: true }),
        ...(proj.url ? [gar('\t'), gar(proj.url, { italic: true, size: SIZE_BODY })] : []),
      ],
    }));

    // Bullets from description
    const bullets = splitBullets(proj.description);
    bullets.forEach((b) => paras.push(bulletPara(b)));
  });
  return paras;
}

function buildPersonalSkillsSection(
  skills: string[],
  languages: string[],
  certifications: ParsedResumeCertification[]
): Paragraph[] {
  const allItems = [
    ...skills,
    ...languages,
    ...certifications.map((c) => c.name),
  ].filter(Boolean);

  if (allItems.length === 0) return [];

  return [
    ...sectionHeader('SKILLS & INTERESTS'),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 0, line: 240 },
      children: [gar(allItems.join(' | '))],
    }),
  ];
}

// ── Main export function ───────────────────────────────────────

export async function generatePersonalDocx(data: ParsedResume, fileName: string): Promise<void> {
  // Build contact line: email | phone | linkedin
  const contactParts = [data.email, data.phone, data.linkedin, data.website].filter(Boolean);
  const contactText = contactParts.join(' | ');

  const children: Paragraph[] = [
    // ── Header ──
    namePara(data.full_name || 'YOUR NAME'),
    ...(contactText ? [contactPara(contactText)] : []),
    thickRulePara(),

    // ── Education ──
    ...buildPersonalEducationSection(data.education ?? []),

    // ── Experience ──
    ...buildPersonalExperienceSection(data.experience ?? []),

    // ── Leadership & Involvement ──
    ...buildPersonalActivitiesSection(data.activities ?? []),

    // ── Projects ──
    ...buildPersonalProjectsSection(data.projects ?? []),

    // ── Skills & Interests ──
    ...buildPersonalSkillsSection(data.skills ?? [], data.languages ?? [], data.certifications ?? []),
  ];

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'personal-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
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
                  font: 'Arial',
                  size: 16, // 8pt
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
              top: MARGIN_TOP,
              bottom: MARGIN_BOTTOM,
              left: MARGIN_LEFT,
              right: MARGIN_RIGHT,
            },
            size: {
              width: 12240,  // 8.5 inches
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
