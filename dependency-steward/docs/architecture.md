# Architecture Overview

Dependency Steward is split into three runtime surfaces:

- The web app is a read-heavy operator console.
- The API is the control plane for repository onboarding, policy changes, and run visibility.
- The worker is the execution plane for scans, coverage analysis, upgrades, and test backfill orchestration.

The shared packages encode the product rules that need to stay stable across services:

- `@dependency-steward/shared`: domain types and DTOs.
- `@dependency-steward/policy-engine`: deterministic routing decisions.
- `@dependency-steward/dependency-intelligence`: package inventory, advisories, and release metadata.
- `@dependency-steward/coverage-intelligence`: coverage parsing and threshold evaluation.
- `@dependency-steward/agent-core`: orchestration state machine and run plans.
- `@dependency-steward/prompt-kit`: GPT-5.4 adapter and structured prompting.
- `@dependency-steward/github`: GitHub App integration and PR helpers.
- `@dependency-steward/sandbox`: constrained workspace execution.
- `@dependency-steward/queue`: BullMQ contracts and helpers.
- `@dependency-steward/db`: Prisma schema and persistence helpers.