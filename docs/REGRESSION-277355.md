# Live regression check: PBI 277355

`test-core.cjs` checks that the installed instructions ask for each behavior below. Only a real
Copilot run against the real source can show the model follows them. Run this once after
installing 4.0.0 or later, and again after any agent change. PBI facts named here are the expected
results of that run; they are never written into the reusable agent.

## Setup
1. Install the Builder at the Git root of each target repository (setup window, Install /
   Upgrade). Leave any earlier installation in place until this check passes.
   - `C:\Users\RGA\source\repos\AN.ColorDMS.Customizations` (Custom (Legacy CRM/XRM))
   - `C:\src\ColorDMS` (role as installed today)
   - `C:\Users\RGA\source\repos\AN.ColorAppsAzure.BL` (role as installed today)
2. In the legacy repository create `playbook\pbi-builder\knowledge\SEARCH-SCOPE.md` listing
   `Source/Formula`, `Source/WebResources`, `Source/Measurement`, `Source/MarketColor` and any
   other relevant sibling module, and run **Discover sources** in the form.
3. Visual Studio 18.5 or later: File > Open > Folder on the legacy repository's Git root (not a
   `.sln` in a subfolder). In the Tools panel, enable `readfile`, `code_search`,
   `find_references` and `editfiles`; confirm `business-decision-advisor` is listed as a skill.
4. New chat, select "Akzo SDD PBI Builder - <project>", paste the full PBI 277355 text with
   "Create PBI" and the scope "legacy only".

## Expected (compare with the original conversation)
| # | Expected behavior | Pass? |
| --- | --- | --- |
| 1 | No six-step intake; no separate approvals of title, module, project or criteria | |
| 2 | No "should I investigate / continue / look at JavaScript / BR-8 first?" questions | |
| 3 | The sibling WebResources solution and its scripts are discovered | |
| 4 | The existing Color Name lookup filter is found (web resource) | |
| 5 | `cdms_paintsystemlevel` is found (metadata or code) | |
| 6 | The Color Point override is traced end to end | |
| 7 | ColorApps (2) and OwnColor (4) are treated as Development Tool values, not applications | |
| 8 | Measurement validation and the override are separate rules | |
| 9 | The explicit Industry Variant precondition is recommended | |
| 10 | DEC-3, DEC-4 and DEC-5 are preserved on resume (test with Resume PBI 277355) | |
| 11 | Each question uses the Advisor format with numbered choices | |
| 12 | Each question ends with a ready-to-use answer | |
| 13 | Nothing is called missing before every relevant layer was searched | |
| 14 | VALIDATION-MATRIX.md and EVIDENCE.md form an implementation-ready evidence matrix | |
| 15 | CDMS/DAB are not investigated beyond essential dependencies (legacy-only scope) | |
| 16 | No end-to-end analysis document is requested, written or used as evidence | |

Record failures with the chat excerpt and the files the agent did or did not open. A failure in
3 to 6 with Visual Studio usually means the folder opened does not contain the file: check
the Source access section of EVIDENCE.md before changing the agent.
