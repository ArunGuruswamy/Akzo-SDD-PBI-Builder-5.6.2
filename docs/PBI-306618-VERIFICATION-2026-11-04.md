# Interactive evidence verification: PBI 306618 scenario

## Scope and canonical-state limitation

Work used the current local Builder 5.3.0, not a remote checkout. Application
sources were read only. No commit, push, application-code edit or approved
decision change was made.

The existing 306618 folder/transcript was not found in the configured repositories,
including their root-level and Source/playbook layouts. A location was requested,
but no user answer was available. No replacement PBI or invented decision history
was created. These are source findings for the five supplied requirements, not
claims about unseen approved 306618 criteria. The regression fixture is explicitly
synthetic. Findings cannot be merged into 306618 until its actual canonical folder
is available.

The existing 305974 backend-v1 was checked read-only: ASK_DECISION /
DEPENDENCY_VERIFICATION, five external gaps, Draft, 18 issues, two warnings,
finalAllowed=false. No existing PBI files were changed by this upgrade.

## Exact Builder defects corrected

- Unknown implementation coverage was not a first-class executable work queue.
  Accessible rules now take AUTO_VERIFY precedence over decisions and completion.
  The host read-only adapter can verify up to eight rules per invocation, save each
  result and immediately continue. Routine source investigation needs no permission.
- A component match could be mistaken for implementation proof. Classifications now
  require source-located evidence and explicit implementation, template, service,
  contract, validation and test facets. Partial/missing findings require exact work
  and tests; absence requires the searched scope. Runtime/source gaps require
  concrete verification tasks, not an implementation claim.
- Fresh source mismatches or changed evidence invalidate dependent verification.
  Local adapter observations are checked against actual file hashes before saving.
  Existing evidence IDs cannot be silently overwritten.
- Source failures now become canonical external tasks automatically. A repeated
  failed application source is not probed for every remaining rule.
  Their blocking rule gaps are understood by both readiness checkers; a runtime
  blocker cannot be cleared with source-only proof.
- Root-only folder validation rejected legitimate Source/playbook installations.
  Root-qualified discovery now checks the two supported layouts once, caches
  negative probes, respects configured sources and refuses ambiguous matches.
  It never recursively searches histories/backups or invents a source path.
  If the browser selects an ancestor of an existing Source installation, it uses
  that installation handle for settings/repair rather than creating a second one.
- Working-document synchronization did not include implementation-verification
  results, acceptance validation coverage or external-verification tasks.
  Shared JavaScript/PowerShell specifications now synchronize these sections.
- Saving a browser answer did not execute the next workflow step. It now does.
  This exposed and fixed decision-log appends being consumed by the trailing
  generated section on synchronization; narrative decisions are retained.
- Root caching must be invalidated after configuration writes/removal and newly
  created playbook roots. Regression testing caught and corrected stale settings
  following uninstall.
- Cross-checker JSON formatting caused needless READINESS.json rewrites.
  Semantically identical reports are now retained, with optimistic concurrency.
- Ready for Review no longer produces COMPLETE before approval/artifacts:
  it presents a final-review decision. An absent checker result routes to VALIDATE.

## Source roots used

Paths below are relative to these verified configured roots:

- UI: `C:\Users\RGA\source\repos\AN.ColorAppsAzure.UI\AN.ColorAppsAzure.UI`
- DAB: `C:\Users\RGA\source\repos\AN.ColorAppsAzure.BL`
- CDMS: `C:\src\ColorDMS`
- Legacy: `C:\Users\RGA\source\repos\AN.ColorDMS.Customizations`

UI component paths below start at
`projects/shared-external-libs/src/lib/components/`.
DAB and CDMS paths start at their Formula projects under `src/`.
No configuration values, credentials or runtime data were copied.

## Five-rule source verification

### 1. Industry Variant filtering: PARTIALLY_IMPLEMENTED

Verified UI chain:

- `create-update-imitation-request/base-imitation-request/base-imitation-request.html:12`
  binds Color Name search, loading, pagination and selection.
- `create-imitation-request/create-imitation-request.ts:116` reloads colors when
  request type changes; search/page handlers pass the selected request type.
- `shared/store/create-imitation-request-store/color-name.feature.ts:36` forwards
  requestType.id; failed calls set the store error/loading state.
- `shared/services/imitation-request-lookup.service.ts:23` sends
  imitationRequestTypeId to Lookup/SearchMarketColors, maps items and checks the
  API success/data contract. Its declared pagination shape is hasNextPage/endCursor.

CDMS SearchMarketColorsHandler forwards the type to LookupQueryService.
`MarketColorInstanceCriteriaResolver.cs:42` specifies Global role, Industry kind
and HasVariantSuffix for Industrialization. However the called
`MarketColorQueryService.cs:183` LINQ ApplyCriteriaFilter enforces role/kind but
does not enforce HasVariantSuffix. The separate LookupQueryService filter helper
contains suffix logic; that is not proof it runs in this paged search chain.

DAB `SearchMarketColorsHandler.cs:13` maps only MasterCandidate to Shade;
Industrialization falls through to the generic search. Its declared response
uses HasMoreResults/NextPageToken. No deployed adapter normalizing this to the UI
shape was verified.

Required work: add the missing target-specific Industrialization criteria and
ensure the executed paged query enforces them. Test Global+Industry with/without
suffix, wrong role/kind, all pages, type switching, API failures and unrelated types.
Existing resolver and UI forwarding tests are source evidence, not proof of
deployed dropdown contents.

### 2. Duplicate IR / New Sample: BUSINESS_DECISION_REQUIRED

Verified UI validates required form controls and dropdown selection, submits the
request and displays per-product server errors; it does not implement a separate
Industrialization-specific duplicate/prerequisite rule.
`create-imitation-request-service.ts:111` collects failed-product errors.
Existing service specs cover reference-color behavior for Industrialization.

DAB `CreateImitationRequestValidator.cs:139` checks active duplicates by instance,
product and local/global scope, then underlying-color crossovers. Its paint-system
prerequisite at line 169 rejects non-New-Sample requests when no paint system
exists and rejects New Sample when one exists. Adaptation is exempted from that
prerequisite in the constructor; Industrialization is not.

Legacy `Source/Formula/ImitationRequest/ImitationRequest/ClsPostOnSaveImitationRequest.cs:460`
returns before the prerequisite check for Industrialization, Adaptation and
Digital Variant. That is a verified source difference, not a verified active
registration or a business instruction for this PBI.

Genuine decision: retain the Legacy Industrialization prerequisite exemption, or
require an existing paint system as the current DAB generic validator does.
Recommendation for consideration: retain the scoped Legacy exemption and keep
duplicate protection, unless the actual approved PBI says otherwise.

After the answer, define target-specific server validation and UI error behavior.
Tests: same instance/product duplicate, cross-instance same-color duplicate,
local/global scope, no/existing paint system, New Sample, Industrialization and
unaffected request types. Existing DAB validator tests cover generic duplicates
and New Sample; they do not establish the requested Industrialization decision.

### 3. Paint System Level: PARTIALLY_IMPLEMENTED

The UI binding is VERIFIED_IMPLEMENTED at source level, not missing:
`base-paint-system.html:79` binds the control;
`base-paint-system-service.ts:24` creates it disabled.
The IR and response form-populator utilities populate the API level name.
Their specs explicitly cover Industrialization and null responses.

Persistence is server-owned, not an editable field to add to the UI payload:
CDMS `PaintSystemEntityBuilder.cs:147` maps Industrialization to Industrialized
on creation. DAB `UpdatePaintSystemInputFactory.cs:12` derives Industrialized
from the linked IR and sends PaintSystemLevelId through the update mutation.
UpdatePaintSystemHandler validates and calls the command service; the command
service checks GraphQL errors and missing data.

DAB `CreatePaintSystemInputFactory.cs:79` does not assign PaintSystemLevelId
in the create input. The reviewed creation path does not prove that the external
GraphQL/database layer derives it. Do not equate the correct UI binding or update
mapping with verified create-time persistence.

Required verification/work: verify create/read/reload for both backends; establish
whether DAB creation derives the level downstream. If not, add the missing
server-owned mapping. Test Industrialization, Adaptation, unrelated/null types
and attempted client tampering. No UI editability policy was invented.

### 4. Measurement override: PARTIALLY_IMPLEMENTED

The UI confirmation is VERIFIED_IMPLEMENTED:
`update-paint-system-service.ts:25` prompts only for Industrialized+Developed.
Yes/No are forwarded; dismissal emits nothing and aborts saving.
`update-paint-system-component-service.ts:148` subscribes and sends
useAttemptMeasurementForIndustryVariant. The store/service sends the Update call
and records response/error state. Existing specs cover Yes, No, dismissal and
nonmatching contexts.

The full replacement workflow is not verified. DAB UpdatePaintSystemRequest
does not declare that flag, and its update input factory does not forward it.
CDMS UpdatePaintSystemRequest declares it, but the reviewed update handler's
entity mapping does not use it. The separate CDMS PublishPaintSystemHandler
forwards a flag to COS; that is a different route, not proof that UI Update
performs replacement. Legacy PaintSystemStatusChange contains color replacement
source, but active registration, transactions and deployed execution remain
unverified.

Required work: connect the chosen update/actualization contract to its consumer.
Tests: Yes replaces once, No preserves, dismissal makes no update, ineligible
contexts never replace, and server failures remain visible. External/runtime
task: verify persisted measurements and rollback/idempotency with the service owner.
No replacement, audit or transaction guarantee is assumed.

### 5. Developed-only / Predicted exclusion: VERIFIED_MISSING (client filter)

`base-paint-system.html:8` binds kindOfFormulationOptions directly.
`shared/store/shared/paint-system-dropdown-store.ts:36` passes the complete option
set through without Industrialization filtering.
`shared/services/paint-system-option-sets.service.ts:28` requests options with
filter:null. Its errors are logged and can yield empty option sets; that must not
be mistaken for a successful Developed-only restriction.
The state service only rejects Developed when isMeasurementAdded is explicitly
false; it is not a Predicted exclusion or a Developed-only filter.

Required implementation: apply the scoped Developed-only restriction and exclude
Predicted in the relevant UI flow; verify the authoritative backend validation
too. Tests: Developed allowed, Predicted/other values excluded, loaded disallowed
values handled explicitly, no-measurement rejection, failed option lookup and
unrelated workflows unchanged. Actual deployed option-set contents remain a
runtime fact, not inferred from source.

## Interactive continuation and host results

Synthetic 306618 regression executes five read-only adapter investigations in
order, records classifications, synchronizes draft/evidence/validation/questions,
and reaches the next genuine canonical question. A warm resume makes no adapter
calls; a material source change schedules affected verification again. Custom
answers are persisted, approved decisions retained, and the next step executes.
A source failure is recorded once and propagated as actionable verification work.

VS Code native vscode/askQuestions and Custom Response declarations are unchanged.
Visual Studio retains its separate tools and concise chat fallback when no native
question tool is exposed. Generated profiles and handlers are tested; live agent
discovery and native IDE popup invocation are **NOT VERIFIED** in either IDE.

## Measurements

Actual configured-root resolution: cold 16 ms, one file open, 464 bytes; warm
0 ms at millisecond resolution, zero file opens/bytes/listed entries/writes.
A targeted UI fingerprint pass read 14 distinct files, 67,844 bytes in 89 ms,
with zero repeated opens, missing files, directory listings or writes.
These are filesystem operations, not claims about total agent tool calls or
end-to-end analysis speed. The pass is not the entirety of the investigation.
Full transcript source-search totals, complete tool-call totals, model tokens and
an equivalent prior 306618 run are **NOT MEASURED**.

The existing targeted benchmark was also run for five samples against the exact
local HEAD engine from before this request (not a remote version). Median ms:

| Operation | Before | After | File opens before/after |
|---|---:|---:|---:|
| Cached discovery | 444 | 240 | 10 / 10 |
| Evidence freshness | 50 | 38 | 2 / 2 |
| Readiness | 869 | 648 | 41 / 41 |
| Warm synchronization | 1189 | 1199 | 61 / 65 |

These are synthetic filesystem scenarios on a shared machine, not a controlled
end-to-end agent speed comparison. Synchronization checks more derived coverage
and preserves existing JSON bytes: repeated opens increased from 39 to 43 and
bytes read from 89,524 to 96,954. It made zero writes before and after. No broad
read-count reduction or total-analysis speedup is claimed from those timings.

## Tests and delivery

| Validation | Final result |
|---|---|
| Generator (`test-core.cjs`) | PASS: 59 workflow checks |
| Verification + 5.3 + targeted suites | PASS: 26 tests, including seven new scenarios |
| Snapshot/5.2.1 regressions | PASS: 17 tests |
| Browser event-handler smoke | PASS, including Source installation repair without a second install |
| Real-file E2E | PASS: 14 checks |
| Windows PowerShell installer suite | PASS: 15 checks |
| Final targeted PowerShell synchronization | PASS: exact JS parity, runtime blocker, malformed derived-JSON repair with history, clean JSON stdout, no warm rewrite |
| Router constraint / diff whitespace | PASS |
| Live IDE popup/discovery, deployed APIs, Angular application suites | NOT VERIFIED |

No unresolved test failure remains. Intermediate regression failures were
investigated and corrected rather than weakening established expectations.
Application tests were inspected, not executed or modified. Host-profile assertions
and simulated browser handlers are not live Visual Studio/VS Code executions.

Changed source: maintainer/src/core.js, maintainer/src/ui.js,
maintainer/installer/Install-PBIBuilder.ps1. Related tests:
maintainer/test-verification.cjs, maintainer/test-530.cjs, maintainer/test-ui.cjs.
Documentation: this report and maintainer/README.md. Generated runtime package
files are rebuilt from these sources; no installed application repository is
updated automatically by this task.

The existing local 5.3.0 ZIP was preserved in the session workspace before
rebuilding the root HTML, bundle, installer, checksums and local release ZIP.
This does not publish or install the update. Existing installed profiles keep
their prior behavior until upgraded in their configured installation roots.
Use the rebuilt installer with the existing config: Preview, review, then
AllowUpdates in each authorized location; retain conflicts for manual review.
No application/PBI migration or decision replacement is required.

## Next genuine question and remaining limitations

For Industrialization, preserve Legacy's exemption from the paint-system /
New Sample prerequisite while retaining duplicate IR checks (recommended for
compatibility), or use the current DAB generic prerequisite? Custom Response is
also valid. This is a proposed question, not a recorded or approved decision.
The actual 306618 approved criteria must be reconciled before changing policy.

The next action is presented through the active session's interactive question
tool, not a request for permission to continue searching. Without an answer the
question stays pending. Without the real canonical 306618 folder, an answer
cannot be safely merged into that PBI's state/history.

External limitations remain: deployed API/paging normalization, DAB create-time
level derivation, active Legacy registrations, the measurement consumer/COS
behavior, persisted replacement and transaction/rollback behavior, and runtime
option-set contents. No authorization policy, audit guarantee or service
contract was invented. These source observations do not certify which build is
deployed.
