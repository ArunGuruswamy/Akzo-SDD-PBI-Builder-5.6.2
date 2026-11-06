'use strict';
// 5.6.0: CDMS, DAB and the Shared Angular UI are independent development targets. Each of the seven selections, on real files with the
// real Windows PowerShell chat actions, generates exactly the selected areas' Refined PBIs and nothing for an unselected area. Changes
// found in an unselected area are one scope question, never a document; SetTargets applies an explicit "add". The model's own chat
// behavior is not tested here (it needs a live IDE session).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const P = require('./src/core.js'), W = require('./fixtures/workspace.cjs'), { DirectoryHandle } = require('./fixtures/fs-handles.cjs');
const assets = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, 'src/assets.json'), 'utf8'));
const installer = require('node:fs').readFileSync(path.join(__dirname, 'installer/Install-PBIBuilder.ps1'), 'utf8');
const COMBOS = [['cdms'], ['dab'], ['ui'], ['cdms', 'dab'], ['cdms', 'ui'], ['dab', 'ui'], ['cdms', 'dab', 'ui']];
const DOC = { cdms: 'Refined-PBI-CDMS', dab: 'Refined-PBI-DAB', ui: 'Refined-PBI-UI' };
const FINAL = /^(Refined-PBI-(CDMS|DAB|UI)|REFINED-PBI|PBI-(CDMS|DAB|UI)|(CDMS|DAB)-REFINED-PBI)\.(md|json|docx)$/;
const triple = names => names.flatMap(n => ['.docx', '.json', '.md'].map(x => n + x)).sort();

// The workspace state applies CDMS, DAB and the UI; a selection keeps the paths of the areas in `keep`.
function adapt(s, keep) {
  for (const k of ['cdms', 'dab', 'ui']) if (!keep.includes(k)) {
    s.paths[k] = { applies: false, reason: 'Not selected' };
    for (const r of s.rules) { delete r.paths[k]; for (const b of r.branches || []) delete b[k]; }
  }
  return s;
}
async function pbi(t, application, keep) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'akzo-560-')); t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const o = { feature: 'Measurement', entity: 'measurement' }, dir = path.join(tmp, W.opts(o).workspace), files = await W.build(fs, path, dir, o), root = new DirectoryHandle(dir);
  const config = P.normalizeConfig(W.configFor(o));
  await P.apply(root, await P.plan(root, P.setupFiles(config, assets, '<html></html>').files, true), true);
  await P.discoverSources(root, config);
  const made = P.newPbi(config, { number: '309446', title: 'Measurement validation', description: 'Validate measurements before saving', application, legacy: 'legacy' });
  await P.apply(root, await P.plan(root, made.files));
  const folder = made.folder, name = folder.split('/').pop(), state = adapt(await W.stateFor(P, o, name, files), keep);
  await P.write(root, folder + '/pbi-state.json', JSON.stringify(state, null, 2)); await P.write(root, folder + '/DRAFT-PBI.md', W.draftDoc(state, state.status));
  await P.write(root, folder + '/DECISION-LOG.md', '# Decision log\n\nDEC-1 approved: stated in the original request.\n');
  for (const id of ['Q-1', 'Q-2', 'Q-3']) await P.recordAnswer(root, folder, id, { option: 'A', by: 'Business analyst' });
  const pkg = path.join(tmp, 'package'); await fs.mkdir(pkg);
  await fs.writeFile(path.join(pkg, 'Install-PBIBuilder.ps1'), installer); await fs.writeFile(path.join(pkg, 'pbi-builder-bundle.json'), JSON.stringify(P.bundle(assets)));
  await fs.writeFile(path.join(pkg, 'Akzo-SDD-PBI-Builder.html'), '<html></html>');
  const env = { ...process.env, USERPROFILE: tmp }; delete env.PSExecutionPolicyPreference;
  const run = (...args) => { const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(pkg, 'Install-PBIBuilder.ps1'), '-RepoPath', dir, ...args], { encoding: 'utf8', env, timeout: 180000 }); assert.ifError(r.error); return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout.trim()) }; };
  const sync = () => { const r = run('-Action', 'SyncPbi', '-Pbi', name, '-Json'); assert.equal(r.code, 0, r.err); return r.json(); };
  const approve = review => run('-Action', 'ApproveAndGenerate', '-Pbi', name, '-Approver', 'Product owner', '-ReviewedContent', review);
  const finals = async () => (await fs.readdir(path.join(dir, folder))).filter(n => FINAL.test(n)).sort();
  const read = n => P.read(root, folder + '/' + n);
  return { dir, root, folder, name, run, sync, approve, finals, read, state: async () => JSON.parse(await read('pbi-state.json')) };
}

test('each of the seven selections generates exactly its own Refined PBIs and nothing for an unselected area', async t => {
  for (const areas of COMBOS) {
    const key = P.targetOf(areas), label = areas.join('+'), w = await pbi(t, key, areas);
    assert.deepEqual(P.TARGETS[key].implement.slice().sort(), areas.slice().sort(), label + ': the key implements exactly the selection');
    const out = w.sync(); assert.equal(out.phase, 'Approval', label + ': ' + JSON.stringify(out.report.issues));
    const g = w.approve(out.report.reviewedContent); assert.equal(g.code, 0, label + ': ' + g.err);
    assert.deepEqual(await w.finals(), triple(areas.map(a => DOC[a])), label + ': only the selected areas have Refined PBI files');
    assert.deepEqual(P.finalDocumentNames(JSON.parse(await w.read('pbi.json')), await w.state()), areas.map(a => DOC[a] + '.md'), label + ': the JavaScript generator names the same documents');
    for (const a of areas) {
      const md = await w.read(DOC[a] + '.md');
      assert.match(md, new RegExp('^- Development target: ' + P.TARGETS[key].label.replace(/[+()]/g, '\\$&') + '$', 'm'), label + ': ' + a + ' names its target');
      if (a === 'dab') assert.equal(/CDMS was analyzed as a read-only implementation reference/.test(md), !areas.includes('cdms'), label + ': CDMS is a reference only when it is not selected');
    }
    assert.equal(w.sync().phase, 'COMPLETE', label);
  }
});

test('UI changes found while only CDMS is selected: no UI artifact, one scope question; keeping the UI out records a dependency', async t => {
  // The analysis recorded UI work although the UI is not selected: the target excludes it, so nothing for the UI may be generated.
  const w = await pbi(t, 'cdms-only', ['cdms', 'ui']);
  const conflict = w.sync(); assert.ok(conflict.report.issues.some(i => i.code === 'TARGET_SCOPE_CONFLICT' && i.ref === 'ui'), JSON.stringify(conflict.report.issues));
  const r = w.approve(conflict.report.reviewedContent); assert.equal(r.code, 2); assert.match(r.err, /TARGET_SCOPE_CONFLICT/); assert.deepEqual(await w.finals(), []);
  const next = (await P.advanceWorkflow(w.root, w.folder)).next;
  assert.deepEqual([next.action, next.stage], ['ASK_DECISION', 'REQUIREMENT_CLARIFICATION']);
  assert.equal(next.decision.question, 'Source analysis found changes in Shared Angular UI, which is not a selected development target. Add Shared Angular UI to the implementation scope?');
  assert.deepEqual(next.decision.options.map(o => o.key), ['A', 'B', 'CUSTOM', 'LATER']); assert.match(next.decision.options[0].text, /Refined-PBI-UI\.md/);
  assert.deepEqual(next.scope, { area: 'ui', selected: ['cdms'], withArea: ['cdms', 'ui'] });
  // B: keep the UI out. Its work becomes a dependency for the UI team and its path does not apply; only the CDMS PBI is generated.
  const s = await w.state(); s.paths.ui = { applies: false, reason: 'Not selected; kept out by the product owner' };
  for (const x of s.rules) delete x.paths.ui;
  s.dependencies.push({ id: 'DEP-UI', repository: 'Shared Angular UI', responsibility: 'Show the instrument on the measurement screen (BR-2); not in this PBI', owner: 'UI team' });
  await P.write(w.root, w.folder + '/pbi-state.json', JSON.stringify(s, null, 2));
  const out = w.sync(); assert.equal(out.phase, 'Approval', JSON.stringify(out.report.issues));
  assert.equal(w.approve(out.report.reviewedContent).code, 0);
  assert.deepEqual(await w.finals(), triple(['Refined-PBI-CDMS']), 'no UI artifact although UI changes were found');
  assert.match(await w.read('Refined-PBI-CDMS.md'), /## Dependencies\n\n- DEP-UI \(Shared Angular UI\): Show the instrument on the measurement screen \(BR-2\); not in this PBI/);
});

test('adding the UI after the scope question: SetTargets changes the target, keeps decisions, refuses invalid input, and the UI PBI follows', async t => {
  const w = await pbi(t, 'cdms-only', ['cdms', 'ui']), before = await w.state();
  const pbiJson = await w.read('pbi.json');
  for (const [args, message] of [[['-Targets', 'cdms,portal', '-AnsweredBy', 'PO'], /Unknown target 'portal'/], [['-Targets', 'cdms,ui'], /-AnsweredBy/], [['-AnsweredBy', 'PO'], /-Targets/]]) {
    const r = w.run('-Action', 'SetTargets', '-Pbi', w.name, ...args, '-Json'); assert.equal(r.code, 2, args.join(' ')); assert.match(r.err, message);
  }
  assert.equal(await w.read('pbi.json'), pbiJson, 'invalid input changes nothing');
  const r = w.run('-Action', 'SetTargets', '-Pbi', w.name, '-Targets', 'ui,cdms', '-AnsweredBy', 'Product owner', '-Json'); assert.equal(r.code, 0, r.err);
  const out = r.json(); assert.deepEqual([out.target.from, out.target.to, out.target.changed, out.target.documents], ['cdms-only', P.targetOf(['cdms', 'ui']), true, ['Refined-PBI-CDMS.md', 'Refined-PBI-UI.md']]);
  assert.ok(!out.report.issues.some(i => i.code === 'TARGET_SCOPE_CONFLICT')); assert.equal(out.phase, 'Approval');
  const request = JSON.parse(await w.read('pbi.json')); assert.equal(request.application, 'cdms');
  assert.equal(request.repositories.map(x => x.key + ':' + x.use).join(','), 'legacy:reference,cdms:implement,ui:implement');
  assert.equal(request.title, JSON.parse(pbiJson).title, 'other intake fields are kept');
  const req = await w.read('REQUEST.md'); assert.match(req, /## Development target\n\nCDMS \+ UI\n\nDevelopment target changed from CDMS only to CDMS \+ UI by Product owner in Copilot Chat at \S+\.\n\n## /);
  assert.match(req, /- Shared Angular UI — Shared frontend \(implementation target\): /);
  assert.match(await w.read('DECISION-LOG.md'), /- Development target changed from CDMS only to CDMS \+ UI by Product owner/);
  assert.ok((await fs.readdir(path.join(w.dir, w.folder, 'history'))).some(n => n.startsWith('pbi.json.')), 'the earlier pbi.json is kept in history');
  assert.deepEqual((await w.state()).decisions, before.decisions, 'decisions are preserved');
  assert.equal(w.run('-Action', 'SetTargets', '-Pbi', w.name, '-Targets', 'cdms, ui', '-AnsweredBy', 'PO', '-Json').json().target.changed, false, 'the same selection is no change');
  assert.equal(w.approve(out.report.reviewedContent).code, 0);
  assert.deepEqual(await w.finals(), triple(['Refined-PBI-CDMS', 'Refined-PBI-UI']));
});

test('targets saved before 5.6 keep their meaning, as keys and as labels, in both engines', async t => {
  for (const [saved, areas] of [['DAB + UI', ['dab', 'ui']], ['Both (CDMS + DAB + UI)', ['cdms', 'dab', 'ui']], ['ui', ['ui']]]) {
    const w = await pbi(t, P.targetKey(saved), areas), request = JSON.parse(await w.read('pbi.json'));
    request.application = saved; await P.write(w.root, w.folder + '/pbi.json', JSON.stringify(request, null, 2) + '\n');
    const out = w.sync(); assert.equal(out.phase, 'Approval', saved + ': ' + JSON.stringify(out.report.issues));
    assert.deepEqual(out.report, await P.checkPbi(w.root, w.folder), saved + ': both engines read the saved target the same way');
    assert.equal(w.approve(out.report.reviewedContent).code, 0);
    assert.deepEqual(await w.finals(), triple(areas.map(a => DOC[a])), saved);
  }
});
