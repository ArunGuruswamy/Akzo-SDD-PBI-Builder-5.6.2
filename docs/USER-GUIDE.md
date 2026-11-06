# Akzo SDD PBI Builder 5.6.2: user guide

You do not need to know the templates, the code or terms such as plugins or workflows. Describe
what you need in Copilot Chat; the agent investigates configured source and asks only for business
decisions. The HTML form is optional for setup, evidence inspection, dashboards and downloads.

The workflow is: **Configure repositories → Describe the PBI in Chat → Analyze existing flow →
Answer business questions in Chat → Review and approve in Chat → Generate.** The form's journey
bar is optional and reads saved files.

## Start a PBI
**In Copilot Chat** (recommended). Select "Akzo SDD PBI Builder - <your project>" and type
`Start PBI` (or Create PBI, New PBI, Start Development or Implement PBI). The agent asks only for
missing details together, then investigates accessible configured repositories without asking
permission to inspect files. It reports source access, verified behavior, differences and only
material unresolved business decisions.

**Optional form.** Open `playbook/pbi-builder/PBI-Builder.html`, or the package's
`Akzo-SDD-PBI-Builder.html`, choose the repository folder and open the **New PBI** tab. It has
four steps:

1. **Requirements**: PBI number (an Azure DevOps number or your own identifier such as
   `LOCAL-12`), title, description and acceptance criteria are required; attachments are
   optional. Acceptance criteria are kept exactly as entered. Missing fields are marked
   where they are, with the reason.
2. **Legacy repository**: choose the configured legacy source (for example
   AN.ColorDMS.Customizations). **Validate** lets you browse to the folder to check its name and
   Git root. **Add or remove repositories** takes you to setup; removing a repository there only
   changes the configuration, never the folder. The form remembers your last choice.
3. **Development target**: "Which project are you developing the PBI for?" Tick one or more of
   three independent boxes. The UI is always optional: ticking CDMS or DAB never ticks the UI, and
   ticking the UI never ticks a backend. Each ticked target gets exactly one Refined PBI:

   | Ticked | Implemented in | Read only (reference) | Refined PBI |
   | --- | --- | --- | --- |
   | CDMS | CDMS | Legacy | Refined-PBI-CDMS.md |
   | DAB | DAB | Legacy, **CDMS** | Refined-PBI-DAB.md (with CDMS references) |
   | Shared Angular UI | Shared Angular UI | Legacy, CDMS and DAB contracts when no backend is ticked | Refined-PBI-UI.md, once |

   Any combination works (seven in all); each ticked target's documents are generated on their own.
   An unticked area never gets a document. When the analysis finds UI changes but the UI is not
   ticked, the agent records them as a dependency and asks whether to add the UI; if you say yes it
   changes the target for you (no file editing) and the UI gets its own Refined PBI.

   The form lists each repository's role and path; **Correct repository paths** fixes a missing
   one. DAB always reads CDMS to reuse what CDMS already implements, and never changes it. CDMS
   and DAB share one Angular application, so UI work is planned once.
4. **Review & start**: the analysis mode (Quick, **Deep** by default, or Comprehensive), optional
   extra references, optional details, and a summary. **Start analysis** saves the intake and
   gives you the prompt for Copilot. **Save draft** keeps unfinished work.

If the PBI number already exists, you choose **Resume**, **Review** or **Start New Version** (a new
folder). Nothing is overwritten.

The agent then investigates on its own: it reads relevant accessible code (never only file names
or older analysis documents), reports inaccessible sources, distinguishes verified behavior from
inferences and unavailable evidence, and reports progress at milestones.

## Answer business questions
After investigating, the agent asks only what the request and the code cannot settle, **one
question at a time**, the earliest unanswered first. Moving between questions, skipping or Decide
later answers nothing: the Refined PBI waits until every mandatory question has your explicit answer.
An open blocker (missing evidence, development work, a runtime check or an owner decision) is also
asked about, one at a time, so refinement never stops at the draft. The progress line names the
stage: Intake, Source Analysis, Questions, Refinement Review, Approval, Refined PBI, COMPLETE. A rule your request already states is recorded as a decision
without a question. Each question shows:
- what happens today, what the requirement expects and what is missing;
- an evidence-backed recommendation and why, or **NO RECOMMENDATION** when support is insufficient;
- choices A–D where appropriate, plus Custom answer and Decide later;
- business and technical impacts and the supporting references.

The form checks cited local files and any recorded content hashes before displaying a
recommendation. It shows when a local hash is absent or an external source's current freshness
cannot be checked. Multiple questions sharing a local source use one read per question screen.

Conflicting acceptance criteria are always asked about, never resolved silently.

| Where | How you answer |
| --- | --- |
| Copilot Chat | Use the native question control when available; otherwise reply with a numbered choice, a custom answer, or `Decide Later` |
| The optional form, Continue tab, **Answer business questions** | Load questions, pick an answer or write a custom one, enter your name, Submit. Edit previous answer and Decide later are there too |

Confirmed answers are recorded with their decision history; a recommendation is never silently
approved. Decide Later keeps a material question open. Answered questions are not asked again unless
the supporting evidence or requirement changes. The agent saves drafts and its history copies as it
works; routine internal file operations do not require your approval.

## Other commands
| Command | What it does |
| --- | --- |
| `Resume PBI 305915` | Continues a draft or the next open question |
| `Review PBI 305915` | Summarizes status, decisions and open questions |
| `Edit PBI 305915` | Changes details or an earlier answer |
| `Show Decisions 305915` | Lists decisions with who, when and what they replaced |
| `Analyze Legacy 305915` | Explains how the legacy CRM process works, with file and line evidence |
| `Show Technical Flow 305915` | The traced call chain |
| `Extract Plugin Rules 305915 FormulaPlugin` | Writes PLUGIN-RULES.md: each validation and business rule with its condition, exact error message, data needed, whether DAB must implement it, and test cases |
| `Analyze Workflows 305915 Create Paint System` | Writes PLUGIN-WORKFLOW-COVERAGE.md for the classic workflows and custom workflow activities on that operation |
| `Generate Acceptance Criteria 305915` | Proposed Given/When/Then criteria for review |
| `Export PBI 305915` | Prepares the refined draft in Chat; final artifacts require explicit approval |
| `Validate PBI 305915` | Runs the available readiness check and explains the result in Chat |

These are phrases for the agent, not editor commands. The number can also be a title or folder.

## Attachments: what to expect
- The agent reads what its tools can open: text, Markdown, source files and usually images
  attached in chat.
- If it cannot open a file (for example some PDF or Word files), it says so and asks for text or
  an export. It never guesses a file's content.
- Nothing in an attachment counts as an approved requirement just because it is written there.

## Review, approve once and generate
When the analysis is complete the agent sets the draft to Ready for Review, runs the readiness
check, and summarizes the PBI, source findings, implementation differences, confirmed decisions,
blockers and material warnings in Chat. It offers **Approve & Generate**, **Request Changes** and
**Save Draft / Decide Later**. Use an explicit reply; silence and recommendations are not approval.
In VS Code, approval calls the installed PowerShell `ApproveAndGenerate` action; the agent supplies
the current review fingerprint and the approver name you provide. In an IDE that cannot execute
commands, it gives you the equivalent installer command to run. The installer rechecks readiness
and reviewed content before recording approval. When PowerShell scripts are blocked, the optional
form can still perform its browser-based workflow.
When the native question control is unavailable, the agent uses numbered choices in Chat. The
review covers the same information as the optional form's **Continue** tab, **Review selected PBI**.
That screen shows seven cards: the
PBI, requirements and acceptance criteria, repository analysis, implementation approach (CDMS,
DAB and shared UI), business decisions, untrusted content and sensitive data, and technical
readiness with any blockers. When something does not block the PBI (a gap graded WARNING or
INFORMATIONAL, or evidence the agent could only assume or could not read) an eighth card,
**Warnings (these do not block approval)**, lists it, and the collapsed **Detailed evidence,
analysis plan and warnings** panel shows the full evidence list. The same warnings appear under
"Open issues and assumptions" in every generated Markdown, JSON and DOCX.

- **Approve & Generate** (needs your name): records your final approval, bound to a fingerprint
  of exactly what you reviewed, sets the PBI to Development-Ready and generates the final PBIs
  for the target, each as Markdown, Word (DOCX) and JSON. Every file is read back and checked;
  if anything fails, the earlier files are restored and nothing is approved. It is disabled
  in the optional form while a blocker remains; chat will not generate when readiness has blockers.
- **Request Changes**: saves your change request as a refinement brief and gives you the prompt
  for the agent. Nothing is approved.
- **Save Draft / Decide Later**: keeps the current draft and unresolved questions without
  approval.

After generation the final Markdown, JSON and DOCX artifacts are written and verified by the
existing installer action (Chat) or browser generator (form). For the Both target, shared UI work
appears once in Refined-PBI-UI.md. PBIs generated before 5.5 keep their PBI-CDMS/DAB/UI files; the
next approval writes the Refined-PBI names and moves the earlier files to history/.
The optional form offers a download dialog and ZIP; Chat remains the normal path and does not
require navigating to HTML. In the form, the download dialog provides DOCX, Markdown, JSON,
preview and **Download Complete Package — ZIP** with every PBI and supporting documents.
Downloads are read from the generated files and refused if a file changed since. Where the browser
supports it you choose where to save. Browsers cannot open File Explorer, so the window shows the
PBI folder instead.

Your approval is the approval of the PBI draft only. PO/BA, security, architecture or technical
sign-off that your organization requires is a separate step. A material change to the reviewed
requirements, decisions, documents, attachments or recorded local evidence-source contents makes
a snapshot-bound approval stale; review and approve again. Document line endings and metadata JSON
layout are cosmetic. Source and attachment bytes are checked exactly, so even a formatting-only
edit to either requires review again. External evidence is bound to its recorded revision, but
the form cannot verify that repository's current contents. The final PBIs carry local draft
identifiers; the tool never creates or publishes Azure DevOps work items.

## Additional implementation references
The development target already decides which repositories are analyzed. Under **Add
implementation references** (Review & start) you can add other configured repositories as extra
read-only references for this PBI. The agent compares each requirement with them in the
"Implementation comparison" section of VALIDATION-MATRIX.md, with file and method references, or
"No matching implementation found". Configure repositories once: form setup (paths typed as
`Name = path`, plus the Legacy, CDMS, DAB and shared Angular UI paths) or the setup window (a path,
Browse and a status for each repository, in the one window). The check confirms completeness and
consistency; it cannot confirm that the content is right or who really approved.

## CDMS, DAB and the legacy rules
The agent reads the legacy code (plugins, workflows, custom workflow activities, JavaScript,
HTML web resources and ribbon commands) and lists every business rule once, with all the places
it was found, in VALIDATION-MATRIX.md. Ask for LEGACY-BUSINESS-RULE-CATALOG.md or
BUSINESS-RULE-OWNERSHIP.md if you want them as separate documents.

## The repository is the source of truth
PBI -> repository discovery -> source investigation -> business-rule validation -> gaps ->
decisions only when blocked -> readiness -> refined PBI and SDD handoff.

**Evidence is collected automatically and only as much as the decision needs.** The agent
classifies each evidence record as VERIFIED (read in current source), ASSUMED or UNAVAILABLE, and
each open gap as BLOCKING, WARNING or INFORMATIONAL. Only a BLOCKING gap, or evidence a claim
cannot do without, holds a PBI back; unrelated legacy side effects and optional metadata become
warnings. Discover sources (Continue tab) maps solutions, entry points and the branch and commit
once, writes a source file-name index, and later runs reread only what changed. Refresh evidence
fingerprints marks a stored finding stale when its file, or a file it depends on, changes;
unchanged findings are reused by later PBIs. Decisions and answers are never reused across PBIs.
The collapsed **Run details** below the status line shows what an operation actually read and wrote.

The agent reads the application repository itself. It never needs, writes or waits for a separate
end-to-end analysis document. Older analysis documents, including the ColorDMS reports the form
can still install on request, are optional background: never a prerequisite, never evidence of
current behavior, and never deleted by the Builder. Every investigation checks the current code
again. Findings go, briefly and with file references, into EVIDENCE.md and VALIDATION-MATRIX.md.

Required per PBI: REQUEST.md, DRAFT-PBI.md, VALIDATION-MATRIX.md, EVIDENCE.md, DECISION-LOG.md,
OPEN-QUESTIONS.md, pbi-state.json and the final refined PBI. Only on request: PLUGIN-RULES.md,
PLUGIN-WORKFLOW-COVERAGE.md, the rule catalog, shared rules, ownership and acceptance-criteria
documents, and the developer handoff export.

- **CDMS:** a rule an existing CRM plugin already handles (with its registration checked) is
  reused; the PBI says to verify it, not to build it again. Workflow and JavaScript rules are
  included as CDMS API work or verification.
- **DAB:** there is no DAB plugin. Every applicable rule is a DAB requirement, implemented in DAB's
  own code (Azure Functions, CQRS handlers, FluentValidation for input checks, domain services,
  GraphQL). The PBI says what DAB already has, what is partial and what is missing.
- **Both:** one shared set of business rules and decisions, and two separate application PBIs.

Every rule is checked branch by branch (for example Yes and No, failure and rollback). A plugin
that handles the Yes path does not make the rule covered; a missing No path is reported as a
gap with its risk and a proposed approach.

## Handing over to development
On the Continue tab, select the PBI and click **Export developer handoff**. It writes
`business-rules.json` (for the development agent) and `BRANCH-COVERAGE-MATRIX.md` from the PBI's
recorded state, and keeps earlier exports in `history/`. The file separates approved
requirements, proposed requirements and technical findings, and lists every open gap.

Legacy code tells the agent what DAB must do; it never proves what DAB already does. If an
earlier decision left legacy evidence out of a PBI, it stays until you change it.

## Visual Studio: what the agent can read
In Visual Studio, Copilot's agent file tools read only files in the open solution, or in the
opened folder and its subfolders (Microsoft: "Use Agent Mode", FAQ). A repository next to it, such
as `..\AN.ColorDMS.Customizations`, is out of reach unless the folder you open contains it. The
agent checks this before every analysis, reports a source it cannot read as "configured but
inaccessible" (never as missing), and says which conclusions stay unverified.

Repository-level agents are found in the `.github\agents` folder at the repository root, and
skills in `.github\skills` (Visual Studio 18.5 or later; Microsoft Learn, "Use Agent Skills").
Install the Builder at the Git root (the folder with `.git`); the installer warns otherwise.

The agent searches the whole repository, not only the loaded solution. A repository can hold
several solutions, for example plugins in one and JavaScript web resources in a sibling one;
open the repository root as a folder so all of them are reachable. **Discover sources** lists
every solution and, per folder, the kinds of files it holds, including JavaScript that no project
lists. To name the folders that matter in one repository, create
`playbook\pbi-builder\knowledge\SEARCH-SCOPE.md` yourself, for example:

```
# Search scope
- Source/Formula
- Source/WebResources
- Source/Measurement
- Source/MarketColor
```

The installer never writes or overwrites it. Before saying a feature is missing, the agent searches
every relevant layer and reports each finding as found and verified, found but not yet reviewed,
not found within the listed searches, or inaccessible.

| Analysis | Install the Builder into | Role / sources | Open in Visual Studio |
| --- | --- | --- | --- |
| Custom (Legacy CRM/XRM) only | the legacy repository | role `legacy`, legacy source `.` | File > Open > Folder on the repository root (a `.sln` in a subfolder would leave the root, and the Builder's `playbook\` folder, outside the agent's reach) |
| DAB (GraphQL) only | the DAB repository | role `dab`, DAB source `.` | the repository root folder |
| CDMS only | the CDMS repository | role `cdms`, CDMS source `.` | the repository root folder |
| Several repositories | the repository you work in; other sources as relative paths (`../Legacy`) | as above | a common parent folder that contains every clone. Not verified yet: whether Visual Studio still lists an agent stored in a child repository when the opened folder is the parent. Check it with the list below; if the agent does not appear, analyse from each repository in turn |

Never copy application source into the Builder's folders; the Builder reads it where it is.

**Discover sources** (Continue tab of the form) writes `playbook\pbi-builder\knowledge\SOURCE-MAP.md`:
solutions, projects, project references, target frameworks, markers (CRM SDK, workflows, Web
Forms, Azure Functions, GraphQL, FluentValidation, data access) and whether each configured source
could be read. It reads only solution and project files and counts the rest; it never copies
code or configuration values. Run it again when projects change.

### Visual Studio check (once per team machine)
1. Install the Builder (form or `Install-PBIBuilder.cmd`) into the repository, then open the folder
   as in the table.
2. Copilot Chat > agent picker: "Akzo SDD PBI Builder - <project>" is listed (Visual Studio 18.4 or
   later).
3. Select it, open the **Tools** panel and confirm `readfile`, `code_search`, `find_references` and
   `editfiles` are available and enabled (Microsoft notes that custom-agent tool groups can start
   disabled; re-enable them there).
4. Ask: "Check source access." It should name each source as readable, configured but inaccessible
   or not configured, quoting one file it actually read.
5. For several repositories, repeat steps 2 to 4 with the parent folder open.
