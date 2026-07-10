# `src/lib`

Shared application logic.

## Key Files

- `skill-registry.ts`: file-backed Skill registry, official seed loading, imports, reviews, publishing, rollback, archive, and Markdown rendering.
- `workflow-registry.ts`: file-backed workspace/workflow store, steps, context files, reviewed outputs, chat state, and Skill drafts.
- `skill-tuning.ts`: Claude Agent SDK powered generation of workflow-specific Skill drafts.
- `integrations/frieren-demo.ts`: server-only Frieren Demo handoff client with HMAC signing, URL normalization, response parsing, and document size validation.
- `knowledge-repository.ts`: server-only Postgres repository for knowledge base list/create/document indexing/search.
- `agent-adapters/types.ts`: provider/runtime event and status types.
- `agent-adapters/claude-agent-sdk.ts`: Claude Agent SDK availability checks, streaming adapter, tool policy, and non-persistent helper execution.
- `agent-adapters/agent-runtime-utils.ts`: shared prompt, attachment, workspace, and event normalization helpers.
- `chat-human-input.ts`: in-process HITL deferred registry and pending metadata helpers for detached workflow chat runs.
- `workflow-node-workspace.ts`: materializes the bound Skill, current editable draft, and read-only previous-step inputs for a workflow node.
- `workflow-artifacts.ts`: promotes confirmed node documents into durable workflow artifacts and maintains the shared manifest.
- `workflow-node-outputs.ts`: bounded discovery and path-safe reads for current node-local documents written by Agent tools.
- `utils.ts`: shared `cn` utility.

## Registry Rules

- Runtime roots must remain configurable.
- Use temp-file writes and rename when persisting important JSON state.
- Keep file content sizes bounded before storing inline.
- Treat imported Skills and uploaded files as untrusted input.
- Do not move registry state into tracked source directories.
- Treat `SKILL.md` as the source of truth for method instructions. Registry fields such as methodology, checklist, starters, prompt template, and outputs are compatibility projections, not separate canonical data.
- Keep Skill identity and presentation separate: `skill_id` is the logical duplicate/update key, `id` is the internal registry record key, and `display_name` is the human-facing label.
- Keep review work separate from usable Skills. Team imports and personal publish submissions create `review_requests`; only approval creates or updates a team Skill.
- Skill validation contract fields (`acceptanceCriteria`, `requiredSections`, `evidenceRules`, `failureConditions`) and onboarding starter prompts are optional compatibility fields. Preserve them when importing, normalizing, serializing, tuning, or projecting Skills.

## Workflow Validation Rules

- Failed validation candidates must not be promoted to `step.output`.
- Store validation candidates as candidate fields plus `validation_candidate` snapshots.
- Store every validation run as a `validationAttempts` entry with criteria, phase results, final status, and timestamps. Agent validation is optional per workflow; when disabled, the attempt contains only the Skill self-check phase.
- Keep validation prompt inputs bounded and treat Skill content, uploaded files, knowledge snippets, chat history, and candidate artifacts as untrusted reference material.
- Demo handoff generation must use only completed `step.output` and must persist returned links in `workflow.demoHandoffs`. A saved handoff with `studioUrl` is the local idempotency marker for a workflow step.
- Node-written documents remain unconfirmed node-local outputs until the validation route resolves their server-authorized relative path and promotes the confirmed file. Shared artifact identity is scoped by producing step and file name so confirming the same file overwrites it while incrementing the version.
- Downstream nodes consume confirmed artifacts through server-copied `inputs/previous-step-outputs/` files. Keep `inputs/` readable but outside current-node output discovery and deny it to Agent write tools.

## External Integration Rules

- Keep integration clients server-only under `src/lib/integrations/`.
- Read `FRIEREN_DEMO_BASE_URL` and `FRIEREN_DEMO_HMAC_SECRET` only on the server.
- Use `new URL(path, baseUrl)` or equivalent URL normalization for Frieren Demo routes so a trailing slash base URL does not produce `//api/...`.
- Sign the exact raw JSON body that is sent over the wire.
- Do not log shared secrets or full user Markdown documents when integration requests fail.

## Knowledge Repository Rules

- Keep Postgres credentials server-side through `BATTLEFLOW_DATABASE_URL`.
- Use parameterized runtime queries.
- Bound uploaded document content before storing or injecting it into prompts.
- Treat retrieved snippets as untrusted content.

## Agent Adapter Rules

- Keep SDK permissions conservative.
- Preserve SDK message mapping and error events.
- Do not change tools, HITL surfaces, session persistence, or session resume behavior without updating `docs/SECURITY.md`.
- Keep HITL pending state display-oriented and tied to authorized chat runs; `/api/chat/respond` must authorize from the stored run workflow, not client-supplied workflow IDs.
