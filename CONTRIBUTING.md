# Contributing to pulser

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/TheStack-ai/pulser.git
cd pulser
pnpm install
pnpm dev    # watch mode
```

## Project Structure

```
src/
  index.ts        # CLI entry point
  scanner.ts      # SKILL.md file discovery
  classifier.ts   # Skill type classification
  prescriber.ts   # Issue-to-fix prescription engine
  fixer.ts        # Auto-fix with backup
  reporter.ts     # Output formatting (text/json/md)
  rules/          # 8 diagnostic rules
  eval/           # Skill testing framework
  monitor/        # TUI waveform animation
```

## Adding a New Rule

1. Create `src/rules/your-rule.ts` following the pattern in existing rules
2. Export a function matching the `RuleCheck` type from `src/types.ts`
3. Register it in `src/scanner.ts`
4. Add a test case if applicable

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Make your changes — keep PRs focused on a single concern
3. Run `pnpm lint` and `pnpm build` to verify
4. Open a PR with a clear description of what and why

## Code Style

- TypeScript strict mode
- No external runtime dependencies beyond what's in `package.json`
- Prefer explicit types over `any`

## Reporting Issues

Use the [bug report template](https://github.com/TheStack-ai/pulser/issues/new?template=bug_report.md) or [feature request template](https://github.com/TheStack-ai/pulser/issues/new?template=feature_request.md).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
