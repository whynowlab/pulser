# Pulser Phase 1 MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only CLI tool that scans Claude Code SKILL.md files, diagnoses quality issues against 8 rules, classifies skill types, generates prescriptions, and displays results in a patient-monitor TUI animation.

**Architecture:** TypeScript CLI using commander.js for argument parsing, gray-matter for YAML frontmatter extraction, and blessed for the patient-monitor TUI. The pipeline is linear: scan → diagnose → classify → prescribe → report. Each rule is an independent module implementing a shared `Rule` interface. No database, no network calls, no LLM — pure local file analysis.

**Tech Stack:** TypeScript, Node.js 20+, commander.js, gray-matter, chalk, boxen, blessed, tsup

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/types.ts` | All shared TypeScript interfaces and types |
| `src/scanner.ts` | Find SKILL.md files in a directory, parse frontmatter + content |
| `src/classifier.ts` | Multi-signal skill type detection with confidence scoring |
| `src/rules/index.ts` | Rule registry, tier definitions, runner |
| `src/rules/frontmatter.ts` | Core: name + description field validation |
| `src/rules/description.ts` | Core: trigger keyword quality, length, patterns |
| `src/rules/file-size.ts` | Core: 500-line limit check |
| `src/rules/gotchas.ts` | Recommended: Gotchas section existence |
| `src/rules/allowed-tools.ts` | Recommended: tool restriction check vs skill type |
| `src/rules/structure.ts` | Recommended: supporting file decomposition |
| `src/rules/conflicts.ts` | Recommended: trigger keyword overlap between skills |
| `src/rules/usage-hooks.ts` | Experimental: skill usage logging hook check |
| `src/prescriber.ts` | Generate type-aware prescriptions from diagnostics |
| `src/reporter.ts` | Format results as text, JSON, or markdown |
| `src/monitor/frames.ts` | EtCO2/ECG waveform frame data (arrays of strings) |
| `src/monitor/waveform.ts` | Waveform animation renderer (frame cycling logic) |
| `src/monitor/tui.ts` | Patient monitor TUI using blessed |
| `src/index.ts` | CLI entry point, commander setup, pipeline orchestration |
| `package.json` | Dependencies, bin field, npm metadata |
| `tsconfig.json` | TypeScript config |
| `tsup.config.ts` | Bundle config for single-file output |

---

## Chunk 1: Project Bootstrap + Types + Scanner

### Task 1: Initialize project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`

- [ ] **Step 1: Initialize npm project**

```bash
cd ~/Projects/pulser
pnpm init
```

Edit `package.json` to:
```json
{
  "name": "pulser",
  "version": "0.1.0",
  "description": "Diagnose and fix your Claude Code skills — based on Anthropic's internal principles",
  "type": "module",
  "bin": {
    "pulser": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "lint": "tsc --noEmit"
  },
  "keywords": ["claude-code", "skills", "lint", "cli", "anthropic"],
  "author": "whynowlab",
  "license": "MIT"
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd ~/Projects/pulser
pnpm add commander gray-matter chalk boxen blessed
pnpm add -D typescript @types/node @types/blessed tsup
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create tsup.config.ts**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  noExternal: [/(.*)/],
  splitting: false,
});
```

- [ ] **Step 5: Create directory structure**

```bash
mkdir -p src/rules src/monitor
```

- [ ] **Step 6: Init git and commit**

```bash
cd ~/Projects/pulser
git init
echo "node_modules/\ndist/\n.env" > .gitignore
git add package.json tsconfig.json tsup.config.ts .gitignore pnpm-lock.yaml
git commit -m "chore: init pulser project"
```

---

### Task 2: Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create all shared types**

```typescript
// src/types.ts

export type Severity = "error" | "warning" | "info";
export type RuleTier = "core" | "recommended" | "experimental";
export type SkillType = "analysis" | "research" | "generation" | "execution" | "reference";
export type OutputFormat = "text" | "json" | "md";

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  "allowed-tools"?: string;
  "disable-model-invocation"?: boolean;
  "user-invocable"?: boolean;
  context?: string;
  agent?: string;
  model?: string;
  "argument-hint"?: string;
  hooks?: unknown;
}

export interface ParsedSkill {
  /** Directory name (e.g., "reasoning-tracer") */
  dirName: string;
  /** Absolute path to SKILL.md */
  filePath: string;
  /** Absolute path to skill directory */
  dirPath: string;
  /** Parsed YAML frontmatter */
  frontmatter: SkillFrontmatter;
  /** Markdown content (without frontmatter) */
  content: string;
  /** Total line count of SKILL.md */
  lineCount: number;
  /** List of other files in the skill directory */
  supportingFiles: string[];
}

export interface SkillClassification {
  primary: SkillType;
  confidence: number;
  signals: string[];
  mixed?: SkillType[];
}

export interface Diagnostic {
  rule: string;
  tier: RuleTier;
  severity: Severity;
  message: string;
  detail?: string;
}

export interface Prescription {
  rule: string;
  skillName: string;
  title: string;
  why: string;
  suggestion: string;
  autoFixable: boolean;
  confidence?: number;
}

export interface SkillReport {
  skill: ParsedSkill;
  classification: SkillClassification;
  diagnostics: Diagnostic[];
  prescriptions: Prescription[];
  healthy: boolean;
}

export interface ScanResult {
  path: string;
  skills: SkillReport[];
  systemDiagnostics: Diagnostic[];
  systemPrescriptions: Prescription[];
  summary: {
    total: number;
    healthy: number;
    warnings: number;
    errors: number;
    score: number;
  };
}

export interface Rule {
  name: string;
  tier: RuleTier;
  run(skill: ParsedSkill, classification: SkillClassification): Diagnostic[];
}

export interface SystemRule {
  name: string;
  tier: RuleTier;
  run(skills: ParsedSkill[], settingsPath: string): Diagnostic[];
}

export interface CLIOptions {
  path: string;
  skill?: string;
  format: OutputFormat;
  noAnim: boolean;
  strict: boolean;
  all: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types for pulser"
```

---

### Task 3: Scanner

**Files:**
- Create: `src/scanner.ts`

- [ ] **Step 1: Implement scanner**

```typescript
// src/scanner.ts

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, resolve, basename } from "path";
import matter from "gray-matter";
import type { ParsedSkill, SkillFrontmatter } from "./types.js";

function expandHome(p: string): string {
  if (p.startsWith("~")) {
    return join(process.env.HOME || "", p.slice(1));
  }
  return p;
}

export function scanSkills(skillsDir: string, singleSkill?: string): ParsedSkill[] {
  const resolved = resolve(expandHome(skillsDir));

  if (!existsSync(resolved)) {
    return [];
  }

  const dirs = singleSkill
    ? [singleSkill]
    : readdirSync(resolved).filter((d) => {
        const fullPath = join(resolved, d);
        return statSync(fullPath).isDirectory() && existsSync(join(fullPath, "SKILL.md"));
      });

  return dirs
    .map((dirName) => {
      const dirPath = join(resolved, dirName);
      const filePath = join(dirPath, "SKILL.md");

      if (!existsSync(filePath)) return null;

      const raw = readFileSync(filePath, "utf-8");
      const { data, content } = matter(raw);
      const lineCount = raw.split("\n").length;

      const supportingFiles = readdirSync(dirPath)
        .filter((f) => f !== "SKILL.md")
        .flatMap((f) => {
          const fp = join(dirPath, f);
          if (statSync(fp).isDirectory()) {
            return readdirSync(fp).map((sf) => join(f, sf));
          }
          return [f];
        });

      return {
        dirName,
        filePath,
        dirPath,
        frontmatter: data as SkillFrontmatter,
        content,
        lineCount,
        supportingFiles,
      } satisfies ParsedSkill;
    })
    .filter((s): s is ParsedSkill => s !== null);
}
```

- [ ] **Step 2: Verify scanner works**

```bash
cd ~/Projects/pulser
npx tsx src/scanner.ts 2>/dev/null || echo "OK - not standalone"
```

- [ ] **Step 3: Commit**

```bash
git add src/scanner.ts
git commit -m "feat: add skill scanner with frontmatter parsing"
```

---

## Chunk 2: Classifier + Rules

### Task 4: Classifier

**Files:**
- Create: `src/classifier.ts`

- [ ] **Step 1: Implement multi-signal classifier**

```typescript
// src/classifier.ts

import type { ParsedSkill, SkillClassification, SkillType } from "./types.js";

interface Signal {
  type: SkillType;
  weight: number;
  reason: string;
}

export function classifySkill(skill: ParsedSkill): SkillClassification {
  const signals: Signal[] = [];
  const fm = skill.frontmatter;
  const tools = fm["allowed-tools"] || "";

  // High-weight signals
  if (fm.context === "fork") {
    if (tools.includes("WebSearch") || tools.includes("WebFetch")) {
      signals.push({ type: "research", weight: 0.9, reason: "context:fork + web tools" });
    } else {
      signals.push({ type: "analysis", weight: 0.8, reason: "context:fork + read tools" });
    }
  }

  if (fm["disable-model-invocation"] === true) {
    signals.push({ type: "execution", weight: 0.8, reason: "disable-model-invocation:true" });
  }

  if (fm["user-invocable"] === false) {
    signals.push({ type: "reference", weight: 0.8, reason: "user-invocable:false" });
  }

  // Medium-weight signals
  if (tools.includes("WebSearch") || tools.includes("WebFetch")) {
    signals.push({ type: "research", weight: 0.6, reason: "WebSearch/WebFetch in allowed-tools" });
  }

  if (tools.includes("Bash")) {
    signals.push({ type: "execution", weight: 0.5, reason: "Bash in allowed-tools" });
  }

  if (tools && !tools.includes("Bash") && !tools.includes("Write") && !tools.includes("Edit")) {
    signals.push({ type: "analysis", weight: 0.5, reason: "read-only tools" });
  }

  // Low-weight signals from content
  const content = skill.content.toLowerCase();
  if (content.includes("generate") || content.includes("create") || content.includes("produce")) {
    signals.push({ type: "generation", weight: 0.3, reason: "generation keywords in content" });
  }

  if (content.includes("analyze") || content.includes("review") || content.includes("inspect")) {
    signals.push({ type: "analysis", weight: 0.3, reason: "analysis keywords in content" });
  }

  // No signals → default to generation
  if (signals.length === 0) {
    return {
      primary: "generation",
      confidence: 0.3,
      signals: ["no clear signals — defaulting to generation"],
    };
  }

  // Aggregate scores per type
  const scores = new Map<SkillType, number>();
  const reasons = new Map<SkillType, string[]>();

  for (const s of signals) {
    scores.set(s.type, (scores.get(s.type) || 0) + s.weight);
    const r = reasons.get(s.type) || [];
    r.push(s.reason);
    reasons.set(s.type, r);
  }

  // Sort by score descending
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [primaryType, primaryScore] = sorted[0];
  const totalWeight = [...scores.values()].reduce((a, b) => a + b, 0);
  const confidence = Math.min(primaryScore / totalWeight, 1.0);

  // Detect mixed types
  const mixed = sorted
    .slice(1)
    .filter(([, score]) => score / totalWeight > 0.25)
    .map(([type]) => type);

  return {
    primary: primaryType,
    confidence: Number(confidence.toFixed(2)),
    signals: reasons.get(primaryType) || [],
    ...(mixed.length > 0 ? { mixed } : {}),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/classifier.ts
git commit -m "feat: add multi-signal skill classifier"
```

---

### Task 5: Rules — Core tier

**Files:**
- Create: `src/rules/frontmatter.ts`, `src/rules/description.ts`, `src/rules/file-size.ts`

- [ ] **Step 1: Implement frontmatter rule**

```typescript
// src/rules/frontmatter.ts

import type { Rule, Diagnostic, ParsedSkill, SkillClassification } from "../types.js";

export const frontmatterRule: Rule = {
  name: "frontmatter",
  tier: "core",
  run(skill: ParsedSkill, _classification: SkillClassification): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const fm = skill.frontmatter;

    if (!fm.name && !skill.dirName) {
      diagnostics.push({
        rule: "frontmatter",
        tier: "core",
        severity: "error",
        message: "Missing `name` field in frontmatter",
        detail: "Add `name: " + skill.dirName + "` to your SKILL.md frontmatter",
      });
    }

    if (!fm.description) {
      diagnostics.push({
        rule: "frontmatter",
        tier: "core",
        severity: "error",
        message: "Missing `description` field in frontmatter",
        detail: "Claude uses description to decide when to invoke your skill. Without it, your skill will never be auto-triggered.",
      });
    }

    return diagnostics;
  },
};
```

- [ ] **Step 2: Implement description rule**

```typescript
// src/rules/description.ts

import type { Rule, Diagnostic, ParsedSkill, SkillClassification } from "../types.js";

const TRIGGER_PATTERNS = [
  /use when/i,
  /triggers? on/i,
  /use for/i,
  /invoke when/i,
  /activate when/i,
];

export const descriptionRule: Rule = {
  name: "description",
  tier: "core",
  run(skill: ParsedSkill, _classification: SkillClassification): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const desc = skill.frontmatter.description || "";

    if (!desc) return []; // frontmatter rule handles missing description

    if (desc.length < 100) {
      diagnostics.push({
        rule: "description",
        tier: "core",
        severity: "warning",
        message: `Description too short (${desc.length} chars, recommend 100-500)`,
        detail: "Short descriptions give Claude insufficient context to decide when to use your skill.",
      });
    }

    if (desc.length > 500) {
      diagnostics.push({
        rule: "description",
        tier: "core",
        severity: "info",
        message: `Description is long (${desc.length} chars). Consider trimming to under 500.`,
        detail: "Skill descriptions consume context budget. Keep them focused on trigger conditions.",
      });
    }

    const hasTriggerPattern = TRIGGER_PATTERNS.some((p) => p.test(desc));
    if (!hasTriggerPattern) {
      diagnostics.push({
        rule: "description",
        tier: "core",
        severity: "warning",
        message: 'No trigger pattern found (e.g., "Use when...", "Triggers on...")',
        detail: "Descriptions should tell Claude WHEN to use this skill, not just WHAT it does. Add phrases like 'Use when...' or 'Triggers on...'",
      });
    }

    // Check for trigger keywords (quoted strings or comma-separated words after "Triggers on")
    const keywordMatch = desc.match(/[Tt]riggers?\s+on\s+[""](.+?)[""]/);
    if (!keywordMatch && !desc.includes('"') && !desc.includes('"')) {
      diagnostics.push({
        rule: "description",
        tier: "core",
        severity: "info",
        message: "No explicit trigger keywords found in quotes",
        detail: 'Adding quoted trigger keywords helps Claude match user intent. Example: Triggers on "리서치", "research", "조사해줘"',
      });
    }

    return diagnostics;
  },
};
```

- [ ] **Step 3: Implement file-size rule**

```typescript
// src/rules/file-size.ts

import type { Rule, Diagnostic, ParsedSkill, SkillClassification } from "../types.js";

export const fileSizeRule: Rule = {
  name: "file-size",
  tier: "core",
  run(skill: ParsedSkill, _classification: SkillClassification): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (skill.lineCount > 500) {
      diagnostics.push({
        rule: "file-size",
        tier: "core",
        severity: "error",
        message: `SKILL.md is ${skill.lineCount} lines (limit: 500)`,
        detail: "Anthropic recommends keeping SKILL.md under 500 lines. Move detailed reference material to supporting files.",
      });
    } else if (skill.lineCount > 400) {
      diagnostics.push({
        rule: "file-size",
        tier: "core",
        severity: "warning",
        message: `SKILL.md is ${skill.lineCount} lines (approaching 500 limit)`,
        detail: "Consider splitting reference material into separate files before hitting the limit.",
      });
    }

    return diagnostics;
  },
};
```

- [ ] **Step 4: Commit**

```bash
git add src/rules/frontmatter.ts src/rules/description.ts src/rules/file-size.ts
git commit -m "feat: add core rules (frontmatter, description, file-size)"
```

---

### Task 6: Rules — Recommended tier

**Files:**
- Create: `src/rules/gotchas.ts`, `src/rules/allowed-tools.ts`, `src/rules/structure.ts`, `src/rules/conflicts.ts`

- [ ] **Step 1: Implement gotchas rule**

```typescript
// src/rules/gotchas.ts

import type { Rule, Diagnostic, ParsedSkill, SkillClassification } from "../types.js";

export const gotchasRule: Rule = {
  name: "gotchas",
  tier: "recommended",
  run(skill: ParsedSkill, _classification: SkillClassification): Diagnostic[] {
    const hasGotchas = /^##\s+Gotchas/m.test(skill.content);

    if (!hasGotchas) {
      return [{
        rule: "gotchas",
        tier: "recommended",
        severity: "warning",
        message: "No Gotchas section found",
        detail: "Anthropic's #1 ROI improvement: document common failure patterns so the model doesn't repeat them. Add a '## Gotchas' section with numbered items.",
      }];
    }

    // Check if gotchas section has content
    const gotchasMatch = skill.content.match(/^##\s+Gotchas\s*\n([\s\S]*?)(?=^##\s|\Z)/m);
    if (gotchasMatch) {
      const gotchasContent = gotchasMatch[1].trim();
      const hasNumberedItems = /^\d+\.\s/m.test(gotchasContent);
      if (!hasNumberedItems) {
        return [{
          rule: "gotchas",
          tier: "recommended",
          severity: "warning",
          message: "Gotchas section exists but has no numbered items",
          detail: "Add at least one numbered gotcha item: '1. Don't do X because Y'",
        }];
      }
    }

    return [];
  },
};
```

- [ ] **Step 2: Implement allowed-tools rule**

```typescript
// src/rules/allowed-tools.ts

import type { Rule, Diagnostic, ParsedSkill, SkillClassification } from "../types.js";

export const allowedToolsRule: Rule = {
  name: "allowed-tools",
  tier: "recommended",
  run(skill: ParsedSkill, classification: SkillClassification): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const tools = skill.frontmatter["allowed-tools"];

    if (!tools) {
      diagnostics.push({
        rule: "allowed-tools",
        tier: "recommended",
        severity: "warning",
        message: "No `allowed-tools` set — skill has unrestricted tool access",
        detail: "Restricting tools prevents accidental file modifications. Recommended for analysis/research skills.",
      });
      return diagnostics;
    }

    // Type-specific checks
    const { primary, confidence } = classification;

    if (confidence < 0.5) {
      return diagnostics; // Don't make type-dependent judgments with low confidence
    }

    if ((primary === "analysis" || primary === "research") && tools.includes("Bash")) {
      diagnostics.push({
        rule: "allowed-tools",
        tier: "recommended",
        severity: "warning",
        message: `Bash in allowed-tools for ${primary} skill (unnecessary write access)`,
        detail: `${primary} skills typically only need read access. Consider removing Bash to prevent accidental modifications.`,
      });
    }

    if (primary === "analysis" && (tools.includes("Write") || tools.includes("Edit"))) {
      diagnostics.push({
        rule: "allowed-tools",
        tier: "recommended",
        severity: "warning",
        message: "Write/Edit in allowed-tools for analysis skill",
        detail: "Analysis skills should be read-only. Remove Write and Edit access.",
      });
    }

    return diagnostics;
  },
};
```

- [ ] **Step 3: Implement structure rule**

```typescript
// src/rules/structure.ts

import type { Rule, Diagnostic, ParsedSkill, SkillClassification } from "../types.js";

export const structureRule: Rule = {
  name: "structure",
  tier: "recommended",
  run(skill: ParsedSkill, _classification: SkillClassification): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (skill.lineCount > 200 && skill.supportingFiles.length === 0) {
      diagnostics.push({
        rule: "structure",
        tier: "recommended",
        severity: "warning",
        message: `${skill.lineCount} lines in a single file with no supporting files`,
        detail: "Consider splitting reference material into separate files (references/, examples/, scripts/). Keep SKILL.md focused on core instructions.",
      });
    }

    return diagnostics;
  },
};
```

- [ ] **Step 4: Implement conflicts rule (system-level)**

```typescript
// src/rules/conflicts.ts

import type { SystemRule, Diagnostic, ParsedSkill } from "../types.js";

function extractKeywords(description: string): string[] {
  const keywords: string[] = [];

  // Extract quoted strings
  const quotedMatches = description.match(/[""\u201C\u201D]([^""\u201C\u201D]+)[""\u201C\u201D]/g);
  if (quotedMatches) {
    for (const m of quotedMatches) {
      keywords.push(m.replace(/[""\u201C\u201D]/g, "").trim().toLowerCase());
    }
  }

  return keywords;
}

export const conflictsRule: SystemRule = {
  name: "conflicts",
  tier: "recommended",
  run(skills: ParsedSkill[], _settingsPath: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const keywordMap = new Map<string, string[]>();

    for (const skill of skills) {
      const desc = skill.frontmatter.description || "";
      const keywords = extractKeywords(desc);
      for (const kw of keywords) {
        const existing = keywordMap.get(kw) || [];
        existing.push(skill.dirName);
        keywordMap.set(kw, existing);
      }
    }

    for (const [keyword, skillNames] of keywordMap) {
      if (skillNames.length > 1) {
        diagnostics.push({
          rule: "conflicts",
          tier: "recommended",
          severity: "warning",
          message: `Trigger keyword "${keyword}" shared by: ${skillNames.join(", ")}`,
          detail: "Overlapping trigger keywords cause Claude to invoke the wrong skill. Make descriptions more specific or differentiate keywords.",
        });
      }
    }

    return diagnostics;
  },
};
```

- [ ] **Step 5: Commit**

```bash
git add src/rules/gotchas.ts src/rules/allowed-tools.ts src/rules/structure.ts src/rules/conflicts.ts
git commit -m "feat: add recommended rules (gotchas, allowed-tools, structure, conflicts)"
```

---

### Task 7: Rules — Experimental + Registry

**Files:**
- Create: `src/rules/usage-hooks.ts`, `src/rules/index.ts`

- [ ] **Step 1: Implement usage-hooks rule**

```typescript
// src/rules/usage-hooks.ts

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { SystemRule, Diagnostic, ParsedSkill } from "../types.js";

export const usageHooksRule: SystemRule = {
  name: "usage-hooks",
  tier: "experimental",
  run(_skills: ParsedSkill[], settingsPath: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    try {
      if (!existsSync(settingsPath)) {
        diagnostics.push({
          rule: "usage-hooks",
          tier: "experimental",
          severity: "info",
          message: "No settings.json found — skill usage logging not configured",
          detail: "Install a PreToolUse hook to track which skills are used and which are ignored. Run: npx pulser --install-hooks",
        });
        return diagnostics;
      }

      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      const hooks = settings.hooks?.PreToolUse || [];
      const hasSkillHook = Array.isArray(hooks)
        ? hooks.some((h: any) => {
            const cmd = typeof h === "string" ? h : h.command || "";
            return cmd.includes("Skill") || cmd.includes("skill-usage");
          })
        : false;

      if (!hasSkillHook) {
        diagnostics.push({
          rule: "usage-hooks",
          tier: "experimental",
          severity: "info",
          message: "No skill usage logging hook found in settings.json",
          detail: "Without usage tracking, you can't tell if a skill is unused because its description is wrong or because it's not needed.",
        });
      }
    } catch {
      // Settings file parse error — skip
    }

    return diagnostics;
  },
};
```

- [ ] **Step 2: Implement rule registry**

```typescript
// src/rules/index.ts

import type { Rule, SystemRule, RuleTier } from "../types.js";
import { frontmatterRule } from "./frontmatter.js";
import { descriptionRule } from "./description.js";
import { fileSizeRule } from "./file-size.js";
import { gotchasRule } from "./gotchas.js";
import { allowedToolsRule } from "./allowed-tools.js";
import { structureRule } from "./structure.js";
import { conflictsRule } from "./conflicts.js";
import { usageHooksRule } from "./usage-hooks.js";

export const SKILL_RULES: Rule[] = [
  // Core
  frontmatterRule,
  descriptionRule,
  fileSizeRule,
  // Recommended
  gotchasRule,
  allowedToolsRule,
  structureRule,
];

export const SYSTEM_RULES: SystemRule[] = [
  conflictsRule,
  usageHooksRule,
];

export function getActiveRules(includeExperimental: boolean): {
  skillRules: Rule[];
  systemRules: SystemRule[];
} {
  const filterTier = (tier: RuleTier) =>
    tier === "core" || tier === "recommended" || (tier === "experimental" && includeExperimental);

  return {
    skillRules: SKILL_RULES.filter((r) => filterTier(r.tier)),
    systemRules: SYSTEM_RULES.filter((r) => filterTier(r.tier)),
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/rules/usage-hooks.ts src/rules/index.ts
git commit -m "feat: add usage-hooks rule and rule registry"
```

---

## Chunk 3: Prescriber + Reporter

### Task 8: Prescriber

**Files:**
- Create: `src/prescriber.ts`

- [ ] **Step 1: Implement prescription generator**

```typescript
// src/prescriber.ts

import type { Diagnostic, ParsedSkill, SkillClassification, Prescription, SkillType } from "./types.js";

const RECOMMENDED_TOOLS: Record<SkillType, string> = {
  analysis: "Read, Grep, Glob, Agent",
  research: "WebSearch, WebFetch, Read, Grep, Glob, Agent",
  generation: "Read, Grep, Glob",
  execution: "Read, Grep, Glob, Bash, Write, Edit, Agent",
  reference: "Read, Grep, Glob",
};

const GOTCHAS_TEMPLATES: Record<SkillType, string[]> = {
  analysis: [
    "Do not modify files — this skill is read-only",
    "Check git status before analyzing to ensure you're looking at current code",
    "Keep output under 3000 lines — summarize, don't dump",
  ],
  research: [
    "If WebFetch fails on JS-rendered sites (Threads, Instagram), use alternative browser-based approaches",
    "Always cross-verify claims with 2+ independent sources",
    "Label unverified claims explicitly — never present assumptions as findings",
  ],
  generation: [
    "Do not confuse with brainstorming — this skill generates specific outputs, not design explorations",
    "Validate generated output against existing project conventions before presenting",
    "If output exceeds expected size, check scope — you may be over-generating",
  ],
  execution: [
    "Always confirm destructive operations with the user before executing",
    "Check exit codes — don't assume commands succeeded",
    "Log what was changed so it can be rolled back",
  ],
  reference: [
    "This skill provides context, not actions — do not execute tasks based on its content alone",
    "Update when the underlying system changes — stale reference is worse than none",
    "Keep it focused — if it covers too many topics, split into multiple skills",
  ],
};

export function generatePrescriptions(
  skill: ParsedSkill,
  classification: SkillClassification,
  diagnostics: Diagnostic[]
): Prescription[] {
  const prescriptions: Prescription[] = [];
  const { primary, confidence } = classification;

  for (const d of diagnostics) {
    switch (d.rule) {
      case "gotchas": {
        const templateItems = GOTCHAS_TEMPLATES[primary] || GOTCHAS_TEMPLATES.generation;
        const suggestion = confidence >= 0.5
          ? `## Gotchas\n\n${templateItems.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
          : `## Gotchas\n\n1. [TODO: Add common failure patterns for this skill]`;

        prescriptions.push({
          rule: "gotchas",
          skillName: skill.dirName,
          title: "Add Gotchas section",
          why: "Anthropic's highest-ROI improvement: documenting failure patterns prevents the model from repeating the same mistakes.",
          suggestion,
          autoFixable: true,
          confidence,
        });
        break;
      }

      case "allowed-tools": {
        if (!skill.frontmatter["allowed-tools"]) {
          prescriptions.push({
            rule: "allowed-tools",
            skillName: skill.dirName,
            title: "Set allowed-tools restriction",
            why: `${primary} skills should have restricted tool access to prevent accidental modifications.`,
            suggestion: `allowed-tools: ${RECOMMENDED_TOOLS[primary]}`,
            autoFixable: true,
            confidence,
          });
        } else if (d.message.includes("Bash")) {
          const current = skill.frontmatter["allowed-tools"] || "";
          const fixed = current
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t !== "Bash")
            .join(", ");
          prescriptions.push({
            rule: "allowed-tools",
            skillName: skill.dirName,
            title: "Remove Bash from allowed-tools",
            why: `${primary} skills should not have shell access — they only need to read and analyze.`,
            suggestion: `allowed-tools: ${fixed}`,
            autoFixable: true,
            confidence,
          });
        }
        break;
      }

      case "frontmatter": {
        if (d.message.includes("name")) {
          prescriptions.push({
            rule: "frontmatter",
            skillName: skill.dirName,
            title: "Add name field",
            why: "The name field is used for the /slash-command. Without it, the directory name is used.",
            suggestion: `name: ${skill.dirName}`,
            autoFixable: true,
          });
        }
        if (d.message.includes("description")) {
          prescriptions.push({
            rule: "frontmatter",
            skillName: skill.dirName,
            title: "Add description field",
            why: "Without a description, Claude cannot auto-discover this skill. It will only work via manual /invoke.",
            suggestion: 'description: [TODO: Describe what this skill does and when to use it. Include trigger keywords like "Use when..." or "Triggers on..."]',
            autoFixable: false, // Content needs human input
          });
        }
        break;
      }

      case "description": {
        prescriptions.push({
          rule: "description",
          skillName: skill.dirName,
          title: d.message,
          why: "Description quality directly affects whether Claude triggers the right skill at the right time.",
          suggestion: d.detail || "",
          autoFixable: false, // Semantic changes need human judgment
        });
        break;
      }

      case "file-size": {
        prescriptions.push({
          rule: "file-size",
          skillName: skill.dirName,
          title: d.message,
          why: "Large skills consume context and are harder for Claude to process. Split reference material into supporting files.",
          suggestion: "Move detailed examples to examples/, API references to references/, and utility scripts to scripts/",
          autoFixable: false,
        });
        break;
      }

      case "structure": {
        prescriptions.push({
          rule: "structure",
          skillName: skill.dirName,
          title: "Split into supporting files",
          why: "Single-file skills over 200 lines are harder to maintain. Claude can load supporting files on demand.",
          suggestion: "Create subdirectories: references/ (API docs), examples/ (sample outputs), scripts/ (utility code)",
          autoFixable: false,
        });
        break;
      }
    }
  }

  return prescriptions;
}

export function generateSystemPrescriptions(diagnostics: Diagnostic[]): Prescription[] {
  return diagnostics.map((d) => ({
    rule: d.rule,
    skillName: "SYSTEM",
    title: d.message,
    why: d.detail || "",
    suggestion: d.rule === "usage-hooks"
      ? "Run: npx pulser --install-hooks"
      : "Make skill descriptions more specific to avoid keyword overlap",
    autoFixable: d.rule === "usage-hooks",
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/prescriber.ts
git commit -m "feat: add type-aware prescription generator"
```

---

### Task 9: Reporter

**Files:**
- Create: `src/reporter.ts`

- [ ] **Step 1: Implement text/json/md reporter**

```typescript
// src/reporter.ts

import chalk from "chalk";
import boxen from "boxen";
import type { ScanResult, SkillReport, OutputFormat } from "./types.js";

function severityIcon(severity: string): string {
  switch (severity) {
    case "error": return chalk.red("✗");
    case "warning": return chalk.yellow("⚠");
    case "info": return chalk.blue("ℹ");
    default: return " ";
  }
}

function ruleLabel(rule: string): string {
  return chalk.dim(rule.toUpperCase().padEnd(12));
}

function renderSkillCard(report: SkillReport): string {
  const { skill, classification, diagnostics, healthy } = report;
  const typeLabel = classification.confidence >= 0.5
    ? chalk.dim(` ${classification.primary} (${Math.round(classification.confidence * 100)}%)`)
    : chalk.dim(` uncertain`);

  const header = healthy
    ? chalk.green(`  ${skill.dirName}`) + typeLabel + chalk.green("  ✓")
    : chalk.white(`  ${skill.dirName}`) + typeLabel;

  if (healthy) {
    return boxen(header + "\n" + chalk.green("  ✓ All rules passed"), {
      padding: { top: 0, bottom: 0, left: 0, right: 1 },
      borderColor: "green",
      borderStyle: "round",
      dimBorder: true,
    });
  }

  const lines = diagnostics.map((d) =>
    `  ${severityIcon(d.severity)} ${ruleLabel(d.rule)} ${d.message}`
  );

  return boxen(header + "\n" + lines.join("\n"), {
    padding: { top: 0, bottom: 0, left: 0, right: 1 },
    borderColor: diagnostics.some((d) => d.severity === "error") ? "red" : "yellow",
    borderStyle: "round",
    dimBorder: true,
  });
}

function renderPrescriptions(result: ScanResult): string {
  const allRx = [
    ...result.skills.flatMap((s) => s.prescriptions),
    ...result.systemPrescriptions,
  ];

  if (allRx.length === 0) return "";

  const lines = allRx.map((rx, i) => {
    const badge = rx.autoFixable ? chalk.green("AUTO") : chalk.dim("MANUAL");
    return [
      "",
      chalk.yellow(`  💊 Rx #${i + 1} — ${rx.skillName}`),
      chalk.dim(`  [${ rx.rule.toUpperCase()}] `) + rx.title,
      "",
      chalk.dim("    Why: ") + rx.why,
      "",
      chalk.dim("    Suggestion:"),
      ...rx.suggestion.split("\n").map((l) => chalk.cyan(`    ${l}`)),
      "",
      chalk.dim(`    Fix type: `) + badge,
      ...(rx.confidence !== undefined ? [chalk.dim(`    Classification confidence: ${Math.round(rx.confidence * 100)}%`)] : []),
    ].join("\n");
  });

  return "\n" + chalk.yellow("  PRESCRIPTIONS") + "\n" + lines.join("\n" + chalk.dim("  ─".repeat(30)) + "\n");
}

export function reportText(result: ScanResult): string {
  const parts: string[] = [];

  // Skill cards
  for (const report of result.skills) {
    parts.push(renderSkillCard(report));
  }

  // System diagnostics
  if (result.systemDiagnostics.length > 0) {
    const sysLines = result.systemDiagnostics.map(
      (d) => `  ${severityIcon(d.severity)} ${ruleLabel(d.rule)} ${d.message}`
    );
    parts.push(boxen(chalk.white("  SYSTEM") + "\n" + sysLines.join("\n"), {
      padding: { top: 0, bottom: 0, left: 0, right: 1 },
      borderColor: "cyan",
      borderStyle: "round",
      dimBorder: true,
    }));
  }

  // Summary
  const s = result.summary;
  parts.push("");
  parts.push(`  ${s.total} skills scanned`);
  parts.push(
    `  ${chalk.green(`✓ ${s.healthy} healthy`)}  ` +
    `${chalk.yellow(`⚠ ${s.warnings} warnings`)}  ` +
    `${chalk.red(`✗ ${s.errors} errors`)}`
  );
  parts.push(`  Score: ${s.score >= 80 ? chalk.green(s.score) : s.score >= 50 ? chalk.yellow(s.score) : chalk.red(s.score)}/100`);

  // Prescriptions
  parts.push(renderPrescriptions(result));

  return parts.join("\n");
}

export function reportJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

export function reportMarkdown(result: ScanResult): string {
  const lines: string[] = [
    "# Pulser Diagnostic Report",
    "",
    `**Scanned:** ${result.summary.total} skills`,
    `**Score:** ${result.summary.score}/100`,
    `**Healthy:** ${result.summary.healthy} | **Warnings:** ${result.summary.warnings} | **Errors:** ${result.summary.errors}`,
    "",
    "## Skills",
    "",
  ];

  for (const report of result.skills) {
    const status = report.healthy ? "✓" : "⚠";
    lines.push(`### ${status} ${report.skill.dirName} (${report.classification.primary}, ${Math.round(report.classification.confidence * 100)}%)`);
    lines.push("");

    if (report.healthy) {
      lines.push("All rules passed.");
    } else {
      for (const d of report.diagnostics) {
        lines.push(`- **${d.severity.toUpperCase()}** [${d.rule}]: ${d.message}`);
      }
    }
    lines.push("");
  }

  if (result.systemDiagnostics.length > 0) {
    lines.push("## System");
    lines.push("");
    for (const d of result.systemDiagnostics) {
      lines.push(`- **${d.severity.toUpperCase()}** [${d.rule}]: ${d.message}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function report(result: ScanResult, format: OutputFormat): string {
  switch (format) {
    case "json": return reportJson(result);
    case "md": return reportMarkdown(result);
    default: return reportText(result);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/reporter.ts
git commit -m "feat: add multi-format reporter (text, json, markdown)"
```

---

## Chunk 4: TUI Monitor + CLI Entry

### Task 10: Patient Monitor TUI

**Files:**
- Create: `src/monitor/frames.ts`, `src/monitor/waveform.ts`, `src/monitor/tui.ts`

This task will be dispatched to the **web-design team** for the actual animation implementation. The plan provides the interface and data contracts.

- [ ] **Step 1: Create waveform frame data**

`src/monitor/frames.ts` — EtCO2-style waveform patterns as string arrays. Each frame is a single line of characters representing the waveform at a point in time.

- [ ] **Step 2: Create waveform renderer**

`src/monitor/waveform.ts` — Takes frame data, cycles through frames at configurable speed, outputs ANSI-colored strings.

- [ ] **Step 3: Create TUI layout**

`src/monitor/tui.ts` — Uses blessed to create full-screen black background with 4 waveform channels (SKILLS, RULES, COVERAGE, FIXES), right-side number displays, color-coded values. Exports `startMonitor(onComplete)` and `updateMetrics(data)` functions.

- [ ] **Step 4: Commit**

```bash
git add src/monitor/
git commit -m "feat: add patient monitor TUI with EtCO2 animation"
```

---

### Task 11: CLI Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement CLI with commander**

```typescript
// src/index.ts

import { Command } from "commander";
import { join } from "path";
import { scanSkills } from "./scanner.js";
import { classifySkill } from "./classifier.js";
import { getActiveRules } from "./rules/index.js";
import { generatePrescriptions, generateSystemPrescriptions } from "./prescriber.js";
import { report } from "./reporter.js";
import type { CLIOptions, ScanResult, SkillReport } from "./types.js";

const DEFAULT_SKILLS_PATH = "~/.claude/skills";
const DEFAULT_SETTINGS_PATH = "~/.claude/settings.json";

function expandHome(p: string): string {
  if (p.startsWith("~")) {
    return join(process.env.HOME || "", p.slice(1));
  }
  return p;
}

function calculateScore(reports: SkillReport[]): number {
  if (reports.length === 0) return 100;

  const totalRules = reports.length * 8; // 8 rules per skill
  let passed = 0;

  for (const r of reports) {
    const errors = r.diagnostics.filter((d) => d.severity === "error").length;
    const warnings = r.diagnostics.filter((d) => d.severity === "warning").length;
    passed += 8 - errors - warnings * 0.5;
  }

  return Math.round((passed / totalRules) * 100);
}

async function run(options: CLIOptions) {
  const { skillRules, systemRules } = getActiveRules(options.all);

  // Phase 1: Scan
  const skills = scanSkills(options.path, options.skill);

  if (skills.length === 0) {
    console.log("\n  No skills found at " + options.path);
    console.log("  Make sure SKILL.md files exist in subdirectories.\n");
    process.exit(1);
  }

  // Phase 2+3: Diagnose + Classify
  const reports: SkillReport[] = skills.map((skill) => {
    const classification = classifySkill(skill);
    const diagnostics = skillRules.flatMap((rule) => rule.run(skill, classification));
    const prescriptions = generatePrescriptions(skill, classification, diagnostics);
    const healthy = diagnostics.filter((d) => d.severity === "error" || d.severity === "warning").length === 0;

    return { skill, classification, diagnostics, prescriptions, healthy };
  });

  // System-level rules
  const systemDiagnostics = systemRules.flatMap((rule) =>
    rule.run(skills, expandHome(DEFAULT_SETTINGS_PATH))
  );
  const systemPrescriptions = generateSystemPrescriptions(systemDiagnostics);

  // Phase 4: Report
  const result: ScanResult = {
    path: options.path,
    skills: reports,
    systemDiagnostics,
    systemPrescriptions,
    summary: {
      total: reports.length,
      healthy: reports.filter((r) => r.healthy).length,
      warnings: reports.flatMap((r) => r.diagnostics).filter((d) => d.severity === "warning").length,
      errors: reports.flatMap((r) => r.diagnostics).filter((d) => d.severity === "error").length,
      score: calculateScore(reports),
    },
  };

  // Output header (text mode only)
  if (options.format === "text" && !options.noAnim) {
    console.log("");
    console.log("  _╭─╮_╭─╮_╭─╮_______");
    console.log("       pulser v0.1.0");
    console.log("  Diagnose your Claude Code skills");
    console.log("");
  }

  console.log(report(result, options.format));

  // Exit code
  if (result.summary.errors > 0) process.exit(1);
  if (options.strict && result.summary.warnings > 0) process.exit(2);
}

const program = new Command();

program
  .name("pulser")
  .description("Diagnose and fix your Claude Code skills")
  .version("0.1.0")
  .argument("[path]", "Path to skills directory", DEFAULT_SKILLS_PATH)
  .option("--skill <name>", "Scan a single skill by name")
  .option("--format <type>", "Output format: text, json, md", "text")
  .option("--no-anim", "Disable TUI animation")
  .option("--strict", "Treat warnings as errors")
  .option("--all", "Include experimental rules")
  .action((path, opts) => {
    run({
      path: path || DEFAULT_SKILLS_PATH,
      skill: opts.skill,
      format: opts.format as any,
      noAnim: opts.noAnim === false ? true : !opts.anim,
      strict: opts.strict || false,
      all: opts.all || false,
    });
  });

program.parse();
```

- [ ] **Step 2: Build and test**

```bash
cd ~/Projects/pulser
pnpm build
node dist/index.js ~/.claude/skills/
```

- [ ] **Step 3: Test with --format json**

```bash
node dist/index.js ~/.claude/skills/ --format json | head -30
```

- [ ] **Step 4: Test with --skill flag**

```bash
node dist/index.js ~/.claude/skills/ --skill reasoning-tracer
```

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: add CLI entry point with commander"
```

---

### Task 12: Build verification + smoke test

- [ ] **Step 1: Full build**

```bash
cd ~/Projects/pulser && pnpm build
```

- [ ] **Step 2: Run against real skills**

```bash
node dist/index.js ~/.claude/skills/
```

Expected: diagnostic report with skill cards, prescriptions, score.

- [ ] **Step 3: Run JSON format**

```bash
node dist/index.js --format json ~/.claude/skills/ | python3 -m json.tool | head -50
```

Expected: valid JSON output.

- [ ] **Step 4: Run single skill**

```bash
node dist/index.js --skill cross-verified-research ~/.claude/skills/
```

Expected: only cross-verified-research results.

- [ ] **Step 5: Final commit**

```bash
cd ~/Projects/pulser
git add -A
git commit -m "chore: phase 1 MVP complete — scan, diagnose, classify, prescribe, report"
```

---

### Task 13: Dispatch web-design team for TUI

After tasks 1-12 are complete, dispatch `web-design` team to implement the patient-monitor TUI animation in `src/monitor/`. Provide:
- Interface contracts from `types.ts`
- Color scheme from spec (green/yellow/red/cyan on black)
- Reference image: hospital EtCO2 monitor
- Required exports: `startMonitor()`, `updateMetrics()`, `stopMonitor()`
- Must work in standard terminal (80+ cols), degrade gracefully

---

## Summary

| Chunk | Tasks | What it delivers |
|-------|-------|------------------|
| 1: Bootstrap + Scanner | T1-T3 | Project setup, types, SKILL.md parser |
| 2: Classifier + Rules | T4-T7 | Multi-signal classifier, 8 diagnostic rules |
| 3: Prescriber + Reporter | T8-T9 | Prescription generator, text/json/md output |
| 4: TUI + CLI | T10-T13 | Patient monitor animation, CLI entry, smoke test |
