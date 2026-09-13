// Regressionstest: wenn Hin-/Rückspiel im Aggregat unentschieden enden (z.B. Hinspiel 1:0, Rückspiel
// 1:2 -> Aggregat 2:2), lief die Verlängerung/Elfmeterschießen-Entscheidung bisher komplett unsichtbar
// im Hintergrund ab - der Spieler sah nur "Niederlage" und direkt danach "Ausgeschieden", ohne je zu
// erfahren, dass das Aggregat eigentlich unentschieden war (wirkte wie ein grundloser Sieg des Gegners).
// playUclKnockoutLeg/playUclPlayoffLeg müssen jetzt einen expliziten Toast zeigen, sobald eine solche
// Entscheidung greift.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId: 'test', displayName: 'Test FC', coins: 0, achievementStats: {} };
    clubId = 'test'; collection = []; managerCollection = []; packCollection = [];
    squad = { formation: '433', slots: {}, managerUid: null, tactics: { ...DEFAULT_TACTICS } };
    squadRating = () => ({ rating: 90, filled: 11 });
    inMatch = false; queueActive = false; pendingDuelId = null;
    fb = null; sSet = async () => {};
    document.body.innerHTML += '<div id="ucl-match-area-ucl"></div>';
    const toasts = []; toast = (m) => toasts.push(m);
    renderUclPanel = () => {};

    let callNum = 0;
    // Genau das gemeldete Szenario: Hinspiel 1:0 (Sieg), Rückspiel 1:2 (Niederlage) -> Aggregat 2:2.
    const scores = [{ myGoals: 1, oppGoals: 0, winnerSide: 'me' }, { myGoals: 1, oppGoals: 2, winnerSide: 'opp' }];
    uclPlayLegCore = async () => scores[callNum++];

    const rounds = [{ matches: [{ aClub: 'MyClub', bClub: 'OppClub', aIsPlayer: true, bIsPlayer: false, leg1: null, leg2: null, decider: null, pending: true, winnerClub: null }] }];
    profile.ucl = {
      schemaVersion: UCL_SCHEMA_VERSION, comp: 'ucl', stage: 'knockout', myClub: 'MyClub', myRating: 90,
      knockout: { rounds, playerLoc: { roundIdx: 0, matchIdx: 0 } }, eliminatedAt: null, wonCup: false,
    };

    await playUclKnockoutLeg('ucl');
    await playUclKnockoutLeg('ucl');

    const m = profile.ucl.knockout.rounds[0].matches[0];
    return {
      toasts,
      aggMe: m.leg1.aGoals + m.leg2.aGoals, aggOpp: m.leg1.bGoals + m.leg2.bGoals,
      deciderTriggered: !!m.decider,
    };
  }));

  console.log('UCL-Decider-Toast-Test');
  noErrors(errors, 'Seite');
  eq(result.aggMe, 2, 'Aggregat (eigene Tore) korrekt 2 (Hinspiel 1:0 + Rückspiel 1:2)');
  eq(result.aggOpp, 2, 'Aggregat (Gegner-Tore) korrekt 2 - echtes Aggregat-Unentschieden');
  eq(result.deciderTriggered, true, 'Aggregat-Gleichstand löst tatsächlich eine Entscheidung aus');
  const deciderToast = result.toasts.find(t => t.includes('Aggregat') && t.includes('unentschieden'));
  ok(!!deciderToast, `ein expliziter Toast erklärt die Aggregat-Entscheidung (Toasts: ${JSON.stringify(result.toasts)})`);
  ok(deciderToast && deciderToast.includes('2:2'), 'der Toast nennt das tatsächliche Aggregat (2:2)');

  summary('UCL-Decider-Toast-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
