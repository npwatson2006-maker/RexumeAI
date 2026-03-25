#!/usr/bin/env node
/**
 * npm run push
 *
 * Stages all changes, commits with a timestamp, and pushes to main.
 * Usage: npm run push
 */

import { execSync } from 'child_process';

function run(cmd) {
  return execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
}

const now = new Date();
const timestamp = now.toLocaleString('en-US', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).replace(',', '');

const message = `Update: ${timestamp}`;

console.log(`\n📦 Staging all changes...`);
run('git add .');

// Check if there's anything to commit
const status = execSync('git status --porcelain').toString().trim();
if (!status) {
  console.log('✅ Nothing to commit — already up to date.');
  process.exit(0);
}

console.log(`\n💬 Committing: "${message}"`);
run(`git commit -m "${message}"`);

console.log(`\n🚀 Pushing to main...`);
run('git push origin main');

console.log(`\n✅ Done! Changes pushed to GitHub.\n`);
