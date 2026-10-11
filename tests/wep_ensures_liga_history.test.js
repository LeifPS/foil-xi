// Regressionstest: "Wochenpokal ist auch kaputt" - der Wochenendpokal baut sein 8er-Feld aus
// leagueHistory/{Woche}, das erst die Liga-Abrechnung schreibt. Lief diese nie (am Samstag war niemand
// online und der Sonntags-Nachholer zielte auf die falsche Woche), fand der Pokal keine Tabellen und konnte
// nicht starten. Jetzt holt der Pokal die Liga-Abrechnung der Woche bei Bedarf selbst nach, und beides
// läuft zusätzlich beim Spielstart im Hintergrund.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const originalBerlinNow = berlinNow, origRollover = resolveWeeklyRolloverIfNeeded, origSwiss1 = wepRunSwiss1;
    const sunday = new Date(2026, 8, 13, 13, 0, 0, 0); // Sonntag 13:00, Woche ab Montag 2026-09-07
    berlinNow = () => sunday;
    const weekStart = mostRecentMondayBerlin();
    const store = {};
    fb = { doc: (db, col, id) => ({ path: col + '/' + id }), getDoc: async (ref) => { const d = store[ref.path]; return { exists: () => !!d, data: () => d }; } };
    let rolloverCalls = 0, swiss1Calls = 0;
    resolveWeeklyRolloverIfNeeded = async () => { rolloverCalls++; return null; };
    wepRunSwiss1 = async () => { swiss1Calls++; return null; };

    // 1) leagueHistory der Woche fehlt -> Liga-Abrechnung wird zuerst nachgeholt, danach darf der Pokal starten
    await resolveWochenendpokalIfNeeded();
    const rolloverTriggeredWhenHistoryMissing = rolloverCalls >= 1;
    const wepStillAttempted = swiss1Calls === 1;

    // 2) leagueHistory vorhanden -> keine unnötige Liga-Abrechnung
    store['leagueHistory/' + weekStart] = { weekStart, tables: {} };
    rolloverCalls = 0;
    await resolveWochenendpokalIfNeeded();
    const noRolloverWhenHistoryExists = rolloverCalls === 0;

    // 3) Mo-Fr: Pokal-Nachholen zielt auf die Vorwoche, die Liga ebenfalls -> gleiche Woche, wird nachgeholt
    const wednesday = new Date(2026, 8, 16, 10, 0, 0, 0); // Mittwoch darauf
    berlinNow = () => wednesday;
    const prevWeek = mostRecentMondayBerlin() - 7 * 24 * 60 * 60 * 1000;
    delete store['leagueHistory/' + prevWeek];
    rolloverCalls = 0;
    await resolveWochenendpokalIfNeeded();
    const catchupOnWeekday = rolloverCalls >= 1;

    // 4) Samstag: Liga zielt auf die LAUFENDE Woche, der Pokal auf die Vorwoche -> nichts erzwingen
    const saturday = new Date(2026, 8, 19, 15, 0, 0, 0);
    berlinNow = () => saturday;
    const satPrev = mostRecentMondayBerlin() - 7 * 24 * 60 * 60 * 1000;
    delete store['leagueHistory/' + satPrev];
    rolloverCalls = 0;
    await resolveWochenendpokalIfNeeded();
    const nothingForcedOnSaturday = rolloverCalls === 0;

    // 5) Hintergrund-Nachholen beim Start deckt den Pokal mit ab
    berlinNow = () => sunday;
    delete store['leagueHistory/' + weekStart];
    profile = { userId: 'x' }; clubId = 'x'; _ligaBackgroundCatchUpRan = false;
    swiss1Calls = 0;
    await ligaBackgroundCatchUp();
    const backgroundRunsWep = swiss1Calls >= 1;

    berlinNow = originalBerlinNow; resolveWeeklyRolloverIfNeeded = origRollover; wepRunSwiss1 = origSwiss1;
    return { rolloverTriggeredWhenHistoryMissing, wepStillAttempted, noRolloverWhenHistoryExists, catchupOnWeekday, nothingForcedOnSaturday, backgroundRunsWep };
  }));

  console.log('Wochenendpokal-braucht-Liga-Historie-Test');
  noErrors(errors, 'Seite');
  eq(result.rolloverTriggeredWhenHistoryMissing, true, 'fehlt leagueHistory der Woche, wird die Liga-Abrechnung vom Pokal selbst nachgeholt');
  eq(result.wepStillAttempted, true, 'danach wird der Pokal-Start trotzdem versucht');
  eq(result.noRolloverWhenHistoryExists, true, 'ist die Historie da, wird keine unnötige Liga-Abrechnung angestoßen');
  eq(result.catchupOnWeekday, true, 'auch Mo-Fr (Vorwoche) wird die fehlende Liga-Abrechnung nachgeholt');
  eq(result.nothingForcedOnSaturday, true, 'am Samstag (Liga = laufende Woche, Pokal = Vorwoche) wird nichts Falsches erzwungen');
  eq(result.backgroundRunsWep, true, 'das Hintergrund-Nachholen beim Start deckt den Wochenendpokal mit ab');
  summary('Wochenendpokal-braucht-Liga-Historie-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
