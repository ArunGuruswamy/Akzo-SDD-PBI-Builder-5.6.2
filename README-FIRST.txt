AKZO SDD PBI BUILDER 5.6.2
Evidence-based PBI refinement | 6 November 2026

WHAT IT DOES
Copilot Chat is the normal interface, using one agent per repository:
"Akzo SDD PBI Builder - <your project>". An offline HTML form is optional for setup,
evidence inspection, dashboards and downloads. The workflow is:
  Configure repositories -> Describe PBI in Chat -> Analyze existing flow -> Answer
  business questions in Chat -> Review and explicitly approve in Chat -> Generate.
A compact router in the agent loads only the guide the current step needs.
The agent investigates the relevant accessible legacy, CDMS, DAB and shared Angular
UI code the target needs (the shared UI is analyzed once; DAB reads CDMS as a
reference), reports inaccessible sources, records who enforces each business rule
with evidence, and asks only genuine business
decisions, one at a time. Only genuine blockers hold a PBI back, and each one comes with a question:
gaps graded WARNING or INFORMATIONAL and unverified (ASSUMED or UNAVAILABLE) evidence
are shown as warnings at review. The one final approval in Chat is bound to a
fingerprint of what was reviewed; the installer generates the final PBIs
(the Refined PBI: Refined-PBI-CDMS.md, Refined-PBI-DAB.md and/or Refined-PBI-UI.md, each also
as DOCX and JSON). DRAFT-PBI.md is only the working draft.

INSTALL - OPTION A: BROWSER (no PowerShell needed)
1. Extract this ZIP (Extract All). Open Akzo-SDD-PBI-Builder.html from the
   extracted folder in desktop Edge or Chrome.
2. Click Choose project folder and select your application repository root.
   The form shows the installed version, Git root and solutions it finds.
3. Check Project name, Editors (Visual Studio 2026, VS Code, or both) and repository
   role. Add other source paths if needed.
4. Click Review setup. When upgrading, check Allow reviewed updates only after
   reviewing the list. Click Install / update in selected folder.
   Repair, Uninstall and Check installed files work on the selected folder too.
   Repositories you choose stay in "Repositories chosen in this session".
5. Reopen the solution (Visual Studio) or folder (VS Code). In Copilot Chat select
   Akzo SDD PBI Builder - <your project>, then run the setup-check prompt shown.
   With both editors there is one agent per editor: "... (Visual Studio)" in Visual
   Studio and "... (VS Code)" in VS Code; select the one for the editor you use.
The browser only works on folders you choose in its folder dialog; it cannot open
a typed path or run PowerShell. That is a browser security rule, and it is why
Option A works where PowerShell scripts are blocked.

INSTALL - OPTION B: WINDOWS SETUP WINDOW
Double-click Install.cmd (same as Install-PBIBuilder.cmd). It first checks the
package and your PowerShell policy (see IF THE INSTALLER IS BLOCKED). Then one setup
window opens; everything is set in it (no configuration pop-ups):
1. Install location: the repository root that will hold playbook\pbi-builder (the
   folder with .git). Type or paste the path, Browse, or click a remembered
   installation. The list shows each installation's path, version, editors, status
   (Installed, Not Installed, Upgrade Available, Repair Needed, Failed, Not Found;
   Installed only when every recorded file checks out) and what is required, ticks
   the older ones, and shows the full path when you hover over it. It is
   remembered for next time. Every Browse opens the Windows folder
   picker (address bar, drives, network locations, New folder).
2. Editors: tick Visual Studio 2026, Visual Studio Code, or both (at least one).
   With both, each editor gets its own agent file and every other file is shared;
   the status beside the boxes is shown for each editor.
3. Primary source - Legacy CRM/XRM, then CDMS BL, DAB BL, Shared Angular UI, an
   optional GraphQL schema folder and custom references: a path, Browse and a status
   beside each one (folder not found, invalid characters or a folder used twice are
   shown there). These are read-only references. CDMS, DAB and Shared Angular UI
   are independent implementation targets; UI is optional; each PBI selects its own
   targets. Setup never takes the Legacy source from the install location: choose it.
   Paths with spaces, absolute paths, network paths and sibling repositories work.
4. Install / Upgrade shows the planned changes, asks before writing and saves the
   paths. If one editor's agent file was edited, it says so and offers to install
   or upgrade the other editor only. Upgrade ticked upgrades the ticked older
   installations. Verify, Repair and Uninstall work on the install location;
   Verify and Repair report each editor separately.
Steps run in the background with a progress line, so the window stays responsive.
Each result is summarized below the buttons (files installed, updated, preserved,
backed up and failed, the target repository, the editor configurations and the
verification); Show log shows every step. The window can be resized and maximized.
Files you edited are never overwritten (that repository is skipped and
reported); replaced files are backed up first. Or run the installer with
parameters, for example:
  Install-PBIBuilder.cmd -RepoPath "C:\src\My Repo" -ProjectName "My Repo" -Ide vscode -Role dab -Preview
  Install-PBIBuilder.cmd -RepoPath "C:\src\My Repo" -AllowUpdates
  Install-PBIBuilder.cmd -RepoPath "C:\src\My Repo" -Ide both -AllowUpdates     (Visual Studio 2026 and VS Code)
  Install-PBIBuilder.cmd -RepoPath "C:\src\My Repo" -Action Repair -Editor vscode   (one editor only)
  Install-PBIBuilder.cmd -RepoPath "C:\src\My Repo" -UiSource ..\AN.ColorAppsAzure.UI -AllowUpdates
  Install-PBIBuilder.cmd -RepoPath "C:\src\My Repo" -ClearSource ui -AllowUpdates   (removes a saved path on purpose)
  An empty -LegacySource/-DabSource/-CdmsSource/-UiSource keeps the saved path.
  Install, Repair and Verify print "Source access": for each configured repository,
  readable (a real source file was read), configured-inaccessible (folder missing or
  no readable source file) or not-configured. A path that is configured but not
  verified is still saved; it is reported, never erased.
  (the older ColorDMS analysis documents are not installed unless you add -IncludeReferences;
  the agent investigates the repository directly and never needs them)
  powershell -File PBI-Builder-Setup.ps1 -NoGui -Action Upgrade   (all listed repositories)
Actions: -Action Install (default), Verify, Repair, Uninstall, CheckPbi, SyncPbi,
RefreshEvidence and ApproveAndGenerate (requires the PBI, approver name and
latest reviewed-content fingerprint). -Preview shows changes without writing.
SyncPbi -Pbi <folder> repairs derived working-document sections from pbi-state.json,
preserves prior versions in history, and reruns the canonical readiness checker.
It never approves decisions or turns a conditional draft into final artifacts.
Uninstall.cmd (same as
Uninstall-PBIBuilder.cmd) removes setup files but always keeps PBIs, decisions,
history and knowledge notes.
Both options write identical files for the same settings; see
docs/INSTALLER-PARITY.md.
Every run writes one line to %USERPROFILE%\.akzo-pbi-builder\logs\install.log.
Exit codes: 0 done; 1 PowerShell refused or failed; 2 error, changes rolled back;
3 check failed or nothing written; 10 package incomplete or damaged; 11 policy
needs signed scripts; 12 downloaded files not unblocked; 13 AppLocker/WDAC;
14 Windows PowerShell 5.1 missing.

IF THE INSTALLER IS BLOCKED
Install.cmd and Uninstall.cmd check before PowerShell runs anything. They never
bypass or change your execution policy, Group Policy, AppLocker or WDAC.
- "File ... is not digitally signed" after downloading the ZIP: Windows marked
  the files as downloaded from the internet, and your policy (RemoteSigned) does
  not run marked unsigned scripts. Install.cmd explains this and asks once to
  remove the mark from this package folder's files (Unblock-File, the standard
  Windows step). Answer Y and it continues. Nothing else changes.
- Policy AllSigned or Restricted, or set by Group Policy: the scripts cannot run
  unsigned. Use Option A (the browser form supports install, upgrade, repair,
  verify, uninstall and its own generation workflow) or ask IT for the
  organization-signed package (below). Chat-triggered final generation requires
  the installer action to be allowed.
- AppLocker or WDAC (Constrained Language mode): use Option A or the signed
  package that IT allows.
- Missing or damaged package file: extract the original ZIP again.
- No write access to the repository: use a clone you own. Administrator rights
  are never needed.
Organization-signed package (for IT): on a machine with the organization's
code-signing certificate, set PBI_SIGN_CERT to its thumbprint (optionally
PBI_SIGN_TIMESTAMP to a timestamp server), run node maintainer/release.cjs, and
distribute the resulting ZIP. Its checksums cover the signed scripts. The
publisher must be trusted on user machines (Trusted Publishers).
Interrupted install (window closed, PC restarted): run Install again with the same
settings. It completes the installation; nothing else is needed. Ctrl+C during
writing restores the files touched so far.

CREATE A PBI IN COPILOT CHAT
Open a NEW Copilot chat for every new PBI, so nothing from an earlier PBI is
carried over. Select the builder agent and type "Start PBI" (also Create PBI,
New PBI, Start Development or Implement PBI). The agent gathers missing intake
details, investigates accessible configured sources, asks only material business
questions in Chat, and presents an evidence-based review. Nothing is approved by
silence or by accepting a recommendation.
The optional form's New PBI tab is available for users who prefer guided intake:
1. Requirements: PBI number (Azure DevOps or an identifier such as LOCAL-12),
   title, description and acceptance criteria (required), attachments (optional).
2. Select Legacy Source Repository: a configured repository; Validate browses to
   it; Add or remove repositories goes to setup (folders are never deleted).
3. Which project are you developing the PBI for? Tick CDMS, DAB and/or Shared Angular UI
   (any combination; the UI is never added automatically). Each ticked target gets its own
   Refined PBI. The form shows each repository's role and path.
4. Review & start: analysis mode (Quick, Deep - the default - or Comprehensive),
   optional extra references, then Start analysis and paste the prompt in Copilot.
An existing PBI number offers Resume, Review or Start New Version; nothing is
overwritten. There is no DAB plugin: DAB implements every applicable legacy
rule in its own code, while CDMS reuses verified plugins.

FINISH A PBI: REVIEW AND APPROVE ONCE IN CHAT
The agent summarizes the PBI, source findings, decisions, blockers and warnings in
Chat, then offers Approve & Generate, Request Changes or Save Draft / Decide Later.
Review the summary and explicitly choose Approve & Generate; provide the approver
name when requested. In VS Code, the agent invokes the installer readiness-bound
generation action. In an IDE without command execution, it provides the equivalent
command for you to run. The action rechecks readiness and the exact reviewed-content
fingerprint before approval and generation; it refuses changed or blocked PBIs and
rolls back earlier files if generation fails.

The optional form offers the same review in Continue tab -> select the PBI ->
Review selected PBI. Seven cards show the PBI,
requirements, repository analysis, implementation approach, decisions, sensitive
content and technical readiness; an eighth card lists warnings that do not block the
approval, and the collapsed "Detailed evidence, analysis plan and warnings" panel
holds the full evidence list. Form-based Approve & Generate also verifies every file;
Request Changes and Save Draft approve nothing. The PBI
Generated Successfully window offers DOCX, MD and JSON per PBI, a preview, and one
ZIP with everything. Values that look like credentials are replaced with
[REDACTED: <kind>] before anything is saved, and a credential left in a PBI's
documents blocks approval. Text in the request or attachments that tries to
instruct the agent is flagged as untrusted and shown in the review, never followed.
PO/BA, security, architecture or technical sign-off your
organization requires remains a separate step outside this tool. See
docs/USER-GUIDE.md.

UPGRADING FROM 5.2.x
Install or upgrade as usual and allow reviewed updates (the agent file, guides
and optional form change; settings, repository paths, PBIs,
decisions, approvals and evidence are kept). To go back, see ROLLBACK in
MIGRATION.md; the 5.2.2 package stays in releases/.

UPGRADING FROM 5.2.0
Install or upgrade as usual and allow reviewed updates. The updated review
snapshot includes recorded local evidence-source contents, so an earlier
snapshot-bound approval can require renewed review. Decisions and approval
history are retained. External evidence is bound to its recorded revision; the
form cannot verify the current contents of another repository.

UPGRADING FROM 4.x
Install as above (Install.cmd, the optional form, or Upgrade ticked) and allow reviewed updates.
The setup window and the form show "update to 5.6.2 available". Files you never
edited are updated with backups. PBIs, decisions and approval history are kept; from
5.0 only the final user approval is required, so a 4.x PBI that was waiting only
for PO/BA or technical approval can be reviewed and approved if other checks pass. Add the shared
Angular UI path in setup when you use UI targets. See MIGRATION.md.

UPGRADING FROM 3.1.0
Install as above and allow reviewed updates (in the setup window: Install /
Upgrade or Upgrade ticked). Existing PBIs and approval history are retained; the
readiness check reports any stale or missing evidence. See MIGRATION.md.

UPGRADING FROM 3.0.0
Install as above and allow reviewed updates. PBI folders are not changed. 3.0.0
approvals cannot show what was reviewed, so the check no longer accepts them: a
3.0.0 PBI must be migrated by the agent and approved again before it is
Development-Ready. See MIGRATION.md.

UPGRADING FROM 2.0 OR 2.1
Install as above. The earlier "dynamic" and "Concise" agent files are backed up and
removed only if you never edited them; edited ones are kept and listed. Existing
PBIs, decisions and history are untouched. See MIGRATION.md.

DAILY USE
In Copilot select the agent and type "Start PBI", "Resume PBI <number>",
"Continue PBI <number or folder>" or "Refine PBI <number>: <what changed>".
Other commands: Review, Edit, Show Decisions, Analyze Legacy, Analyze Workflows,
Extract Plugin Rules, Show Technical Flow, Generate Acceptance Criteria, Export
and Validate PBI <number>. The form's New PBI and Continue PBI tabs remain
available. Chat-based Approve & Generate reruns readiness and verifies the reviewed
content fingerprint. To check readiness alone use the optional form's Check PBI
readiness or
  Install-PBIBuilder.cmd -RepoPath "C:\src\My Repo" -Action CheckPbi -Pbi <folder>
It checks completeness and consistency, not business correctness or who approved.

COMPARE WITH AN EARLIER VERSION
Compare old & new in the form adds a pinned v2.0 Original or v2.1 Concise agent for
one trial, with identical requests and separate output folders. Remove it afterwards
with Remove comparison agents. See COMPARE-OLD-AND-NEW.txt.

WHEN BROWSER FOLDER ACCESS IS BLOCKED
Use Option B, or Download setup ZIP in the form and copy its CONTENTS into the
repository root (including .github), comparing existing files first. The manual
copy has no managed-update protection.

PREREQUISITES
Visual Studio 2026 18.4+ for custom agents, or VS Code with Copilot. Copilot
sign-in and the read/search/edit tools. Access to the application source.
No npm, API key, admin rights, network calls or new dependencies.

PROTECTION AND LIMITATIONS
Never replaced: application code, solution files, .github/copilot-instructions.md,
unrelated agents, PBIs, knowledge notes, user-edited setup files. Updates use
content hashes and backups; file operations are not a multi-file transaction.
Nothing is committed, pushed, published to Azure DevOps or sent to anyone.
Instructions guide the model; they cannot guarantee its output. Readiness and
approval records are checked for completeness, never authenticated.

VALIDATION
See VALIDATION.txt and MEASUREMENTS.md. Live Copilot quality, agent discovery and
native browser dialogs still need a first team-machine check.
