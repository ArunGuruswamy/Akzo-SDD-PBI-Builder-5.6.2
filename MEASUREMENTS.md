# Version comparison (deterministic)

Same settings for all: {"projectName":"Customizations","ide":"visualstudio","role":"legacy","sources":{"dab":"../DAB","legacy":"","cdms":""},"includeReferences":true}.
"Stated" means the installed agent, template or on-demand guides contain the instruction.
It does not prove a model follows it; that needs the comparison trial with real Copilot runs.

| Required behavior | v2.1 Concise states it | v3.0.0 states it | v3.1.0 states it | v4.0.0 states it |
| --- | --- | --- | --- | --- |
| Plugin source alone is not proof the rule is active | no | yes | yes | yes |
| Registration details to inspect (stage, mode, filtering attributes, enabled state) | no | yes | yes | yes |
| CDMS vs DAB/OCP/GraphQL decided per operation from evidence | no | yes | yes | yes |
| Async plugins/background workflows cannot block a save | no | yes | yes | yes |
| Execution identity: caller, impersonated or service | no | yes | yes | yes |
| Hidden/disabled button is not backend authorization | no | yes | yes | yes |
| Validation ownership matrix per rule | no | yes | yes | yes |
| Five readiness statuses incl. Needs Evidence and Awaiting PO/BA Decision | no | yes | yes | yes |
| Every BR mapped to ACs (positive/negative/boundary/permission) | no | yes | yes | yes |
| One consolidated PO/BA + technical + final user approval before REFINED-PBI.md | no | yes | yes | yes |
| Changed approved item invalidates approval | no | yes | yes | yes |
| Approval bound to fingerprints of the reviewed content, even without a rev change | no | no | yes | yes |
| Paths in scope recorded per PBI and rule, with a reason when not applicable | no | no | yes | yes |
| Evidence records with level (code, registration, reach, runtime) and source | no | no | yes | yes |
| External evidence needs a revision; unobtainable evidence is a gap with an owner | no | no | yes | yes |
| Document must carry the same rule and criterion text as the state | no | no | yes | yes |
| Code-enforced versus agent-dependent controls stated | no | no | yes | yes |
| 3.0.0 approvals never carried forward on migration | no | no | yes | yes |
| Business users never asked about registration, pipelines, builds or deployment | no | no | no | yes |
| Technical gaps go to the technical assessment instead of blocking business refinement | no | no | no | yes |
| Interactive answers in VS Code (vscode/askQuestions) with a numbered fallback | no | no | no | yes |
| One answer approves one decision; no second confirmation | no | no | no | yes |
| Guided Create PBI with prefill, save draft and resume | no | no | no | yes |
| Bounded CRM plugin/workflow call-chain tracing with plain-language explanation | no | no | no | yes |
| Legacy CRM evidence never proves DAB behavior; recorded evidence scope | no | no | no | yes |
| New PBI starts without earlier decisions or approvals | no | yes | yes | yes |
| Question gives business example and consequence of each option | no | yes | yes | yes |
| Do not re-ask an answered question in this PBI | no | yes | yes | yes |
| Reusable knowledge separated from PBI state, with fingerprints | no | yes | yes | yes |
| Reference documents navigated by heading index, not loaded whole | no | yes | yes | yes |
| One unresolved question at a time (kept) | yes | yes | yes | yes |
| No application code changes during refinement (kept) | yes | yes | yes | yes |

Instruction coverage: v2.1 Concise 2/32, v3.0.0 18/32, v3.1.0 25/32, v4.0.0 32/32.

## The four reported readiness gaps
Each state below is what a 3.0.0 agent records (schemaVersion 1); the same files are checked by both engines.

| Gap | 3.0.0 computed status | 4.0.0 computed status |
| --- | --- | --- |
| 1. approved rule text changed without a rev change | Development-Ready | Draft |
| 2. final document with only a status line and IDs | Development-Ready | Draft |
| 3. DAB target path omitted | Development-Ready | Draft |
| 4. rule cites an evidence ID with no evidence record | Development-Ready | Draft |

The same gaps written in the current format (schemaVersion 2), each the only defect:

| Scenario | 4.0.0 computed status |
| --- | --- |
| gap 1: approved rule text changed without a rev change | Ready for Review |
| gap 2: final document with only a status line and IDs | Ready for Review |
| gap 3: DAB path omitted for a rule | Needs Evidence |
| gap 4: rule cites an evidence ID with no record | Needs Evidence |

## Readiness checks without an AI run
v2.1: no deterministic check; readiness is whatever the model writes.
v4.0.0: 61/61 shared scenarios give the expected status (identical in the wizard and PowerShell); 53 of them must not be finalized and none is allowed to be.

## Not measured here
Missed rules, incorrect ownership, unsupported assumptions, repeated questions and readiness
errors in real model output; elapsed time; searches; tool calls; tokens; AI credits. Record them
with Compare old & new (results.csv, QUALITY-REVIEW.md) using identical requests and repository state.

## Automated results (27 October 2026, this machine)
Windows 11, Node v20.20.2, Python 3.13.7, Windows PowerShell 5.1.22621.6133, CurrentUser policy RemoteSigned.

| Suite | Result | Elapsed |
| --- | --- | --- |
| test-core.cjs | passed, 30 PASS lines | 1815 ms |
| test-ui.cjs | passed, 1 PASS lines | 308 ms |
| test-ps.cjs | passed, 7 PASS lines | 84455 ms |

Elapsed times are for the automated suites only, not for refinement work.
