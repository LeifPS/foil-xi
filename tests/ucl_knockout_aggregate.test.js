// Regressionstest für den K.o.-Rückspiel-Bugfix ("kein unnötiges Elfmeterschießen bei klarem Aggregat
// mehr, Siegchance berücksichtigt jetzt das Hinspiel"). Deckt beide Richtungen ab:
//   1. Rückspiel selbst unentschieden, Aggregat klar -> KEIN Decider, Sieger direkt übers Aggregat.
//   2. Rückspiel selbst klar entschieden, Aggregat unentschieden -> Decider MUSS greifen.
// Testet außerdem direkt, dass buildDecisiveMatch mit allowDraw:true keine überflüssige Verlängerung
// mehr auf einen echten 90-Minuten-Unentschieden draufsetzt, und dass die live-Siegchance
// (monteCarloWinProb) einen mitgebrachten Aggregat-Vorsprung tatsächlich einrechnet.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

// leg1/mockLegResult werden per page.evaluate(fn, arg) ins Browser-Fenster durchgereicht (structured
// clone, kein Funktions-Sharing nötig) - jedes Szenario läuft in einer frischen Seite (withPage), damit
// sich profile/uclCurrentRun etc. zwischen den Läufen nicht gegenseitig beeinflussen.
async function runKnockoutScenario({ leg1, mockLegResult, extraRounds }) {
  return withPage(page => page.evaluate(({ leg1, mockLegResult, extraRounds }) => {
    profile = { userId: 'test', displayName: 'Test FC', coins: 999999999 };
    squadRating = () => ({ rating: 90, filled: 11 });
    getMySquadPlayers = () => {
      const pool = adminFullCardPool().filter(c => !c.isManager && c.ov >= 80);
      return FORMATIONS['433'].slots.map((slot, i) => ({ ...pool[i], pos: slot.label }));
    };
    getAssignedManager = () => null;
    squad = { tactics: null, crest: null };
    const box = document.createElement('div'); box.id = 'ucl-content'; document.body.appendChild(box);
    const area = document.createElement('div'); area.id = 'ucl-match-area-ucl'; document.body.appendChild(area);

    const rounds = [
      { matches: [{ aClub: 'FC Bayern München', bClub: 'Real Madrid', aIsPlayer: true, bIsPlayer: false,
        leg1, leg2: null, decider: null, pending: true, winnerClub: null }] },
    ];
    for (let i = 0; i < extraRounds; i++) rounds.push({ matches: [null] }); // verhindert Turnierabschluss-Modal
    profile.ucl = {
      schemaVersion: UCL_SCHEMA_VERSION, comp: 'ucl', myClub: 'FC Bayern München', stage: 'knockout',
      knockout: { rounds, playerLoc: { roundIdx: 0, matchIdx: 0 } },
    };

    const origLeg = uclPlayLegCore;
    let capturedAllowDraw = null, capturedAggMyExtra = null, capturedAggOppExtra = null;
    uclPlayLegCore = async (oppClub, allowDraw, area, stageLabel, aggMyExtra, aggOppExtra) => {
      capturedAllowDraw = allowDraw; capturedAggMyExtra = aggMyExtra; capturedAggOppExtra = aggOppExtra;
      return mockLegResult;
    };
    let caught = null;
    return playUclKnockoutLeg('ucl').catch(e => { caught = e.message; }).then(() => {
      uclPlayLegCore = origLeg;
      const m = uclCurrentRun('ucl').knockout.rounds[0].matches[0];
      return {
        caught, capturedAllowDraw, capturedAggMyExtra, capturedAggOppExtra,
        leg2: m.leg2, decider: m.decider, winnerClub: m.winnerClub,
        aggA: m.leg1.aGoals + m.leg2.aGoals, aggB: m.leg1.bGoals + m.leg2.bGoals,
      };
    });
  }, { leg1, mockLegResult, extraRounds }));
}

(async () => {
  console.log('UCL-K.o.-Rückspiel-Aggregat-Test');

  // --- Szenario 1: Hinspiel 4:0, Rückspiel 1:1 (Leg selbst unentschieden, Aggregat klar 5:1) ---
  const { result: r1, errors: e1 } = await runKnockoutScenario({
    leg1: { aGoals: 4, bGoals: 0 },
    mockLegResult: { myGoals: 1, oppGoals: 1, winnerSide: 'draw' },
    extraRounds: 1,
  });
  noErrors(e1, 'Szenario 1 (Rückspiel-Unentschieden, klares Aggregat)');
  ok(r1.caught === null, `Szenario 1 lief ohne Exception${r1.caught ? ' - ' + r1.caught : ''}`);
  ok(r1.capturedAllowDraw === true, 'Szenario 1: Rückspiel läuft mit allowDraw:true (der eigentliche Bugfix)');
  eq(r1.capturedAggMyExtra, 4, 'Szenario 1: Aggregat-Vorsprung (4 Tore) korrekt an uclPlayLegCore übergeben');
  eq(r1.capturedAggOppExtra, 0, 'Szenario 1: gegnerischer Aggregat-Vorsprung korrekt 0');
  eq(r1.decider, null, 'Szenario 1: KEIN Decider trotz 1:1 im Rückspiel, weil Aggregat klar ist');
  eq(r1.winnerClub, 'FC Bayern München', 'Szenario 1: Sieger korrekt übers 5:1-Aggregat bestimmt');

  // --- Szenario 2: Hinspiel 3:4, Rückspiel 3:2 (Leg selbst klar, Aggregat 6:6 unentschieden) ---
  const { result: r2, errors: e2 } = await runKnockoutScenario({
    leg1: { aGoals: 3, bGoals: 4 },
    mockLegResult: { myGoals: 3, oppGoals: 2, winnerSide: 'me' },
    extraRounds: 1,
  });
  noErrors(e2, 'Szenario 2 (Rückspiel klar, Aggregat unentschieden)');
  ok(r2.caught === null, `Szenario 2 lief ohne Exception${r2.caught ? ' - ' + r2.caught : ''}`);
  eq(r2.aggA, 6, 'Szenario 2: Aggregat A korrekt 6');
  eq(r2.aggB, 6, 'Szenario 2: Aggregat B korrekt 6');
  ok(r2.decider !== null, 'Szenario 2: Decider MUSS greifen, weil das Aggregat 6:6 unentschieden ist');
  ok(r2.winnerClub === 'FC Bayern München' || r2.winnerClub === 'Real Madrid', 'Szenario 2: Decider hat einen der beiden Klubs als Sieger bestimmt');

  // --- Szenario 3: buildDecisiveMatch mit allowDraw:true darf einen echten 90-Minuten-Gleichstand
  // nicht in eine Verlängerung zwingen (die eigentliche Wurzel des ursprünglichen Bugs). ---
  const { result: r3, errors: e3 } = await withPage(page => page.evaluate(() => {
    let drawCount = 0, sawET = false;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const md = buildDecisiveMatch(90, 90, adminFullCardPool().slice(0, 11), adminFullCardPool().slice(11, 22), null, null, { allowDraw: true });
      if (md.myGoals === md.oppGoals) { drawCount++; if (md.wentToET) sawET = true; }
    }
    return { drawCount, sawET, N };
  }));
  noErrors(e3, 'Szenario 3 (allowDraw ET-Unterdrückung)');
  ok(r3.drawCount > 0, `Szenario 3: mindestens ein echtes 90-Minuten-Unentschieden simuliert (${r3.drawCount}/${r3.N})`);
  ok(!r3.sawET, 'Szenario 3: kein einziges dieser Unentschieden löste eine Verlängerung aus');

  // --- Szenario 4: die live Siegchance muss einen mitgebrachten Aggregat-Vorsprung einrechnen. ---
  const { result: r4, errors: e4 } = await withPage(page => page.evaluate(() => {
    resetWinProbSmoothing();
    const evenProfile = { attack: 80, defense: 80, attackPace: 50, defPaceBlend: 50 };
    const withoutAgg = monteCarloWinProb(1, 1, 10, evenProfile, evenProfile, true);
    resetWinProbSmoothing();
    const withAgg = monteCarloWinProb(1 + 4, 1 + 0, 10, evenProfile, evenProfile, true);
    return { withoutAggWin: withoutAgg.win, withAggWin: withAgg.win };
  }));
  noErrors(e4, 'Szenario 4 (Siegchance mit Aggregat-Vorsprung)');
  ok(r4.withAggWin > r4.withoutAggWin, `Siegchance MIT 4-Tore-Aggregat-Vorsprung (${(r4.withAggWin*100).toFixed(1)}%) deutlich höher als ohne (${(r4.withoutAggWin*100).toFixed(1)}%)`);
  ok(r4.withAggWin > 0.95, 'Siegchance mit 4-Tore-Vorsprung bei 1:1 und 10 Minuten Restzeit ist sehr hoch (>95%)');

  summary('UCL-K.o.-Rückspiel-Aggregat-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
