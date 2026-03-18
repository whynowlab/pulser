# Pulser — Design Spec

## Overview
CLI tool that diagnoses and fixes Claude Code skills based on Anthropic's published principles.

**Name:** pulser
**Tagline:** "Take your skill's pulse."
**npm:** `pulser`
**GitHub:** `whynowlab/pulser`
**License:** MIT

## Problem
Anthropic published 7 principles for building effective Claude Code skills, but no tool exists to check whether your skills follow them. Users create skills by trial-and-error with no feedback loop.

## Solution
A CLI tool that scans SKILL.md files, diagnoses issues against 8 rules derived from Anthropic's principles, classifies skill types, generates prescriptions with concrete fix suggestions, and optionally auto-applies structural fixes with full backup/rollback safety.

## Tech Stack
- **Language:** TypeScript
- **Runtime:** Node.js 20+
- **CLI:** commander.js
- **Terminal UI:** blessed-contrib or ink (for patient-monitor animation)
- **Parsing:** gray-matter (YAML frontmatter)
- **Output:** chalk (colors), boxen (cards)
- **Build:** tsup (bundle to single executable)
- **Publish:** npm

## CLI Flow

```
Phase 1: SCAN      — Find SKILL.md files, parse frontmatter + content
Phase 2: DIAGNOSE  — Run 8 rules, score each skill
Phase 3: CLASSIFY  — Auto-detect skill type (with confidence score)
Phase 4: REPORT    — Patient-monitor style diagnostic report
Phase 5: PRESCRIBE — Type-aware prescriptions (structural only for auto-fix)
Phase 6: PROMPT    — User chooses: auto-apply / save report / exit
```

## Commands

```bash
npx pulser                        # Scan default path (~/.claude/skills/)
npx pulser ./path/to/skills       # Custom path
npx pulser --skill reasoning-tracer  # Single skill
npx pulser --fix                  # Diagnose + auto-apply structural fixes
npx pulser --fix --install-hooks  # + install usage logging hook
npx pulser --format json          # JSON output (CI integration)
npx pulser --format md            # Markdown report
npx pulser --no-anim              # Disable animation (non-TTY)
npx pulser --strict               # Warnings become errors
npx pulser undo                   # Rollback last --fix
```

## 8 Rules

### Tier: Core (always run)

| Rule | What it checks | Severity |
|------|---------------|----------|
| `frontmatter` | name + description fields present | error if missing |
| `description` | Trigger keywords, "Use when" pattern, length 100-500 chars | warning/error |
| `file-size` | SKILL.md under 500 lines (Anthropic recommendation) | warning |

### Tier: Recommended (default on)

| Rule | What it checks | Severity |
|------|---------------|----------|
| `gotchas` | `## Gotchas` section exists with 1+ items | warning |
| `allowed-tools` | `allowed-tools` set in frontmatter, appropriate for skill type | warning/error |
| `structure` | Supporting files exist for skills over 200 lines | warning |
| `conflicts` | No trigger keyword overlap between skills | warning |

### Tier: Experimental (opt-in via --all)

| Rule | What it checks | Severity |
|------|---------------|----------|
| `usage-hooks` | System-level skill usage logging hook installed | info |

### Rule details

**frontmatter**
- `name` present and valid (lowercase, hyphens, max 64 chars)
- `description` present and non-empty
- Error if either missing

**description**
- Has trigger keywords (explicit phrases that match user intent)
- Contains "Use when" or "Triggers on" pattern
- Length between 100-500 characters
- Warning if under 100, info if over 500

**file-size**
- SKILL.md line count
- Warning at 400+ lines ("approaching limit")
- Error at 500+ lines ("split into supporting files")

**gotchas**
- `## Gotchas` heading exists
- At least 1 numbered item under it
- Warning if missing

**allowed-tools**
- `allowed-tools` field in frontmatter
- Cross-check against detected skill type:
  - analysis type + Bash → warning (unnecessary write access)
  - generation type + no restriction → warning
  - execution type + Bash → OK
- Error if completely absent

**structure**
- If SKILL.md > 200 lines AND skill directory contains only SKILL.md
- Warning: "Consider splitting reference material into supporting files"
- Check for presence of: references/, examples/, scripts/ subdirectories

**conflicts**
- Extract trigger keywords from all skill descriptions
- Detect overlapping keywords between 2+ skills
- Warning with specific overlap details

**usage-hooks**
- Check settings.json for PreToolUse hook that logs Skill tool calls
- Info-level only (not a skill quality issue)

## Skill Type Classification

### Signals (multi-signal, not single-label)

| Signal | Weight | Indicates |
|--------|--------|-----------|
| `context: fork` in frontmatter | High | Isolated execution (analysis/research) |
| `disable-model-invocation: true` | High | User-triggered execution |
| `user-invocable: false` | High | Background reference |
| WebSearch/WebFetch in allowed-tools | Medium | Research type |
| Bash in allowed-tools | Medium | Execution type |
| Read/Grep/Glob only | Medium | Analysis type |
| No allowed-tools + no fork | Low | Generation or reference |

### Classification output

```typescript
interface SkillClassification {
  primary: "analysis" | "research" | "generation" | "execution" | "reference";
  confidence: number; // 0.0 - 1.0
  signals: string[];  // which signals matched
  mixed?: string[];   // secondary types if confidence < 0.7
}
```

### Safety rules
- If confidence < 0.5 → show classification as "uncertain", block auto-fix for type-dependent rules
- If mixed types detected → show both, let user confirm before type-dependent fixes
- User override via `--type <type>` flag

## Prescriptions

### What can be auto-fixed (--fix)

Structural, deterministic changes only:

| Fix | Action |
|-----|--------|
| Missing `allowed-tools` | Insert recommended set based on type (with confidence check) |
| Bash in analysis skill | Remove Bash from allowed-tools line |
| Missing `## Gotchas` | Insert section skeleton: `## Gotchas\n\n1. [TODO: Add common failure patterns for this skill]` |
| Missing frontmatter fields | Add `name` (from directory name) or empty `description` |
| File over 500 lines | Suggest split points (before ## sections) — report only, no auto-split |

### What is suggestion-only (no auto-fix)

| Suggestion | Why not auto |
|------------|-------------|
| Gotchas content | Requires understanding of skill's failure modes — needs human or LLM |
| Description rewrite | Semantic optimization needs context |
| Trigger keyword additions | Risk of false triggers |
| File split execution | Needs human judgment on boundaries |

### Prescription output format

Each prescription includes:
- Rule that triggered it
- Before/after diff preview
- Why this matters (1-sentence explanation)
- Confidence level for type-dependent fixes

## Safety (--fix)

### Backup system
```
~/.pulser/
├── backups/
│   └── 2026-03-18T160000/
│       ├── manifest.json          # what was changed
│       ├── reasoning-tracer/
│       │   └── SKILL.md.bak      # original file
│       └── creativity-sampler/
│           └── SKILL.md.bak
└── config.json                    # settings
```

### Atomic writes
- Write to `.SKILL.md.tmp` first
- Validate YAML parse succeeds
- Rename to `SKILL.md` (atomic on POSIX)

### Rollback
```bash
npx pulser undo              # restore last backup
npx pulser undo --list       # show all backups
npx pulser undo <timestamp>  # restore specific backup
```

### Path security
- Resolve all paths with `fs.realpathSync`
- Verify resolved path starts with expected prefix
- Reject symlinks pointing outside skill directories

## Visual Design

### Patient Monitor TUI

Black background, colored waveforms, real-time animation during scan.
Inspired by bedside EtCO2/ECG monitors.

```
┌──────────────────────────────────────────────────────────┐
│ pulser v1.0                          2026-03-18 16:00  ⚡│
│──────────────────────────────────────────────────────────│
│                                                          │
│ SKILLS  ×1   Monitor                      HEALTH         │
│┃╶─╲_╱─╲_╱─╲_╱─╲_╱─╲_╱──────               6 / 6        │
│                                                          │
│──────────────────────────────────────────────────────────│
│                                                          │
│ RULES   8                             PASS  WARN  FAIL   │
│┃╶──╱╲___╱╲___╱╲___╱╲──────            32     8     2     │
│                                                          │
│──────────────────────────────────────────────────────────│
│                                                          │
│ COVERAGE %                                 SCORE         │
│┃╶─╱╲╱╲╱╲╱╲╱╲╱╲╱╲──────                    76            │
│                                                          │
│──────────────────────────────────────────────────────────│
│                                                          │
│ FIXES                                      Rx            │
│┃╶╱╲──╱╲──╱╲──╱╲──────                     4             │
│                                                          │
│──────────────────────────────────────────────────────────│
│ SK  PASS WARN FAIL SCORE  DATE       TIME                │
│  6    32    8    2    76   03-18  16:00:24                │
└──────────────────────────────────────────────────────────┘
```

### Color scheme
- Green: healthy metrics, passing rules, waveforms
- Yellow: warnings, prescriptions count
- Red: errors, failures
- Cyan: coverage/score waveform
- White: labels, text
- Background: black (#000)

### Animation behavior
- During scan: waveforms scroll left-to-right
- On completion: waveforms freeze, final numbers displayed
- On error: waveform becomes erratic (irregular peaks)
- No skills found: flatline
- `--no-anim`: static output, no TUI

### Implementation
- Use `blessed` or `ink` for full TUI control
- Custom waveform renderer with frame buffer
- Detect TTY — fall back to simple text output in pipes/CI

## Project Structure

```
pulser/
├── src/
│   ├── index.ts              # CLI entry (commander.js)
│   ├── scanner.ts            # Find + parse SKILL.md files
│   ├── classifier.ts         # Multi-signal skill type detection
│   ├── rules/
│   │   ├── index.ts          # Rule registry + tier system
│   │   ├── frontmatter.ts    # Core: required fields
│   │   ├── description.ts    # Core: trigger quality
│   │   ├── file-size.ts      # Core: 500 line limit
│   │   ├── gotchas.ts        # Recommended: section exists
│   │   ├── allowed-tools.ts  # Recommended: tool restriction
│   │   ├── structure.ts      # Recommended: file decomposition
│   │   ├── conflicts.ts      # Recommended: keyword overlap
│   │   └── usage-hooks.ts    # Experimental: logging hook
│   ├── prescriber.ts         # Generate type-aware prescriptions
│   ├── fixer.ts              # Apply fixes with backup/rollback
│   ├── backup.ts             # Backup/restore/undo system
│   ├── reporter.ts           # Format output (text/json/md)
│   ├── monitor/
│   │   ├── tui.ts            # Patient monitor TUI
│   │   ├── waveform.ts       # Waveform animation renderer
│   │   └── frames.ts         # EtCO2 waveform frame data
│   └── types.ts              # Shared types
├── templates/
│   ├── gotchas-skeleton.md   # Gotchas section template
│   └── skill-usage-hook.js   # PreToolUse hook for --install-hooks
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── README.md
└── LICENSE
```

## Phased Delivery

### Phase 1: MVP — Read-only (Week 1)
- Scan + Diagnose + Classify + Report
- Patient monitor TUI animation
- 8 rules (core + recommended)
- `--format json|md|text`
- `--skill`, `--no-anim`
- Exit codes: 0 (pass), 1 (errors), 2 (warnings in strict mode)
- npm publish as v0.1.0

### Phase 2: Auto-fix (Week 2)
- `--fix` with backup/undo system
- Atomic writes + path security
- Prescription generation (structural only)
- Diff preview before apply
- `pulser undo` rollback
- Confidence-gated type-dependent fixes
- npm publish as v0.5.0

### Phase 3: Launch (Week 3)
- `--install-hooks` (skill usage logging)
- README with demo GIF
- GitHub social preview
- Community launch (X, Reddit, Discord)
- Awesome Claude Code PR
- npm publish as v1.0.0

## Non-Goals (v1)
- No LLM-powered analysis (no API keys required)
- No CI/CD GitHub Action (future)
- No web dashboard (separate project: jarvis-dashboard)
- No plugin system for custom rules (future)
- No auto-generated gotchas content (needs LLM, future)

## Success Metrics
| Metric | Month 1 | Month 3 |
|--------|---------|---------|
| npm downloads/week | 100-300 | 500-1000 |
| GitHub stars | 50-100 | 200-400 |
| Issues/PRs | 5-10 | 15-30 |
