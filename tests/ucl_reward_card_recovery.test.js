// Regressionstest: "ein paar UEL und UCL Karten von Spielern verschwunden" - Champions-/Europa-League-
// Sieger-Karten (uclRewardCardsForClub) werden nur dann in BY_ID registriert, wenn genau dieser Klub in
// DIESER Browser-Session schon einmal per echtem Finalsieg gebaut wurde - UCL_REWARD_CACHE ist ein
// reiner In-Memory-Cache, der bei jedem Page-Load wieder komplett leer ist. Ein Spieler, der so eine
// Karte in seiner Sammlung hat, aber in einer NEUEN Session (Reload, anderes Gerät) noch nicht selbst
// gegen genau diesen Klub gewonnen hat, bekam bisher BY_ID.get(cardId)===undefined zurück - die Karte
// "verschwand" aus Sammlung/Kader/Handel. ensureOwnedUclRewardCardsRegistered() muss das beim Boot
// (init()) heilen, exakt wie es für WM26-Variante/Kapitän und die Breakout-Specials bereits passiert.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    // Simuliert exakt den gemeldeten Zustand: eine neue Session (frischer, leerer UCL_REWARD_CACHE -
    // wie beim echten Page-Load), die eine UCL-Sieger-Karte eines Klubs besitzt, den diese Session
    // selbst noch nie gebaut hat.
    UCL_REWARD_CACHE.clear();
    const club = UCL_ALL_CLUBS[0];
    const tops = uclTopPlayersForClub(club, 1);
    const idOffset = 71000000;
    const ownedCardId = idOffset + tops[0].id;

    collection = [{ uid: 'u-ucl-reward', cardId: ownedCardId, xp: 0, obtainedAt: 1 }];

    const resolvableBeforeFix = BY_ID.has(ownedCardId);
    ensureOwnedUclRewardCardsRegistered();
    const resolvableAfterFix = BY_ID.has(ownedCardId);
    const cardAfterFix = leveledOwnedCard(collection[0]);

    // Idempotent + günstig: ein zweiter Aufruf (z.B. jeder weitere Page-Load) darf nichts kaputt machen
    // und muss weiterhin sofort auflösbar bleiben.
    ensureOwnedUclRewardCardsRegistered();
    const resolvableAfterSecondCall = BY_ID.has(ownedCardId);

    // Ein Spieler OHNE jede unbekannte Karte darf keinen unnötigen Full-Rebuild auslösen (reine
    // Kosten-Absicherung, kein Verhaltensunterschied nach außen).
    UCL_REWARD_CACHE.clear();
    collection = [{ uid: 'u-normal', cardId: tops[0].id, xp: 0, obtainedAt: 1 }]; // ein ganz normaler Basiskarten-Besitz
    const cacheSizeBefore = UCL_REWARD_CACHE.size;
    ensureOwnedUclRewardCardsRegistered();
    const cacheSizeAfterNoop = UCL_REWARD_CACHE.size;

    return { resolvableBeforeFix, resolvableAfterFix, cardAfterFix: !!cardAfterFix, resolvableAfterSecondCall, cacheSizeBefore, cacheSizeAfterNoop };
  }));

  console.log('UCL/UEL-Sieger-Karten-Wiederherstellungs-Test');
  noErrors(errors, 'Seite');
  eq(result.resolvableBeforeFix, false, 'reproduziert den gemeldeten Bug: eine besessene Sieger-Karte ist in einer frischen Session zunächst NICHT auflösbar');
  eq(result.resolvableAfterFix, true, 'ensureOwnedUclRewardCardsRegistered() macht die besessene Karte wieder auflösbar');
  eq(result.cardAfterFix, true, 'leveledOwnedCard() liefert nach dem Fix wieder eine echte Karte statt null');
  eq(result.resolvableAfterSecondCall, true, 'ein zweiter Aufruf (z.B. jeder weitere Page-Load) bleibt idempotent auflösbar');
  eq(result.cacheSizeBefore, result.cacheSizeAfterNoop, 'besitzt ein Spieler keine unbekannte Karte, löst der Check keinen unnötigen Full-Rebuild aus');

  summary('UCL/UEL-Sieger-Karten-Wiederherstellungs-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
