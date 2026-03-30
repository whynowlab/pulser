# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.4.x   | :white_check_mark: |
| < 0.4   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in pulser, please report it responsibly:

1. **Do not** open a public issue
2. Email **security@whynowlab.com** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. You will receive a response within 48 hours
4. A fix will be prioritized and released as a patch version

## Scope

pulser runs locally and processes SKILL.md files. Security concerns include:
- Path traversal in file scanning
- Arbitrary code execution via malformed skill files
- Dependency supply chain risks

Thank you for helping keep pulser safe.
