# Targeted upgrade of the current local PBI Builder 5.3.0

## 1. Baseline and verified root causes

Work used the current local generator, including all pre-existing uncommitted
changes, not a GitHub checkout. No commit, push or application-code change was made.
The original generator was preserved in the session workspace for comparison.

Already implemented and retained: VS Code native questions and Custom Response,
conditional workflow choices, folder resolution, shared-UI analysis, project-map
reuse, dependency hashes, run metrics and readiness-bound final generation.
The initial workflow/decision suites passed all 26 tests.

Remaining reproducible defects:

- The next-action helper was stateless unless callers supplied a loop counter.
  Persisted stage/transition state and unchanged-input loop detection were absent.
- Readiness's pending final approval could be treated as an unclassified issue,
  preventing a conditional interaction even when the remaining technical gaps
  were correctly classified. Final approval still blocks final generation.
- Applied custom responses could lead back into the same automatic action.
  Completed conditional planning supplied a report but no structured next-owner
  interaction.
- Working-document synchronization was an instruction, not a callable operation.
  Drift could remain between canonical state, draft, intake status and evidence.
  The real backend-v1 intake still claimed wizard stage source-access/draft
  despite completed conditional planning; derived wizard metadata is now repaired.
- The evidence index accepted missing dependencies on first refresh and silently
  ignored invalid dependency paths. Dependency-set and recorded-revision changes
  did not invalidate findings.
- Actual PBI validation exposed a pre-existing JavaScript/PowerShell difference:
  JavaScript treated HTML br tags as line breaks, but PowerShell did not. The
  original multiline AC-3 therefore acquired a false document-content mismatch.
  PowerShell now uses the same normalization, with a multiline parity regression.
- The installed host profiles already differed in tool declarations, but shared
  interaction wording did not explicitly identify Visual Studio's unverified
  question-tool capability.

## 2. Implemented improvements

- Persistent `analysis.workflow`: stage, action, relevant-input fingerprint,
  eight-step automatic budget, repeated-action detection and 32-transition history.
  Blocking outcomes carry recommendations, alternatives and Custom Response.
- Conditional generation requires sufficiently defined requirements and a saved
  user workflow selection. It writes verified behavior, implementation tasks,
  dependencies and owner-verification tasks to the working draft; reruns canonical
  readiness; never writes final artifacts or approves anything.
- Already-generated conditional drafts resume to an outstanding dependency-owner
  question (`ASK_DECISION`, not terminal `COMPLETE`). Their remaining
  structural/readiness issues remain explicitly visible.
- JavaScript synchronization and PowerShell `SyncPbi` use shared section definitions.
  Derived rules, criteria, dependencies, readiness, evidence, decisions and
  questions are refreshed; original intake and other narrative are retained.
  Changed files have history backups; stale writes are refused and failures roll back.
  Read-only `CheckPbi` remains read-only.
- The browser readiness action synchronizes and computes the next interaction.
  Missing state still produces the original deterministic readiness error.
- Operational workflow progress does not invalidate reviewed-content snapshots;
  material evidence, decisions and document changes still do, in both checkers.
- Freshness rejects missing/invalid dependencies, dependency-set edits, recorded
  revision changes and explicit repository-commit mismatches. Repeated unchanged
  checks do not rewrite the index. External source verification is not invented.
- The router keeps its existing size constraint. Resume instructions explicitly
  prioritize saved state, evidence and freshness before scoped source lookup,
  and reuse already-loaded, unchanged guides.

## 3. Files changed by this upgrade

Source and documentation:

- [core.js](../maintainer/src/core.js)
- [ui.js](../maintainer/src/ui.js)
- [Install-PBIBuilder.ps1](../maintainer/installer/Install-PBIBuilder.ps1)
- [test-targeted.cjs](../maintainer/test-targeted.cjs)
- [test-ps.cjs](../maintainer/test-ps.cjs): updates the old expectation that
  missing/unsafe dependencies were reusable.
- [test-530.cjs](../maintainer/test-530.cjs) and
  [test-e2e.cjs](../maintainer/test-e2e.cjs): require a next-owner interaction
  instead of a terminal conditional-completion action.
- [benchmark-targeted.cjs](../maintainer/benchmark-targeted.cjs)
- [maintainer README](../maintainer/README.md)
- [README-FIRST.txt](../README-FIRST.txt)
- This report.

Generated artifacts: standalone HTML, root installer, bundle, checksums and the
5.3.0 release ZIP/checksum. Existing unrelated changes, audit documents, older
releases and the previously extracted package directory are retained.

The existing backend-v1 PBI received history-backed canonical evidence freshness,
workflow/resume metadata, synchronized working sections and a saved readiness
report. DEC-1 through DEC-5 and the original request were preserved.

## 4. Validation

| Suite | Result |
|---|---|
| Generator/core | 59 checks passed |
| Snapshot, workflow, decisions and 5.3 regressions | 36 tests passed |
| Final targeted synchronization/freshness/host/rollback tests | 10 passed, including multiline JavaScript/PowerShell normalization |
| Browser handler integration | Passed; simulated DOM, not a rendered IDE |
| End-to-end | 14 checks passed |
| Full PowerShell installation/readiness suite | 15 checks passed, including every shared readiness case |
| Actual PBI 305974 repeated resume | Conditional owner interaction; exact JavaScript/PowerShell readiness parity; all 27 evidence hashes current |
| Router size | Both generated profiles are 2,699 characters, below 3,500 |
| Package regeneration, extraction and checksums | Passed; 70 extracted files and all 69 checksums verified |
| Authorized installed targets | Both Verify actions passed; subsequent installation is idempotent |

Failures found during implementation were corrected: syntax/scope mistakes,
fixture setup, an overly broad pending-approval classification, the missing-state
UI regression, and an outdated test expectation that unsafe/missing dependencies
were reusable. Actual-PBI validation also caught and corrected the multiline
PowerShell normalization mismatch before final packaging. No unresolved production
failure is being reclassified as a pass.

## 5. Actual before/after measurements

`benchmark-targeted.cjs` compares the preserved **current local 5.3.0** generator
with the upgraded generator on identical fixture workspaces. Five runs; median
milliseconds; counts are instrumented filesystem API operations, not Copilot tools.
Node v26.5.1 on this Windows machine.

| Warm operation | Before ms | After ms | File opens before/after | Bytes before/after | Writes |
|---|---:|---:|---:|---:|---:|
| Source discovery | 94 | 94 | 10 / 10 | 3,504 / 3,504 | 0 / 0 |
| Evidence freshness | 14 | 15 | 2 / 2 | 396 / 440 | 0 / 0 |
| Canonical readiness | 249 | 222 | 41 / 41 | 35,988 / 35,988 | 0 / 0 |
| New synchronization, already consistent | Not available | 367 | Not available / 61 | Not available / 89,524 | 0 |

Timing variation is machine-specific, not proof of an agent-level speedup; freshness
was one millisecond slower in this final run. This
upgrade does not reduce those inherited warm-operation file-open counts.
Freshness reads 44 extra bytes of recorded-revision metadata in this fixture.
The new synchronization deliberately adds validation work; no lower token cost
or faster end-to-end refinement is claimed.

Actual backend-v1 observations at the recorded synchronization checkpoint:

- Before: read-only readiness, 388 ms, 37 file opens, 635,622 bytes, no writes.
- After synchronization: read-only readiness, 345 ms, 37 opens, 704,582 bytes.
  The documents/state are larger because canonical sections and resume data exist.
- Warm full resume: 762 ms, 64 opens, 1,317,873 bytes, three writes including
  history/backups and persisted progress; no directory entries listed.
- These actual-PBI measurements cover different operations/content sizes and
  must not be interpreted as a like-for-like end-to-end speed comparison.
- Each actual-PBI measurement above was invoked through one command-tool call.
  Before/after native Copilot refinement tool calls and model tokens were
  **NOT MEASURED**; the IDE did not expose a comparable complete refinement trace.

Saved PBI evidence freshness required 22 distinct source files (337,431 bytes)
for 27 entries, not a repository scan. Sixteen of seventeen existing hashes
matched. EV-3's changed DAB startup file was re-read at the recorded DI/middleware
excerpt and refreshed. Ten newer verified entries received current fingerprints.
No source was missing. Existing Legacy, CDMS, DAB and shared-UI findings were reused.

## 6. VS Code compatibility

Native `vscode/askQuestions`, free-text Custom Response, tool declarations and
existing question behavior are retained. Profile-generation, core, workflow and
browser-handler tests pass. Live VS Code agent selection, question popup and
tool invocation in the IDE: **NOT VERIFIED**.

## 7. Visual Studio capability evidence

Read-only local inspection found Visual Studio Professional 2026 18.10.3
(18.10.12224.181) and GitHub Copilot extension 18.10.1207.43936. Installed settings
and manifests contain custom-agent, skills and MCP support. Custom-agent UI
availability is feature-flag dependent; a live enabled state was not established.

No separate native question tool was established from installed metadata or
Microsoft documentation. This is not a claim that every Visual Studio build
can never offer one. The separately rendered Visual Studio profile retains its
existing conservative tool declarations, does not declare VS Code question or
terminal tools, and offers concise chat choices with Custom Response unless a
native question tool is actually callable.

Sources:

- [Visual Studio agent mode](https://learn.microsoft.com/en-us/visualstudio/ide/copilot-agent-mode)
- [Specialized and custom agents](https://learn.microsoft.com/en-us/visualstudio/ide/copilot-specialized-agents)
- [Agent skills](https://learn.microsoft.com/en-us/visualstudio/ide/copilot-agent-skills)
- [Chat context and clarifying questions](https://learn.microsoft.com/en-us/visualstudio/ide/copilot-chat-context)
- Local extension manifest and settings beneath the installed Visual Studio
  `Common7/IDE/Extensions/Microsoft/Copilot` directory.

Live Visual Studio agent discovery, Tools panel contents, question invocation,
cross-solution file access and command execution: **NOT VERIFIED**.

## 8. PBI 305974 and remaining blockers

Resumed only `pbi-305974-take-measurement-backend-v1`, not either similarly named
folder. WF-1 had already selected and applied the conditional route. It was reused,
not requested again. DEC-1 through DEC-5 were compared with the preserved baseline.
Canonical readiness remains **Draft, 18 issues, two warnings, finalAllowed=false**.
No new final approval or final PBI artifacts were generated.

The five external gaps remain open:

1. DAB authorization policy, effective caller identity and host-key enforcement.
2. Color Measurement Service server contract and persistence behavior.
3. DAB Created By/Created On persistence guarantees.
4. Instrument metadata resolution for accepted unregistered devices.
5. Transaction, compensation and idempotency guarantees.

Additional missing acceptance-coverage types, reach-level evidence, the unknown
DAB path, actor identity and technical feasibility are still visible. SDK
connection enforcement and deployed response normalization remain warnings.
No service contract, authorization policy, audit guarantee, transaction behavior
or legacy activation was invented. The next interaction recommends the security
owner verification first and offers the other four dependencies and Custom Response.

## 9. Regeneration and authorized installation

Regeneration completed after passing tests. For future regeneration:

```powershell
node maintainer\build.cjs
node maintainer\release.cjs
```

Install only in the two existing targets containing Builder configurations:

```powershell
.\Install-PBIBuilder.ps1 -RepoPath "C:\Users\RGA\source\repos\AN.ColorDMS.Customizations" -AllowUpdates
.\Install-PBIBuilder.ps1 -RepoPath "C:\Users\RGA\source\repos\AN.ColorDMS.Customizations\Source\Formula\PaintSystem" -AllowUpdates
```

Do not install in the three registry entries without existing Builder configs.
Preserve the root VS Code profile and nested Visual Studio profile, source
configuration, PBI histories and edited/unowned files. Installation previews found
no managed-file conflicts. Prior local package outputs are preserved in the session
workspace; replaced installed files have installer backups.

Installation completed in both authorized targets: four managed files updated in
the root VS Code installation and six in the nested Visual Studio installation.
Both independent Verify actions passed; rerunning the corrected package installer
made no changes. Configurations, sources, histories and unowned files were retained.
SHA-256 comparisons confirm both original configuration files and REQUEST.md
are unchanged; DEC-1 through DEC-5 match the preserved baseline exactly.

Both configured installation folders lack a local .git directory; the installer
reported this warning, and no repository was initialized or relocated. The nested
Visual Studio target still has no DAB/CDMS/UI source paths configured. That existing
limitation was preserved rather than silently changing source access. Installer
file-read probes are not proof of behavioral evidence or live IDE access.

The regenerated ZIP was independently extracted and all 69 manifest checksums
matched. Use the regenerated ZIP or root installer, not the pre-existing extracted
package directory, which was deliberately left untouched.

Reopen the relevant IDE to reload its existing agent profile; no new evaluation or
continuation prompt is required for the saved PBI interaction.
