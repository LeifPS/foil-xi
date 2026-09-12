// Regressionstest für den gemeinsamen UCL/UEL-Ligaphasen-Spielplan (uclLeaguePhaseMatchPairs +
// uclAssignMatchdays, siehe "UCL/UEL-Ligaphase: echter gemeinsamer Spielplan"-Commit). Prüft genau die
// Eigenschaften, deren Fehlen den ursprünglichen Bug ausmachte: jeder Klub bekommt an jedem Spieltag
// höchstens ein Spiel, und wenn Klub A laut Spielplan gegen Klub B spielt, muss B's eigener Spielplan
// am selben Spieltag genau A als Gegner zeigen (echte Gegenseitigkeit statt zweier unabhängiger,
// möglicherweise widersprüchlicher Kalender).
const { withPage } = require('./lib/browser');
const { ok, noErrors, summary } = require('./lib/assert');

const RUNS = 20;

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate((runs) => {
    const allClubs = UCL_ALL_CLUBS;
    let successCount = 0;
    let consistencyOk = true, consistencyDetail = null;
    let sampleMix = null;

    for (let r = 0; r < runs; r++) {
      const pairs = uclLeaguePhaseMatchPairs('ucl');
      const assigned = uclAssignMatchdays(pairs, allClubs);
      if (!assigned) { consistencyOk = false; consistencyDetail = `Lauf ${r}: uclAssignMatchdays lieferte null`; break; }
      successCount++;

      const byClub = new Map(allClubs.map(c => [c, new Array(8).fill(null)]));
      assigned.forEach(m => {
        byClub.get(m.a)[m.matchday] = { opp: m.b, home: m.homeA, pot: m.potB };
        byClub.get(m.b)[m.matchday] = { opp: m.a, home: !m.homeA, pot: m.potA };
      });

      for (const c of allClubs) {
        const sched = byClub.get(c);
        if (sched.some(s => !s)) { consistencyOk = false; consistencyDetail = `${c} hat einen leeren Spieltag-Slot`; }
        const opps = sched.map(s => s.opp);
        if (new Set(opps).size !== 8) { consistencyOk = false; consistencyDetail = `${c} hat einen Gegner doppelt`; }
        if (opps.includes(c)) { consistencyOk = false; consistencyDetail = `${c} spielt gegen sich selbst`; }
        for (let d = 0; d < 8; d++) {
          const opp = sched[d].opp;
          const back = byClub.get(opp)[d];
          if (!back || back.opp !== c || back.home === sched[d].home) {
            consistencyOk = false; consistencyDetail = `${c} vs ${opp} an Spieltag ${d} nicht gegenseitig konsistent`;
          }
        }
      }
      if (r === 0) sampleMix = byClub.get('Paris Saint-Germain').map(s => s.pot);
    }
    return { successCount, runs, consistencyOk, consistencyDetail, sampleMix };
  }, RUNS));

  console.log('UCL-Ligaphasen-Spielplan-Test');
  noErrors(errors, 'Seite');
  ok(result.successCount === RUNS, `alle ${RUNS} Testläufe erzeugen einen gültigen Spielplan (${result.successCount}/${RUNS})`);
  ok(result.consistencyOk, `kein leerer Slot / kein doppelter Gegner / keine Selbstpaarung / echte Gegenseitigkeit${result.consistencyDetail ? ' - ' + result.consistencyDetail : ''}`);

  // "ein wenig gemischt" statt starr A,A,B,B,C,C,D,D (siehe "die 4 gewonnen, 30 verloren"-Bugreport) -
  // die erste und letzte Topf-Kennung dürfen nicht beide "A" sein UND die Sequenz darf nicht streng
  // nach Topf-Buchstabe sortiert sein, sonst wäre sie wieder starr.
  const mix = result.sampleMix || [];
  const isRigidOrder = JSON.stringify(mix) === JSON.stringify([...mix].sort());
  ok(mix.length === 8 && !isRigidOrder, `Spieltag-Reihenfolge ist gemischt, nicht starr nach Topf sortiert (Beispiel: ${JSON.stringify(mix)})`);

  summary('UCL-Ligaphasen-Spielplan-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
