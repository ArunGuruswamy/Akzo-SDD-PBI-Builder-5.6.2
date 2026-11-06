'use strict';
// 5.6.1: Visual Studio 2026, VS Code, or both editors in one installation, on real folders with the real Windows PowerShell
// installer. Each editor has its own agent file; every other file is shared once. Status, failures, repairs and upgrades are
// per editor. Copilot discovering the agents inside Visual Studio or VS Code needs a live IDE and is not tested here.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const P = require('./src/core.js'), V53 = require('./fixtures/baseline-v5.3.0-core.cjs'), { DirectoryHandle } = require('./fixtures/fs-handles.cjs');
const assets = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, 'src/assets.json'), 'utf8'));
const installer = require('node:fs').readFileSync(path.join(__dirname, 'installer/Install-PBIBuilder.ps1'), 'utf8');
const VS = P.AGENT, CODE = P.AGENT_VSCODE, HTML = '<html></html>';

async function kit(t) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'akzo-561-')); t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const pkg = path.join(tmp, 'package'); await fs.mkdir(pkg);
  await fs.writeFile(path.join(pkg, 'Install-PBIBuilder.ps1'), installer); await fs.writeFile(path.join(pkg, 'pbi-builder-bundle.json'), JSON.stringify(P.bundle(assets)));
  await fs.writeFile(path.join(pkg, 'Akzo-SDD-PBI-Builder.html'), HTML);
  for (const f of ['PBI-Builder-Setup.ps1']) await fs.copyFile(path.join(__dirname, 'installer', f), path.join(pkg, f));
  const env = { ...process.env, USERPROFILE: tmp }; delete env.PSExecutionPolicyPreference;
  let n = 0;
  const repo = async () => { const d = path.join(tmp, 'repo ' + (++n)); await fs.mkdir(path.join(d, '.git'), { recursive: true }); return d; };
  const run = (dir, ...args) => { const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(pkg, 'Install-PBIBuilder.ps1'), '-RepoPath', dir, ...args], { encoding: 'utf8', env, timeout: 180000 }); assert.ifError(r.error); return { code: r.status, out: r.stdout + r.stderr }; };
  const setup = (...args) => { const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(pkg, 'PBI-Builder-Setup.ps1'), '-NoGui', '-HomeRoot', tmp, ...args], { encoding: 'utf8', env, timeout: 180000 }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout.trim()); };
  return { tmp, repo, run, setup };
}
async function tree(dir, rel = '') {
  const out = {};
  for (const e of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.name === '.git' || r === P.BASE + '/backups') continue;
    if (e.isDirectory()) Object.assign(out, await tree(dir, r)); else out[r] = await fs.readFile(path.join(dir, r), 'utf8');
  }
  return out;
}
const read = (d, p) => fs.readFile(path.join(d, p), 'utf8');
const config = async d => JSON.parse(await read(d, P.CONFIG));
const nameOf = text => /^name: "(.*)"$/m.exec(text)[1];
const toolsOf = text => /^tools: (.*)$/m.exec(text)[1];
const editorLines = out => out.split(/\r?\n/).filter(l => l.startsWith('Editor '));

test('Visual Studio only, VS Code only and both: the installer writes what the browser engine writes; one agent per editor, everything else once', async t => {
  const k = await kit(t), single = {};
  for (const ide of ['visualstudio', 'vscode', 'both']) {
    const d = await k.repo(); let r = k.run(d, '-ProjectName', 'Demo', '-Ide', ide, '-Role', 'legacy');
    assert.equal(r.code, 0, r.out);
    const files = await tree(d), expected = P.setupFiles({ projectName: 'Demo', ide, role: 'legacy', includeReferences: false, sources: { legacy: '', dab: '', cdms: '', ui: '' }, others: [] }, { ...assets, installer }, HTML).files;
    delete files[P.MANIFEST];
    assert.deepEqual(Object.keys(files).sort(), Object.keys(expected).sort(), ide + ': the same files as the browser engine');
    for (const p of Object.keys(expected)) assert.equal(files[p], expected[p], ide + ': ' + p);
    const agents = Object.keys(files).filter(p => p.startsWith('.github/agents/')).sort();
    assert.equal((await config(d)).ide, ide, 'the selection is saved in config.json');
    assert.equal(Object.keys(files).filter(p => p.endsWith('/README.md') && p.includes('pbi-builder')).length, 1, 'one playbook folder');
    assert.ok(Object.keys(files).every(p => p.startsWith('.github/') || p.startsWith(P.BASE + '/')), 'nothing outside .github and the one playbook folder');
    if (ide === 'both') {
      assert.deepEqual(agents, [CODE, VS].sort());
      assert.equal(nameOf(files[VS]), 'Akzo SDD PBI Builder - Demo (Visual Studio)'); assert.equal(nameOf(files[CODE]), 'Akzo SDD PBI Builder - Demo (VS Code)');
      assert.equal(toolsOf(files[VS]), toolsOf(single.visualstudio[VS]), 'the Visual Studio agent has the Visual Studio tools'); assert.equal(toolsOf(files[CODE]), toolsOf(single.vscode[VS]), 'the VS Code agent has the VS Code tools');
      assert.equal(files[VS].replace(/ \(Visual Studio\)"/, '"'), single.visualstudio[VS], 'the Visual Studio agent is the single-editor agent, named for its editor');
      assert.equal(files[CODE].replace(/ \(VS Code\)"/, '"'), single.vscode[VS], 'the VS Code agent is the single-editor agent, named for its editor');
      const shared = p => !p.startsWith('.github/agents/') && !p.startsWith('.github/prompts/') && p !== P.CONFIG && p !== P.BASE + '/README.md';
      for (const p of Object.keys(files).filter(shared)) assert.equal(files[p], single.visualstudio[p], 'shared file identical to a single-editor install: ' + p);
      assert.doesNotMatch(files['.github/prompts/akzo-pbi-new.prompt.md'], /^agent:/m, 'shared prompts leave the agent to the editor\'s selection');
      assert.match(files[P.BASE + '/README.md'], /- Visual Studio: Akzo SDD PBI Builder - Demo \(Visual Studio\)\n- VS Code: Akzo SDD PBI Builder - Demo \(VS Code\)/);
      assert.deepEqual(editorLines(r.out).filter(l => /: installed./.test(l)).map(l => l.replace(/:.*/, '')), ['Editor Visual Studio 2026', 'Editor VS Code']);
    } else {
      single[ide] = files; assert.deepEqual(agents, [VS]); assert.equal(nameOf(files[VS]), 'Akzo SDD PBI Builder - Demo');
      assert.match(files['.github/prompts/akzo-pbi-new.prompt.md'], /^agent: "Akzo SDD PBI Builder - Demo"$/m);
      assert.deepEqual(editorLines(r.out).filter(l => /: installed./.test(l)).map(l => l.replace(/:.*/, '')), ['Editor ' + P.EDITORS[ide]], 'only the selected editor is reported');
    }
    r = k.run(d, '-Action', 'Verify'); assert.equal(r.code, 0, r.out);
    const v = editorLines(r.out); assert.equal(v.length, ide === 'both' ? 2 : 1); assert.ok(v.every(l => / OK - /.test(l)), v.join('\n'));
  }
  assert.match(toolsOf(single.visualstudio[VS]), /readfile/); assert.match(toolsOf(single.vscode[VS]), /vscode\/askQuestions/);
});

test('the selection persists across reruns, repairs and upgrades; switching editors keeps shared files and retires only that editor\'s agent', async t => {
  const k = await kit(t), d = await k.repo();
  // A 5.3.0 installation for VS Code, upgraded without naming the editor: still VS Code.
  const root = new DirectoryHandle(d), old = { projectName: 'Demo', ide: 'vscode', role: 'legacy', includeReferences: false, sources: { legacy: '', dab: '', cdms: '', ui: '../CDMS' }, others: [{ name: 'GraphQL Schema', path: '../Schema' }] };
  await V53.apply(root, await V53.plan(root, V53.setupFiles(old, assets, HTML).files, true), true);
  await fs.mkdir(path.join(d, 'playbook/pbis/pbi-1'), { recursive: true }); await fs.writeFile(path.join(d, 'playbook/pbis/pbi-1/pbi.json'), '{"kept":true}');
  let r = k.run(d, '-AllowUpdates'); assert.equal(r.code, 0, r.out);
  let c = await config(d); assert.equal(c.ide, 'vscode'); assert.equal(c.packageVersion, P.VERSION); assert.deepEqual([c.sources.ui, c.others], ['../CDMS', [{ name: 'GraphQL Schema', path: '../Schema' }]], 'paths and the schema reference are kept');
  assert.match(toolsOf(await read(d, VS)), /vscode\/askQuestions/);
  r = k.run(d, '-Action', 'Repair'); assert.equal(r.code, 0, r.out); assert.equal((await config(d)).ide, 'vscode', 'Repair keeps the editors');
  r = k.run(d); assert.equal(r.code, 0, r.out); assert.equal((await config(d)).ide, 'vscode', 'a rerun keeps the editors');
  // Add Visual Studio: the agent path takes the Visual Studio profile, VS Code gets its own file; shared files are not rewritten.
  const before = await tree(d);
  r = k.run(d, '-Ide', 'both', '-AllowUpdates'); assert.equal(r.code, 0, r.out);
  let now = await tree(d); assert.equal((await config(d)).ide, 'both');
  assert.match(toolsOf(now[VS]), /readfile/); assert.match(toolsOf(now[CODE]), /vscode\/askQuestions/);
  const changed = Object.keys(now).filter(p => now[p] !== before[p]).sort();
  assert.deepEqual(changed, [CODE, VS, '.github/prompts/akzo-pbi-new.prompt.md', '.github/prompts/akzo-pbi-refine.prompt.md', P.CONFIG, P.BASE + '/README.md', P.MANIFEST].sort(), 'only editor-specific files change');
  assert.equal(now['playbook/pbis/pbi-1/pbi.json'], '{"kept":true}');
  r = k.run(d, '-Action', 'Repair'); assert.equal(r.code, 0, r.out); assert.equal((await config(d)).ide, 'both');
  // Back to Visual Studio only: the unchanged VS Code agent is retired with a backup; with an edited one it is kept and reported.
  r = k.run(d, '-Ide', 'visualstudio', '-AllowUpdates'); assert.equal(r.code, 0, r.out);
  now = await tree(d); assert.equal(now[CODE], undefined); assert.match(r.out, new RegExp('Retired: .*' + CODE.replace(/[.]/g, '\\.')));
  assert.ok((await fs.readdir(path.join(d, P.BASE, 'backups'))).length, 'backed up first'); assert.equal(nameOf(now[VS]), 'Akzo SDD PBI Builder - Demo');
  r = k.run(d, '-Ide', 'both', '-AllowUpdates'); assert.equal(r.code, 0, r.out);
  await fs.appendFile(path.join(d, CODE), '\nMy VS Code notes.\n');
  r = k.run(d, '-Ide', 'vscode', '-AllowUpdates'); assert.equal(r.code, 0, r.out);
  assert.match(await read(d, CODE), /My VS Code notes/, 'an edited agent is never removed'); assert.match(r.out, /Kept \(edited or unowned/);
  assert.match(toolsOf(await read(d, VS)), /vscode\/askQuestions/, 'VS Code only: its agent is at the agent path again');
  // Uninstall removes the agents it installed unchanged and keeps PBIs and edited files.
  r = k.run(d, '-Action', 'Uninstall'); assert.equal(r.code, 0, r.out);
  now = await tree(d); assert.equal(now[VS], undefined); assert.match(now[CODE], /My VS Code notes/); assert.equal(now['playbook/pbis/pbi-1/pbi.json'], '{"kept":true}');
});

test('one blocked editor is reported on its own and nothing is marked installed; the other editor upgrades and repairs independently with -Editor', async t => {
  const k = await kit(t), d = await k.repo();
  let r = k.run(d, '-ProjectName', 'Demo', '-Ide', 'both', '-Role', 'legacy'); assert.equal(r.code, 0, r.out);
  await fs.appendFile(path.join(d, CODE), '\nMy VS Code notes.\n');
  const edited = await read(d, CODE), before = await tree(d);
  // A change that updates both agents (the project name): VS Code is blocked by its edit, so nothing is written.
  r = k.run(d, '-ProjectName', 'Demo 2', '-AllowUpdates');
  assert.equal(r.code, 2, r.out); assert.match(r.out, /Nothing was written/);
  const lines = editorLines(r.out);
  assert.match(lines.find(l => l.startsWith('Editor VS Code:')), /^Editor VS Code: BLOCKED: .*akzo-sdd-pbi-builder-vscode\.agent\.md differs .*rerun with -Editor visualstudio/);
  assert.match(lines.find(l => l.startsWith('Editor Visual Studio 2026:')), /^Editor Visual Studio 2026: NOT WRITTEN: .*-Editor visualstudio/, 'the unblocked editor is not reported as installed');
  assert.doesNotMatch(r.out, /: installed\./);
  assert.deepEqual(await tree(d), before, 'nothing was written');
  // Upgrade Visual Studio only.
  r = k.run(d, '-ProjectName', 'Demo 2', '-Editor', 'visualstudio', '-AllowUpdates'); assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Editor Visual Studio 2026: installed\. .*Demo 2 \(Visual Studio\)/); assert.match(r.out, /Editor VS Code: not changed \(-Editor visualstudio\)/);
  assert.equal(nameOf(await read(d, VS)), 'Akzo SDD PBI Builder - Demo 2 (Visual Studio)'); assert.equal(await read(d, CODE), edited, 'VS Code is left as it is');
  assert.equal((await config(d)).projectName, 'Demo 2');
  // Verify reports each editor separately; -Editor checks one.
  r = k.run(d, '-Action', 'Verify'); assert.equal(r.code, 3, r.out);
  assert.match(r.out, /Editor Visual Studio 2026: OK - /); assert.match(r.out, /Editor VS Code: CHANGED - .*Repair -Editor vscode/);
  r = k.run(d, '-Action', 'Verify', '-Editor', 'visualstudio'); assert.equal(r.code, 0, r.out); assert.doesNotMatch(r.out, /Editor VS Code/);
  // Repair one editor while the other is blocked.
  await fs.rm(path.join(d, VS));
  r = k.run(d, '-Action', 'Repair'); assert.equal(r.code, 2, r.out); assert.match(r.out, /Editor VS Code: BLOCKED/);
  r = k.run(d, '-Action', 'Repair', '-Editor', 'visualstudio'); assert.equal(r.code, 0, r.out);
  assert.equal(nameOf(await read(d, VS)), 'Akzo SDD PBI Builder - Demo 2 (Visual Studio)'); assert.equal(await read(d, CODE), edited);
  // Restore VS Code (move the edited file away), repair it alone, and both verify.
  await fs.rename(path.join(d, CODE), path.join(d, 'my-vscode-agent.md'));
  r = k.run(d, '-Action', 'Verify', '-Editor', 'vscode'); assert.equal(r.code, 3, r.out); assert.match(r.out, /Editor VS Code: MISSING - .*Run Repair -Editor vscode/);
  r = k.run(d, '-Action', 'Repair', '-Editor', 'vscode'); assert.equal(r.code, 0, r.out);
  assert.equal(nameOf(await read(d, CODE)), 'Akzo SDD PBI Builder - Demo 2 (VS Code)');
  r = k.run(d, '-Action', 'Verify'); assert.equal(r.code, 0, r.out); assert.equal(editorLines(r.out).filter(l => / OK - /.test(l)).length, 2);
  // -Editor must be one of the installation's editors.
  const one = await k.repo(); assert.equal(k.run(one, '-ProjectName', 'One', '-Ide', 'visualstudio', '-Role', 'legacy').code, 0);
  r = k.run(one, '-Action', 'Repair', '-Editor', 'vscode'); assert.equal(r.code, 2, r.out); assert.match(r.out, /-Editor vscode is not an editor of this installation \(Visual Studio 2026\)/);
});

test('setup window: two independent editor checkboxes, at least one required, the saved selection shown again', async t => {
  const k = await kit(t), d = await k.repo();
  assert.equal(k.run(d, '-ProjectName', 'Demo', '-Ide', 'both', '-Role', 'other').code, 0);
  let w = k.setup('-Action', 'WindowTest', '-Repo', d);
  assert.deepEqual(w.editors, ['visualstudio', 'vscode']); assert.equal(w.editor, 'both'); assert.equal(w.unsaved, false);
  assert.deepEqual(w.checkboxes, ['Visual Studio 2026', 'Visual Studio Code']);
  assert.match(w.editorStatus, /^Visual Studio 2026: installed, up to date\. VS Code: installed, up to date\./);
  assert.ok(w.arguments.join(' ').startsWith('-Ide both -Role other'));
  for (const [set, ide] of [['visualstudio', 'visualstudio'], ['vscode', 'vscode'], ['visualstudio,vscode', 'both']]) {
    w = k.setup('-Action', 'WindowTest', '-Repo', d, '-Set', 'editor=' + set);
    assert.equal(w.editor, ide); assert.deepEqual(w.errors, []); assert.deepEqual(w.arguments.slice(0, 2), ['-Ide', ide]); assert.equal(w.unsaved, ide !== 'both');
  }
  w = k.setup('-Action', 'WindowTest', '-Repo', d, '-Set', 'editor=none');
  assert.deepEqual(w.errors, ['Editor: select at least one editor.']); assert.equal(w.editorStatus, 'Error: select at least one editor.');
  await fs.appendFile(path.join(d, CODE), '\nedit\n');
  w = k.setup('-Action', 'WindowTest', '-Repo', d);
  assert.match(w.editorStatus, /Visual Studio 2026: installed, up to date\. VS Code: agent file edited/);
});

test('setup window list: version, editors, verified status and required action for every remembered installation; full path as tooltip', async t => {
  const k = await kit(t);
  const cur = await k.repo(); assert.equal(k.run(cur, '-ProjectName', 'Cur', '-Ide', 'both', '-Role', 'other').code, 0);
  await fs.appendFile(path.join(cur, CODE), '\nMy notes.\n');
  const old = await k.repo(), root = new DirectoryHandle(old);
  await V53.apply(root, await V53.plan(root, V53.setupFiles({ projectName: 'Old', ide: 'vscode', role: 'legacy', includeReferences: false, sources: { legacy: '', dab: '', cdms: '', ui: '' }, others: [] }, assets, HTML).files, true), true);
  const plain = await k.repo();
  const broken = await k.repo(); assert.equal(k.run(broken, '-ProjectName', 'Broken', '-Ide', 'visualstudio', '-Role', 'other').code, 0); await fs.rm(path.join(broken, VS));
  const long = path.join(k.tmp, 'Long ' + 'a'.repeat(50), 'b'.repeat(50), 'c'.repeat(50), 'Repository with a long name'); await fs.mkdir(path.join(long, '.git'), { recursive: true });
  const gone = path.join(k.tmp, 'Gone Repo');
  await fs.mkdir(path.join(k.tmp, '.akzo-pbi-builder'), { recursive: true }); await fs.writeFile(path.join(k.tmp, '.akzo-pbi-builder', 'repositories.txt'), [cur, old, plain, broken, long, gone].join('\r\n'));
  const w = k.setup('-Action', 'WindowTest');
  assert.deepEqual(w.columns, ['Installation location', 'Version', 'Editors', 'Status', 'Required']);
  assert.equal(w.itemToolTips, true); assert.equal(w.resizable, true); assert.equal(w.logToggle, 'Show log');
  const by = Object.fromEntries(w.installations.map(i => [i.path, i])), row = i => [i.version, i.editors, i.status, i.required, i.ticked].join(' | ');
  assert.equal(w.installations.length, 6);
  assert.equal(row(by[cur]), `${P.VERSION} | Visual Studio 2026 + VS Code | Installed | None | false`);
  assert.match(by[cur].tooltip, /\nInstalled: Verified: (\d+) of (\d+) recorded files match\. 1 edited file\(s\) kept: \.github\/agents\/akzo-sdd-pbi-builder-vscode\.agent\.md$/);
  assert.equal(row(by[old]), '5.3.0 | VS Code | Upgrade Available | Upgrade | true', 'an older installation is ticked for Upgrade ticked');
  assert.equal(row(by[plain]), '- | - | Not Installed | Install | false');
  assert.equal(row(by[broken]), `${P.VERSION} | Visual Studio 2026 | Repair Needed | Repair | false`);
  assert.match(by[broken].tooltip, /Repair Needed: 1 of \d+ recorded files missing: \.github\/agents\/akzo-sdd-pbi-builder\.agent\.md/);
  assert.equal(row(by[gone]), '- | - | Not Found | Fix path | false');
  assert.ok(by[long].tooltip.startsWith(long + '\n'), 'the full path is in the tooltip');
});
