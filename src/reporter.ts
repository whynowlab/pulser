import chalk from "chalk";
import boxen from "boxen";
import type { ScanResult, SkillReport, OutputFormat } from "./types.js";

function severityIcon(severity: string): string {
  switch (severity) {
    case "error": return chalk.red("\u2717");
    case "warning": return chalk.yellow("\u26A0");
    case "info": return chalk.blue("\u2139");
    default: return " ";
  }
}

function ruleLabel(rule: string): string {
  return chalk.dim(rule.toUpperCase().padEnd(14));
}

function renderSkillCard(report: SkillReport): string {
  const { skill, classification, diagnostics, healthy } = report;
  const confPct = Math.round(classification.confidence * 100);
  const typeLabel = classification.confidence >= 0.5
    ? chalk.dim(` ${classification.primary} (${confPct}%)`)
    : chalk.dim(` uncertain`);

  const header = healthy
    ? chalk.green(`  ${skill.dirName}`) + typeLabel + chalk.green("  \u2713")
    : chalk.white(`  ${skill.dirName}`) + typeLabel;

  if (healthy) {
    return boxen(header + "\n" + chalk.green("  \u2713 All rules passed"), {
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
    const parts = [
      "",
      chalk.yellow(`  \uD83D\uDC8A Rx #${i + 1} \u2014 ${rx.skillName}`),
      chalk.dim(`  [${rx.rule.toUpperCase()}] `) + rx.title,
      "",
      chalk.dim("    Why: ") + rx.why,
      "",
      chalk.dim("    Suggestion:"),
      ...rx.suggestion.split("\n").map((l) => chalk.cyan(`    ${l}`)),
      "",
      chalk.dim("    Fix type: ") + badge,
    ];
    if (rx.confidence !== undefined) {
      parts.push(chalk.dim(`    Classification confidence: ${Math.round(rx.confidence * 100)}%`));
    }
    return parts.join("\n");
  });

  return "\n" + chalk.yellow("  PRESCRIPTIONS") + "\n" + lines.join("\n" + chalk.dim("  " + "\u2500".repeat(40)) + "\n");
}

export function reportText(result: ScanResult): string {
  const parts: string[] = [];

  for (const report of result.skills) {
    parts.push(renderSkillCard(report));
  }

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

  const s = result.summary;
  parts.push("");
  parts.push(`  ${s.total} skills scanned`);
  parts.push(
    `  ${chalk.green(`\u2713 ${s.healthy} healthy`)}  ` +
    `${chalk.yellow(`\u26A0 ${s.warnings} warnings`)}  ` +
    `${chalk.red(`\u2717 ${s.errors} errors`)}`
  );
  const scoreColor = s.score >= 80 ? chalk.green : s.score >= 50 ? chalk.yellow : chalk.red;
  parts.push(`  Score: ${scoreColor(String(s.score))}/100`);

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
    const status = report.healthy ? "\u2713" : "\u26A0";
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

  return lines.join("\n");
}

export function report(result: ScanResult, format: OutputFormat): string {
  switch (format) {
    case "json": return reportJson(result);
    case "md": return reportMarkdown(result);
    default: return reportText(result);
  }
}
