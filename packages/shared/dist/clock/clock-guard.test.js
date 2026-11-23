"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
/**
 * Architectural Guard Test:
 * Ensures that nowhere in application code (outside the clock module)
 * are Date.now() or new Date() instantiated without arguments.
 * All time calculations must be injected via Clock to support the Time Machine.
 */
(0, vitest_1.describe)('Clock Architectural Guard (No raw Date.now() / new Date() without arguments)', () => {
    const allowedPaths = [
        path.normalize('packages/shared/src/clock'),
        path.normalize('packages/shared/src/types'),
    ];
    function getFiles(dir, fileList = []) {
        if (!fs.existsSync(dir))
            return fileList;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            if (['node_modules', 'dist', '.git', '.system_generated'].includes(file)) {
                continue;
            }
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                getFiles(fullPath, fileList);
            }
            else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
                // Exclude test files from strict check if they are testing date parsing with explicit strings
                if (!file.endsWith('.test.ts') && !file.endsWith('.spec.ts')) {
                    fileList.push(fullPath);
                }
            }
        }
        return fileList;
    }
    (0, vitest_1.it)('should not contain raw new Date() or Date.now() in production application code', () => {
        const rootDir = path.resolve(__dirname, '../../../../');
        const allSourceFiles = getFiles(rootDir);
        const violations = [];
        // Regex to match "new Date()" without arguments and "Date.now()"
        const newDateNoArgsRegex = /\bnew\s+Date\s*\(\s*\)/;
        const dateNowRegex = /\bDate\.now\s*\(\s*\)/;
        for (const filePath of allSourceFiles) {
            const relative = path.relative(rootDir, filePath);
            const isAllowed = allowedPaths.some(allowed => relative.includes(allowed));
            if (isAllowed)
                continue;
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
        (0, vitest_1.expect)(violations, 'Found forbidden raw Date calls outside clock module').toHaveLength(0);
    });
});
//# sourceMappingURL=clock-guard.test.js.map