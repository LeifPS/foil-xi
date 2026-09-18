// Regressionstest: wenn Hin-/Rückspiel im Aggregat unentschieden enden (z.B. Hinspiel 1:0, Rückspiel
// 1:2 -> Aggregat 2:2), lief die Verlängerung/Elfmeterschießen-Entscheidung bisher komplett unsichtbar
// im Hintergrund ab (per uclMatchResultClubs() ohne jedes spielbare/anschaubare Match) - der Spieler sah
// nur "Niederlage" und direkt danach "Ausgeschieden", ohne je eine echte Verlängerung zu erleben (wirkte
// wie ein grundloser Sieg des Gegners statt einer fairen Entscheidung).
// playUclKnockoutLeg/playUclPlayoffLeg müssen jetzt (1) einen expliziten Toast zeigen, sobald eine solche
// Entscheidung greift, UND (2) die Entscheidung selbst als echtes drittes, live animiertes Spiel über
// uclPlayLegCore(oppClub, false, ...) laufen lassen (Bugfix: "bei Unentschieden soll nicht verloren
// sondern Verlängerung [kommen]") statt sie lautlos zu würfeln.
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
    // Der Aggregat-Entscheider ist ein echter 50/50-Zufallsausgang (uclMatchResultClubs simuliert ein
    // echtes Match) - gewinnt die Testkarte diesen Münzwurf, läuft das gesamte K.o.-Turnier (nur 1 Runde
    // hier) sofort durch bis zum Pokalsieg, und uclFinishRun würde auf showUclTrophyCutscene warten, das
    // im echten Spiel erst durch einen Klick auf "Weiter" auflöst - in diesem headless Test kommt dieser
    // Klick nie, also hinge page.evaluate hier ohne diesen Stub etwa jeden zweiten Lauf für immer (genau
    // das reproduzierte "Target page ... has been closed"-Timeout-Verhalten). Stub löst sofort auf, exakt
    // wie renderUclPanel oben schon gestubbt ist, und lässt den eigentlichen Testfokus (den Decider-Toast
    // selbst) unangetastet, unabhängig davon, wer den Münzwurf gewinnt.
    showUclTrophyCutscene = async () => {};

    let callNum = 0;
    // Genau das gemeldete Szenario: Hinspiel 1:0 (Sieg), Rückspiel 1:2 (Niederlage) -> Aggregat 2:2,
    // gefolgt vom dritten, echten Entscheidungsspiel (Verlängerung + Elfmeterschießen), das der Spieler
    // für sich entscheidet - alle drei Aufrufe laufen über dieselbe uclPlayLegCore-Funktion, beweist also,
    // dass die Entscheidung kein stiller uclMatchResultClubs()-Münzwurf mehr ist, sondern ein echtes
    // drittes Match.
    const legOppClubArgs = [];
    const scores = [
      { myGoals: 1, oppGoals: 0, winnerSide: 'me' },
      { myGoals: 1, oppGoals: 2, winnerSide: 'opp' },
      { myGoals: 2, oppGoals: 1, winnerSide: 'me', wentToET: true, wentToPK: true },
    ];
    uclPlayLegCore = async (oppClub) => { legOppClubArgs.push(oppClub); return scores[callNum++]; };

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
      legOppClubArgs,
      winnerClub: m.winnerClub,
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
  // Kernpunkt des Bugfixes: die Entscheidung ist ein DRITTER echter Aufruf von uclPlayLegCore (also ein
  // live spielbares Match mit Verlängerung/Elfmeterschießen), nicht ein stiller uclMatchResultClubs()-Wurf.
  eq(result.uclPlayLegCoreCallCount, 3, 'uclPlayLegCore wird für die Entscheidung ein drittes Mal aufgerufen (echtes Entscheidungsspiel statt stillem Würfeln)');
  eq(result.legOppClubArgs[2], 'OppClub', 'das Entscheidungsspiel läuft gegen denselben Gegner-Klub wie Hin-/Rückspiel');
  ok(!!result.decider, 'das Ergebnis des Entscheidungsspiels wird im Match gespeichert');
  eq(result.decider.winnerSide, 'me', 'der Sieger des Entscheidungsspiels wird korrekt übernommen');
  eq(result.decider.wentToPK, true, 'ein n.E.-Entscheidungsspiel wird als solches gespeichert (für die Anzeige "n.E.")');
  eq(result.winnerClub, 'MyClub', 'der tatsächliche Sieger des Entscheidungsspiels gewinnt die Paarung, nicht automatisch der Gegner');
  const resultToast = result.toasts.find(t => t.includes('Entscheidungsspiel') && t.includes('Sieg'));
  ok(!!resultToast, `ein Toast zeigt das Ergebnis des Entscheidungsspiels selbst (Toasts: ${JSON.stringify(result.toasts)})`);

  summary('UCL-Decider-Toast-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
