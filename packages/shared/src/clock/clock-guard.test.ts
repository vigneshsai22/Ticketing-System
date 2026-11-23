import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Architectural Guard Test:
 * Ensures that nowhere in application code (outside the clock module)
 * are Date.now() or new Date() instantiated without arguments.
 * All time calculations must be injected via Clock to support the Time Machine.
 */
describe('Clock Architectural Guard (No raw Date.now() / new Date() without arguments)', () => {
  const allowedPaths = [
    path.normalize('packages/shared/src/clock'),
    path.normalize('packages/shared/src/types'),
  ];

  function getFiles(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (['node_modules', 'dist', '.git', '.system_generated'].includes(file)) {
        continue;
      }
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        getFiles(fullPath, fileList);
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        // Exclude test files from strict check if they are testing date parsing with explicit strings
        if (!file.endsWith('.test.ts') && !file.endsWith('.spec.ts')) {
          fileList.push(fullPath);
        }
      }
    }
    return fileList;
  }

  it('should not contain raw new Date() or Date.now() in production application code', () => {
    const rootDir = path.resolve(__dirname, '../../../../');
    const allSourceFiles = getFiles(rootDir);
    const violations: { file: string; line: number; text: string }[] = [];

    // Regex to match "new Date()" without arguments and "Date.now()"
    const newDateNoArgsRegex = /\bnew\s+Date\s*\(\s*\)/;
    const dateNowRegex = /\bDate\.now\s*\(\s*\)/;

    for (const filePath of allSourceFiles) {
      const relative = path.relative(rootDir, filePath);
      const isAllowed = allowedPaths.some(allowed => relative.includes(allowed));
      if (isAllowed) continue;

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Ignore comments
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return;
        }

        if (newDateNoArgsRegex.test(line) || dateNowRegex.test(line)) {
          violations.push({
            file: relative,
            line: index + 1,
            text: line.trim()
          });
        }
      });
    }

    if (violations.length > 0) {
      console.error('Clock guard violations found:');
      violations.forEach(v => {
        console.error(`  at ${v.file}:${v.line} -> ${v.text}`);
      });
    }

    expect(violations, 'Found forbidden raw Date calls outside clock module').toHaveLength(0);
  });
});
