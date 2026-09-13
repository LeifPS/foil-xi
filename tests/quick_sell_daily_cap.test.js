// Regressionstest für das 50.000-Coins-Tageslimit auf den Gesamterlös aus Schnellverkauf (nicht die
// Kartenanzahl): ein Verkauf, der das Limit überschreiten würde, muss komplett blockiert werden (keine
// Karte weg, keine Coins gutgeschrieben) statt teilweise auszuführen, und das Limit muss sich täglich
// zurücksetzen.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId: 'test', displayName: 'Test FC', coins: 0, achievementStats: {} };
    clubId = 'test'; collection = []; managerCollection = []; packCollection = [];
    squad = { formation: '433', slots: {}, managerUid: null, tactics: { ...DEFAULT_TACTICS } };
    fb = null;
    let toastMsg = null; toast = (m) => { toastMsg = m; };
    renderTrade = () => {}; invalidateReadCache = () => {};

    await executeQuickSell([{ uid: 'a', value: 40000 }]); // unter dem Limit -> erlaubt
    const afterFirst = { coins: profile.coins, earnedToday: quickSellEarnedToday() };

    toastMsg = null;
    const coinsBeforeSecond = profile.coins;
    await executeQuickSell([{ uid: 'b', value: 20000 }]); // 40k+20k=60k > 50k -> komplett blockiert
    const afterSecond = { coinsUnchanged: profile.coins === coinsBeforeSecond, toastMsg, earnedToday: quickSellEarnedToday() };

    toastMsg = null;
    await executeQuickSell([{ uid: 'c', value: 10000 }]); // genau der Rest -> erlaubt, trifft das Limit exakt
    const afterThird = { coins: profile.coins, earnedToday: quickSellEarnedToday(), toastMsg };

    profile.quickSellDate = localDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000)); // simuliert einen neuen Tag
    const earnedAfterNewDay = quickSellEarnedToday();

    return { afterFirst, afterSecond, afterThird, earnedAfterNewDay };
  }));

  console.log('Schnellverkauf-Tageslimit-Test');
  noErrors(errors, 'Seite');
  eq(result.afterFirst.coins, 40000, '40.000 Coins unter dem 50.000-Limit werden normal gutgeschrieben');
  eq(result.afterFirst.earnedToday, 40000, 'Tageserlös-Zähler steht danach korrekt bei 40.000');
  eq(result.afterSecond.coinsUnchanged, true, 'ein Verkauf, der das Limit überschreiten würde, wird komplett blockiert (keine Coins)');
  ok(result.afterSecond.toastMsg && result.afterSecond.toastMsg.includes('Tageslimit erreicht'), 'Toast erklärt das Tageslimit');
  eq(result.afterSecond.earnedToday, 40000, 'Tageserlös-Zähler bleibt nach dem blockierten Versuch unverändert');
  eq(result.afterThird.coins, 50000, 'der exakt passende Rest-Betrag wird noch akzeptiert');
  eq(result.afterThird.earnedToday, 50000, 'Tageserlös-Zähler trifft das Limit exakt');
  eq(result.earnedAfterNewDay, 0, 'an einem neuen Tag setzt sich der Zähler zurück');

  summary('Schnellverkauf-Tageslimit-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
