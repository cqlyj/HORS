# HORS documentation

HORS separates the public explanation, implementation guide, demo runbook, and
protocol reference so each audience can go as deep as it needs.

| Document | Audience | Contents |
| --- | --- | --- |
| [Architecture and rationale](ARCHITECTURE.md) | Reviewers, protocol designers, security engineers | The missing layer, threat model, CORS analogy, protocol roles, alternatives, and trust boundaries |
| [SDK guide](SDK.md) | MCP service and agent developers | Package map, policy model, server/client APIs, assurance, 0G execution, discovery, registry, and errors |
| [Call Home runbook](../examples/call-home/README.md) | Demo operator | End-to-end setup, live ENS discovery, World QR flows, 0G execution, and token transfer |
| [Selfie Check testing](SELFIE_TESTING.md) | World reviewers | Risk signal, exact flow, integration feedback, observed evidence, and user-experience findings |
| [Identity Check testing](IDENTITY_TESTING.md) | World reviewers | Higher-risk identity step-up, data minimization, integration feedback, and final live-test protocol |
| [Technical specification](../draft/SPEC.md) | Implementers | Wire authorization, policy representation, contracts, Storage, errors, and protocol details |
| [Agent skill](../skills/use-hors-cli/SKILL.md) | AI agents and operators | Safe CLI procedure with explicit human handoff for registration and assurance |

Start with the [root README](../README.md) for the shortest complete explanation.
