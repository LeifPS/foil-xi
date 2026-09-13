// Regressionstest: der Gratis-UCL-Startplatz (Belohnung für einen UEL-Sieg, profile.uclFreeEntryAvailable)
// darf NICHT gegen das normale 3/Tag-Tageslimit zählen - sonst wäre der Bonus oft wertlos, wenn man an
// dem Tag schon 3x UCL gespielt hat. Macht theoretisch bis zu 6 UCL-Starts an einem Tag möglich (3
// gewöhnliche + beliebig viele gratis, je nachdem wie oft an dem Tag UEL gewonnen wurde).
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId: 'test', displayName: 'Test FC', coins: 1000000, achievementStats: {}, uclFreeEntryAvailable: false };
    clubId = 'test'; collection = []; managerCollection = []; packCollection = [];
    squad = { formation: '433', slots: {}, managerUid: null, tactics: { ...DEFAULT_TACTICS } };
    fb = null; sSet = async () => {};
    inMatch = false; queueActive = false; pendingDuelId = null;
    squadRating = () => ({ rating: 80, filled: 11 });
    uclCurrentRun = () => null;
    renderUclPanel = () => {};
    const toasts = []; toast = (m) => toasts.push(m);

    for (let i = 0; i < 3; i++) { await startUcl('ucl'); profile.ucl = null; }
    const usedAfter3 = uclStartsUsedToday('ucl');

    toasts.length = 0;
    await startUcl('ucl'); // 4th normal attempt - should be blocked
    const blockedToast = toasts[toasts.length - 1];
    const gotRunOn4th = !!profile.ucl;
    profile.ucl = null;

    profile.uclFreeEntryAvailable = true;
    const coinsBefore = profile.coins;
    await startUcl('ucl'); // free entry #1 - should work despite limit already hit
    const freeWorked = !!profile.ucl;
    const usedAfterFree = uclStartsUsedToday('ucl');
    const coinsAfter = profile.coins;
    profile.ucl = null;

    profile.uclFreeEntryAvailable = true;
    await startUcl('ucl'); // free entry #2 same day - also should work
    const secondFreeWorked = !!profile.ucl;
    const usedAfterSecondFree = uclStartsUsedToday('ucl');

    return {
      usedAfter3, blockedToast, gotRunOn4th,
      freeWorked, usedAfterFree, coinsUnchangedOnFree: coinsBefore === coinsAfter,
      secondFreeWorked, usedAfterSecondFree,
    };
  }));

  console.log('UCL-Gratis-Eintritt-Test');
  noErrors(errors, 'Seite');
  eq(result.usedAfter3, 3, 'normales Tageslimit nach 3 bezahlten Starts erreicht');
  ok(result.blockedToast.includes('Tageslimit erreicht'), '4. bezahlter Versuch wird blockiert');
  eq(result.gotRunOn4th, false, '4. bezahlter Versuch erzeugt keinen Lauf');
  eq(result.freeWorked, true, 'Gratis-Eintritt funktioniert trotz bereits erreichtem Tageslimit');
  eq(result.usedAfterFree, 3, 'Gratis-Eintritt erhöht den Tageszähler NICHT (bleibt bei 3)');
  eq(result.coinsUnchangedOnFree, true, 'Gratis-Eintritt kostet keine Coins');
  eq(result.secondFreeWorked, true, 'ein zweiter Gratis-Eintritt am selben Tag funktioniert ebenfalls');
  eq(result.usedAfterSecondFree, 3, 'auch der zweite Gratis-Eintritt zählt nicht gegen das Limit');

  summary('UCL-Gratis-Eintritt-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
