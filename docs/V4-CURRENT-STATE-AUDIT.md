# Akzo SDD PBI Builder: current-state audit before 4.0.0

Audited: the 3.1.0 implementation in this repository (`maintainer/src/core.js`, `ui.js`,
`shell.html`, `installer/*.ps1`, tests and fixtures), plus the 2.0/2.1 and 3.0.0 generators
frozen in `maintainer/fixtures/`. Statements below come from that code and its tests, not from
release notes. Date: 27 October 2026.

## 1. Architecture and capabilities (3.1.0)
- **Delivery.** One offline HTML form (`build.py` inlines `shell.html`, `core.js`, `ui.js`,
  `assets.json`) and a Windows PowerShell installer that renders the same files from
  `pbi-builder-bundle.json`. Both are generated from `core.js`; byte equality is tested.
- **Installed into a repository:**
  - one Copilot custom agent, `.github/agents/akzo-sdd-pbi-builder.agent.md`;
  - two prompts;
  - `playbook/pbi-builder/` with `config.json`, `sources.yaml`, `PBI-TEMPLATE.md`, `README.md`,
    the form, optional reference documents and an index;
  - three on-demand guides: `skills/execution-path-analysis.md`, `readiness-and-approval.md`
    and `repository-knowledge.md`. These are plain Markdown the agent reads; there is no plugin
    or SKILL.md discovery mechanism.
- **Install safety.** A SHA-256 manifest (`installed-files.json`). Plan states are create,
  unchanged, update, conflict, retire and retire-conflict. Every replaced file is backed up, a
  failed install rolls back, and uninstall keeps PBIs and knowledge.
- **Refinement.** This is done entirely by the agent following its instructions. The form only
  writes an intake (`REQUEST.md`, `pbi.json`, `START-PROMPT.txt`) or a refinement brief, and
  prepares a prompt to paste.
- **Deterministic readiness check** (form button and `-Action CheckPbi`, identical results):
  - it checks `pbi-state.json` schemaVersion 2 against the documents, DECISION-LOG.md and local
    evidence files;
  - five statuses;
  - approvals are bound to content fingerprints;
  - it checks path scope (CDMS and DAB required) and evidence levels (code, registration,
    reach, runtime).
- **Evidence fingerprints** for `knowledge/evidence-index.json`.
- **Comparison trials** against pinned v2.0 Original and v2.1 Concise agents, with cleanup.

## 2. Functional problems
- **No interactive answers.** Questions are chat text only. The VS Code tool list did not
  include `vscode/askQuestions`, so the host's interactive question controls were never used.
- **Technical gaps reach business users.** Nothing lists which topics must never be asked of
  business users. "Record the exact gap and the confirmation required" and the NEEDS PO/BA
  CONFIRMATION label let technical gaps turn into business questions. That is the reported
  "too many technical questions".
- **Weak question model.** Questions had only `open` and `resolved`. There was no option list,
  answer, edit history or deferral, and no deterministic duplicate detection.
- **Thin intake form.** It had title, description, number and optional details only. There were
  no attachments, no target project, no kind of change, no criteria choice and no save
  draft/resume. A duplicate PBI number was a hard stop with no resume option.
- **No evidence scope.** Legacy CRM evidence could be cited as reach evidence for a DAB path.
  An instruction such as "exclude legacy plugins for this DAB PBI" could not be recorded or
  checked.

## 3. Missing functionality
- Guided Create PBI flow and commands (Resume, Review, Show Decisions, Analyze Legacy, Show
  Technical Flow, Generate Acceptance Criteria, Export, Validate).
- A decision engine with recorded options, a custom answer, supersede-on-edit, optional-question
  skipping and immediate persistence.
- CRM plugin and workflow call-chain tracing with bounded traversal, cycle handling and a
  plain-language presentation.
- Attachment handling rules: what counts as authoritative, and reporting unreadable files.
- A Business Process Tracer is named in the 4.0 request, but its definition was in a part of the
  request that was not received. Call-chain tracing is covered by the CRM guide.

## 4. Repeated or unnecessary agent behavior
- Questions could be re-asked after rewording. Only the instruction "do not ask when an approved
  answer exists" prevented it.
- A second confirmation of an answer was not forbidden, so one answer could be followed by
  another approval request.
- Unavailable sources tended to block refinement instead of going into the technical
  assessment.

## 5. Installer limitations
- Unsigned scripts: blocked under AllSigned or Restricted policy (by design; documented).
- Installs only a Copilot agent. There is no VS Code extension, so native Quick Pick is not
  available. In-chat interactive questions depend on the host tool `vscode/askQuestions`.
  Visual Studio has no documented equivalent and uses the numbered fallback.
- Guided double-click mode (folder dialog) is not covered by automated tests.
- Any edited managed file blocks the whole update until the user resolves it (safe, but strict).

## 6. Plugin analysis depth (before 4.0)
`execution-path-analysis.md` covered:
- registration fields (stage, mode, filtering attributes, images, rank, state, run-as);
- error propagation and transactions;
- CDMS versus DAB per operation;
- identities.

It did not cover call chains from an entry point, SharedVariables, conditional compilation,
FetchXML or option-set values, records written, or triggered downstream plugins. It had no
traversal bound and no rule for presenting findings to business users.

## 7. Migration risks
| Risk | Handling in 4.0 |
| --- | --- |
| 3.1 approvals invalidated by new fingerprinted material | `evidenceScope` is fingerprinted only when present; 3.1 states fingerprint exactly as before (tested: a 3.1-approved PBI stays Development-Ready after upgrade) |
| New question statuses | `resolved` and `open` are still accepted; answered/approved/not-applicable count as resolved; anything else counts as open, as in 3.1 |
| Agent file changes (tools list, instructions) | Normal managed update with backup; an edited agent is reported as a conflict, never overwritten |
| Pinned comparison baselines | Keep their original tool lists (`BASE_TOOLS`); bodies are byte-identical to v2.0/v2.1 (tested) |
| Existing intakes | Old `REQUEST.md` and `pbi.json` stay valid; the form can resume only drafts it created |

## 8. Features to preserve
- One agent.
- Evidence levels, ownership matrix, CDMS versus DAB per operation.
- Five statuses.
- Consolidated approval with fingerprints.
- 3.0.0 migration rules.
- Readiness parity between the form and PowerShell.
- Manifest, backups and rollback.
- Comparison baselines.
- Knowledge fingerprints.
- No telemetry, network calls or dependencies.
- The boundary that the agent never changes application code or publishes work items.

## 9. Features to improve
These are the items in sections 2–6.

## 10. Implementation and acceptance criteria
| Requirement | Implementation | Acceptance (automated unless stated) |
| --- | --- | --- |
| BA-style refinement; no technical questions to business users | Agent "Ask one business question at a time" rewritten: forbidden topics, gaps go to the technical assessment, classification of statements, no second confirmation | test-core: agent wording; live behavior **not automatable** |
| Selectable answers | VS Code: `vscode/askQuestions` in the tool list (host ignores unavailable tools). Form: Answer questions panel. Elsewhere: numbered options with back/skip/status/why | test-ui: panel; test-core: tool lists per IDE; host rendering **manual** |
| Decision engine | `questionProgress`, `answerQuestion`, `skipQuestion`, `recordAnswer` and `recordSkip` in core.js: history backups, change detection, supersede-on-edit, DECISION-LOG entry | test-core and test-ui (scenarios F, G, L, M) |
| Question statuses and duplicates in readiness | `questionResolved`, `QUESTION_DUPLICATE` (identical text; reworded duplicates left to the agent) | 61 shared scenarios, JS and PowerShell identical |
| CRM plugin and workflow intelligence | `skills/crm-plugin-workflow-intelligence.md`: entry point, bounded traversal, 10-point record, evidence per rule, four-part presentation | test-core: guide content; tracing quality **manual** |
| Legacy versus DAB evidence scope | Evidence `system`; `evidenceScope` decision; `LEGACY_NOT_TARGET_EVIDENCE`, `EVIDENCE_OUT_OF_SCOPE`, `SCOPE_DECISION_MISSING` | shared scenarios incl. the PBI 305915 direction |
| Guided Create PBI | Form: six-step wizard (progress, back/next, save draft, resume, review, start analysis, cancel, real file picker, existing-PBI choice). Agent: `skills/guided-pbi-creation.md` and commands | test-ui (A, C, E, F, H), test-core (A–E); chat flow **manual** |
| Installer and upgrade | Two new guides in the bundle; upgrade from 3.0.0 and 3.1.0 tested | test-core, test-ps |
