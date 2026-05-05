#!/usr/bin/env node
// One-shot codemod: lucide-react → @phosphor-icons/react.
// Walks src/, rewrites imports + renames the icons whose names changed.
// Safe to delete after the migration commit lands.
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = decodeURIComponent(new URL('../src/', import.meta.url).pathname);

// Icon name remap. Keys are lucide names, values are phosphor names.
// Identical names are left implicit — only entries here get rewritten.
const NAME_MAP = {
  AlertOctagon: 'WarningOctagon',
  AlertTriangle: 'Warning',
  CalendarRange: 'CalendarBlank',
  CheckCircle2: 'CheckCircle',
  ChevronDown: 'CaretDown',
  ChevronLeft: 'CaretLeft',
  ChevronRight: 'CaretRight',
  ChevronUp: 'CaretUp',
  ClipboardList: 'ClipboardText',
  ExternalLink: 'ArrowSquareOut',
  EyeOff: 'EyeSlash',
  GripVertical: 'DotsSixVertical',
  LayoutPanelTop: 'SquaresFour',
  Loader2: 'CircleNotch',
  Maximize2: 'ArrowsOut',
  Minimize2: 'ArrowsIn',
  MoveRight: 'ArrowRight',
  Rows3: 'Rows',
  Search: 'MagnifyingGlass',
  Settings2: 'GearSix',
  Sparkles: 'Sparkle',
  // Type renames
  LucideProps: 'IconProps',
  LucideIcon: 'Icon',
};

// Sort keys longest-first so `ChevronDown` rewrites cleanly without partial
// collisions on a hypothetical `Chevron` token.
const KEYS = Object.keys(NAME_MAP).sort((a, b) => b.length - a.length);

let touched = 0;
const visited = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (['.ts', '.tsx', '.js', '.jsx'].includes(extname(full))) {
      processFile(full);
    }
  }
}

function processFile(path) {
  const original = readFileSync(path, 'utf8');
  if (!/from\s+['"]lucide-react['"]/.test(original)) return;
  let next = original;
  // Swap the import path.
  next = next.replace(/from\s+(['"])lucide-react\1/g, "from '@phosphor-icons/react'");
  // Rename every lucide-only token (whole-word, both code and JSX).
  for (const k of KEYS) {
    const re = new RegExp(`\\b${k}\\b`, 'g');
    next = next.replace(re, NAME_MAP[k]);
  }
  if (next !== original) {
    writeFileSync(path, next, 'utf8');
    touched += 1;
    visited.push(path);
  }
}

walk(ROOT);
console.log(`Rewrote ${touched} file(s).`);
for (const v of visited) console.log('  -', v);
