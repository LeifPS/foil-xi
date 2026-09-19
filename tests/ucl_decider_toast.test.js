// Regressionstest: wenn Hin-/Rückspiel im Aggregat unentschieden enden (z.B. Hinspiel 1:0, Rückspiel
// 1:2 -> Aggregat 2:2), lief die Verlängerung/Elfmeterschießen-Entscheidung erst komplett unsichtbar im
// Hintergrund ab (per uclMatchResultClubs()), dann - nach einem ersten Bugfix - als eigenes, komplett
// separates DRITTES Match ("Entscheidungsspiel", eigene Anstoß-Cutscene). Beides ist falsch: im echten
// Fußball ist die Verlängerung Teil DESSELBEN Rückspiels, kein eigenes drittes Spiel. Der Nutzer meldete
// das explizit: "wenn es ein Aggregat unentschieden ist [soll] das zweite Spiel fortgesetzt werden [...]
// mit Verlängerung Elfmeterschießen und nicht ein eigenes drittes Spiel kommen soll."
// playUclKnockoutLeg/playUclPlayoffLeg rufen uclPlayLegCore daher jetzt nur noch GENAU 2x auf (Hin- und
// Rückspiel) - das Rückspiel selbst läuft mit tieBreakOnAggregate:true, geht also bei Aggregat-
// Gleichstand SELBST nahtlos in Verlängerung/Elfmeterschießen (siehe buildDecisiveMatch), statt dass ein
// separates drittes Match gestartet wird.
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
    showUclTrophyCutscene = async () => {};

    let callNum = 0;
    // Genau das gemeldete Szenario: Hinspiel 1:0 (Sieg), Rückspiel endet nach 90 Minuten ebenfalls im
    // Aggregat unentschieden (2:2) und wird - noch als TEIL DESSELBEN Rückspiel-Aufrufs - über
    // Verlängerung/Elfmeterschießen entschieden (wentToET/wentToPK bereits im zurückgegebenen md).
    const callArgs = [];
    const scores = [
      { myGoals: 1, oppGoals: 0, winnerSide: 'me' },
      { myGoals: 1, oppGoals: 2, winnerSide: 'me', wentToET: true, wentToPK: true },
    ];
    uclPlayLegCore = async (oppClub, allowDraw, area, stageLabel, aggMyExtra, aggOppExtra, tieBreakOnAggregate) => {
      callArgs.push({ oppClub, tieBreakOnAggregate });
      return scores[callNum++];
    };

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
      decider: m.decider,
      uclPlayLegCoreCallCount: callNum,
      callArgs,
      winnerClub: m.winnerClub,
    };
  }));

  console.log('UCL-Decider-Toast-Test');
  noErrors(errors, 'Seite');
  eq(result.aggMe, 2, 'Aggregat (eigene Tore) korrekt 2 (Hinspiel 1:0 + Rückspiel 1:2)');
  eq(result.aggOpp, 2, 'Aggregat (Gegner-Tore) korrekt 2 - echtes Aggregat-Unentschieden');
  eq(result.deciderTriggered, true, 'Aggregat-Gleichstand wird als Entscheidung (Verlängerung/Elfmeterschießen) erkannt und gespeichert');
  // Kernpunkt dieses Bugfixes: KEIN drittes, separates Match mehr - uclPlayLegCore wird exakt 2x
  // aufgerufen (Hin- und Rückspiel), die Verlängerung/das Elfmeterschießen ist Teil des Rückspiel-Aufrufs.
  eq(result.uclPlayLegCoreCallCount, 2, 'uclPlayLegCore wird NUR 2x aufgerufen (Hin-/Rückspiel) - kein separates drittes "Entscheidungsspiel" mehr');
  eq(result.callArgs[0].tieBreakOnAggregate, false, 'das Hinspiel entscheidet nicht anhand des Aggregats (es gibt noch keins)');
  eq(result.callArgs[1].tieBreakOnAggregate, true, 'das Rückspiel läuft mit tieBreakOnAggregate:true - es entscheidet bei Bedarf selbst per Verlängerung/Elfmeterschießen');
  eq(result.callArgs[1].oppClub, 'OppClub', 'das Rückspiel läuft gegen denselben Gegner-Klub wie das Hinspiel');
  ok(!!result.decider, 'das Verlängerungs-/Elfmeterschießen-Ergebnis des Rückspiels wird im Match gespeichert');
  eq(result.decider.winnerSide, 'me', 'der Sieger nach Verlängerung/Elfmeterschießen wird korrekt übernommen');
  eq(result.decider.wentToPK, true, 'ein Elfmeterschießen wird als solches gespeichert (für die Anzeige "n.E.")');
  eq(result.winnerClub, 'MyClub', 'der tatsächliche Sieger nach Verlängerung/Elfmeterschießen gewinnt die Paarung');
  // Das Rückspiel-Ergebnis selbst trägt jetzt direkt den n.E.-Hinweis im Toast (kein separater
  // "Entscheidungsspiel"-Toast mehr nötig, da alles Teil desselben Spiels ist).
  const legToast = result.toasts.find(t => t.includes('1:2') && t.includes('n.E.'));
  ok(!!legToast, `der Rückspiel-Toast selbst zeigt bereits den n.E.-Hinweis (Toasts: ${JSON.stringify(result.toasts)})`);
  const noSeparateDeciderToast = !result.toasts.some(t => t.includes('Entscheidungsspiel'));
  ok(noSeparateDeciderToast, `es gibt keinen Toast mehr für ein separates "Entscheidungsspiel" (Toasts: ${JSON.stringify(result.toasts)})`);

  summary('UCL-Decider-Toast-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
