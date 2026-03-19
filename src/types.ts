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
  dirName: string;
  filePath: string;
  dirPath: string;
  frontmatter: SkillFrontmatter;
  content: string;
  lineCount: number;
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
  fix: boolean;
  detail: boolean;
}
