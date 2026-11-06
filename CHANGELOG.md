# Changelog

## 5.6.2 - 6 November 2026

Setup window visibility. Only the setup window changed; installing, upgrading, repairing and uninstalling work as in 5.6.1.
No new dependency, no network call, no telemetry. Application repositories are never modified.

- Remembered installations: 6 to 8 rows visible; columns Installation location, Version, Editors, Status and Required,
  resizable. The location takes the width the other columns leave, so the status stays in view; a longer path ends in ...
  with the full path in its tooltip, and a column dragged wider makes the list scroll sideways (the width is kept until
  the window is resized).
- Status per installation: Installed (only when every file in its installation record is present; edited files are
  listed in the tooltip), Not Installed, Upgrade Available, Repair Needed, Failed (a step in this window did not finish)
  and Not Found, with the required action. The list is refreshed after every Install / Upgrade, Upgrade ticked, Repair,
  Verify, Uninstall and Validate paths.
- Success is reported only after verification: Install / Upgrade (also when already up to date), Upgrade ticked and
  Repair end with Verify, and the result says what Verify found.
- A result summary below the buttons: target repository, result and verification, files installed, updated, retired,
  preserved, backed up and failed, and each editor's agent file. Show log / Hide log shows the full installer output
  beside it. Progress reads "Step 1 of 3: previewing", "Step 2 of 3: installing", "Step 3 of 3: verifying".
- The window is larger by default (up to 1120 x 800, within the screen), resizable and maximizable; every control is
  placed from the window size, and below the minimum the window scrolls instead of overlapping controls.

## 5.6.1 - 6 November 2026

Single-window setup and dual editors. No new dependency, no network call, no telemetry. Application repositories are never
modified.

- The Windows setup window is one window. The "Repositories for ..." dialog and its "Repair / configure..." button are gone:
  the installation location, Legacy CRM/XRM (first, in its own section), CDMS BL, DAB BL, Shared Angular UI, an optional
  GraphQL schema folder and custom references are rows in the main window, each with a path box, Browse and a status
  beside it (folder not found, unreadable, invalid characters, a folder used twice, no solution/angular.json/.graphql file).
  The installation location is separate from the source paths: setup never takes the Legacy source from it, and a
  repository's role is the source row whose folder is the install location. The GraphQL schema is saved as the other
  repository "GraphQL Schema", so config.json keeps its layout. A note replaces the old target text: "CDMS, DAB and Shared
  Angular UI are independent implementation targets. UI is optional."
- Every Browse opens the Windows Explorer-style folder picker (IFileDialog with FOS_PICKFOLDERS): address bar, navigation
  pane, network locations, New folder, typed paths. It opens at the field's folder, else beside the last folder chosen or
  the installation, and returns the full path; Windows remembers its last folder. The tree-only FolderBrowserDialog and the
  path input box are no longer used.
- Install / Upgrade, Upgrade ticked (was Upgrade all), Verify, Repair and Uninstall run in the background with a progress
  line; the window stays responsive. Install / Upgrade previews and asks before writing; Uninstall asks first; closing with
  unsaved paths asks first. Paths, editors and the last installation are shown again when the window is reopened.
- Editors: Visual Studio 2026, VS Code or both (`-Ide both`; two independent check boxes in the setup window and the form, at
  least one). With both, Visual Studio keeps the agent path and VS Code gets
  `.github/agents/akzo-sdd-pbi-builder-vscode.agent.md`; the agents are named "... (Visual Studio)" and "... (VS Code)"
  because both editors list .github/agents, and the shared prompts leave the agent to the editor's selection. Every other
  file is written once. One-editor installations are byte-identical to 5.6.0 apart from the version.
- Per editor: Install and Verify print one line per editor; a blocked editor (its agent file edited) is reported on its own
  and the other editor is never reported as installed. `-Editor visualstudio|vscode` limits Install or Repair to that
  editor and the shared files, and Verify to that editor; the setup window offers it when one editor is blocked and repairs
  each editor separately.
- Fixed: the new-PBI prompt and the form's version line still listed the old targets "CDMS + UI, DAB + UI, UI Only or Both".

## 5.6.0 - 6 November 2026

Independent development targets. No new dependency, no network call, no telemetry. Application repositories are never modified.

- CDMS, DAB and the Shared Angular UI are three independent checkboxes in the form and one multi-select question in chat
  (previously four fixed choices: CDMS + UI, DAB + UI, UI Only, Both). All seven non-empty combinations are supported. The UI
  is always optional: selecting a backend never selects the UI, and selecting the UI never selects a backend.
- Each selected area gets exactly one Refined PBI (Refined-PBI-CDMS, Refined-PBI-DAB, Refined-PBI-UI as .md, .json and
  .docx), generated independently. An area that is not selected never gets a document, even when the analysis finds
  changes there; the readiness check already refuses such a path (TARGET_SCOPE_CONFLICT).
- Changes in an unselected area (for example UI changes when only CDMS is selected) are one scope question: add the area to
  the implementation scope, or keep it out and record the work as a dependency. The workflow engine asks it; the new chat
  action `-Action SetTargets -Pbi <folder> -Targets cdms,ui -AnsweredBy <name>` applies an "add" to pbi.json and REQUEST.md
  with history and a decision-log line, and synchronizes. An unselected UI is read only for dependencies.
- The keys saved before 5.6 keep their meaning (`cdms` = CDMS + UI, `dab` = DAB + UI, `ui`, `both`); the new selections
  are `cdms-only`, `dab-only` and `cdms-dab`. Existing PBIs, decisions and approvals need no change.
- Fixed: the DAB document said CDMS was a read-only reference even when CDMS was also selected (Both).

## 5.5.0 - 6 November 2026

Refined PBI completion workflow: the final deliverable is the Refined PBI, and refinement never ends at the draft. No new
dependency, no network call, no telemetry. Application repositories are never modified.

- Final documents are named `Refined-PBI-CDMS`, `Refined-PBI-DAB` and `Refined-PBI-UI` (.md, .json, .docx), generated
  only for the selected development target and only where its path applies; their headings read "Refined PBI". CDMS + UI
  now also writes Refined-PBI-UI when the shared UI changes, as DAB + UI does since 5.4.1. DRAFT-PBI.md stays the working
  draft and is never presented as the deliverable. Earlier names (PBI-CDMS/DAB/UI, CDMS-/DAB-REFINED-PBI) are still read
  and still count as complete; the next approval regenerates them under the new names and moves them to history/.
- Fixed: a dependency saved with the conditional draft kept the PBI at the draft after its cause was resolved (5.4.1 stayed
  at REFINEMENT_COMPLETE while readiness already reported Ready for Review). Saved dependencies are now re-derived from the
  current state, and a gap marked resolved never blocks.
- Every open blocker comes with one specific question (the evidence exists, development work, a runtime or integration
  check, a genuine decision for its owner, Custom Response, Decide later) instead of ending the flow at the draft.
- CanRefine: SyncPbi, RecordAnswer and DeferQuestion return `gate.canRefine` (every mandatory question answered, evidence
  validated, final approval granted) and the stage as `phase`: Intake, Source Analysis, Questions, Refinement Review,
  Approval, Refined PBI, COMPLETE. COMPLETE requires every generated file; the workflow engine returns the same phase, and
  the form's journey bar shows the same stages.
- Questions are asked one at a time (one per question-tool call), the earliest unanswered first; the instructions that
  grouped them into one decision review were changed. New agent section "Never stop at the draft" classifies each gap:
  business question, security or architecture decision for its owner, retrievable evidence, development work, runtime check.
- Fixed: chat-generated PBIs (PowerShell) showed "â€”" instead of an em dash in their heading and code references, because
  Windows PowerShell 5.1 reads the BOM-less installer as ANSI. The installer is now pure ASCII, checked by a test.

## 5.4.1 - 5 November 2026

Chat refinement repairs found in a reported DAB + UI refinement (PBI 309446): the agent could not find the readiness
checker, edited answers into the state by hand, kept code still to be built as missing evidence, and stopped at the
draft. No new dependency, no network call, no telemetry. Application repositories are never modified.

- Readiness checker in the repository: both installers write `playbook/pbi-builder/tools/Install-PBIBuilder.ps1` and
  its bundle (the same version as the installed agent; recorded for Verify and Uninstall). The agent runs it there and
  never searches the disk; without a command tool (Visual Studio) it gives the user the exact command.
- Mandatory question gate: `questionGate` (JavaScript) and the `gate` field of SyncPbi (PowerShell) report the
  mandatory count, answered count, remaining and deferred IDs and `canContinue`. The agent stays in Business Questions
  until every mandatory question has an explicit answer; navigation, skipping, Decide later and recommendations answer
  nothing. Answers recorded without who/when are listed as `unconfirmed` for explicit confirmation (not blocking).
- Chat answers through canonical actions: `-Action RecordAnswer -Question <id> -Option <key|custom> [-Custom <text>]
  -AnsweredBy <name>` and `-Action DeferQuestion` validate the answer, record the decision, decision log and history
  exactly like the form, synchronize and return the gate in one run. Invalid input changes nothing.
- DAB + UI produces `PBI-DAB` and, when the shared UI path applies, `PBI-UI` (Markdown, JSON and DOCX), each owning
  its own rules; previously the UI work was a section of PBI-DAB.md. CDMS + UI is unchanged.
- Chat-generated final PBIs (PowerShell) gain the Technical implementation approach, Validation requirements and Test
  scenarios sections the form already wrote; "Open issues and assumptions" is now "Risks, open issues and assumptions"
  in both generators. Evidence references are listed correctly, and a renewed approval no longer writes a nested empty
  entry into approvalHistory (both PowerShell defects predate 5.4).
- Implementation gaps: code the PBI asks developers to build is recorded as `bypasses` + `targetAction implement`, not
  as unknown or a BLOCKING gap, so a fully defined PBI reaches the final review.
- Resume fast path: SyncPbi reuses its last report when nothing readiness reads has changed (digest of the state, working
  and final documents, attachments, cited evidence sources, rules bundle, engine and config, in
  `READINESS.inputs.sha256`). Measured: unchanged resume 2,474 ms to 1,149 ms (median). Any change recomputes.
- Setup window: Repositories shows Legacy CRM/XRM first as the primary source (Browse folder, Validate, detected
  solutions, projects, frameworks and architecture), then a reference grid (CDMS BL, DAB BL, Shared UI, Custom) with
  Add, Edit, Remove and Validate. A folder configured twice is refused; missing folders warn. `-NoGui -Action Detect`
  shows the detection for a folder.

## 5.4.0 - 5 November 2026

Faster chat refinement with the same rules, evidence checks and approvals; no new dependency, no network
call, no telemetry. Source repositories are never modified.

- Agent instructions: the always-loaded agent file is about 42% smaller (48.6K to 28.4K characters in
  both editor profiles). Stage detail moved, word for word, into eight on-demand modules
  (`playbook/pbi-builder/skills/stage-*.md`: intake, resume, analysis, cross-repo, evidence,
  questions, approval, artifacts) that the Workflow router names for each stage; they are read once
  per conversation and reused while unchanged. Rules that always apply (routing, repository access,
  accuracy, evidence integrity, decision persistence, approval boundaries, safety, automatic
  continuation, chat first) stay in the agent file. Approval-only sections of
  `readiness-and-approval.md` and the Start-only intake of `guided-pbi-creation.md` moved into the
  approval and intake modules, so other workflows no longer load them.
- Chat flow from draft to refined PBI: Decide later keeps a question pending and the next waiting question
  is asked (a deferred question is no longer repeated at once); when only deferred blocking questions remain
  the next action is a PENDING_DECISION that says they block the refined PBI. Every question payload offers
  Custom Response and Decide later. A conditional draft whose dependencies are resolved goes to the final
  review instead of ending at the draft, and a conditional draft with open dependencies lists each blocker
  with its owner and is never described as complete. WARNING and INFORMATIONAL rule gaps are warnings, not
  dependencies that hold a reviewable PBI at a draft. The agent shows done / remaining / blocking progress,
  runs ApproveAndGenerate right after an explicit approval and checks the generated files.
- Approval freshness: resuming or synchronizing an approved PBI no longer makes its approval stale. The
  reviewed-content fingerprint excludes the workflow-owned mirrors that synchronization writes (the derived
  Readiness lines of DRAFT-PBI.md and the status/wizard progress of pbi.json), like their sources in
  pbi-state.json; JavaScript and PowerShell compute it identically. Approvals recorded with 5.3.0 stay valid
  while the content is unchanged. Any material change still requires a new approval.
- Re-approval in Copilot Chat: PowerShell ApproveAndGenerate no longer refuses a renewed approval because final
  documents from the earlier approval exist (a defect already present in 5.3.0). Like the JavaScript generator, its
  pre-check ignores the documents it is about to replace (with history backups); the check after generation stays complete.
- Next action after review and approval: until a PBI is Development-Ready, final documents that the approval will replace no
  longer block the final review (the choice uses readiness as the approval gate sees it). An approved PBI whose final
  Markdown, JSON and DOCX all exist is COMPLETE; resuming it no longer alternates between "verify artifacts" and a
  loop-guard question.
- Next action: a stale or unbound user approval (any edit after review) now leads to the review and a
  new approval request instead of a "Which action should follow?" stop; the approval gate and the
  chooser share one definition. Stale external approvals still block.
- PowerShell: `SyncPbi -RefreshEvidence` refreshes the evidence index and synchronizes in one run
  (output gains `evidence`; without the switch the output is unchanged). The agent uses it on resume
  and no longer runs CheckPbi after SyncPbi (SyncPbi's report is identical). Canonical JSON, hashing
  and escaping avoid PowerShell pipelines; output is byte-identical.
- Diagnostics and tests: `maintainer/diagnose.cjs` (`--instructions` for sizes only) reports
  instruction sizes per workflow and PowerShell timings; `test-modules.cjs` proves every sentence of
  the 5.3.0 agent and guides is still present (frozen in `fixtures/baseline-v5.3.0-agents.json`),
  that each module ships, is routed and is identical in both profiles, and that upgrade and uninstall
  handle the new files. Measured results: docs/PERFORMANCE-5.4.0.md.

## 5.3.0 - 1 November 2026

Reliability, evidence and performance repairs to the existing builder; no new dependency, no network
call, no telemetry. Source repositories are never modified.

- Installer: repository paths persist across install, reinstall, upgrade, repair and restart. An empty
  value never replaces a saved path (`-ClearSource` removes one on purpose), a changed role reports what
  happened to the old role's path, and paths with `< > " | ? *` are refused identically by the form and
  PowerShell. Install, Repair and Verify print "Source access" (readable, configured-inaccessible,
  not-configured), keeping configured paths apart from verified read access, with absolute paths, spaces
  and an existing `.code-workspace` file handled. The setup window's "Repair / configure..." dialog warns
  about missing folders before saving.
- Workflow router: the agent opens with a compact router (seven workflows, each with its guides and a
  "Done when") and loads only the guide the current step needs. No role menus, introductions or
  per-role approval gates.
- Minimum Sufficient Evidence: `gaps[].impact` (BLOCKING, WARNING, INFORMATIONAL) and
  `evidence[].verification` (VERIFIED, ASSUMED, UNAVAILABLE). Only BLOCKING gaps (or a gap without an
  impact, as before) hold a PBI at Needs Evidence; ASSUMED and UNAVAILABLE evidence never proves a claim.
  Warnings are returned by the readiness check, shown beside blockers at review, in the collapsed
  evidence panel and in the generated Markdown, JSON and DOCX. JavaScript and PowerShell stay
  byte-identical (shared readiness cases).
- Repository intelligence: Discover sources is incremental (unchanged solutions and projects are reused
  by size and modified time and not reread; identical results are not rewritten), records known entry
  points and the `.git` branch, commit and remote (credentials removed), and writes
  `knowledge/FILE-INDEX.txt`, a source file-name index without build output. Evidence index entries
  support `dependsOn`: a change to a listed file or its disappearance marks the finding stale
  (`dependency-changed`); Refresh evidence reports `reusable` findings. PowerShell matches JavaScript.
- Shared UI once: `planAnalysis` builds the scan plan for the chosen target (the Angular UI once, only
  backend differences per backend, a differences-only pass when UI identities differ) and Create PBI
  records it in `pbi.json`, `REQUEST.md` and the start prompt. The agent keeps a "Shared UI flow map" and an
  "Implementation difference map".
- Metrics: `PBI.measure` counts file opens, repeated opens, bytes read, writes, skipped writes and
  elapsed time. The form shows them under a collapsed "Run details". Model tokens and tool calls come from
  the chat host and are not claimed.
- Form: a journey bar (Configure repositories, Enter PBI, Analyze existing flow, Answer business
  questions, Review, Approve and Generate) follows saved files; no second UI was added.
- Tests: `test-530.cjs`, `test-e2e.cjs` (real installer, real files, multi-repository workspace),
  new installer, evidence-dependency and readiness parity cases, UI assertions, `benchmark-530.cjs`
  against the frozen 5.2.2 core, and a recorded real-browser run of the full workflow.
- Housekeeping: `update-fixture.cjs` rebuilds `dom-fixture.json` without Python.
- Chat-first workflow: the installed Copilot agent handles intake, questions, review and explicit
  approval; the HTML form is an optional alternative for setup, evidence inspection and downloads.
  The VS Code agent can invoke the installer `ApproveAndGenerate` action using the latest
  reviewed-content fingerprint. The installer repeats readiness and sensitive-content checks,
  verifies Markdown/JSON/DOCX output and restores prior files if generation fails. No Node runtime
  is needed by end users.

## 5.2.2 - 1 November 2026

- Existing question panel now opens as one native decision modal with radio
  options, evidence, recommendations, custom answers and Decide Later. Grouped
  Save Answers, Save Draft / Decide Later and Cancel use the existing engine.
- Locally verified recommendations may be preselected, never auto-approved.
  Drafts remain unapproved; explicit answers update canonical state and the
  existing decision log with history and stale-popup protection.
- Material evidence changes reopen affected answers and retain prior approval
  provenance. Repository switches clear modal sessions; one final approval
  remains the normal generation gate.
- Agent guidance uses symbol-first source discovery, actual access limitations,
  and exact existing-folder resume without inventing missing decisions.
- Legacy intake target labels and pbiNumber remain discoverable without rewriting
  original intake. Node build fallback supports machines without Python.
- Grouped workflow tests and native browser desktop/mobile checks cover the popup.
  Browser tests use an isolated filesystem fixture, not live business approvals.
  Native folder selection and external source freshness still need user/tool access.

## 5.2.1 — 1 November 2026

Targeted approval, evidence, UI coverage and final-artifact corrections.

- New review snapshots include the contents of every recorded local evidence
  source. Source changes or deletion invalidate snapshot-bound approval; existing
  history is retained. Working-document line endings and metadata JSON layout
  are normalized; source and attachment contents remain byte-sensitive. Earlier
  per-record approvals keep their compatibility checks.
- UI-only and combined CDMS/DAB/UI branch claims require evidence for each
  applicable application. Unproven claims remain visible as gaps in handoff.
- Markdown, JSON and DOCX include the same approved branch coverage and citations;
  JSON also retains request details, related requirements and recorded optional
  sign-offs. Unknown branch evidence IDs block final approval.
- Independent questions appear together. A recommendation needs a reason and
  valid supporting references; missing or changed local sources suppress it.
  External source freshness remains unverified by the selected-repository form.
- Duplicate source entries are read once per evidence-index refresh, and local
  recommendation references are checked once per source per question screen.
  One final user approval remains required; separate organizational and security
  gates still apply when policy requires them.

## 5.2.0 — 1 November 2026

Selective reliability and decision-workflow improvements to the existing builder.

- Approve & Generate binds the user's approval to a SHA-256 snapshot of the exact
  reviewed PBI metadata, working documents, state and attachment contents. The
  HTML and PowerShell readiness checks use the same fingerprint; older recorded
  approvals retain their prior compatibility behavior until renewed.
- Switching repositories clears selected PBIs, drafts, review state, question
  controls and generated-download state. UI scope remains explicit in evidence,
  branch checks and developer handoff.
- The installer rejects junctions and reparse points along every repository-relative
  path before reading or writing through them.
- Decision-log and state updates, intake files and binary attachments roll back
  together on failure. Final Markdown, JSON and DOCX are generated from the same
  approved state and stale output formats are retired consistently.
- PBI listing checks directory entries and reads only `pbi.json` metadata instead
  of opening every document body; the measured before/after results are in
  `docs/PERFORMANCE.md`.
- The existing Business Decision Advisor now specifies evidence-backed A–D
  choices, explicit NO RECOMMENDATION, business and technical impacts, custom
  answers and defer. The existing question panel presents independent questions
  together without preselecting a recommendation as the user's answer.

## 5.1.0 — 31 October 2026

Sensitive-data protection and untrusted-content handling. No new dependency, no telemetry, no
network call; the installers, readiness rules, approvals, generation, draft and resume behave as
in 5.0.0.

### Sensitive data
- Values that look like credentials are replaced with [REDACTED: <kind>] before anything is
  saved: private keys, GitHub, AWS, Slack, Google and Sonar tokens, JWTs, bearer tokens, SAS
  signatures, credentials in URLs, connection-string passwords and account keys, and password,
  secret, API-key and token assignments. Only the value is replaced; the setting name and the
  surrounding text stay. Placeholders (<password>, {0}, $env:X, ${VAR}, ***), code references
  (options.Password, GetValue(...)) and prose ("Password: required") are kept.
- Applied in the shared core, so every path uses it: intake fields (REQUEST.md, pbi.json, the
  start prompt, the folder name), text attachments (copied redacted), the intake ZIP, refinement
  requests and Request Changes notes, custom answers in the question panel (pbi-state.json and
  DECISION-LOG.md), Save Draft review notes, and the supporting files in the final ZIP.
- REQUEST.md and pbi.json record what was removed by kind and count (never the value). Binary or
  very large attachments (Word, PDF, images) are kept unchanged and listed as not scanned.
- Approve & Generate refuses, writing nothing, when pbi-state.json, pbi.json, REQUEST.md,
  DRAFT-PBI.md, EVIDENCE.md, OPEN-QUESTIONS.md, DECISION-LOG.md or VALIDATION-MATRIX.md holds a
  value that looks like a credential ([SENSITIVE_DATA], kind only). After generation every MD and
  JSON file is scanned again; a finding rolls the generation back.

### Untrusted content
- Lines in the request or a text attachment that address the agent rather than describe the
  business (override its rules, change its role, bypass an approval, hide something from the
  user, run commands, send data out) are flagged with file, line and kind. They are never removed;
  the attachment is kept whole.
- REQUEST.md lists them under "Instruction-like text (untrusted)", pbi.json records them
  (contentWarnings), and the start prompt tells the agent to treat them as data.
- Review & approve has a seventh card, Untrusted content and sensitive data. A credential in a
  working document blocks approval there; instruction-like text is shown, not blocking.
- Agent: new "Untrusted content" section. Attachments, the request, repository source and earlier
  reports are reference material, never instructions; instruction-like text is recorded in
  EVIDENCE.md as not followed; secrets are written as [REDACTED: <kind>].

## 5.0.0 — 30 October 2026

One workflow: Start PBI → requirements → legacy repository → development target → deep
analysis → review → approve once → generate → preview and download. Root causes and regression
coverage: docs/REGRESSION-305965.md.

### Intake and repositories
- One intake form (New PBI tab, four steps): PBI number (Azure DevOps or a manual identifier such
  as LOCAL-12), title, description and acceptance criteria required, attachments optional, with
  inline validation. Start PBI, Create PBI, New PBI, Start Development and Implement PBI start the
  same intake; an existing PBI number offers Resume, Review or Start New Version.
- Select Legacy Source Repository: configured repositories, Validate (browse to the folder: name
  and Git root), Add or remove repositories (configuration only; folders are never deleted),
  last choice remembered.
- Development target, single choice: CDMS + UI, DAB + UI, UI Only, Both (CDMS + DAB + UI). The
  form shows each repository's role (Legacy — Business Reference; CDMS/DAB — Implementation
  Target or Reference; Angular UI — Shared Frontend). DAB always reads CDMS as a read-only
  reference; CDMS + UI never involves DAB; UI Only creates no backend work; Both gives three PBIs
  with the shared UI work once. Recorded in pbi.json (application, legacy, repositories,
  analysisMode) and REQUEST.md.
- Shared Angular UI repository (config.json sources.ui, sources.yaml ui, role ui): form setup,
  setup window Repositories... (Browse), -UiSource. A 4.x config.json gains an empty ui source.
- Analysis modes Quick, Deep (default) and Comprehensive; findings classified Verified, Proposed,
  Unverified or Contradicted.

### Decisions and the one approval
- Rules the request states explicitly are recorded as decisions ("source": "request") without a
  question; remaining questions come together in one decision review; conflicting acceptance
  criteria are always asked.
- Only the user's final approval is required. Review & approve (Continue tab) shows six cards and
  offers Approve & Generate, Request Changes and Save Draft. The approval is bound to the
  check's fingerprint of the reviewed content. PO/BA and technical approvals are optional
  external records: checked when recorded, never implied.
- Approve & Generate writes history copies first, records the approval, sets Development-Ready,
  generates PBI-CDMS.md, PBI-DAB.md and/or PBI-UI.md (each also .docx and .json) from
  pbi-state.json, reads every file back, reruns the check, and restores every touched file if
  anything fails. Final documents of an earlier run move to history/.
- PBI Generated Successfully: Download DOCX, MD and JSON per PBI, Preview, Download Complete
  Package — ZIP. Downloads are verified against the generation hashes; the save location can be
  chosen where the browser supports it.

### Readiness (identical in the form and PowerShell)
- Required paths follow the development target (CDMS + UI: cdms and ui; DAB + UI: dab and ui;
  UI Only: ui; Both: all three; no target: cdms and dab as before). A path the target excludes
  that is recorded as applying is TARGET_SCOPE_CONFLICT.
- PBI-UI.md is a final document; approvals.user is the only required approval.

### Agent
- Development targets, Shared Angular UI, Legacy to CDMS to DAB mapping and Analysis modes
  sections; history copies are the agent's job (it never asks for a snapshot command); the agent
  never writes the final approval or the final PBIs.

## 4.2.0 — 30 October 2026

- HTML form Install and Repair follow the PowerShell installer: the same review summary
  (Repository, Agent, Review counts, retire and conflict notes), "Apply these changes?",
  "Allow updates...?" when needed, a stop on conflicts and the same result messages.
- The form's badge shows the full package version from core.js (it said 4.0 in 4.1.0).
- Release ZIPs are written to releases/Akzo-SDD-PBI-Builder-<version>/ in the repository.

## 4.1.0 — 29 October 2026

### Implementation references and separate CDMS / DAB PBIs
- Configure other repositories besides Legacy, CDMS and DAB (config.json `others`, sources.yaml
  `otherRepositories`): form setup (`Name = path`), setup window Repositories... with Browse per
  repository, or `-OtherSource "Name=path;..."`. Both installers write identical files; older
  config.json files without `others` keep working.
- New PBI: after the target application is chosen, a Select Implementation References pop-up
  offers every configured repository except the target; none, one or several, recorded per PBI
  in pbi.json and REQUEST.md. Create PBI in Copilot asks the same.
- Agent: Multi-repository implementation analysis. Target first, references read-only, an
  Implementation comparison section in VALIDATION-MATRIX.md with file and method references,
  "No matching implementation found" instead of invented references.
- Final application PBIs are now PBI-CDMS.md and PBI-DAB.md (4.0 names still read): CDMS only,
  DAB only, or exactly two separate, complete PBIs for Both, linked by a shared requirement
  line. PBI-DAB.md covers every applicable legacy rule in C#, including plugin-enforced ones.

### Installer: blocked scripts, HTML parity, folder selection
- Install.cmd and Uninstall.cmd (aliases of Install-PBIBuilder.cmd and Uninstall-PBIBuilder.cmd)
  check the package before PowerShell runs anything: required files, SHA256SUMS.txt, Windows
  PowerShell 5.1, the effective execution policy (and whether Group Policy sets it), script
  signatures, the downloaded-from-internet mark and AppLocker/WDAC Constrained Language mode.
  They never bypass or change the policy. A downloaded ZIP under RemoteSigned ("file is not
  digitally signed") is explained and, after a Y, unblocked for this package folder only.
  AllSigned, Restricted and application control get the compliant options: the browser form or
  an organization-signed package (release.cjs signs with PBI_SIGN_CERT). Exit codes 10-14.
- Uninstall-PBIBuilder.cmd now goes through the same checks.
- One JSON line per run in %USERPROFILE%\.akzo-pbi-builder\logs\install.log; write-access
  errors say how to fix them (no administrator rights needed).
- Install and uninstall roll back on Ctrl+C as well as on errors; rerunning Install completes
  an interrupted installation.
- HTML form: Repair, Uninstall (asks first; same engine and identical result as PowerShell),
  installed version on folder selection, and a list of repositories chosen in this session.
  Setup window: Add by path... (type or paste) besides the folder dialog, adapted from the
  Akzo-Agent installer. Parity matrix: docs/INSTALLER-PARITY.md.

### Agent: direct legacy source analysis
- New section "Analyze the legacy source directly": detect the stack (.NET Framework, Web
  Forms, controllers, handlers, ADO.NET, EF, stored procedures, CRM SDK) without assuming
  modern architecture; trace entry point to database; establish whether behavior exists and
  reuse it; cite files, classes, methods and lines; mark unverifiable details Not Verified;
  analysis documents (ANALYSIS.md, REFERENCE-ANALYSIS.md, earlier SDDs, generated reports) are
  never proof; respect .gitignore and skip build output; never copy secrets into reports.
- Approvals are offered as selectable choices: 1. Approved, 2. Change Requested, 3. Custom
  Response.

## 4.0.0 — 27 October 2026

### Repository first: no end-to-end analysis document
- The repository is the source of truth: the agent never requires, creates or waits for a
  separate end-to-end analysis document, treats bundled reports and earlier analysis documents
  as optional background (never a prerequisite or evidence), revalidates against current code on
  every investigation, and never deletes such documents.
- Required PBI files: REQUEST.md, DRAFT-PBI.md, VALIDATION-MATRIX.md, EVIDENCE.md,
  DECISION-LOG.md, OPEN-QUESTIONS.md, pbi-state.json and the final PBI. SOURCE-DISCOVERY.md is
  replaced by a short Source access section in EVIDENCE.md. PLUGIN-RULES.md,
  PLUGIN-WORKFLOW-COVERAGE.md, LEGACY-BUSINESS-RULE-CATALOG.md, SHARED-BUSINESS-RULES.md,
  BUSINESS-RULE-OWNERSHIP.md and ACCEPTANCE-CRITERIA.md are written only on request.
- The historical ColorDMS reports are no longer installed by default (form checkbox off; new
  `-IncludeReferences` switch; `-NoReferences` unchanged). The setup check prompts no longer open
  them. Readiness needed no change: it never required them and never counts them as evidence.

### Autonomous investigation and the Business Decision Advisor
- Create PBI: one compact intake. The agent asks, in one message and only when missing, for the
  PBI number or title, the requirement and an optional investigation scope; it infers the rest
  and shows it for correction. No separate approvals of title, module, project, attachments,
  change type or criteria. The Target project is the installation repository, not the
  application under investigation. The form records the scope (REQUEST.md, pbi.json, prompt).
- Autonomous investigation: the agent keeps investigating until the rules have evidence, a
  genuine business decision blocks, essential source is inaccessible, or the user stops it; it
  never asks permission to trace the next rule, file or language and finishes independent rules
  first. Per rule: expectation, current behavior, reuse, gap, layers, regression tests.
- Repository-wide discovery: the whole Git repository, not only the loaded solution; every
  legacy CRM/XRM layer (plugins, workflows, web resources and lookup filters, forms, metadata and
  option sets, solution XML, configuration, status changes) before calling anything missing;
  four finding classes; end-to-end workflow traces; the recorded scope is respected. Optional
  user-owned knowledge/SEARCH-SCOPE.md names a repository's folders, so no paths are hard-coded.
  Discover sources adds a "Source folders" table (file kinds two levels deep), which shows
  JavaScript outside every project.
- Business Decision Advisor: new workspace skill `.github/skills/business-decision-advisor/SKILL.md`
  (Visual Studio 18.5+ and VS Code discover it; the agent also reads it explicitly). Today /
  expected / missing, recommendation and why, numbered choices (never letters), ready-to-use
  answer, impact and evidence; six decision-quality checks; never records an unchosen
  recommendation.
- Resume continues from the last verified point; contradicting evidence is recorded and the
  affected recommendations revalidated; approved decisions change only through supersession.
- DRAFT-PBI.md separates confirmed requirements, existing functionality, gaps, proposed changes,
  approved decisions, blockers, source-access limitations and regression tests.
- Agent description updated; Visual Studio tools unchanged (`readfile`, `code_search`,
  `find_references`, `editfiles`, as documented by Microsoft; no terminal tool).

### Every new PBI starts fresh
- Agent: each new PBI uses only its own request, folder, attachments and the source read for
  it. Start it in a new chat (the agent asks for one if the conversation already worked on
  another PBI); nothing is carried over from earlier PBIs, chats or Copilot memory (rules,
  answers, decisions, assumptions, field values, application names, questions, criteria).
  Other PBI folders are read only by name for duplicate detection, or as a named related PBI
  that is never evidence or approval. PBI content is never stored in Copilot memory or
  knowledge notes. The start prompt of every new PBI repeats this.
- Readiness (form and PowerShell, identical): evidence that points into another PBI's folder is
  reported as FOREIGN_PBI_EVIDENCE and never counts; files in the PBI's own folder still do.

### Setup window with upgrade
- Double-clicking Install-PBIBuilder.cmd opens a setup window (PBI-Builder-Setup.ps1),
  modelled on the Akzo Master SDD installer: a remembered list of repositories with each one's
  installed version and available update, Add repository, Install / Upgrade, Upgrade all,
  Repair, Verify, Uninstall and a log. Editor and repository area are asked only for a first
  install; an upgrade keeps config.json.
- It runs Install-PBIBuilder.ps1 for every action, so review, conflict protection, backups and
  rollback are unchanged: changes are previewed and confirmed before writing, and a repository
  with edited files is skipped and reported. It runs under the user's execution policy (no
  Bypass, unlike the Master installer). `-NoGui -Action Install|Upgrade|Repair|Verify|Uninstall|Status`
  for scripts. The list is stored in %USERPROFILE%\.akzo-pbi-builder\repositories.txt (paths
  only). With arguments, Install-PBIBuilder.cmd runs the installer as before.

### Application areas and question rules
- Three application areas, named the same everywhere: CDMS, DAB (GraphQL) and Custom (Legacy
  CRM/XRM). Stored keys are unchanged (`legacy`, `dab`, `cdms`; evidence system `legacy-crm`),
  so existing configurations and PBIs keep working. The form's repository role and source
  labels, sources.yaml (`area` per source) and SOURCE-MAP.md use these names.
- Agent: identify the current repository's area from its source, search the source before
  describing functionality, name the owning area for each rule, trace across the available
  areas, explain in business language. Never invent an application, repository or dependency;
  a field value such as OwnColor (Development Tool) is data, not an application, and is kept as
  written.
- Questions: options in business language with a Recommended option and its reason (when
  supported), Custom answer and Decide later. A scope question (area, workflow, process or field
  value) only after finding where the field or behavior is used and whether the requirement
  covers all of those places. For PBI 277355 this removes the question "Should the Yes/No
  choice apply to ColorApps or both ColorApps and OwnColor?"; the agent now investigates where
  the Development Tool field affects actualization across the Industrialization workflows.
- Form: Decide later replaces Skip and also works on required questions; they stay open and the
  PBI is not Development-Ready until they are answered. A question's `recommended` option is
  marked and preselected.

### Guided PBI creation
- "Create PBI" (also New PBI, Create User Story, Refine New Requirement, Start PBI): six
  steps (title and project, requirement, acceptance criteria, supporting material, kind of
  change, review) with prefill from what the user already gave, Save draft and Resume.
- The form's New PBI tab is the same wizard: progress, Back/Next, Save draft, Start analysis,
  Cancel, target project from the configured sources, a real file picker that copies
  attachments into the PBI's attachments/ folder, and Resume or Create separate draft when the
  PBI number already exists (previously a hard stop).
- Commands: Resume, Review, Edit, Show Decisions, Analyze Legacy, Show Technical Flow,
  Generate Acceptance Criteria, Export and Validate PBI.

### Visual Studio source access and discovery
- Checked against Microsoft's Visual Studio documentation: custom agents live in
  `.github/agents/*.agent.md` (Visual Studio 18.4+); documented tool names include `readfile`,
  `code_search`, `editfiles` and `find_references`; agent file tools reach only the open
  solution or opened folder and its subfolders. The Visual Studio agent now also has
  `find_references` (read-only caller tracing); no terminal tool. Pinned comparison agents keep
  their original tools.
- Agent and repository-knowledge guide: source access check before every analysis (readable,
  configured but inaccessible, not configured, proven by a real file read; never "missing"),
  solution and project mapping, tracing from entry point to persistence and side effects for
  legacy .NET Framework, Web Forms, plugins, workflows, web resources, SQL and configuration (no
  secrets recorded), evidence priority (current source first, bundled reports last), and
  SOURCE-DISCOVERY.md per PBI; pbi-state.json may record `sourceAccess`.
- Readiness: bundled reports under playbook/pbi-builder/references/ (or evidence marked
  `historical`) never count as evidence; `HISTORICAL_NOT_PROOF` when a rule has nothing else.
- Form: Discover sources writes knowledge/SOURCE-MAP.md and source-map.json (solutions, projects,
  references, frameworks, markers, file kinds, access per source); reads only solution and project
  files. The developer handoff now carries `sourceAccess` and `dependencies`.
- sources.yaml states the Visual Studio access rule; user guide: setups for legacy, DAB, CDMS and
  several repositories, and a Visual Studio check.

### Branch completeness, developer handoff and speed
- New mandatory guide `skills/business-rule-branch-completeness.md`: conditions, Yes/No
  branches, success, validation failures, status transitions, side effects, failure and
  rollback, compared per branch with verified implementation; side-effect risk when an
  uncovered branch shares an operation with a covered one (worked example: Paint System
  measurement, Yes replaces Master measurement and Color Point, No keeps them).
- Rules may record `branches` with CDMS and DAB coverage (covered, partial, missing,
  conflicting, unverified, not-applicable), evidence, risk, proposed approach and acceptance
  criteria. Readiness: `BRANCH_INCOMPLETE`, `BRANCH_NOT_COVERED` (reuse claimed while a branch
  such as No is open), `BRANCH_COVERAGE_UNPROVEN` (covered without code evidence, without plugin
  activation, or with legacy evidence for DAB), `DAB_BRANCH_GAP`. Same results in PowerShell.
- Form: Export developer handoff writes `business-rules.json` (schema 1: applications, rules,
  branches, recorded and effective coverage, evidence, CDMS and DAB ownership, acceptance
  criteria, decisions, open gaps; approved requirements, proposed requirements and technical
  findings kept apart) and `BRANCH-COVERAGE-MATRIX.md`, from pbi-state.json only; earlier exports
  go to history/.
- Faster refinement instructions: configured paths are never asked for, search terms come from
  the PBI, no whole-repository scans, only the needed guides, incremental updates after an
  answer, a short default summary, and per-run metrics in EVIDENCE.md. The evidence index can
  hold method, entity, trigger, conditions, rule IDs, calls and confidence.
- Compare old & new: results.csv adds files_read, cache_entries_reused and cold_or_warm.
  `maintainer/benchmark.cjs` measures the deterministic operations against 3.1.0
  (docs/PERFORMANCE.md).

### Business rule ownership (CDMS and DAB)
- There is no DAB plugin. DAB implements every applicable legacy rule in its own code; the
  earlier "the plugin already runs for DAB" and "assign only some legacy operations to DAB"
  wording is removed. New guide `skills/business-rule-ownership.md`: application choice (CDMS,
  DAB or Both, asked once and saved); rules read from plugins, workflows, custom activities,
  JavaScript (OnLoad/OnSave/OnChange, ribbon), HTML web resources and helpers, with the
  AN.ColorDMS.Customizations areas to search; UI logic restated as API requirements; one
  canonical rule per outcome with every source as evidence; CDMS ownership (existing plugin
  reused when verified, workflow and JavaScript rules included); DAB ownership by layer (Azure
  Functions, CQRS handler, FluentValidation only for input rules, domain service, GraphQL,
  response conventions); documents LEGACY-BUSINESS-RULE-CATALOG.md, SHARED-BUSINESS-RULES.md,
  BUSINESS-RULE-OWNERSHIP.md, ACCEPTANCE-CRITERIA.md, CDMS-REFINED-PBI.md, DAB-REFINED-PBI.md.
- Readiness: a rule may record `dab` {layer, status}; a plugin as DAB layer is
  `DAB_PLUGIN_ASSIGNED`, an incomplete one `DAB_OWNER_INVALID`. With a `dab` record, a CDMS
  `reuse` of a plugin is no longer flagged because DAB bypasses it. Identical rule text is
  `RULE_DUPLICATE`. CDMS-REFINED-PBI.md and DAB-REFINED-PBI.md are gated and checked like
  REFINED-PBI.md, and `DOC_OUT_OF_SCOPE` when their application does not apply. Evidence
  components javascript, web-resource and ribbon.
- Form: the New PBI wizard asks the application (CDMS, DAB, Both, not decided) and saves it in
  REQUEST.md and pbi.json; the start prompt tells the agent not to ask again.
- PBI template: application line and CDMS/DAB ownership columns.

### Business questions
- The agent acts as a Business Analyst. It never asks business users about registration,
  pipelines, DI, middleware, builds, repository paths, GraphQL generation or deployment;
  missing technical evidence goes into the technical assessment and does not stop business
  refinement.
- VS Code: the agent's tools include `vscode/askQuestions` (interactive question controls; the
  host ignores unavailable tools). Elsewhere: numbered options with back, skip, status and why.
- The form's Continue tab has an Answer questions panel: options, custom answer, required
  name, skip (optional questions only), edit previous answer, show decisions.
- Decision engine (core.js): each answer is saved at once to pbi-state.json and DECISION-LOG.md
  with a backup in history/; editing an answer supersedes the earlier decision; the file is not
  written if it changed meanwhile. One answer approves that decision only, without a second
  confirmation.
- Question statuses unanswered, answered, approved, deferred, superseded and not-applicable
  (open and resolved still accepted); identical question text is flagged.

### Evidence
- New guide `skills/crm-plugin-workflow-intelligence.md`: call chains from one entry point with
  a visited list and depth bound, a 10-point record per entry point, evidence per rule, and a
  plain-language presentation (technical evidence, simple explanation, difference, next
  action).
- Evidence records may carry `system` (legacy-crm, cdms, dab, ocp, graphql, other). Legacy CRM
  evidence cannot prove a DAB/OCP/GraphQL path (`LEGACY_NOT_TARGET_EVIDENCE`). A PBI may record
  `evidenceScope` (for example excluding legacy-crm, as directed for PBI 305915) backed by an
  approved decision; excluded evidence is rejected.
- "Extract Plugin Rules <n>": the agent reads the plugin code once and writes PLUGIN-RULES.md,
  a DAB implementation handoff. Each rule is classed as validation, default/calculation, side
  effect or guard, with the trigger, condition as pseudocode, exact error message, data
  needed, CDMS and DAB status, Given/When/Then tests and source lines. DAB need is decided
  from the DAB write path: Web API/SDK writes already run the plugin; direct database writes
  must implement the rule. One business question confirms which rules carry over.
- New guide `skills/xrm-workflow-intelligence.md` and command "Analyze Workflows <n>": classic
  CRM (WF4/XAML) workflows and custom workflow activities, kept apart from Power Automate cloud
  flows. Targeted discovery from the operation's entity (.xaml.data.xml first), trigger, mode,
  scope, activation ("activation unverified" when not shown), branches, actions, child
  workflows, custom activity code, real-time versus background termination, downstream
  triggers with cycle and depth limits, no invented ordering. Writes PLUGIN-WORKFLOW-COVERAGE.md
  (rule, CDMS owner, plugin/workflow, trigger, conditions, evidence, DAB responsibility) with an
  operation graph, and separate business and technical views. CDMS, DAB and Both scopes.
- Rule owners: custom-activity, xrm-service, multiple (with types) and unknown; evidence may name
  its `component`. `OWNER_MISATTRIBUTED` when an owner is not backed by code evidence from that
  component (a workflow rule cited only with plugin code); `OWNER_UNKNOWN` blocks
  Development-Ready. Custom activities need activation evidence like plugins and workflows.
- Faster: a "Work fast" section (targeted searches, line ranges, pbi-state.json first on
  resume) and knowledge/PLUGIN-CATALOG.md so a plugin read for one PBI is reused by the next.

### Compatibility
- pbi-state.json stays schemaVersion 2. A PBI approved under 3.1.0 stays Development-Ready after
  the upgrade (tested). The pinned v2.0/v2.1 comparison agents keep their original tools.
- Results remain identical in the form and PowerShell (61 shared scenarios).

### Not included
- No VS Code extension (Quick Pick/webview); the documented in-chat tool is used instead.
- No Azure DevOps auto-prefill (no approved connection exists); screenshots and documents are
  read by Copilot only where its tools can open them.

## 3.1.0 — 27 October 2026

### Fixed readiness gaps (each reproduced by a failing test first)
1. An approved rule could change without a rev change and still be
   Development-Ready. Approvals are now bound to content fingerprints.
2. A final document with only a Status line and IDs could pass. The document must
   now contain each rule and criterion text from the state.
3. A target path such as DAB could be omitted. The PBI now records its path scope
   (cdms and dab required), and every rule must assess every path that applies.
4. A rule could cite an evidence ID with no record. Evidence IDs must now resolve
   to evidence records.
3.0.0 accepted all four as Development-Ready; 3.1.0 rejects all four (MEASUREMENTS.md).

### Approvals
- `pbi-state.json` schemaVersion 2. The check computes a 16-hex fingerprint per
  record in each approval scope (PO/BA, technical, final user), including the
  content of local evidence files. An approval records that `basis` as printed by
  the check. Any change, addition or removal makes the affected approvals stale
  and the report names the IDs. Whitespace-only reformatting does not.
- The approver is recorded (by, at, evidence), not authenticated. Old approvals
  move to `approvalHistory` as stale; history and decisions are never deleted.
- 3.0.0 approvals (rev-number basis) are reported as unbound and never count.

### Document, state and evidence consistency
- Rule and criterion text must be present, not a placeholder (TBD/TODO/TBC) and
  at least 12 characters, and must appear in the PBI document. Dependency IDs
  must be in the document; decision IDs in DECISION-LOG.md.
- Evidence records carry level (code, registration, reach, runtime), kind
  (repo-file or external), source, location and summary; external evidence needs
  a revision. Rules need code-level evidence for an existing owner, registration
  evidence for a registration claim, reach evidence for each path that reaches
  or bypasses, and runtime evidence for "runtime verified".
- Repository evidence files are read by the check: missing, changed (against an
  optional sha256) or stale evidence blocks Development-Ready.
- Resolved blocking questions need a resolution; PO/BA ones also an approved
  decision. Supersede links must point to a superseded decision. Rule
  dependencies must resolve.
- PATH_CONFLICT when a rule claims a path the PBI scope excludes.

### Product
- The wizard and `-Action CheckPbi` show the approval basis once a PBI is Ready
  for Review. Results are identical in both (50 shared scenarios plus the four
  3.0.0 gap states, JSON compared field by field).
- The agent, readiness guide and template describe the new flow: revalidate after
  every change, resolve PO/BA and technical questions with their owners, one
  consolidated review quoting the fingerprints, separate approvals, final document
  only when the check allows it. The guide separates code-enforced controls from
  controls that depend on the agent.
- Template: execution-path scope table, criteria as one verbatim column, evidence
  level column, approval fingerprints line.

### Other fixes found in review
- Paths with Windows device names (CON, NUL.cs, COM1...) or a trailing dot or
  space are rejected in the wizard and the installer; Windows silently aliased
  them to other files.
- PowerShell property lookup is now case-sensitive, as in JavaScript, so
  `"Rules"` is no longer read as `"rules"` by one implementation only.

### Unchanged
One agent, on-demand v2.0/v2.1 comparison baselines, wizard, PowerShell installer,
manifest, conflict handling, backups and rollback. No new dependencies.

## 3.0.0 — 27 October 2026

### Agent and refinement
- One agent, "Akzo SDD PBI Builder - <project>", replaces the original/Concise pair.
  The concise communication rules are kept. "Dynamic" is removed from all names.
- Execution-path ownership: four separate evidence levels (code exists, registration
  or configuration active, target request reaches it, runtime confirmed). Plugin
  source alone is not treated as active.
- Validation ownership matrix (`VALIDATION-MATRIX.md`) per business rule, and CDMS
  versus DAB/OCP/GraphQL decided per operation from evidence.
- Users and permissions: initiator, role/ownership/BU scope, execution identity,
  record/field restrictions, unauthorized behavior; frontend visibility is not
  backend authorization.
- Statuses: Draft, Needs Evidence, Awaiting PO/BA Decision, Ready for Review,
  Development-Ready.
- Final revalidation of all rules and criteria, then one consolidated approval request
  (PO/BA, technical, final user). `REFINED-PBI.md` is created only after all three
  approvals are recorded; drafts live in `DRAFT-PBI.md`. A change to an approved item
  bumps its `rev` and needs renewed approval.
- Better questions: business example, options with consequences, no re-asking an
  answered question, answers recorded with scope and provenance.
- New PBIs start with no decisions or approvals from other PBIs.
- On-demand guides in `playbook/pbi-builder/skills/`: execution-path analysis,
  readiness and approval, repository knowledge.
- PBI template extended (actors, current vs required behavior, ownership summary,
  CDMS vs DAB, integration failures, data/state, AC-to-rule links, readiness).

### Deterministic checks
- `pbi-state.json` and a readiness check (form button, `-Action CheckPbi`) with
  shared rules: completeness, evidence gaps, reuse of inactive/bypassed enforcement,
  identities, PBI-specific decisions, stale approvals, document consistency, and
  no final document before approval. It never claims semantic correctness or
  approval authenticity.
- Repository knowledge: `knowledge/evidence-index.json` with content fingerprints of
  raw bytes; refresh marks changed or deleted sources stale (form button,
  `-Action RefreshEvidence`). Reference documents get a heading index.

### Installation
- Windows installer: `Install-PBIBuilder.cmd/.ps1`, `Uninstall-PBIBuilder.cmd/.ps1`
  with folder selection, settings, preview, install, upgrade, verify, repair and
  uninstall. Same manifest, hashes, backups, conflict detection and rollback as the
  form. Respects execution policy.
- Generation contract: `core.js` exports a placeholder bundle
  (`pbi-builder-bundle.json`, schemaVersion 1) that both installers render. Unknown
  schemas, tokens and placeholders fail before writing.
- Migration retires unchanged 2.x agent files after the new ones are verified;
  edited or unowned ones are kept and reported.
- Comparison trials write a pinned v2.0 Original or v2.1 Concise baseline agent
  on demand; Remove comparison agents deletes unchanged ones.

### Maintenance
- `build.py` and `update-fixture.py` read and write UTF-8 with LF on Windows
  (previously failed with cp1252 and wrote CRLF).
- Tests: 24 core checks, UI handler smoke, 6 PowerShell equivalence and installer
  checks; `compare-versions.cjs`; `release.cjs` builds and verifies the ZIP.

## 2.1.0 — 28 September 2026
Concise pilot agent added beside the original 2.0 agent; comparison mode.

## 2.0.0
Setup wizard: project-specific agent, intake, continuation, managed updates.
