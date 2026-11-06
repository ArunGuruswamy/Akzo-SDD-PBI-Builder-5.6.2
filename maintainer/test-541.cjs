'use strict';
// 5.4.1: strict mandatory question gate, chat answers through the canonical RecordAnswer/DeferQuestion actions, the readiness
// checker installed in the repository, DAB + UI final PBIs, the unchanged-resume fast path and the Legacy-first setup dialog.
// Real files and real Windows PowerShell; a PBI shaped like the reported PBI 309446 (fixtures/pbi-309446-shape.cjs).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const P = require('./src/core.js'), F = require('./fixtures/pbi-309446-shape.cjs'), W = require('./fixtures/workspace.cjs'), { DirectoryHandle } = require('./fixtures/fs-handles.cjs');
const assets = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, 'src/assets.json'), 'utf8'));
const installer = require('node:fs').readFileSync(path.join(__dirname, 'installer/Install-PBIBuilder.ps1'), 'utf8');
const MANDATORY = ['Q-1', 'Q-2', 'Q-3', 'Q-4', 'Q-5', 'Q-6'];

async function pbi(t, { withTools = false } = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'akzo-541-')); t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const dir = path.join(tmp, 'ws'), { files, config, o } = await F.build(P, fs, path, dir), root = new DirectoryHandle(dir);
  await fs.mkdir(path.join(dir, '.git'), { recursive: true });
  await P.apply(root, await P.plan(root, P.setupFiles(config, withTools ? { ...assets, installer } : assets, '<html></html>').files, true), true);
  await P.discoverSources(root, config);
  const made = P.newPbi(config, { number: '309446', title: 'Measurement validation', description: 'Validate measurements before saving', application: 'dab', legacy: 'legacy' });
  await P.apply(root, await P.plan(root, made.files));
  const folder = made.folder, name = folder.split('/').pop(), state = await F.state(P, o, name, files);
  await P.write(root, folder + '/pbi-state.json', JSON.stringify(state, null, 2)); await P.write(root, folder + '/DRAFT-PBI.md', W.draftDoc(state, state.status));
  await P.write(root, folder + '/DECISION-LOG.md', '# Decision log\n\nDEC-1 approved: stated in the original request.\n');
  const pkg = path.join(tmp, 'package'); await fs.mkdir(pkg);
  await fs.writeFile(path.join(pkg, 'Install-PBIBuilder.ps1'), installer); await fs.writeFile(path.join(pkg, 'pbi-builder-bundle.json'), JSON.stringify(P.bundle(assets)));
  await fs.writeFile(path.join(pkg, 'Akzo-SDD-PBI-Builder.html'), '<html></html>');
  const env = { ...process.env, USERPROFILE: tmp }; delete env.PSExecutionPolicyPreference;
  const ps = (script, ...args) => { const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script, '-RepoPath', dir, ...args], { encoding: 'utf8', env, timeout: 180000 }); assert.ifError(r.error); return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout.trim()) }; };
  const run = (...args) => ps(path.join(pkg, 'Install-PBIBuilder.ps1'), ...args);
  const answer = (q, option, extra = []) => run('-Action', 'RecordAnswer', '-Pbi', name, '-Question', q, '-Option', option, '-AnsweredBy', 'Business analyst', '-Json', ...extra);
  return { tmp, dir, root, folder, name, pkg, run, ps, answer, state: async () => JSON.parse(await P.read(root, folder + '/pbi-state.json')) };
}
const finals = async w => (await Promise.all(['Refined-PBI-DAB', 'Refined-PBI-UI', 'Refined-PBI-CDMS', 'REFINED-PBI'].flatMap(n => ['.md', '.json', '.docx'].map(async x => (await P.read(w.root, w.folder + '/' + n + x)) !== null ? n + x : null)))).filter(Boolean);

test('mandatory question gate: answering only Q-6 of six leaves Q-1..Q-5 open and nothing after Business Questions proceeds', async t => {
  const w = await pbi(t);
  let r = w.answer('Q-6', 'A'); assert.equal(r.code, 0, r.err + r.out); let out = r.json();
  assert.deepEqual(out.gate, { mandatory: 6, answered: 1, remaining: ['Q-1', 'Q-2', 'Q-3', 'Q-4', 'Q-5'], deferred: [], unconfirmed: [], canContinue: false, canRefine: false }); assert.equal(out.phase, 'Questions');
  assert.deepEqual(out.answer, { question: 'Q-6', status: 'answered', decision: 'DEC-2', text: 'Yes' });
  assert.equal(out.report.computedStatus, 'Awaiting PO/BA Decision'); assert.equal(out.report.finalAllowed, false);
  let s = await w.state();
  assert.deepEqual(s.questions.filter(q => q.status === 'open').map(q => q.id), ['Q-1', 'Q-2', 'Q-3', 'Q-4', 'Q-5'], 'answering the last question completes no earlier one');
  const q6 = s.questions.find(q => q.id === 'Q-6'); assert.equal(q6.answeredBy, 'Business analyst'); assert.match(q6.answeredAt, /^\d{4}-\d\d-\d\dT/); assert.equal(q6.decisionRef, 'DEC-2');
  assert.deepEqual(P.questionGate(s, out.report), out.gate, 'PowerShell and JavaScript compute the same gate');
  let next = await P.advanceWorkflow(w.root, w.folder);
  assert.equal(next.next.action, 'ASK_DECISION'); assert.equal(next.next.decision.question, s.questions[0].question, 'returns to the earliest unanswered question'); assert.equal(next.next.gate.canContinue, false);
  // No readiness review, approval or generation while the gate is closed.
  const before = await P.read(w.root, w.folder + '/pbi-state.json');
  r = w.run('-Action', 'ApproveAndGenerate', '-Pbi', w.name, '-Approver', 'Product owner', '-ReviewedContent', out.report.reviewedContent);
  assert.equal(r.code, 2); assert.match(r.err, /Not ready for approval/); assert.equal(await P.read(w.root, w.folder + '/pbi-state.json'), before);
  await assert.rejects(P.approveAndGenerate(w.root, w.folder, 'Product owner', out.report.reviewedContent), /BLOCKING_QUESTION|not ready|blocker/i);
  assert.deepEqual(await finals(w), []);
  // Out of order, with a custom answer; invalid inputs change nothing.
  out = w.answer('Q-3', 'custom', ['-Custom', 'Only for EU sites']).json(); assert.equal(out.answer.text, 'Only for EU sites');
  out = w.answer('Q-5', 'B').json(); assert.deepEqual(out.gate.remaining, ['Q-1', 'Q-2', 'Q-4']);
  const unchanged = await P.read(w.root, w.folder + '/pbi-state.json');
  for (const [args, message] of [[['-Question', 'Q-1', '-AnsweredBy', 'BA'], /-Option/], [['-Question', 'Q-1', '-Option', 'custom', '-Custom', ' ', '-AnsweredBy', 'BA'], /custom answer/], [['-Question', 'Q-1', '-Option', 'Z', '-AnsweredBy', 'BA'], /Choose one of the options/], [['-Question', 'Q-9', '-Option', 'A', '-AnsweredBy', 'BA'], /not in this PBI/], [['-Question', 'Q-1', '-Option', 'A'], /-AnsweredBy/]]) {
    r = w.run('-Action', 'RecordAnswer', '-Pbi', w.name, ...args, '-Json'); assert.equal(r.code, 2, args.join(' ')); assert.match(r.err, message);
  }
  assert.equal(await P.read(w.root, w.folder + '/pbi-state.json'), unchanged, 'a navigation without a valid answer saves nothing');
  // Decide later keeps Q-1 pending; the next waiting question is asked; restart shows the same gate.
  out = w.run('-Action', 'DeferQuestion', '-Pbi', w.name, '-Question', 'Q-1', '-Json').json();
  assert.deepEqual([out.gate.remaining, out.gate.deferred, out.gate.canContinue], [['Q-1', 'Q-2', 'Q-4'], ['Q-1'], false]);
  s = await w.state(); next = await P.advanceWorkflow(w.root, w.folder);
  assert.equal(next.next.decision.question, s.questions.find(q => q.id === 'Q-2').question);
  const resumed = w.run('-Action', 'SyncPbi', '-Pbi', w.name, '-RefreshEvidence', '-Json').json(); assert.deepEqual(resumed.gate, out.gate, 'restart enforces the same gate');
  // Only after every mandatory question is answered does the workflow move on, automatically, to readiness and the final review.
  w.answer('Q-2', 'A'); w.answer('Q-4', 'A'); out = w.answer('Q-1', 'A').json();
  assert.equal(out.gate.canContinue, true); assert.equal(out.report.computedStatus, 'Ready for Review');
  next = await P.advanceWorkflow(w.root, w.folder); assert.equal(next.next.stage, 'FINAL_REVIEW');
  s = await w.state(); assert.ok(MANDATORY.every(id => s.questions.find(q => q.id === id).status === 'answered'));
  assert.match(await P.read(w.root, w.folder + '/DECISION-LOG.md'), /DEC-2 \(approved\): Q-6 [\s\S]*Selected by Business analyst in Copilot Chat/);
});

test('a chat answer records the same question and decision as the form, with history backups', async t => {
  const a = await pbi(t), b = await pbi(t);
  await P.recordAnswer(a.root, a.folder, 'Q-2', { option: 'A', by: 'Business analyst' });
  assert.equal(b.answer('Q-2', 'A').code, 0);
  const qa = (await a.state()).questions.find(q => q.id === 'Q-2'), qb = (await b.state()).questions.find(q => q.id === 'Q-2');
  for (const k of ['status', 'answer', 'resolution', 'decisionRef', 'answeredBy', 'answerBasis']) assert.deepEqual(qb[k], qa[k], k);
  const da = (await a.state()).decisions.find(d => d.question === 'Q-2'), db = (await b.state()).decisions.find(d => d.question === 'Q-2');
  for (const k of ['id', 'status', 'question', 'decision', 'supersedes']) assert.deepEqual(db[k], da[k], k);
  assert.equal(da.pbi, a.name); assert.equal(db.pbi, b.name);
  const line = l => l.replace(/ at \S+ /, ' at <time> ').replace('the PBI Builder question panel', 'Copilot Chat');
  // The chat action also synchronizes (adding the derived canonical records), so compare the appended decision line itself.
  const entry = async w => (await P.read(w.root, w.folder + '/DECISION-LOG.md')).split('\n').find(l => l.startsWith('- DEC-2 (approved)'));
  assert.equal(line(await entry(b)), line(await entry(a)));
  assert.ok((await fs.readdir(path.join(b.dir, b.folder, 'history'))).some(n => /^pbi-state\..+\.json$/.test(n)));
  // Answering again supersedes the earlier decision instead of overwriting it.
  const again = b.answer('Q-2', 'B').json(); assert.equal(again.answer.decision, 'DEC-3');
  const s = await b.state(); assert.equal(s.decisions.find(d => d.id === 'DEC-2').status, 'superseded'); assert.equal(s.decisions.find(d => d.id === 'DEC-3').supersedes, 'DEC-2');
});

test('the readiness checker is installed in the repository by both installers and runs from there', async t => {
  const w = await pbi(t, { withTools: true }), tool = path.join(w.dir, 'playbook/pbi-builder/tools/Install-PBIBuilder.ps1');
  assert.equal(await fs.readFile(tool, 'utf8'), installer, 'the form writes the same checker');
  assert.equal(await fs.readFile(path.join(w.dir, 'playbook/pbi-builder/tools/pbi-builder-bundle.json'), 'utf8'), JSON.stringify(P.bundle(assets)));
  const r = w.ps(tool, '-Action', 'SyncPbi', '-Pbi', w.name, '-Json'); assert.equal(r.code, 0, r.err); assert.equal(r.json().gate.mandatory, 6);
  // The PowerShell installer writes byte-identical tools and records them for Verify and Uninstall.
  const repo = path.join(w.tmp, 'repo2'); await fs.mkdir(path.join(repo, '.git'), { recursive: true });
  const env = { ...process.env, USERPROFILE: w.tmp }; delete env.PSExecutionPolicyPreference;
  const ps = (...args) => cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(w.pkg, 'Install-PBIBuilder.ps1'), '-RepoPath', repo, ...args], { encoding: 'utf8', env, timeout: 180000 });
  assert.equal(ps('-ProjectName', 'Tools', '-Ide', 'vscode', '-Role', 'dab').status, 0);
  assert.equal(await fs.readFile(path.join(repo, 'playbook/pbi-builder/tools/Install-PBIBuilder.ps1'), 'utf8'), installer);
  assert.equal(await fs.readFile(path.join(repo, 'playbook/pbi-builder/tools/pbi-builder-bundle.json'), 'utf8'), JSON.stringify(P.bundle(assets)));
  const manifest = await fs.readFile(path.join(repo, 'playbook/pbi-builder/installed-files.json'), 'utf8');
  assert.match(manifest, /tools\/Install-PBIBuilder\.ps1/); assert.match(manifest, /tools\/pbi-builder-bundle\.json/);
  assert.match(ps('-Action', 'Verify').stdout, /All recorded files match/);
  // The agent is told exactly where it is.
  const agent = P.setupFiles({ projectName: 'X', ide: 'vscode', role: 'dab', sources: {} }, assets, '').files[P.AGENT].replace(/\s+/g, ' ');
  assert.match(agent, /Install-PBIBuilder\.ps1 in these instructions is playbook\/pbi-builder\/tools\/Install-PBIBuilder\.ps1 in this repository/);
});

test('DAB + UI with an implementation gap refines to all six final files; COMPLETE survives a restart', async t => {
  const w = await pbi(t);
  for (const id of MANDATORY) assert.equal(w.answer(id, 'A').code, 0);
  const sync = w.run('-Action', 'SyncPbi', '-Pbi', w.name, '-Json').json();
  assert.equal(sync.report.computedStatus, 'Ready for Review', 'code to be built (bypasses + implement) is not missing evidence: ' + JSON.stringify(sync.report.issues));
  let next = await P.advanceWorkflow(w.root, w.folder); assert.equal(next.next.stage, 'FINAL_REVIEW');
  const r = w.run('-Action', 'ApproveAndGenerate', '-Pbi', w.name, '-Approver', 'Product owner', '-ReviewedContent', sync.report.reviewedContent);
  assert.equal(r.code, 0, r.err + r.out); assert.match(r.out, /Approved and generated:[\s\S]*Refined-PBI-DAB\.md[\s\S]*Refined-PBI-UI\.md/);
  assert.deepEqual((await finals(w)).sort(), ['Refined-PBI-DAB.docx', 'Refined-PBI-DAB.json', 'Refined-PBI-DAB.md', 'Refined-PBI-UI.docx', 'Refined-PBI-UI.json', 'Refined-PBI-UI.md']);
  for (const n of ['Refined-PBI-DAB', 'Refined-PBI-UI']) {
    const md = await P.read(w.root, w.folder + '/' + n + '.md'), json = JSON.parse(await P.read(w.root, w.folder + '/' + n + '.json'));
    for (const h of ['## Business requirements', '## Acceptance criteria', '## Technical implementation approach', '## Existing code references', '## Dependencies', '## Test scenarios', '## Risks, open issues and assumptions', '## Business decisions', '## Approval'])
      assert.ok(md.includes(h), n + ' has ' + h);
    assert.equal(json.status, 'Development-Ready'); assert.equal(json.approval.user.by, 'Product owner'); assert.ok(json.evidence.length > 0, n + ' cites source evidence');
  }
  const dab = JSON.parse(await P.read(w.root, w.folder + '/Refined-PBI-DAB.json')), ui = JSON.parse(await P.read(w.root, w.folder + '/Refined-PBI-UI.json'));
  assert.deepEqual(dab.rules.map(x => x.id), ['BR-1'], 'Refined-PBI-DAB owns the DAB rule'); assert.ok(ui.rules.map(x => x.id).includes('BR-2'), 'the shared UI work is in Refined-PBI-UI, once');
  assert.match(await P.read(w.root, w.folder + '/Refined-PBI-DAB.md'), /implement/i);
  for (let i = 0; i < 2; i++) { next = await P.advanceWorkflow(w.root, w.folder); assert.equal(next.next.action, 'COMPLETE', 'restart ' + i); }
  const after = w.run('-Action', 'SyncPbi', '-Pbi', w.name, '-Json').json(); assert.equal(after.report.computedStatus, 'Development-Ready'); assert.deepEqual(after.report.issues, []);
});

test('an unchanged resume reuses the saved readiness; any change to what readiness reads recomputes it', async t => {
  const w = await pbi(t), sync = () => w.run('-Action', 'SyncPbi', '-Pbi', w.name, '-RefreshEvidence', '-Json').json();
  const first = sync(); assert.equal(first.reused, undefined);
  const second = sync(); assert.equal(second.reused, true); assert.deepEqual(second.changed, []);
  assert.deepEqual(second.report, first.report); assert.deepEqual(second.gate, first.gate);
  assert.deepEqual(second.report, await P.checkPbi(w.root, w.folder), 'the reused report is what the checker computes now');
  // An answer, a document edit and an evidence source change each force a full recomputation.
  w.answer('Q-1', 'A'); const third = sync(); assert.equal(third.reused, true, 'after RecordAnswer synchronized, the next unchanged resume is reused');
  await P.write(w.root, w.folder + '/REQUEST.md', (await P.read(w.root, w.folder + '/REQUEST.md')) + '\nClarified.\n');
  assert.equal(sync().reused, undefined, 'document change recomputes');
  const s = await w.state(), src = s.evidence.find(e => e.kind === 'repo-file').source;
  await fs.appendFile(path.join(w.dir, src), '\n// changed\n');
  const changed = sync(); assert.equal(changed.reused, undefined); assert.ok(changed.report.issues.some(i => i.code === 'EVIDENCE_CHANGED'), 'a changed source is detected, not hidden by the cache');
});

test('setup (5.6.1): one window, Legacy first, a row per reference with its own Browse and status, errors beside the path, settings saved and shown again', async t => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'akzo-541-setup-')); t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const o = { feature: 'Measurement', entity: 'measurement' }, dir = path.join(tmp, W.opts(o).workspace), R = W.opts(o).repos; await W.build(fs, path, dir, o);
  const pkg = path.join(tmp, 'package'); await fs.mkdir(pkg);
  for (const f of ['PBI-Builder-Setup.ps1', 'Install-PBIBuilder.ps1']) await fs.copyFile(path.join(__dirname, 'installer', f), path.join(pkg, f));
  await fs.writeFile(path.join(pkg, 'pbi-builder-bundle.json'), JSON.stringify(P.bundle(assets))); await fs.writeFile(path.join(pkg, 'Akzo-SDD-PBI-Builder.html'), '<html></html>');
  const env = { ...process.env, USERPROFILE: tmp }; delete env.PSExecutionPolicyPreference;
  const setup = (...args) => { const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(pkg, 'PBI-Builder-Setup.ps1'), '-NoGui', '-HomeRoot', tmp, ...args], { encoding: 'utf8', cwd: dir, env, timeout: 180000 }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout.trim()); };
  const legacy = setup('-Action', 'Detect', '-Repo', R.legacy);
  assert.equal(legacy.readable, true); assert.ok(legacy.solutions >= 1 && legacy.projects >= 1); assert.ok(legacy.architecture.includes('Dynamics CRM/XRM')); assert.ok(legacy.frameworks.length >= 1);
  assert.ok(setup('-Action', 'Detect', '-Repo', R.ui).architecture.includes('Angular'));
  assert.equal(setup('-Action', 'Detect', '-Repo', 'No Such Folder').detail, 'folder not found');
  // The window's source: one Form, the Windows folder picker (IFileDialog, folders only), no tree-only picker, no configuration pop-up, no old target text.
  const src = await fs.readFile(path.join(pkg, 'PBI-Builder-Setup.ps1'), 'utf8');
  assert.equal((src.match(/New-Ctl Form\b|Windows\.Forms\.Form\b/g) || []).length, 1, 'exactly one window is created');
  assert.doesNotMatch(src, /FolderBrowserDialog|BrowseForFolder|Repair \/ configure|New-RepositoryDialog|InputBox|UI Only or Both/);
  assert.match(src, /42f85136-db7e-439c-85f1-e4075d135fc8/); assert.match(src, /0x20 \| 0x40 \| 0x800/, 'IFileDialog with PICKFOLDERS, FORCEFILESYSTEM and PATHMUSTEXIST');
  const root = new DirectoryHandle(dir), cfg = W.configFor(o); cfg.sources.cdms = R.legacy;
  await P.apply(root, await P.plan(root, P.setupFiles(P.normalizeConfig(cfg), assets, '').files, true), true);
  const full = k => path.join(dir, R[k]);
  let d = setup('-Action', 'WindowTest', '-Repo', dir);
  assert.deepEqual(d.groups.map(g => g.text), ['Installation', 'Primary source - Legacy CRM/XRM (business reference)', 'Reference repositories (read only)']);
  assert.ok(d.groups[0].top < d.groups[1].top && d.groups[1].top < d.groups[2].top, 'installation location first, then Legacy, then the references');
  assert.deepEqual(d.rows.map(r => r.key + '|' + r.label), ['legacy|Legacy CRM/XRM', 'cdms|CDMS BL', 'dab|DAB BL', 'ui|Shared Angular UI', 'schema|GraphQL Schema', 'custom|Custom reference']);
  assert.ok(d.rows.every(r => r.browse === 'Browse...')); assert.equal(d.buttons.filter(b => b === 'Browse...').length, d.rows.length + 1, 'one Browse per path, including the install location');
  assert.ok(['Install / Upgrade', 'Validate paths', 'Verify', 'Repair', 'Uninstall', 'Close'].every(b => d.buttons.includes(b)) && d.buttons.some(b => /^Upgrade ticked/.test(b)));
  assert.equal(d.targets, 'CDMS, DAB and Shared Angular UI are independent implementation targets. UI is optional. The folders above are read-only references: setup never selects an implementation target; each PBI selects its own targets when it is created.');
  assert.equal(d.location.path, dir); assert.match(d.location.status, new RegExp('^Installed: ' + P.VERSION.replace(/\./g, '\\.') + ', up to date'));
  assert.deepEqual(d.rows.slice(0, 4).map(r => r.path), [full('legacy'), full('legacy'), full('dab'), full('ui')], 'saved relative paths are shown in full');
  assert.match(d.rows[0].status, /^OK: \d+ solution\(s\), \d+ project\(s\)/); assert.match(d.rows[3].status, /^OK: Angular workspace/);
  assert.equal(d.rows[1].status, 'Error: same folder as Legacy CRM/XRM', 'the error is shown beside the path');
  assert.deepEqual(d.errors, ['CDMS BL: same folder as Legacy CRM/XRM'], 'a folder configured twice blocks Install / Upgrade');
  assert.equal(d.role, 'other', 'the install location is not inferred as the Legacy source'); assert.equal(d.editor, 'vscode'); assert.equal(d.unsaved, false, 'nothing was edited');
  // Fix the duplicate; add the schema and a custom reference; invalid and missing paths are reported beside their rows.
  await fs.mkdir(path.join(dir, 'Schema')); await fs.writeFile(path.join(dir, 'Schema', 'schema.graphql'), 'type Query { a: Int }\n'); await fs.mkdir(path.join(dir, 'Pricing API'));
  d = setup('-Action', 'WindowTest', '-Repo', dir, '-Set', `cdms=${full('cdms')}|schema=${path.join(dir, 'No Such Folder')}|custom=C:\\bad<name`);
  assert.equal(d.rows[4].status, 'Error: folder not found'); assert.equal(d.rows[5].status, 'Error: remove < > " | ? * from the path');
  assert.deepEqual(d.errors, ['Custom reference: remove < > " | ? * from the path']); assert.deepEqual(d.warnings, ['GraphQL Schema: folder not found'], 'a missing folder is a warning: it can still be saved after confirmation');
  d = setup('-Action', 'WindowTest', '-Repo', dir, '-Set', `cdms=${full('cdms')}|schema=${path.join(dir, 'Schema')}|custom=${path.join(dir, 'Pricing API')}`);
  assert.deepEqual(d.errors, []); assert.equal(d.unsaved, true, 'edited paths are unsaved until Install / Upgrade'); assert.match(d.rows[1].status, /^OK: /); assert.equal(d.rows[4].status, 'OK: 1 .graphql file(s)'); assert.equal(d.rows[5].status, 'OK: readable');
  assert.deepEqual(d.arguments, ['-Ide', 'vscode', '-Role', 'other', '-LegacySource', R.legacy, '-CdmsSource', R.cdms, '-DabSource', R.dab, '-UiSource', R.ui, '-OtherSource', 'GraphQL Schema=Schema;Pricing API=Pricing API'], 'unchanged paths are sent exactly as saved; new ones relative to the installation');
  // Saving runs the same installer arguments; reopening shows every path again.
  const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(pkg, 'Install-PBIBuilder.ps1'), '-RepoPath', dir, ...d.arguments, '-AllowUpdates'], { encoding: 'utf8', env, timeout: 180000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const saved = JSON.parse(await fs.readFile(path.join(dir, P.CONFIG), 'utf8'));
  assert.deepEqual([saved.role, saved.ide, saved.sources, saved.others], ['other', 'vscode', { legacy: R.legacy, dab: R.dab, cdms: R.cdms, ui: R.ui }, [{ name: 'GraphQL Schema', path: 'Schema' }, { name: 'Pricing API', path: 'Pricing API' }]]);
  d = setup('-Action', 'WindowTest', '-Repo', dir);
  assert.deepEqual(d.rows.map(x => x.label + '=' + x.path), ['Legacy CRM/XRM=' + full('legacy'), 'CDMS BL=' + full('cdms'), 'DAB BL=' + full('dab'), 'Shared Angular UI=' + full('ui'), 'GraphQL Schema=' + path.join(dir, 'Schema'), 'Pricing API=' + path.join(dir, 'Pricing API'), 'Custom reference=']);
  assert.equal(d.unsaved, false); assert.deepEqual(d.errors, []);
  // Choosing the install location itself as a source makes it this repository's role; that source is then stored as '.'.
  d = setup('-Action', 'WindowTest', '-Repo', dir, '-Set', `legacy=${dir}`);
  assert.equal(d.role, 'legacy'); assert.ok(!d.arguments.includes('-LegacySource')); assert.match(d.rows[0].status, /\(the install location\)$/);
});
