'use strict';
// A disposable PBI shaped like the reported PBI 309446 (not its content, which was not supplied): development target
// DAB + UI with CDMS as a read-only reference, six mandatory PO/BA questions, and DAB code that the PBI asks developers
// to build (an implementation gap recorded as bypasses + implement, not missing evidence).
const W = require('./workspace.cjs');
async function build(P, fs, path, dir, o = { feature: 'Measurement', entity: 'measurement' }) {
  const files = await W.build(fs, path, dir, o), config = P.normalizeConfig(W.configFor(o));
  return { files, config, o };
}
async function state(P, o, pbi, files) {
  const s = await W.stateFor(P, o, pbi, files);
  s.paths.cdms = { applies: false, reason: 'DAB + UI target: CDMS is a read-only implementation reference' };
  for (const r of s.rules) {
    r.paths.cdms = { status: 'not-applicable', reason: 'CDMS is a reference for this target' };
    for (const b of r.branches || []) if ('cdms' in b) delete b.cdms;
  }
  // The DAB handler does not exist yet: the PBI asks developers to build it.
  s.rules[0].paths.dab = { status: 'bypasses', evidence: ['EV-6'] }; s.rules[0].targetAction = 'implement';
  const extra = [['Q-4', 'Must a supervisor approve a corrected measurement?'], ['Q-5', 'Is the reason for a rejection shown to the user?'], ['Q-6', 'Are historical measurements migrated?']];
  for (const [id, question] of extra) s.questions.push({ id, blocking: true, owner: 'po-ba', status: 'open', question, options: [{ key: 'A', text: 'Yes' }, { key: 'B', text: 'No' }], evidence: ['EV-2'] });
  return s;
}
module.exports = { build, state };
