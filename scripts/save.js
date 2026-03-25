#!/usr/bin/env node
/**
 * npm run save
 *
 * Detects changed files, generates a meaningful commit message,
 * stages everything, commits, and pushes to main.
 * Usage: npm run save
 */

import { execSync } from 'child_process';

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: opts.capture ? 'pipe' : 'inherit', cwd: process.cwd() });
}

function capture(cmd) {
  return execSync(cmd, { stdio: 'pipe', cwd: process.cwd() }).toString().trim();
}

// ── Get changed files ──────────────────────────────────────
const staged   = capture('git diff --cached --name-only');
const unstaged = capture('git diff --name-only');
const untracked = capture('git ls-files --others --exclude-standard');

const allChanged = [...new Set([
  ...staged.split('\n'),
  ...unstaged.split('\n'),
  ...untracked.split('\n'),
].filter(Boolean))];

if (allChanged.length === 0) {
  console.log('✅ Nothing to commit — already up to date.');
  process.exit(0);
}

// ── Generate a meaningful commit message ──────────────────
function categorize(files) {
  const categories = [];

  const inDir = (dir) => files.some(f => f.startsWith(dir));
  const hasExt = (...exts) => files.some(f => exts.some(e => f.endsWith(e)));
  const hasFile = (...names) => files.some(f => names.some(n => f.includes(n)));

  if (hasFile('auth.ts', 'main.ts') || files.some(f => f.includes('auth')))
    categories.push('auth flow');
  if (hasFile('db.ts') || files.some(f => f.includes('db')))
    categories.push('database helpers');
  if (hasFile('types.ts'))
    categories.push('TypeScript types');
  if (hasFile('client.ts'))
    categories.push('Supabase client');
  if (inDir('supabase/'))
    categories.push('SQL migrations');
  if (hasFile('index.html'))
    categories.push('landing page');
  if (inDir('css/') || hasExt('.css'))
    categories.push('styles');
  if (inDir('js/') || hasExt('.js') && !hasFile('package'))
    categories.push('scripts');
  if (hasFile('package.json', 'package-lock.json', 'vite.config', 'tsconfig'))
    categories.push('config');
  if (hasFile('.gitignore', '.gitattributes', '.env.example'))
    categories.push('project setup');

  // Fallback: list up to 3 filenames
  if (categories.length === 0) {
    const names = files.slice(0, 3).map(f => f.split('/').pop());
    categories.push(`update ${names.join(', ')}`);
  }

  return categories;
}

const cats = categorize(allChanged);
let message;

if (cats.length === 1) {
  message = `Update ${cats[0]}`;
} else if (cats.length === 2) {
  message = `Update ${cats[0]} and ${cats[1]}`;
} else {
  const last = cats.pop();
  message = `Update ${cats.join(', ')}, and ${last}`;
}

// Cap at 72 chars
if (message.length > 72) message = message.slice(0, 69) + '...';

// ── Stage, commit, push ────────────────────────────────────
console.log(`\n📦 Changed files (${allChanged.length}):`);
allChanged.forEach(f => console.log(`   • ${f}`));

console.log(`\n💬 Commit message: "${message}"`);
run('git add .');
run(`git commit -m "${message}"`);

console.log(`\n🚀 Pushing to main...`);
run('git push origin main');

console.log(`\n✅ Saved! Changes pushed to GitHub.\n`);
