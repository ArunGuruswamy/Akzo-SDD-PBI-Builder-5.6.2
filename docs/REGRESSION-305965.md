# PBI 305965: root causes and the 5.0 changes

The issues were reported during PBI 305965: repeated questions, unnecessary approvals, manual
snapshot commands, inconsistent scope decisions and readiness-state problems. The PBI's own
folder is not in this repository. Each cause below is therefore traced to the 4.x rule that
produces the symptom, not to the PBI's files. Each fix has a regression test in
`maintainer/test-core.cjs`, `test-ui.cjs` or `test-ps.cjs`.

## Root causes in 4.2.0

| Symptom | Cause in 4.x | 5.0 change | Test |
| --- | --- | --- | --- |
| Repeated questions | Every rule needed an approved decision (DECISION_PENDING), and no rule allowed a decision taken from explicit request text, so the agent asked users to confirm what they had already written. Questions came one to three per message, one round per message. | Explicit request rules become approved decisions with `"source": "request"` and the quoted text; the rest come together in one decision review. | test-core: 5.0 development targets (agent text) |
| Unnecessary approvals | Development-Ready required three approvals (PO/BA, technical, final user). For each one, the user ran the check and pasted the fingerprint back to the agent. | One required approval (`approvals.user`), recorded by Review & approve with the fingerprint the form computes. PO/BA and technical are optional external records, checked only when recorded. | readiness fixture "PO/BA and technical approvals are optional…"; Approve & Generate tests |
| Manual snapshot commands | History copies were the agent's job, but nothing forbade asking the user. The agent also wrote final documents itself, which needed backups. | The agent copies to history/ itself and never asks for a snapshot command. Approve & Generate backs up every file it touches, verifies, and restores everything on failure. | "Approve & Generate refuses…, rolls back a failed generation…" |
| Inconsistent scope decisions | The target was CDMS, DAB or Both, with no UI area. References were chosen ad hoc, so a DAB PBI could skip CDMS. The readiness check always required both cdms and dab paths, which pushed a CDMS-only PBI to assess DAB. A UI exclusion in the requirement had nowhere to go. | Development targets CDMS + UI, DAB + UI, UI Only and Both, with fixed repository roles (DAB always reads CDMS). Required paths follow the target. A path the target excludes cannot apply (TARGET_SCOPE_CONFLICT). A UI exclusion is recorded as `paths.ui` not applying, and no PBI-UI.md is produced. | readiness target cases (form and PowerShell); "UI scope excluded by the requirement" |
| Readiness-state problems | Approval and generation were separate steps: the agent claimed statuses and wrote final documents, and the check judged them afterwards. Final documents from an earlier run blocked a new review (FINAL_WITHOUT_APPROVAL, DOC_OUT_OF_SCOPE). | Review & approve judges the working draft (earlier final documents are ignored, then moved to history). A premature Development-Ready claim is reported, and the one approval settles it. Generation is accepted only when the check reports Development-Ready with no issues. | "The agent claimed Development-Ready too early…"; "Request Changes after approval…" |

## Regression scenarios for 305965

The 305965 issues listed were UI scope changes, ICO formula-code timing conflicts,
approval-state inconsistencies and readiness-check limits. The scenarios below test the
mechanism behind each one:

- **UI scope change**: Both with UI excluded by the requirement produces only PBI-CDMS.md and
  PBI-DAB.md. A reference recorded as an implementation target is refused.
- **Conflicting timing rules**: two acceptance criteria that disagree on when a code is set are
  recorded as an open blocking question. Approve & Generate refuses, and nothing is written. The
  ICO formula-code details of 305965 are not in this repository, so the test models a generic
  conflict between two criteria.
- **Approval state**: a rule changed after approval makes the approval stale (`user: changed
  BR-2`). A new approval replaces it, and the old one is kept in approvalHistory.
- **Readiness limits**: earlier final documents do not block a new review. A failed file write
  restores every touched file, and nothing is approved.

## What 5.0 cannot verify

The checks confirm completeness and consistency, not that the business content is right. Live
Copilot behavior is not covered: whether the model follows "do not ask again" or reads code
before concluding. Neither is the rendered browser (native folder and save dialogs, Word
opening the DOCX). These still need a first team-machine run with a real PBI.
