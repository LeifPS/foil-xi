// Regressionstest: "Warum wurde das Finale des Wochenendpokal nie gespielt?" - resolveWochenendpokalIfNeeded
// brach an jedem Nicht-Sonntag bisher SOFORT und vollständig ab. War an einem Sonntag zwischen 17:00 und
// 18:00 (oder überhaupt nach 18:00) niemand online, blieb die Woche für IMMER auf "Finale-Hinspiel
// fertig, Rückspiel nie gestartet" hängen, weil die nächste Woche ab Montag automatisch eine ANDERE
// Kalenderwoche adressierte. Jetzt muss ein Aufruf an einem Nicht-Sonntag die Vorwoche nachholen.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const originalBerlinNow = berlinNow;
    const originalWepRunFinal2 = wepRunFinal2;

    // Ein ECHTER, in sich konsistenter Montag NACH LIGA_SEASON_EPOCH (2026-08-24 ist laut dessen eigenem
    // Kommentar selbst ein Montag - eine Woche später, 2026-08-31, ist es also auch einer) - wichtig:
    // sowohl das Kalenderdatum als auch getDay() müssen zusammenpassen, sonst rechnet
    // mostRecentMondayBerlin() (das intern getDay() UND getFullYear/Month/Date kombiniert) ein falsches,
    // in sich widersprüchliches Ergebnis aus. Muss zusätzlich >= LIGA_SEASON_EPOCH liegen, sonst bricht
    // resolveWochenendpokalIfNeeded schon vorher wegen "Saison noch nicht gestartet" ab.
    const fixedMonday = new Date(2026, 7, 31, 9, 0, 0, 0);
    berlinNow = () => fixedMonday;
    const mondayWeekStart = mostRecentMondayBerlin(); // = fixedMonday selbst (Montag 00:00)
    const lastWeekStart = mondayWeekStart - 7 * DAY_MS;

    fb = { doc: (db, col, id) => ({ path: col + '/' + id }) };
    let final2Called = null;
    wepRunFinal2 = async (f1Data, ref, weekStart) => { final2Called = { weekStart }; return { stage: 'final2-mock' }; };

    // Finale-Hinspiel der VORWOCHE ist fertig, Finale-Rückspiel existiert noch gar nicht - genau der
    // gemeldete Zustand ("Finale wurde nie gespielt").
    const store = {
      ['leagueMeta/wepSwiss1_' + lastWeekStart]: { status: 'done' },
      ['leagueMeta/wepSwiss2_' + lastWeekStart]: { status: 'done' },
      ['leagueMeta/wepSwiss3_' + lastWeekStart]: { status: 'done' },
      ['leagueMeta/wepSemi1_' + lastWeekStart]: { status: 'done' },
      ['leagueMeta/wepSemi2_' + lastWeekStart]: { status: 'done' },
      ['leagueMeta/wepFinal1_' + lastWeekStart]: { status: 'done' },
    };
    fb.getDoc = async (ref) => { const data = store[ref.path]; return { exists: () => !!data, data: () => data }; };

    const resultMonday = await resolveWochenendpokalIfNeeded();
    const monWeekStart = wepTargetWeekStart(false);
    const final2CalledOnMonday = final2Called; // vor dem Reset unten sichern

    // Kontrollfall: ein ECHTER Sonntag VOR 10:00 darf weiterhin nichts starten - die normale
    // Uhrzeit-Gate-Logik für den gewöhnlichen Sonntagsablauf darf nicht kaputtgehen.
    const fixedSundayEarly = new Date(2026, 7, 30, 5, 0, 0, 0); // 2026-08-30 ist der Sonntag direkt vor dem obigen Montag
    berlinNow = () => fixedSundayEarly;
    final2Called = null;
    fb.getDoc = async () => ({ exists: () => false, data: () => null });
    const resultSundayEarly = await resolveWochenendpokalIfNeeded();

    berlinNow = originalBerlinNow;
    wepRunFinal2 = originalWepRunFinal2;

    return { lastWeekStart, monWeekStart, final2CalledOnMonday, resultMonday, resultSundayEarly };
  }));

  console.log('Wochenendpokal-Nachhol-Test');
  noErrors(errors, 'Seite');
  eq(result.monWeekStart, result.lastWeekStart, 'wepTargetWeekStart(false) zielt an einem Nicht-Sonntag auf die VORWOCHE');
  ok(!!result.final2CalledOnMonday, `an einem Montag mit fertigem Finale-Hinspiel wird das Finale-Rückspiel für die Vorwoche nachgeholt (war: ${JSON.stringify(result.final2CalledOnMonday)})`);
  eq(result.final2CalledOnMonday && result.final2CalledOnMonday.weekStart, result.lastWeekStart, 'das nachgeholte Finale-Rückspiel zielt auf die richtige (vergangene) Woche');
  eq(result.resultSundayEarly, null, 'an einem echten Sonntag vor 10:00 wird weiterhin nichts gestartet (normales Uhrzeit-Gate bleibt intakt)');

  summary('Wochenendpokal-Nachhol-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
