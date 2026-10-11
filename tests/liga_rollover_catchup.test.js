// Regressionstest: dieselbe Fehlerklasse wie beim Wochenendpokal (siehe wep_catchup.test.js), diesmal
// bei der Liga-Aufstiegsrunde (resolveWeeklyRolloverV2IfNeeded). Das 4-stufige Bracket (Halbfinale-Hin-
// /Rückspiel, Finale-Hin-/Rückspiel) lief bisher NUR an einem echten Samstag und brach an jedem anderen
// Wochentag sofort komplett ab ("only Samstag") - war während der genauen Stunden-Fenster (12/13/15/16
// Uhr) niemand online, blieb die betroffene Liga für IMMER auf der letzten erreichten Stufe hängen und
// lief mit der alten Mitgliederliste weiter, ohne dass Auf-/Abstieg je stattfand (komplett unsichtbar,
// kein Fehler). Ein Aufruf an einem Nicht-Samstag muss jetzt die Vorwoche nachholen und dabei alle
// Stunden-Gates überspringen (der Tag ist ja schon vorbei).
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const originalBerlinNow = berlinNow;
    const originalSemi1 = ligaPromoSemiLeg1, originalSemi2 = ligaPromoSemiLeg2;
    const originalFinal1 = ligaPromoFinalLeg1, originalFinalize = ligaPromoFinalize;

    // Ein ECHTER, in sich konsistenter Montag NACH LIGA_RULES_V2_WEEK_START (2026-08-31 ist laut dessen
    // eigenem Kommentar selbst ein Montag - eine Woche später, 2026-09-07, ist es also auch einer).
    const fixedMonday = new Date(2026, 8, 7, 10, 0, 0, 0);
    berlinNow = () => fixedMonday;
    const mondayWeekStart = mostRecentMondayBerlin();
    const lastWeekStart = mondayWeekStart - 7 * DAY_MS;

    const store = {}; // Firestore-Doc-Simulation: path -> data
    fb = {
      doc: (db, col, id) => ({ path: col + '/' + id }),
      getDoc: async (ref) => { const data = store[ref.path]; return { exists: () => !!data, data: () => data }; },
    };

    const calls = [];
    ligaPromoSemiLeg1 = async (weekStart, ref) => { calls.push({ stage: 'semiLeg1', weekStart }); store[ref.path] = { status: 'done' }; return { stage: 'semiLeg1' }; };
    ligaPromoSemiLeg2 = async (weekStart, leg1Data, ref) => { calls.push({ stage: 'semiLeg2', weekStart }); store[ref.path] = { status: 'done' }; return { stage: 'semiLeg2' }; };
    ligaPromoFinalLeg1 = async (weekStart, s1, s2, ref) => { calls.push({ stage: 'finalLeg1', weekStart }); store[ref.path] = { status: 'done' }; return { stage: 'finalLeg1' }; };
    ligaPromoFinalize = async (weekStart, s1, f1, ref) => { calls.push({ stage: 'finalize', weekStart }); store[ref.path] = { status: 'done' }; return { stage: 'finalize' }; };

    // Vorwoche ist bei Stufe 1 (Halbfinale-Hinspiel) stehengeblieben - keine der drei folgenden Stufen
    // wurde je erreicht. Genau der gemeldete Zustand ("Liga läuft mit alter Mitgliederliste weiter").
    store['leagueMeta/promoSemiLeg1_' + lastWeekStart] = { status: 'done' };

    // Ein einzelner Aufruf darf das Bracket nur um EINE Stufe voranbringen (semiLeg2) - erst der
    // wiederholte Aufruf (siehe die renderLigenPanel-Schleife) bringt es ganz durch.
    const resultSingleCall = await resolveWeeklyRolloverIfNeeded();
    const stagesAfterSingleCall = calls.map(c => c.stage);

    for (let i = 0; i < 5; i++) { if (!(await resolveWeeklyRolloverIfNeeded())) break; }
    const stagesAfterLoop = calls.map(c => c.stage);
    const allWeekStartsCorrect = calls.every(c => c.weekStart === lastWeekStart);

    // Kontrollfall: ein ECHTER Samstag vor 12:00 darf weiterhin nichts starten - die normale
    // Stunden-Gate-Logik für den gewöhnlichen Samstagsablauf darf nicht kaputtgehen.
    calls.length = 0;
    const fixedSaturdayEarly = new Date(2026, 8, 5, 9, 0, 0, 0); // 2026-09-05 ist der Samstag vor obigem Montag
    berlinNow = () => fixedSaturdayEarly;
    const store2 = {};
    fb.getDoc = async (ref) => { const data = store2[ref.path]; return { exists: () => !!data, data: () => data }; };
    const resultSaturdayEarly = await resolveWeeklyRolloverIfNeeded();
    const stagesOnSaturdayEarly = calls.map(c => c.stage);

    // Sonntag-Fall (der gemeldete Fehler): am Sonntag nach einem Samstag, an dem niemand online war, muss die
    // Woche nachgeholt werden, zu der dieser Sonntag GEHÖRT (Montag davor), NICHT die Vorwoche. Alle
    // Stunden-Gates entfallen (der Samstag ist vorbei).
    calls.length = 0;
    const fixedSunday = new Date(2026, 8, 13, 10, 0, 0, 0); // Sonntag der Woche, die am Montag 2026-09-07 begann
    berlinNow = () => fixedSunday;
    const sundayWeekStart = mostRecentMondayBerlin();
    const sundayIsMonday0907 = sundayWeekStart === new Date(2026, 8, 7, 0, 0, 0, 0).getTime();
    const store3 = {};
    fb.getDoc = async (ref) => { const data = store3[ref.path]; return { exists: () => !!data, data: () => data }; };
    ligaPromoSemiLeg1 = async (weekStart, ref) => { calls.push({ stage: 'semiLeg1', weekStart }); store3[ref.path] = { status: 'done' }; return { stage: 'semiLeg1' }; };
    ligaPromoSemiLeg2 = async (weekStart, l1, ref) => { calls.push({ stage: 'semiLeg2', weekStart }); store3[ref.path] = { status: 'done' }; return { stage: 'semiLeg2' }; };
    ligaPromoFinalLeg1 = async (weekStart, s1, s2, ref) => { calls.push({ stage: 'finalLeg1', weekStart }); store3[ref.path] = { status: 'done' }; return { stage: 'finalLeg1' }; };
    ligaPromoFinalize = async (weekStart, s1, f1, ref) => { calls.push({ stage: 'finalize', weekStart }); store3[ref.path] = { status: 'done' }; return { stage: 'finalize' }; };
    for (let i = 0; i < 6; i++) { if (!(await resolveWeeklyRolloverIfNeeded())) break; }
    const sundayStages = calls.map(c => c.stage);
    const sundayTargetsWeekOfThatSunday = calls.length > 0 && calls.every(c => c.weekStart === sundayWeekStart);

    // Hintergrund-Nachholen beim Spielstart: läuft genau einmal pro Sitzung, auch ohne Ligen-Tab
    calls.length = 0;
    Object.keys(store3).forEach(k => delete store3[k]);
    profile = { userId: 'x' }; clubId = 'x';
    _ligaBackgroundCatchUpRan = false;
    await ligaBackgroundCatchUp();
    const backgroundRanStages = calls.map(c => c.stage);
    calls.length = 0;
    await ligaBackgroundCatchUp(); // zweiter Aufruf derselben Sitzung: nichts mehr
    const backgroundOnlyOncePerSession = calls.length === 0;

    berlinNow = originalBerlinNow;
    ligaPromoSemiLeg1 = originalSemi1; ligaPromoSemiLeg2 = originalSemi2;
    ligaPromoFinalLeg1 = originalFinal1; ligaPromoFinalize = originalFinalize;

    return { sundayIsMonday0907, sundayStages, sundayTargetsWeekOfThatSunday, backgroundRanStages, backgroundOnlyOncePerSession, lastWeekStart, stagesAfterSingleCall, stagesAfterLoop, allWeekStartsCorrect, resultSaturdayEarly, stagesOnSaturdayEarly };
  }));

  console.log('Liga-Aufstiegsrunde-Nachhol-Test');
  noErrors(errors, 'Seite');
  eq(JSON.stringify(result.stagesAfterSingleCall), JSON.stringify(['semiLeg2']), 'ein einzelner Nachhol-Aufruf bringt das Bracket exakt eine Stufe voran (Halbfinale-Rückspiel)');
  eq(JSON.stringify(result.stagesAfterLoop), JSON.stringify(['semiLeg2', 'finalLeg1', 'finalize']), 'wiederholte Aufrufe (wie in renderLigenPanel) bringen das gesamte hängengebliebene Bracket bis zum Ende durch, ohne auf Stunden-Gates zu warten');
  eq(result.allWeekStartsCorrect, true, 'alle nachgeholten Stufen zielen auf die richtige (vergangene) Woche, nicht auf die neue laufende Woche');
  eq(result.resultSaturdayEarly, null, 'an einem echten Samstag vor 12:00 wird weiterhin nichts gestartet (normales Stunden-Gate bleibt intakt)');
  eq(result.stagesOnSaturdayEarly.length, 0, 'am frühen Samstag läuft keine einzige Stufe an');

  eq(result.sundayIsMonday0907, true, 'Testaufbau: der Sonntag gehört zur Woche, die am Montag 2026-09-07 begann');
  eq(JSON.stringify(result.sundayStages), JSON.stringify(['semiLeg1', 'semiLeg2', 'finalLeg1', 'finalize']), 'am Sonntag wird die komplette, am Samstag verpasste Aufstiegsrunde nachgeholt (alle 4 Stufen, ohne Stunden-Gates)');
  eq(result.sundayTargetsWeekOfThatSunday, true, 'am Sonntag wird die Woche dieses Sonntags nachgeholt, NICHT die Vorwoche (der gemeldete Fehler: Liga-Belohnungen blieben aus)');
  eq(JSON.stringify(result.backgroundRanStages), JSON.stringify(['semiLeg1', 'semiLeg2', 'finalLeg1', 'finalize']), 'das Hintergrund-Nachholen beim Spielstart bringt die Abrechnung auch ohne Ligen-Tab durch');
  eq(result.backgroundOnlyOncePerSession, true, 'das Hintergrund-Nachholen läuft nur einmal pro Sitzung');

  summary('Liga-Aufstiegsrunde-Nachhol-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
