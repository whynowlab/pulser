import { Command } from "commander";
import { join } from "path";
import { scanSkills } from "./scanner.js";
import { classifySkill } from "./classifier.js";
import { getActiveRules } from "./rules/index.js";
import { generatePrescriptions, generateSystemPrescriptions } from "./prescriber.js";
import { report } from "./reporter.js";
import chalk from "chalk";
import { PatientMonitor } from "./monitor/tui.js";
import { previewFixes, applyFixes } from "./fixer.js";
import { restoreBackup, listBackups } from "./backup.js";
import type { CLIOptions, ScanResult, SkillReport, OutputFormat } from "./types.js";

const VALID_FORMATS: OutputFormat[] = ["text", "json", "md"];

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

  const { skillRules } = getActiveRules(false);
  const rulesPerSkill = skillRules.length;
  const totalRules = reports.length * rulesPerSkill;
  let passed = 0;

  for (const r of reports) {
    const errors = r.diagnostics.filter((d) => d.severity === "error").length;
    const warnings = r.diagnostics.filter((d) => d.severity === "warning").length;
    passed += Math.max(0, rulesPerSkill - errors - warnings * 0.5);
  }

  return Math.max(0, Math.min(100, Math.round((passed / totalRules) * 100)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(options: CLIOptions) {
  const { skillRules, systemRules } = getActiveRules(options.all);
  const useMonitor = options.format === "text" && !options.noAnim && process.stdout.isTTY;

  let monitor: PatientMonitor | undefined;

  if (useMonitor) {
    monitor = new PatientMonitor();
    monitor.start();
    await sleep(800); // Let animation play briefly
  }

  // Phase 1: Scan
  const skills = scanSkills(options.path, options.skill);

  if (skills.length === 0) {
    if (monitor) {
      monitor.stopFlatline();
    } else {
      console.log("\n  No skills found at " + expandHome(options.path));
      console.log("  Make sure SKILL.md files exist in subdirectories.\n");
    }
    process.exit(1);
  }

  if (monitor) {
    monitor.update({
      skillsTotal: skills.length,
      skillsScanned: 0,
      passCount: 0,
      warnCount: 0,
      failCount: 0,
      score: 0,
      rxCount: 0,
      phase: "scanning",
    });
    await sleep(500);
  }

  // Phase 2+3: Diagnose + Classify
  const reports: SkillReport[] = [];
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    const classification = classifySkill(skill);
    const diagnostics = skillRules.flatMap((rule) => rule.run(skill, classification));
    const prescriptions = generatePrescriptions(skill, classification, diagnostics);
    const healthy = diagnostics.filter((d) => d.severity === "error" || d.severity === "warning").length === 0;

    if (healthy) passCount++;
    warnCount += diagnostics.filter((d) => d.severity === "warning").length;
    failCount += diagnostics.filter((d) => d.severity === "error").length;

    reports.push({ skill, classification, diagnostics, prescriptions, healthy });

    if (monitor) {
      monitor.update({
        skillsTotal: skills.length,
        skillsScanned: i + 1,
        passCount,
        warnCount,
        failCount,
        score: calculateScore(reports),
        rxCount: reports.flatMap((r) => r.prescriptions).length,
        phase: "diagnosing",
      });
      await sleep(100); // Brief pause per skill for animation effect
    }
  }

  // System-level rules
  const systemDiagnostics = systemRules.flatMap((rule) =>
    rule.run(skills, expandHome(DEFAULT_SETTINGS_PATH))
  );
  const systemPrescriptions = generateSystemPrescriptions(systemDiagnostics);

  const result: ScanResult = {
    path: options.path,
    skills: reports,
    systemDiagnostics,
    systemPrescriptions,
    summary: {
      total: reports.length,
      healthy: reports.filter((r) => r.healthy).length,
      warnings: warnCount,
      errors: failCount,
      score: calculateScore(reports),
    },
  };

  // Stop monitor, then print report
  if (monitor) {
    monitor.stop({
      skillsTotal: skills.length,
      skillsScanned: skills.length,
      passCount,
      warnCount,
      failCount,
      score: result.summary.score,
      rxCount: reports.flatMap((r) => r.prescriptions).length + systemPrescriptions.length,
      phase: "complete",
    });
    await sleep(300);
  }

  // Print report
  if (options.format === "text" && !useMonitor) {
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

  // Phase 6: --fix auto-apply
  if (options.fix && options.format === "text") {
    const allRx = [
      ...reports.flatMap((r) => r.prescriptions),
      ...systemPrescriptions,
    ];

    const { fixable, manual } = previewFixes(allRx, skills);

    if (fixable.length > 0) {
      console.log("");
      console.log(chalk.yellow(`  ${fixable.length} auto-fixable prescriptions found.`));
      console.log(chalk.dim("  Applying fixes with backup..."));
      console.log("");

      const results = applyFixes(fixable, skills, expandHome(options.path));
      const applied = results.filter((r) => r.applied);

      for (const r of results) {
        const icon = r.applied ? chalk.green("\u2713") : chalk.red("\u2717");
        console.log(`  ${icon} ${r.skillName} [${r.rule}]`);
        if (r.diff && r.diff !== "no change") {
          for (const line of r.diff.split("\n")) {
            if (line.startsWith("+")) {
              console.log(chalk.green(`      ${line}`));
            } else if (line.startsWith("-")) {
              console.log(chalk.red(`      ${line}`));
            }
          }
        }
      }

      console.log("");
      console.log(`  ${chalk.green(`${applied.length} fixes applied`)}. Run ${chalk.cyan("npx pulser undo")} to rollback.`);
    }

    if (manual.length > 0) {
      console.log("");
      console.log(chalk.dim(`  ${manual.length} prescriptions require manual changes (see report above).`));
    }
  }

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
  .addHelpText("after", "\nFormats: text (default), json (CI), md (reports)")
  .option("--no-anim", "Disable TUI animation")
  .option("--detail", "Show full diagnostic report (default: summary only)")
  .option("--fix", "Auto-apply structural fixes (with backup)")
  .option("--strict", "Treat warnings as errors")
  .option("--all", "Include experimental rules")
  .action((path, opts) => {
    const fmt = opts.format as OutputFormat;
    if (!VALID_FORMATS.includes(fmt)) {
      console.error(`  Error: invalid format "${fmt}". Use: text, json, md`);
      process.exit(1);
    }
    run({
      path: path || DEFAULT_SKILLS_PATH,
      skill: opts.skill,
      format: fmt,
      noAnim: !opts.anim,
      strict: opts.strict || false,
      all: opts.all || false,
      fix: opts.fix || false,
      detail: opts.detail || !!opts.skill,
    });
  });

program
  .command("undo [timestamp]")
  .description("Rollback the last --fix operation")
  .option("--list", "Show all available backups")
  .action((timestamp, opts) => {
    if (opts.list) {
      const backups = listBackups();
      if (backups.length === 0) {
        console.log("\n  No backups found.\n");
        return;
      }
      console.log("\n  Available backups:\n");
      for (const b of backups) {
        console.log(`  ${chalk.cyan(b.timestamp)}  (${b.files.length} files)`);
        for (const f of b.files) {
          console.log(chalk.dim(`    ${f.skillName}/SKILL.md`));
        }
      }
      console.log("");
      return;
    }

    const result = restoreBackup(timestamp);
    if (!result) {
      console.log("\n  No backup found to restore.\n");
      process.exit(1);
    }
    console.log(`\n  ${chalk.green(`Restored ${result.restored} files`)} from backup ${chalk.cyan(result.timestamp)}\n`);
  });

program.parse();
