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
    "If WebFetch fails on JS-rendered sites, use alternative browser-based approaches",
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
          why: "Anthropic's highest-ROI improvement: documenting failure patterns prevents repeated mistakes.",
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
            why: "The name field is used for the /slash-command.",
            suggestion: `name: ${skill.dirName}`,
            autoFixable: true,
          });
        }
        if (d.message.includes("description")) {
          prescriptions.push({
            rule: "frontmatter",
            skillName: skill.dirName,
            title: "Add description field",
            why: "Without a description, Claude cannot auto-discover this skill.",
            suggestion: "description: [TODO: Describe what this skill does and when to use it]",
            autoFixable: false,
          });
        }
        break;
      }

      case "description": {
        prescriptions.push({
          rule: "description",
          skillName: skill.dirName,
          title: d.message,
          why: "Description quality directly affects whether Claude triggers the right skill.",
          suggestion: d.detail || "",
          autoFixable: false,
        });
        break;
      }

      case "file-size": {
        prescriptions.push({
          rule: "file-size",
          skillName: skill.dirName,
          title: d.message,
          why: "Large skills consume context. Split reference material into supporting files.",
          suggestion: "Move examples to examples/, API references to references/, scripts to scripts/",
          autoFixable: false,
        });
        break;
      }

      case "structure": {
        prescriptions.push({
          rule: "structure",
          skillName: skill.dirName,
          title: "Split into supporting files",
          why: "Single-file skills over 200 lines are harder to maintain. Claude loads supporting files on demand.",
          suggestion: "Create: references/ (docs), examples/ (sample outputs), scripts/ (utilities)",
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
