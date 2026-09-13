// Regressionstest für das gestaffelte WM26-Startgeld (wm26EntryFeeForRating/wm26CurrentEntryFee):
// Rating 120+ zahlt vollen Preis (10.000), darunter in 2.000er-Schritten weniger, unter 100 Rating ist
// der erste Start des Tages gratis und jeder weitere am selben Tag kostet den niedrigsten bezahlten
// Tarif (2.000) statt entweder gesperrt oder dauerhaft gratis zu sein.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(() => {
    // Tarifstufen unabhängig vom Tagesdatum/Gratis-Logik
    const tiers = [125, 120, 119, 115, 114, 110, 109, 105, 104, 100, 99].map(rating => ({
      rating, fee: wm26EntryFeeForRating(rating),
    }));

    // wm26CurrentEntryFee braucht ein globales `profile` mit wm26FreeStartDate.
    profile = { wm26FreeStartDate: null };
    const freshBelow100 = wm26CurrentEntryFee(85); // noch nie gratis gestartet -> gratis
    profile.wm26FreeStartDate = localDateStr(new Date());
    const usedTodayBelow100 = wm26CurrentEntryFee(85); // heute schon genutzt -> 2.000
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    profile.wm26FreeStartDate = localDateStr(yesterday);
    const usedYesterdayBelow100 = wm26CurrentEntryFee(85); // neuer Tag -> wieder gratis
    profile.wm26FreeStartDate = localDateStr(new Date());
    const usedTodayAt120 = wm26CurrentEntryFee(125); // Gratis-Regel gilt nur unter 100, hier voller Preis

    return { tiers, freshBelow100, usedTodayBelow100, usedYesterdayBelow100, usedTodayAt120 };
  }));

  console.log('WM26-Startgeld-Test');
  noErrors(errors, 'Seite');

  const expected = { 125: 10000, 120: 10000, 119: 8000, 115: 8000, 114: 6000, 110: 6000, 109: 4000, 105: 4000, 104: 2000, 100: 2000, 99: 0 };
  result.tiers.forEach(({ rating, fee }) => {
    eq(fee, expected[rating], `Rating ${rating} -> ${expected[rating]} Coins`);
  });

  eq(result.freshBelow100, 0, 'Rating <100, noch keine Gratis-WM heute genutzt -> kostenlos');
  eq(result.usedTodayBelow100, 2000, 'Rating <100, Gratis-WM heute schon genutzt -> 2.000 Coins (niedrigster bezahlter Tarif)');
  eq(result.usedYesterdayBelow100, 0, 'Rating <100, letzte Gratis-WM war gestern -> heute wieder kostenlos');
  eq(result.usedTodayAt120, 10000, 'Rating 120+ ignoriert die Gratis-Regel komplett -> voller Preis');

  summary('WM26-Startgeld-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
