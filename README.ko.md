# pulser

<p align="center">
  <img src="docs/banner.svg" alt="pulser — Diagnose. Prescribe. Fix." width="100%">
</p>

<p align="center">
  <a href="https://github.com/TheStack-ai/pulser/actions/workflows/ci.yml"><img src="https://github.com/TheStack-ai/pulser/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/pulser-cli"><img src="https://img.shields.io/npm/v/pulser-cli?color=10b981" alt="npm"></a>
  <a href="https://www.npmjs.com/package/pulser-cli"><img src="https://img.shields.io/npm/dm/pulser-cli?color=06b6d4" alt="downloads"></a>
  <a href="https://github.com/TheStack-ai/pulser/blob/main/LICENSE"><img src="https://img.shields.io/github/license/TheStack-ai/pulser" alt="license"></a>
  <a href="https://github.com/TheStack-ai/pulser"><img src="https://img.shields.io/github/stars/TheStack-ai/pulser?style=social" alt="stars"></a>
  <a href="https://github.com/rohitg00/awesome-claude-code-toolkit"><img src="https://awesome.re/mentioned-badge.svg" alt="Mentioned in Awesome Claude Code Toolkit"></a>
  <br>
  <a href="./README.md">English</a>
</p>

'스킬 점검해줘' 한 마디. Claude Code 대화 안에서 진단, 분류, 처방, 수정까지 끝납니다.

```
$ pulser

  pulser v0.4.0

  54 skills scanned · Score: 89/100
  ✓ 48 healthy  ⚠ 4 warnings  ✗ 2 errors

  Top issues:
    cardnews    — No Gotchas, no allowed-tools
    geo-audit   — 338 lines, single file

  💊 Rx #1 — cardnews
  [GOTCHAS] Add Gotchas section
    Why: Anthropic's highest-ROI improvement
    Template:
      ## Gotchas
      1. Validate output against conventions
      2. Check scope — don't over-generate

  Fix type: AUTO
```

## 뭘 하는 도구인가요

pulser는 SKILL.md 파일을 Anthropic이 공개한 ["Building Claude Code: How We Use Skills"](https://code.claude.com/docs/en/skills) 원칙 기반 8가지 규칙으로 진단합니다.

| 규칙 | 검사 내용 |
|------|----------|
| `frontmatter` | name, description 필드 존재 여부 |
| `description` | 트리거 키워드, "Use when" 패턴, 길이 |
| `file-size` | SKILL.md 500줄 이하 |
| `gotchas` | Gotchas 섹션과 실패 패턴 |
| `allowed-tools` | 스킬 유형에 맞는 도구 제한 |
| `structure` | 대형 스킬의 보조 파일 분리 |
| `conflicts` | 스킬 간 트리거 키워드 충돌 |
| `usage-hooks` | 스킬 사용 로깅 훅 설치 여부 |

각 스킬은 유형별(분석, 리서치, 생성, 실행, 레퍼런스)로 자동 분류되고, 처방은 유형에 맞게 제공됩니다.

## 설치

```bash
npm install -g pulser-cli
```

설치하면 Claude Code 스킬로 자동 등록됩니다. "스킬 점검해줘" 또는 `/pulser`로 바로 실행할 수 있습니다.

## 사용법

### Claude Code 대화에서

그냥 말하면 됩니다:

```
스킬 점검해줘
```

슬래시 명령도 됩니다:

```
/pulser
```

Claude가 진단 결과를 요약하고, 문제를 수정할지 물어봅니다. 대화 안에서 전부 끝납니다.

### 터미널에서

```bash
# 기본 경로 스캔 (~/.claude/skills/)
pulser

# 특정 디렉토리 스캔
pulser ./my-skills/

# 단일 스킬 스캔
pulser --skill reasoning-tracer

# 자동 수정 (백업 포함)
pulser --fix

# 마지막 수정 롤백
pulser undo

# JSON 출력 (CI/자동화용)
pulser --format json

# 마크다운 리포트
pulser --format md

# 경고를 에러로 처리
pulser --strict

# TUI 애니메이션 끄기
pulser --no-anim
```

## Eval — 스킬 테스트

v0.4.0 신규: 스킬을 실제 입력으로 테스트합니다.

```bash
pulser eval
```

`SKILL.md` 옆에 `eval.yaml`을 작성하세요:

```yaml
tests:
  - name: "버그 감지"
    input: "Review: function add(a,b) { return a - b }"
    assert:
      - contains: "subtract"
      - min-length: 30
```

pulser가 `claude -p`로 각 테스트를 실행하고, assertion을 체크하고, 회귀를 자동 추적합니다.

```
$ pulser eval

  reviewer (2 tests)
    ✓ 버그 감지            320ms
    ✓ 정상 코드 통과        280ms

  2 passed · 0 failed · 0.6s
```

지원 assertions: `contains`, `not-contains`, `min-length`, `max-length`, `matches` (정규식).

### 종료 코드 (eval)

| 코드 | 의미 |
|------|------|
| `0` | 전체 통과 |
| `1` | 실패 있음 |
| `3` | 회귀 감지 (이전에 통과하던 테스트가 실패) |

## 핵심 파이프라인

1. 진단 — 8가지 규칙으로 문제를 찾고 분류
2. 처방 — 왜 문제인지 설명하고, 바로 쓸 수 있는 템플릿 제시
3. 수정 — 안전한 구조 수정을 자동 적용 (전체 백업)
4. 테스트 — 실제 입력으로 스킬을 실행하고, 회귀 추적
5. 롤백 — 언제든 이전 상태로 되돌리는 안전망

## 종료 코드

| 코드 | 의미 |
|------|------|
| `0` | 모든 규칙 통과 |
| `1` | 에러 발견 |
| `2` | 경고 발견 (`--strict` 사용 시) |

## 환자 모니터 TUI

TTY 터미널에서 실행하면 병원 환자 모니터 스타일의 실시간 파형 애니메이션이 표시됩니다:

- 녹색 ECG — 스킬 스캔 진행
- 녹색 카프노그래피 — pass/warn/fail 카운트
- 시안 맥박산소측정 — 건강 점수
- 노란 호흡 — 처방 수

`--no-anim` 또는 파이프 출력으로 비활성화.

## 라이선스

MIT — [TheStack-ai](https://github.com/TheStack-ai)
