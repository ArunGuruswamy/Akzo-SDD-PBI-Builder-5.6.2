# Migrating to Akzo SDD PBI Builder 5.6.2

## From 5.6.1
- Only the setup window changed. The installed files are the same as 5.6.1 apart from the version; settings, paths, editors,
  PBIs, decisions and approvals are kept. Upgrade normally.

### Rollback from 5.6.2 to 5.6.1
Run `Install-PBIBuilder.cmd -RepoPath "<repository>" -AllowUpdates` from `releases/Akzo-SDD-PBI-Builder-5.6.1/`.

# Migrating to Akzo SDD PBI Builder 5.6.1

## From 5.6.0
- Install or upgrade normally. One-editor installations (`ide` visualstudio or vscode) get the same files as 5.6.0 apart
  from the version, so nothing else changes. Paths, the schema reference (saved as the other repository "GraphQL Schema"),
  PBIs, decisions and approvals are kept.
- The setup window keeps its list of installations (repositories.txt); the old repositories dialog is part of the main window.
- To use both editors, tick both (or `-Ide both`). The VS Code agent moves to its own file and both agents are renamed with
  their editor, so select the agent again in Copilot Chat.

### Rollback from 5.6.1 to 5.6.0
1. The 5.6.0 package is kept in `releases/Akzo-SDD-PBI-Builder-5.6.0/` (ZIP, `.sha256` and an extracted copy).
2. Run its `Install-PBIBuilder.cmd -RepoPath "<repository>" -AllowUpdates`.
3. Both editors: 5.6.0 reads `ide` both as Visual Studio only. It renames the Visual Studio agent back and retires the
   unchanged VS Code agent file with a backup (an edited one is kept and reported). Rerun it with `-Ide vscode` if that
   installation should serve VS Code instead.

# Migrating to Akzo SDD PBI Builder 5.6.0

## From 5.5.0
- Install or upgrade normally and allow reviewed updates; the agent, stage modules, guides and the repository checker are
  updated with backups. Repository paths, PBIs, decisions and approvals are kept.
- Saved targets keep their meaning: a PBI recorded as CDMS + UI, DAB + UI, UI Only or Both is read exactly as before, so no
  PBI changes status. New PBIs record one of seven selections; `cdms-only`, `dab-only` and `cdms-dab` are new keys.
- Changing the target of an existing PBI (SetTargets) changes its reviewed scope, so an earlier approval becomes stale and
  needs one renewed Approve & Generate.

### Rollback from 5.6.0 to 5.5.0
1. The 5.5.0 package is kept in `releases/Akzo-SDD-PBI-Builder-5.5.0/` (ZIP, `.sha256` and an extracted copy).
2. Run its `Install-PBIBuilder.cmd -RepoPath "<repository>" -AllowUpdates`.
3. 5.5.0 does not know the keys `cdms-only`, `dab-only` and `cdms-dab`: such a PBI is treated as having no development
   target and would generate REFINED-PBI.md. Finish those PBIs with 5.6.0, or set their target to one of the four earlier
   choices before rolling back. PBIs, decisions, approvals and evidence need no rollback.

# Migrating to Akzo SDD PBI Builder 5.5.0

## From 5.4.1
- Install or upgrade normally and allow reviewed updates. The agent file, stage modules, guides and the repository checker
  (`playbook/pbi-builder/tools/`) are updated with backups. Repository paths, PBIs, decisions and approvals are kept.
- Approved PBIs keep their final files under the earlier names (PBI-CDMS.md, PBI-DAB.md, PBI-UI.md) and stay complete. The
  next Approve & Generate, needed only after a change, writes `Refined-PBI-*.md/.json/.docx` and moves the earlier files to
  the PBI's history/ folder.
- A CDMS + UI PBI approved before 5.5 has no UI document. When its shared UI path applies it is reported at the Refined PBI
  stage, not COMPLETE, until one renewed Approve & Generate adds Refined-PBI-UI.
- Anything that reads `PBI-CDMS.md`, `PBI-DAB.md` or `PBI-UI.md` by name should read the `Refined-PBI-` names (or both).
- Approvals recorded by 5.3.0 still go stale at their first synchronization, as they did before 5.5; renew them once.

### Rollback from 5.5.0 to 5.4.1
1. The 5.4.1 package is kept in `releases/Akzo-SDD-PBI-Builder-5.4.1/` (ZIP, `.sha256` and an extracted copy).
2. Run its `Install-PBIBuilder.cmd -RepoPath "<repository>" -AllowUpdates`. Updated files are replaced with their 5.4.1
   versions and backed up first.
3. 5.4.1 does not recognize Refined-PBI files: a PBI approved with 5.5.0 stays Development-Ready but is not reported as
   complete. Copy each `Refined-PBI-<X>.md/.json/.docx` to `PBI-<X>.*`, or run Approve & Generate again under 5.4.1.
   PBIs, decisions, approvals and evidence need no rollback.

# Migrating to Akzo SDD PBI Builder 5.4.1

## From 5.4.0
- Install or upgrade normally and allow reviewed updates. Two files are new: `playbook/pbi-builder/tools/Install-PBIBuilder.ps1`
  and `playbook/pbi-builder/tools/pbi-builder-bundle.json` (the readiness checker the agent runs); the agent file and the
  stage modules are updated with backups. Repository paths, PBIs, decisions and approvals are kept.
- DAB + UI PBIs now get PBI-UI.md (with .json and .docx) beside PBI-DAB.md when the shared UI path applies. A DAB + UI PBI
  approved with 5.4.0 keeps its PBI-DAB files and stays Development-Ready; it is reported as complete again after one
  renewed Approve & Generate, which adds the PBI-UI files.
- Answers already recorded without who/when stay valid; they are listed under `gate.unconfirmed` so the agent asks for
  explicit confirmation before the final review.
- `READINESS.inputs.sha256` appears in PBI folders after a PowerShell synchronization; it is a cache key and can be deleted.

### Rollback from 5.4.1 to 5.4.0
1. The 5.4.0 package is kept in `releases/Akzo-SDD-PBI-Builder-5.4.0/` (ZIP, `.sha256` and an extracted copy).
2. Run its `Install-PBIBuilder.cmd -RepoPath "<repository>" -AllowUpdates`. Updated files are replaced with their 5.4.0
   versions and backed up first. The tools folder and `READINESS.inputs.sha256` files are unused by 5.4.0.
3. PBIs, decisions, approvals and evidence need no rollback; generated PBI-UI files of DAB + UI PBIs stay in place.

# Migrating to Akzo SDD PBI Builder 5.4.0

## From 5.3.0
- Install or upgrade normally and allow reviewed updates. Eight new files are created in
  `playbook/pbi-builder/skills/` (`stage-*.md`); the agent file, `readiness-and-approval.md`,
  `guided-pbi-creation.md`, `repository-knowledge.md`, `business-rule-ownership.md` and the
  README are updated with backups. Edited files are never overwritten.
- No data change: `pbi-state.json`, decisions, approvals, evidence index and `config.json` are read
  and written exactly as in 5.3.0. Existing approvals stay valid.
- Approvals recorded with 5.3.0 stay valid under 5.4.0 for checks and generation while the PBI is unchanged.
  The first synchronization or resume of such a PBI rewrites its derived Readiness lines and asks for the final
  approval once more, as 5.3.0 itself did after any synchronization. Approvals given with 5.4.0 are not
  affected: later synchronizations keep them current.
- `Install-PBIBuilder.ps1 -Action SyncPbi` accepts `-RefreshEvidence`; scripts that call SyncPbi
  without it see the same output as before.

### Rollback from 5.4.0 to 5.3.0
1. Do not delete anything. The 5.3.0 package is kept in `releases/Akzo-SDD-PBI-Builder-5.3.0/`. Its ZIP
   is stored there as `Akzo-SDD-PBI-Builder-5.3.1.zip` (with an extracted copy in the folder of the
   same name); its SHA-256 equals the one recorded in `Akzo-SDD-PBI-Builder-5.3.0.zip.sha256`, and the
   package inside reports version 5.3.0.
2. Run its `Install-PBIBuilder.cmd -RepoPath "<repository>" -AllowUpdates`. Files updated by 5.4.0
   are replaced with their 5.3.0 versions and backed up first. The eight `stage-*.md` files are not
   used by 5.3.0; remove them only if they are unedited.
3. PBIs, decisions, approvals and evidence need no rollback.

# Migrating to Akzo SDD PBI Builder 5.3.0

## From 5.2.x
- Install or upgrade normally (Install.cmd, the form, or `Upgrade all`) and allow reviewed
  updates. The agent file gains the workflow router and the minimum-sufficient-evidence
  rules; the guides gain gap-impact, evidence-verification, dependency and shared-UI rules.
  `config.json` (repository paths, editor, role) is never replaced by empty values.
- `pbi-state.json` is unchanged and still schemaVersion 2. Two optional fields are new:
  `rules[].gaps[].impact` (BLOCKING, WARNING, INFORMATIONAL) and `evidence[].verification`
  (VERIFIED, ASSUMED, UNAVAILABLE). Without them behavior is exactly as in 5.2.x: a gap without an
  impact blocks, and evidence without `verification` counts as VERIFIED. Existing approvals stay valid.
- `knowledge/evidence-index.json` entries may now carry `repository`, `revision` and `dependsOn`;
  Refresh evidence records `dependencyHashes` and reports `reusable`. Older entries need no change.
- Discover sources now also writes `knowledge/FILE-INDEX.txt` and adds entry points and
  repository identity to `source-map.json`; the first run after the upgrade rewrites the map once.
- `-LegacySource ''` (an empty value) now keeps the saved path; use `-ClearSource <key>` to remove
  one. Paths containing `< > " | ? *` are refused by the form and by PowerShell.
- Request folders created by 5.3.0 gain an `analysisPlan` entry in `pbi.json` and an
  "Analysis plan" section in `REQUEST.md`; folders created earlier are not rewritten.

### Rollback from 5.3.0 to 5.2.2
1. Do not delete anything. The 5.2.2 package is kept in
   `releases/Akzo-SDD-PBI-Builder-5.2.2/` (ZIP and `.sha256`); extract it somewhere new.
2. Run its `Install-PBIBuilder.cmd -RepoPath "<repository>" -AllowUpdates` (or Upgrade all). Files
   updated by 5.3.0 are replaced with their 5.2.2 versions and backed up first; edited files are
   never overwritten.
3. If something must be restored by hand, copy files from `playbook/pbi-builder/backups/<batch>/`
   back to their original relative paths.
4. PBIs, decisions and approvals need no rollback. A `pbi-state.json` that already uses `impact` or
   `verification` is still valid JSON for 5.2.2, which ignores those two fields (a gap with an
   INFORMATIONAL impact then blocks again, as it did before).
5. `knowledge/FILE-INDEX.txt` and the extra map fields can stay or be deleted; nothing else reads them.

## From 5.2.0
- Upgrade normally and review managed-file updates. Existing PBI folders,
  decisions and approval history are preserved.
- The final-review snapshot now includes recorded local evidence-source contents.
  An earlier snapshot-bound approval may become stale and require a new review,
  even when the PBI documents did not change.
- Older approvals without a reviewed-content snapshot retain their historical
  per-record checks; a renewed final approval binds the complete snapshot.
  External evidence remains bound to its recorded revision, whose current
  source freshness the selected-repository form cannot verify.

## From 5.0.0
- Install or Upgrade as usual and allow reviewed updates (the agent file gains the "Untrusted
  content" section). PBIs, decisions, approvals and settings are unchanged.
- Existing PBI folders are not rewritten. Review & approve now scans their working documents: if
  one holds a value that looks like a credential, approval is blocked until it is replaced with
  [REDACTED: <kind>] (ask the agent, or edit the file).

## From 4.x
- Install or Upgrade as usual and allow reviewed updates. config.json gains an empty shared
  Angular UI path (sources.ui); set it in setup (or -UiSource) before using UI targets.
- PBI folders are not changed. A PBI created before 5.0 keeps the 4.x path rules (cdms and
  dab required), even when its pbi.json records CDMS, DAB or Both; Approve & Generate produces
  its application's PBI (or REFINED-PBI.md when none was recorded). To use the 5.0 targets
  (including the shared UI), start a new version of the PBI.
- Approvals: only the final user approval is required by the tool. Existing approval records
  are retained and checked for staleness. A 4.x PBI that
  waited only for PO/BA or technical approval can be approved with Review & approve.
- The 4.1 "Approved / Change Requested / Custom Response" choices are replaced by the form's
  Approve & Generate, Request Changes and Save Draft.

## From 4.1.0
- Install or Upgrade as usual and allow reviewed updates. Only the form changes; PBIs, decisions,
  approvals and settings are unchanged.

## From 4.0.0
- Install or Upgrade as usual and allow reviewed updates. The agent file and its guides change
  (direct legacy source analysis; selectable Approved / Change Requested / Custom Response
  approvals); unedited files are updated with backups, edited ones are reported, never
  overwritten. PBIs, decisions, approvals and readiness rules are unchanged.
- Start the installer with Install.cmd / Uninstall.cmd (the old names still work). They check
  the package and your execution policy first and never bypass it.

## To 4.0.0

## From 3.1.0
Install with the form or `Install-PBIBuilder.cmd -RepoPath <repo> -AllowUpdates`.
- Updated (with backups): the agent, `readiness-and-approval.md` and the other guides, the
  template, README, config and the form. Added: `skills/guided-pbi-creation.md`,
  `skills/crm-plugin-workflow-intelligence.md`, `skills/xrm-workflow-intelligence.md`,
  `skills/business-rule-ownership.md` and `skills/business-rule-branch-completeness.md`. The PBI template gains an application line and
  CDMS/DAB ownership columns.
- sources.yaml gains an `area` line per source (Custom (Legacy CRM/XRM), DAB (GraphQL), CDMS);
  keys and roles are unchanged. Questions may record `recommended` and `recommendedReason`.
- The Visual Studio agent gains the `find_references` tool; sources.yaml gains an `ideAccess`
  note (a sources.yaml you edited is reported as a conflict, as before).
- PBI folders are not changed. pbi-state.json stays schemaVersion 2; existing approvals keep
  their fingerprints and stay valid (tested). New fields (question options and answers,
  evidence `system`, `evidenceScope`) are optional.
- Added: `.github/skills/business-decision-advisor/SKILL.md`, a workspace Agent Skill. A file you
  already have at that path is reported as a conflict and kept.
- Create PBI uses a compact intake and autonomous investigation. Existing PBIs keep their
  questions, answers and decisions; option keys A/B recorded earlier still work, and current
  questions use A–D where appropriate. REQUEST.md may gain an "Investigation scope" section.
- Repository first: no end-to-end analysis document is required. SOURCE-DISCOVERY.md is no
  longer written (source access goes into EVIDENCE.md); the catalog, ownership, coverage and
  plugin-rule documents are written only on request. Existing documents in PBI folders are kept
  and read only as background. Readiness rules are unchanged.
- New installations leave the historical ColorDMS reports out (`-IncludeReferences` or the form
  checkbox adds them). An upgrade keeps the choice in config.json, so reports already installed
  stay; unchecking it in the form removes them only if unchanged, with a backup.
- An earlier installation in another folder (for example a project subfolder instead of the Git
  root) is not touched. Verify the new one at the Git root first, then remove the old one with
  the setup window's Uninstall (it only removes unchanged files it installed).
- An edited agent or guide is reported as a conflict and nothing is written until you resolve it.
- Rollback: restore from `playbook/pbi-builder/backups/<batch>/`, or install 3.1.0 again with
  reviewed updates allowed; it also removes the five new guides if unchanged (backed up first).

# Migrating to 3.1.0

## From 3.0.0

### Setup files
Install 3.1.0 with the form or `Install-PBIBuilder.cmd -RepoPath <repo> -AllowUpdates`.
File names are unchanged. The agent, the three guides, `config.json`, `README.md`,
`PBI-TEMPLATE.md` and the form are updated after you allow reviewed updates;
each replaced file is backed up to `playbook/pbi-builder/backups/<batch>/`. A setup
file you edited is reported as a conflict and nothing is written until you resolve
it (same rules as before). Never touched: `playbook/pbis/**`, knowledge notes,
backups, comparison baseline agents and trial folders, `.github/copilot-instructions.md`.

### Existing PBIs (pbi-state.json schemaVersion 1)
Nothing in a PBI folder is rewritten by the installer or the check.
- The readiness check still reads a 3.0.0 state. It reports `STATE_OUTDATED`
  and applies the 3.1.0 rules, so missing path scope, evidence records and
  criterion text are listed.
- A 3.0.0 approval recorded revision numbers, not what was reviewed. It is
  reported as `APPROVAL_UNBOUND` and never counts. **A 3.0.0 PBI that was
  Development-Ready is no longer Development-Ready until it is migrated and
  approved again.** This is deliberate: the reviewed content of those approvals
  cannot be established.
- To migrate, open the PBI with the agent ("Continue PBI <number>"). It copies
  `pbi-state.json` to `history/`, writes schemaVersion 2, moves each old approval
  to `approvalHistory` marked stale, and records anything it cannot establish as a
  gap. Then follow the normal review: run Check PBI readiness, present the
  consolidated approval request, record the new approvals with the printed basis.
- An existing `REFINED-PBI.md` stays in place. Until the PBI is Development-Ready
  again, the check reports it as `FINAL_WITHOUT_APPROVAL`.

### What is enforced by code and what depends on the agent
| Control | Enforced by |
| --- | --- |
| Status computed from state, documents and local evidence; approvals bound to fingerprints; document text, evidence references, path scope, decision log | Readiness check (form and PowerShell, identical results) |
| Migration rewrite of a 3.0.0 state, history copies, approvalHistory entries | Agent instructions |
| Asking the right owner, recording answers as stated, never editing a basis, not creating REFINED-PBI.md before the check allows it | Agent instructions |
| Whether an approver really agreed, whether content is correct, whether external evidence is current | Nobody: these remain human review |

The check reports; it cannot stop a file from being written.

### Rollback to 3.0.0
Restore the setup files from `playbook/pbi-builder/backups/<batch>/`, or install the
3.0.0 package again with reviewed updates allowed. PBIs migrated to schemaVersion 2
then show `STATE_SCHEMA` in the 3.0.0 check; their `history/` folder holds the
schemaVersion 1 copy.

# Migrating to 3.0.0 (from 2.0 or 2.1)

## What changes in your repository

| Before (2.0 / 2.1) | After (3.0) |
| --- | --- |
| `.github/agents/akzo-sdd-pbi-dynamic.agent.md` ("Akzo SDD PBI Builder - X") | `.github/agents/akzo-sdd-pbi-builder.agent.md` (same display name) |
| `.github/agents/akzo-sdd-pbi-dynamic-concise.agent.md` ("... Concise - X") | Retired; its behavior is part of the single agent |
| `.github/prompts/akzo-pbi-{new,refine}-concise.prompt.md` | Retired |
| `.github/prompts/akzo-pbi-{new,refine}.prompt.md` | Kept, now point at the single agent |
| — | `playbook/pbi-builder/skills/*.md` (guides the agent loads on demand) |
| — | `playbook/pbi-builder/REFERENCES-INDEX.md` (when references are included) |
| `config.json` with `conciseAgentName` | `conciseAgentName` dropped; `packageVersion` 3.0.0 |

Retirement rules, applied by both the form and `Install-PBIBuilder.ps1`:
- A retired file is backed up to `playbook/pbi-builder/backups/<batch>/` and removed
  only if its SHA-256 still matches the previous installation manifest, and only
  after every new file has been written and verified.
- An edited old file, or one without an ownership record, is kept and reported as
  `retire-conflict`. Delete it yourself, or change its `name:` line to keep a
  personal copy without a duplicate name in Copilot.
- If any step fails, every touched file is restored. An interrupted run (for example
  a closed window) can simply be rerun: files already written show as unchanged.

Never touched: `playbook/pbis/**` (requests, drafts, decisions, approvals, history),
`playbook/pbi-builder/knowledge/**`, backups, `.github/copilot-instructions.md`,
application code and unrelated agents.

## Existing PBIs
- Folders from 2.x keep working with Continue/Refine PBI.
- A `REFINED-PBI.md` written by 2.x without `pbi-state.json` is treated as a draft.
  The agent keeps it and creates the 3.0 records (`DRAFT-PBI.md`,
  `VALIDATION-MATRIX.md`, `pbi-state.json`) beside it, then revalidates and asks for
  approval before finalizing.
- Decisions recorded in a PBI stay with that PBI. They are never reused for another.

## New in the PBI folder
| File | Purpose |
| --- | --- |
| `DRAFT-PBI.md` | Readable working PBI (template extended with actors, ownership, CDMS vs DAB, failures, data/state, readiness) |
| `VALIDATION-MATRIX.md` | One record per business rule with detailed evidence |
| `pbi-state.json` | Structured rules, criteria, owners, decisions and approvals for the readiness check |
| `REFINED-PBI.md` | Created after readiness checks and final user approval; separate organizational sign-offs still apply when required |

## Rollback
- Restore files from `playbook/pbi-builder/backups/<batch>/` (same relative paths).
- Or install the 2.1 package again: it recreates its two agents and, after you allow
  updates, updates the shared files it owns (config, template, README, form) with
  backups. It ignores the 3.0 agent and guides; delete them yourself if you want
  only the 2.1 agents.
- To compare without rolling back, use Compare old & new with a pinned baseline.

## Windows installer
`Install-PBIBuilder.cmd` / `.ps1` install the same files as the form, from
`pbi-builder-bundle.json` generated by the same `core.js`. An existing installation
from the form is recognised (same manifest), and vice versa.
The browser stores `PBI-Builder.html` as it serializes the page and PowerShell copies
the package file, so switching installers shows that one file as an update.
