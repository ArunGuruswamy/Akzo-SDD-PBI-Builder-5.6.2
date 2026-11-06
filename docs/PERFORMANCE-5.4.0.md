# Performance measurements: 5.3.0 versus 5.4.0

Measured on 5 November 2026 on this Windows machine (Node v20.20.2, Windows PowerShell 5.1). Times are wall-clock
milliseconds, median of interleaved runs on one identical synthetic CDMS + DAB + shared-UI workspace; they vary with
machine load and are not a promise. Counts and characters are reproducible. Model tokens, Copilot latency and the
chat host's tool calls are NOT measured here: they happen inside the IDE.

Reproduce: `node maintainer/diagnose.cjs [runs]` (current version) and `node maintainer/diagnose.cjs --instructions`
(instruction sizes, no PowerShell).

## PowerShell actions (before = 5.3.0 installer, after = 5.4.0, 9 interleaved runs, same bundle and data)

| Action | 5.3.0 median (p95) | 5.4.0 median (p95) | Change |
| --- | ---: | ---: | ---: |
| CheckPbi | 2,261 (2,902) | 1,950 (2,566) | -13.8% |
| SyncPbi | 2,537 (2,984) | 2,292 (2,559) | -9.7% |
| Resume: RefreshEvidence + SyncPbi (5.3.0, two launches) vs SyncPbi -RefreshEvidence (5.4.0, one launch) | 3,617 (3,752) | 2,428 (2,661) | -32.9% |
| Milestone: SyncPbi then CheckPbi (old agent flow) vs SyncPbi only (5.4.0 agent flow) | about 4,050 | about 2,140 | about -47% |

Output parity in the same runs: CheckPbi and SyncPbi output were byte-identical between the two installers; the
combined run's `evidence` equals a separate RefreshEvidence and its `report` equals a separate SyncPbi; CheckPbi
equals the JavaScript `checkPbi`. The last row comes from `diagnose.cjs` with the 5.4.0 installer (both flows are
still possible).

Where the time goes (profiled CheckPbi): PowerShell process start about 0.25 s, script definitions about 0.1 s,
bundle parse about 0.15 s, review fingerprint about 0.3 s (run twice: once for the snapshot, once as the
concurrent-edit guard), readiness rules about 0.6 s. 5.4.0 removes PowerShell pipelines from canonical JSON,
hashing and escaping, and the extra process on resume; the guard pass and the rules themselves are unchanged.
A fresh USERPROFILE per launch (as some tests use) adds about 0.2-0.4 s; diagnose.cjs uses a persistent profile.

## Instructions a conversation loads (characters; estimated tokens = characters / 4, an estimate)

Always loaded: the agent file, 48,552 to 28,378 characters (VS Code; Visual Studio 48,670 to 28,496), -41.6%.

| Workflow (per the Workflow router) | 5.3.0 | 5.4.0 | Saved |
| --- | ---: | ---: | ---: |
| Validate PBI or Show Decisions | 63,467 | 41,892 | 34.0% |
| Review, approve and generate | 63,467 | 49,543 | 21.9% |
| Resume and answer business questions | 87,970 | 69,754 | 20.7% |
| Extract Plugin Rules / Analyze Workflows | 67,059 | 53,286 | 20.5% |
| Resume with CDMS to DAB + shared UI re-analysis | 99,519 | 90,226 | 9.3% |
| Start PBI: intake, analysis, first questions | 84,868 | 84,645 | 0.3% |
| Everything in one conversation (worst case) | 131,446 | 134,869 | -2.6% |

A full Start-to-questions conversation needs nearly all analysis rules, so its total barely changes; its turns
before the modules are read run on the smaller agent file. Nothing was removed: test-modules.cjs checks every
sentence of the 5.3.0 agent and guides against fixtures/baseline-v5.3.0-agents.json.

## In-process (browser and engine) operations, 5.4.0

| Operation | Median ms | File opens / distinct |
| --- | ---: | ---: |
| discoverSources (warm) | 12 | 10 / 10 |
| refreshEvidence | 3 | 3 / 3 |
| checkPbi | 38 | 41 / 21 |
| synchronizePbi | 75 | 65 / 22 |
| advanceWorkflow | 74 | 74 / 25 |

Unchanged from 5.3.0 by design; repeated opens are integrity re-reads (review snapshot and concurrent-edit guards).

## Not measured
Model tokens, Copilot response time, tool calls issued by the chat host, time waiting for the user, and whether
the model reads each stage module before acting on it. These need a live session in Visual Studio and VS Code.
