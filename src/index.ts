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

  const rulesPerSkill = 6; // 6 per-skill rules
  const totalRules = reports.length * rulesPerSkill;
  let passed = 0;

  for (const r of reports) {
    const errors = r.diagnostics.filter((d) => d.severity === "error").length;
    const warnings = r.diagnostics.filter((d) => d.severity === "warning").length;
    passed += rulesPerSkill - errors - warnings * 0.5;
  }

  return Math.max(0, Math.min(100, Math.round((passed / totalRules) * 100)));
}

function run(options: CLIOptions) {
  const { skillRules, systemRules } = getActiveRules(options.all);

  // Phase 1: Scan
  const skills = scanSkills(options.path, options.skill);

  if (skills.length === 0) {
    console.log("\n  No skills found at " + expandHome(options.path));
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
  if (options.format === "text") {
    console.log("");
    console.log("  _\u256D\u2500\u256E_\u256D\u2500\u256E_\u256D\u2500\u256E_______");
    console.log("       pulser v0.1.0");
    console.log("  Diagnose your Claude Code skills");
    console.log("");
    console.log(`  Scanning ${expandHome(options.path)} ...`);
    console.log(`  Found ${skills.length} skills`);
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
      format: opts.format,
      noAnim: !opts.anim,
      strict: opts.strict || false,
      all: opts.all || false,
    });
  });

program.parse();
