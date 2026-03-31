/**
 * Client-side resume text extractor
 *
 * Supports PDF (pdfjs-dist), DOCX (mammoth), and plain text (FileReader).
 * Both pdfjs-dist and mammoth are dynamically imported so they are only
 * loaded when the user actually selects a file — the main bundle stays lean.
 */

export type SupportedMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'text/plain';

export const ACCEPTED_TYPES: SupportedMimeType[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt'];
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

// ── PDF via pdfjs-dist ────────────────────────────────────────

async function extractPdf(file: File): Promise<string> {
  // Dynamic imports — only loaded for PDF files
  const pdfjsLib = await import('pdfjs-dist');
  // Vite resolves the ?url import to the correct worker asset URL in both dev and prod
  const workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).href;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const pageTexts: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ');
    pageTexts.push(pageText);
  }

  return pageTexts.join('\n\n').trim();
}

// ── DOCX via mammoth ─────────────────────────────────────────

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}

// ── Plain text ───────────────────────────────────────────────

function extractTxt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) ?? '');
    reader.onerror = () => reject(new ExtractionError('Failed to read text file.'));
    reader.readAsText(file, 'utf-8');
  });
}

// ── Helpers ───────────────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isAcceptedType(file: File): boolean {
  // Check MIME type first, fall back to extension
  if (ACCEPTED_TYPES.includes(file.type as SupportedMimeType)) return true;
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

// ── Public API ────────────────────────────────────────────────

/**
 * Extract plain text from a PDF, DOCX, or TXT file.
 * Throws ExtractionError if the file type or size is invalid,
 * or if extraction fails.
 */
export async function extractText(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new ExtractionError(
      `File is too large (${formatFileSize(file.size)}). Maximum allowed size is 10 MB.`
    );
  }

  if (!isAcceptedType(file)) {
    throw new ExtractionError(
      'Unsupported file type. Please upload a PDF, Word document (.docx), or plain text file (.txt).'
    );
  }

  // Route to the correct extractor by MIME type or extension
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (file.type === 'application/pdf' || ext === 'pdf') {
    return extractPdf(file);
  }

  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    return extractDocx(file);
  }

  // TXT (and any other text/* type)
  return extractTxt(file);
}
