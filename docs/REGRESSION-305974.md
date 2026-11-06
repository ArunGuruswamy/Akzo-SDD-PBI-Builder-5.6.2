# PBI 305974 and consolidated decision popup

Investigation and implementation date: 1 November 2026. Builder version: 5.2.2.

## Repository access

All four user-supplied directories were verified accessible, then relevant source
files were read. No application source was modified.

| Repository | Verified root |
|---|---|
| Legacy | C:/Users/RGA/source/repos/AN.ColorDMS.Customizations/Source |
| CDMS | C:/src/ColorDMS |
| DAB | C:/Users/RGA/source/repos/AN.ColorAppsAzure.BL |
| UI | C:/Users/RGA/source/repos/AN.ColorAppsAzure.UI/AN.ColorAppsAzure.UI |

The exact existing folder is under the legacy repository root, not Source:

```text
C:/Users/RGA/source/repos/AN.ColorDMS.Customizations/playbook/pbis/pbi-305974-take-measurement-backend-v1/
```

The older unversioned Source/playbook draft was not touched. The versioned folder
had no canonical state file; its original pbi.json contained the analysis records.
The original intake and criteria were preserved; canonical state was restored
from recorded facts, with only DEC-1 and four unresolved questions.

## Verified findings

- Shared Angular TakeMeasurementComponent initializes InstrumentHub MeasureComponent,
  then SaveMeasurementService posts raw measurement data via MeasurementService.
- CDMS MeasurementFunctions.CreateMeasurementAsync dispatches CreateMeasurementHandler.
  It prepares color/owner context, validates required/reflection/dEcmc and duplicate
  behavior, resolves instruments, handles confirmed overwrite or Coil deactivation,
  and persists. A coarseness warning is evaluated after save.
- New-record CDMS persistence calls external SaveColorMeasurement v2; confirmed
  non-Coil overwrite uses CRM update. The external service implementation is missing.
- Legacy MeasurementCreateOperations, ColorPaletteMeasurement and
  MarketColorInstanceOriginUpdate declare possible create/update plugin behavior:
  duplicate restrictions/deletion, Comet FDT sequencing, status/origin changes and
  conditional Sync and evaluate. Source declarations do not prove active steps.
- LinkPaintSystem and CreateMeasurementLayers are conditional workflow dependencies;
  their activation/reach on this modern create path remains unverified.
- Legacy ConnectInstrument.js and CreatePanelMeasurement.js establish SignalR device
  acquisition and serialized service save with CRM identity lookup.
- DAB already has MeasurementFunctions.CreateMeasurementAsync, a PaintSystem
  CreateMeasurementHandler, IPaintSystemCommandService, typed GraphQL create mutation,
  common error guards and tests. Reuse them; do not add a duplicate stack.
- DAB's metadata-ID payload and GUID result differ from the shared UI's raw-data and
  duplicate/Coil result contract. Its create endpoint skips user JWT authentication;
  caller audit identity requires review. Its handwritten mutation sets RecordModifiedBy,
  not Created By/Created On or raw spectral data.

Actual paths/methods, ownership mapping, implementation homes and test plans are
recorded in the existing EVIDENCE, DRAFT-PBI and VALIDATION-MATRIX documents. Source
records have SHA-256/revision metadata; outside-root freshness remains unverified
by the browser.

## Questions and readiness

The existing OPEN-QUESTIONS and canonical state contain four independent questions:
duplicate/replace policy; unregistered instruments; explicit no-store feedback;
downstream side-effect scope. Q-1 proposes CDMS-compatible behavior; Q-3 proposes
explicit not-stored feedback from exact AC-4. Q-2/Q-4 have NO RECOMMENDATION.
No proposal was approved. The live decision log still has only DEC-1.

Analysis cannot advance from Needs Evidence. Executable readiness computes Draft
because required negative/permission/boundary criterion coverage is not yet part of
the preserved original criteria. Canonical status was aligned with this result,
retaining previous claimed status and analysisStatus Needs Evidence. No final
generation is allowed.

Minimum evidence to continue: actual Color Measurement Service save/processing
source and owned database dependencies; current CRM step/workflow/web-resource
exports or traces; DAB created-audit and transaction guarantees; InstrumentHub
connectivity/runtime behavior and shared deployment API normalization. These are
evidence tasks, not extra approvals to answer business questions.

## Popup and verification

The existing standalone question panel now opens as a native modal on PBI selection
or page focus, with Load questions as fallback. It has grouped radios, evidence,
recommendations, Custom Answer, Decide Later, Save Answers, Save Draft and Cancel.
Only sufficiently supported local references can preselect a recommendation.
Selections are never approved without explicit save and answer provenance.
Drafts reopen; history and prior decisions remain; material evidence changes reopen
affected questions; stale state or local source changes reject saving. One final
consolidated approval remains the normal generation gate.

Verified: 59 core checks; existing and expanded UI tests; 16 approval/source/branch/
artifact regressions; all 13 PowerShell installer checks; final focused legacy
label/object PowerShell/JavaScript parity; native browser draft, custom/defer, cancel and grouped-save
interactions. Mobile 390x844 fits without horizontal overflow. The real-radio
Decide Later bug found during browser testing was repaired and retested. Browser
tests used isolated in-memory filesystem handles, not live PBI writes. Application
test suites and physical instruments were not executed.

The offline form cannot select directories, render inside Copilot chat, authenticate
an SDK device, independently refresh external repositories, or infer business-rule
document changes from an answer. Use the local HTML in Edge/Chrome, choose the legacy
repository root, select PBI 305974 in Continue PBI and open Load questions. After
answers, the agent updates only affected working sections from canonical decisions.

## Changed files

Builder sources and tests: [core.js](../maintainer/src/core.js),
[ui.js](../maintainer/src/ui.js), [shell.html](../maintainer/src/shell.html),
[test-ui.cjs](../maintainer/test-ui.cjs), [test-521.cjs](../maintainer/test-521.cjs),
[Install-PBIBuilder.ps1](../maintainer/installer/Install-PBIBuilder.ps1), and new
[build.cjs](../maintainer/build.cjs).
Generated HTML, bundle and release checksums/package are rebuilt. Maintainer notes,
changelog, validation supplement and this report document the changes.

External installed/PBI files changed, with no DAB/CDMS/UI source edits:

```text
playbook/pbi-builder/sources.yaml
playbook/pbi-builder/PBI-Builder.html
playbook/pbi-builder/installed-files.json
playbook/pbi-builder/skills/repository-knowledge.md
playbook/pbi-builder/skills/guided-pbi-creation.md
.github/agents/akzo-sdd-pbi-builder.agent.md
playbook/pbis/pbi-305974-take-measurement-backend-v1/EVIDENCE.md
playbook/pbis/pbi-305974-take-measurement-backend-v1/DRAFT-PBI.md
playbook/pbis/pbi-305974-take-measurement-backend-v1/VALIDATION-MATRIX.md
playbook/pbis/pbi-305974-take-measurement-backend-v1/OPEN-QUESTIONS.md
playbook/pbis/pbi-305974-take-measurement-backend-v1/pbi-state.json
```

The four generated installed UI/agent/guide targets were checked against ownership
hashes before updates and backed up. Unrelated installed ownership entries were
preserved; corrected source configuration ownership was registered. REQUEST.md,
pbi.json, the original DECISION-LOG.md and existing history remain untouched. No
commit, push or remote work-item creation was performed.