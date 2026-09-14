// Regressionstest für EVO-Karten: Basis-99er, die über echte Spielziele (Siege/Tore/Vorlagen mit der
// Karte im Kader) freigespielt und danach mit Coins gekauft werden. Deckt ab: einmalige Gratis-
// Grundausstattung (idempotent), Fortschritts-Tracking über awardCardXP/computeMatchRatings, die
// "erst freispielen, dann kaufen"-Reihenfolge (keine Stufe überspringen, kein Kauf ohne erfülltes
// Ziel), und dass ein Kauf tatsächlich Coins abzieht und den OVR-Boost auf die eigene Karte anwendet.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId: 'test', displayName: 'Test FC', coins: 100000, achievementStats: {} };
    clubId = 'test'; collection = []; managerCollection = []; packCollection = [];
    squad = { formation: '433', slots: {}, managerUid: null, tactics: { ...DEFAULT_TACTICS } };
    fb = null;

    // 1) Startpaket: einmal pro EVO_DEFS-Eintrag, und ein zweiter Aufruf darf NICHT verdoppeln.
    await grantEvoStarterIfNeeded();
    const afterFirstGrant = collection.length;
    await grantEvoStarterIfNeeded();
    const afterSecondGrant = collection.length;
    const evoEntry = collection.find(c => c.cardId === EVO_ID_BASE + EVO_DEFS[0].id);
    const def = EVO_DEFS[0];

    const baseCardBeforeAnyStage = leveledOwnedCard(evoEntry);
    const ovBeforeAnyStage = baseCardBeforeAnyStage.ov;

    // 2) Stufe 0 braucht def.stages[0].objective (Siege) - ein Match OHNE Sieg darf NICHTS freischalten,
    // ein Match MIT Sieg (und der Karte im Kader, also uid gesetzt) zählt.
    await awardCardXP({ ratings: [{ uid: evoEntry.uid, rating: 6.5, goals: 0, assists: 0 }], winnerSide: 'opp' });
    const progressAfterLoss = evoProgressValue(evoEntry, 'wins');
    for (let i = 0; i < def.stages[0].objective.target; i++) {
      await awardCardXP({ ratings: [{ uid: evoEntry.uid, rating: 6.5, goals: 0, assists: 0 }], winnerSide: 'me' });
    }
    const progressAfterWins = evoProgressValue(evoEntry, 'wins');
    const stage0Unlocked = evoStageUnlocked(evoEntry, def, 0);
    const stage1UnlockedTooEarly = evoStageUnlocked(evoEntry, def, 1); // Reihenfolge: Stufe 1 erst NACH Stufe 0

    // 3) Kauf: zu wenig Coins -> blockiert; genug Coins -> Coins weg, evoStage steigt, OVR steigt.
    const cost = def.stages[0].cost;
    profile.coins = cost - 1;
    await buyEvoStage(evoEntry.uid, 0);
    const stageAfterTooFewCoins = evoEntry.evoStage || 0;

    profile.coins = cost + 500;
    const coinsBeforeBuy = profile.coins;
    await buyEvoStage(evoEntry.uid, 0);
    const stageAfterBuy = evoEntry.evoStage || 0;
    const coinsSpent = coinsBeforeBuy - profile.coins;
    const ovAfterStage0 = leveledOwnedCard(evoEntry).ov;

    // 4) Stufe 1 überspringen (kaufen, obwohl Stufe 0 gerade erst gekauft und Stufe-1-Ziel nicht erfüllt)
    const coinsBeforeSkipAttempt = profile.coins;
    await buyEvoStage(evoEntry.uid, 1); // Ziel (Tore) noch nicht erfüllt -> muss blockiert bleiben
    const stageAfterSkipAttempt = evoEntry.evoStage || 0;
    const coinsUnchangedAfterSkipAttempt = profile.coins === coinsBeforeSkipAttempt;

    return {
      afterFirstGrant, afterSecondGrant,
      ovBeforeAnyStage, ovAfterStage0, ovBoost0: def.stages[0].ovBoost,
      progressAfterLoss, progressAfterWins, stage0Unlocked, stage1UnlockedTooEarly,
      stageAfterTooFewCoins, stageAfterBuy, coinsSpent, cost,
      stageAfterSkipAttempt, coinsUnchangedAfterSkipAttempt,
    };
  }));

  console.log('EVO-Karten-Test');
  noErrors(errors, 'Seite');
  eq(result.afterFirstGrant, 2, 'Startpaket vergibt genau eine Karte pro EVO_DEFS-Eintrag (2 Karten)');
  eq(result.afterSecondGrant, result.afterFirstGrant, 'ein zweiter Aufruf des Startpakets vergibt nichts doppelt');
  eq(result.progressAfterLoss, 0, 'eine Niederlage zählt nicht als Sieg-Fortschritt für die EVO-Karte');
  eq(result.progressAfterWins, 5, 'Siege mit der Karte im Kader werden korrekt gezählt (Zielwert erreicht)');
  eq(result.stage0Unlocked, true, 'Stufe 0 ist nach Erreichen des Spielziels freigespielt (aber noch nicht gekauft)');
  eq(result.stage1UnlockedTooEarly, false, 'Stufe 1 gilt nicht als freigespielt, solange Stufe 0 noch nicht gekauft ist (Reihenfolge)');
  eq(result.stageAfterTooFewCoins, 0, 'ein Kauf ohne genug Coins schlägt fehl (Stufe bleibt 0)');
  eq(result.stageAfterBuy, 1, 'der Kauf mit genug Coins nach erfülltem Ziel schaltet Stufe 1 frei');
  eq(result.coinsSpent, result.cost, 'beim Kauf werden exakt die Stufenkosten abgezogen');
  eq(result.ovAfterStage0 - result.ovBeforeAnyStage, result.ovBoost0, 'der OVR-Boost der gekauften Stufe wird auf die eigene Karte angewendet');
  eq(result.stageAfterSkipAttempt, 1, 'eine spätere Stufe kann nicht gekauft werden, solange ihr eigenes Spielziel nicht erfüllt ist');
  eq(result.coinsUnchangedAfterSkipAttempt, true, 'ein blockierter Kaufversuch zieht keine Coins ab');

  summary('EVO-Karten-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
