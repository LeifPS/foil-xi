// Regressionstest für den Schnellverkauf (Handel -> Schnellverkauf): nur tradable, nicht gesperrte
// Karten dürfen überhaupt auftauchen, der Preis kommt aus quickSellValue() (60% von getBaselineRAP,
// bewusst UNBEEINFLUSST von echten Marktdaten - siehe dortigen Kommentar) statt aus computeRAP(), und
// ein Verkauf muss die Karte(n) aus der Sammlung entfernen und die Coins sofort gutschreiben.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    document.body.appendChild(document.createElement('div')); // no-op, keeps eval body non-trivial
    profile = { userId: 'test', displayName: 'Test FC', coins: 200000, achievementStats: {} };
    clubId = 'test';
    const tradableBase = ALL_BASE.find(c => !c.untradable && c.ov > 0);
    const untradableId = tradableBase.id + 900000;
    BY_ID.set(untradableId, { ...tradableBase, id: untradableId, untradable: true });
    const squadBase = ALL_BASE.find(c => c.id !== tradableBase.id && !c.untradable);
    collection = [
      { uid: 'u-tradable', cardId: tradableBase.id, xp: 0, obtainedAt: 1 },
      { uid: 'u-untradable', cardId: untradableId, xp: 0, obtainedAt: 1 },
      { uid: 'u-insquad', cardId: squadBase.id, xp: 0, obtainedAt: 1 },
    ];
    managerCollection = []; packCollection = [];
    squad = { formation: '433', slots: { gk: 'u-insquad' }, managerUid: null, tactics: { ...DEFAULT_TACTICS } };
    fb = null; // local-only fallback for getLockedUids/sSet - no real backend needed for this test

    // quickSellValue muss unabhängig von computeRAP()/echten Verkaufsdaten sein (Manipulationsschutz)
    const leveled = leveledOwnedCard(collection[0]);
    const expectedValue = Math.max(1, Math.round(getBaselineRAP(leveled) * QUICK_SELL_RAP_PCT));
    const actualValue = quickSellValue(leveled);

    tradeSubTab = 'quicksell';
    renderTrade(document.getElementById('view'));
    await new Promise(r => setTimeout(r, 300));

    const gridCardCount = document.querySelectorAll('#qs-pick-grid .club-card-wrap').length;
    const wraps = Array.from(document.querySelectorAll('#qs-pick-grid .club-card-wrap'));
    if (wraps.length) wraps[0].click();
    const submitBtn = document.getElementById('qs-submit');
    const submitEnabledAfterClick = submitBtn ? !submitBtn.disabled : false;
    const coinsBefore = profile.coins;
    const collectionLenBefore = collection.length;
    if (submitBtn && !submitBtn.disabled) submitBtn.click();
    await new Promise(r => setTimeout(r, 200));
    const confirmModalShown = !!document.getElementById('qs-confirm-yes');
    document.getElementById('qs-confirm-yes')?.click();
    await new Promise(r => setTimeout(r, 300));

    return {
      expectedValue, actualValue,
      gridCardCount, submitEnabledAfterClick, confirmModalShown,
      coinsGained: profile.coins - coinsBefore,
      collectionLenBefore, collectionLenAfter: collection.length,
      stillHasUntradable: collection.some(c => c.uid === 'u-untradable'),
      stillHasInSquad: collection.some(c => c.uid === 'u-insquad'),
      stillHasTradable: collection.some(c => c.uid === 'u-tradable'),
    };
  }));

  console.log('Schnellverkauf-Test');
  noErrors(errors, 'Seite');
  eq(result.actualValue, result.expectedValue, 'quickSellValue basiert auf getBaselineRAP (nicht auf computeRAP/echten Marktdaten)');
  eq(result.gridCardCount, 1, 'nur die eine tradable, nicht gesperrte Karte erscheint in der Auswahl');
  eq(result.submitEnabledAfterClick, true, 'Verkaufs-Button aktiviert sich nach Auswahl');
  eq(result.confirmModalShown, true, 'Bestätigungs-Modal erscheint vor dem endgültigen Verkauf');
  eq(result.collectionLenAfter, result.collectionLenBefore - 1, 'genau eine Karte wird aus der Sammlung entfernt');
  eq(result.coinsGained, result.expectedValue, 'Coins-Gutschrift entspricht exakt dem Schnellverkaufswert');
  eq(result.stillHasUntradable, true, 'untradable Karte bleibt unangetastet (tauchte nie zur Auswahl auf)');
  eq(result.stillHasInSquad, true, 'im Kader stehende Karte bleibt unangetastet (gesperrt)');
  eq(result.stillHasTradable, false, 'die verkaufte tradable Karte ist wirklich weg');

  summary('Schnellverkauf-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
