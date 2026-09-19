// Regressionstest für: "statt einem Land kann man auch zu 2% Gold bekommen wo man 4x 100+ Karte
// bekommt zum auswählen" - mit DRAFT_GOLD_CHANCE (2%) gibt es statt der normalen Land-Ziehung einen
// Gold-Fund: kein Land, direkt 4 Karten mit 100+ OVR zur Auswahl (mit derselben "mindestens 1 passt auf
// einen offenen Slot"-Garantie).
// Zweite Feedback-Runde: der Gold-Fund darf NICHT als eigenes, plötzlich aufploppendes Ereignis wirken -
// er muss ganz regulär als eine der Kacheln IM Länder-Reel selbst mitlaufen (wie jedes andere Land),
// landet die Walze zufällig darauf, gibt es den Gold-Fund. Kein separates Cutscene-Layout mehr.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId:'test', displayName:'Test FC', coins:1000, crest:{shape:'shield',primary:'#fff',secondary:'#000',letter:'T'}, achievementStats:{} };
    clubId = 'test'; fb = null; sSet = async () => true;

    const def = CHALLENGE_DEFS.find(d=>d.id==='draft');
    openChallengeDetail(def);
    draftStartRoll();
    const state = draftRollState;

    // ---------- (1) draftDrawGoldFour: immer genau 4 Karten, alle 100+ OVR, mindestens 1 passt ----------
    let allGoldRollsValid = true;
    for(let i=0;i<15;i++){
      const cards = draftDrawGoldFour(state.slots, state.usedNames);
      const openLabels = draftOpenSlotLabels(state.slots);
      const allHundredPlus = cards.every(c=>c.ov>=100);
      const atLeastOneFits = cards.some(c=>draftCardFitsAnyOpenSlot(c, openLabels));
      const exactlyFour = cards.length===4;
      if(!allHundredPlus || !atLeastOneFits || !exactlyFour) allGoldRollsValid = false;
    }

    // ---------- (2) draftRollNationAndCards liefert bei erzwungenem Zufall zuverlässig einen Gold-Fund ----------
    const realMathRandom = Math.random;
    Math.random = () => 0; // < DRAFT_GOLD_CHANCE => garantierter Gold-Fund
    const forcedGoldRoll = draftRollNationAndCards(state.slots, state.usedNames);
    Math.random = realMathRandom;
    const forcedRollIsGold = forcedGoldRoll.isGold === true && forcedGoldRoll.nation === null && forcedGoldRoll.cards.length === 4;
    const forcedRollAllHundredPlus = forcedGoldRoll.cards.every(c=>c.ov>=100);

    // ---------- (3) UI: ein erzwungener Gold-Fund läuft über GENAU dasselbe Länder-Reel, landet nur auf
    // der Gold-Kachel statt einem Land - kein separates Cutscene-Layout, kein eigener Screen-Aufbau.
    Math.random = () => 0;
    draftBeginRoll();
    Math.random = realMathRandom;
    const reelStripPresent = !!document.getElementById('draft-reel-strip');
    const finalTileIsGold = !!document.querySelector('#draft-reel-strip .draft-reel-final.draft-reel-gold');
    // Nach der (kürzeren, ohne echten Reel-Übergang wartenden) Spin-Phase + Aufdeck-Sequenz: alle 4
    // gezeigten Karten sind tatsächlich 100+ (worst case inkl. Legendary-Pause+Slow-Reveal je Karte).
    const deadline = Date.now() + 2200 + 4*2500 + 1500;
    while(draftRollState.rollPhase!=='done' && Date.now()<deadline){ await new Promise(r=>setTimeout(r, 40)); }
    const revealedGoldCardsAllHundredPlus = draftRollState.currentRoll.cards.every(c=>c.ov>=100);
    const noNationShownDuringGoldReveal = !document.querySelector('.draft-roll-flag');

    // ---------- (3b) die Gold-Kachel ist auch unter den ganz normalen, zufällig durchlaufenden
    // Füll-Kacheln des Reels regelmäßig dabei - nicht nur, wenn sie tatsächlich das Ergebnis ist. Das
    // beweist, dass sie "ganz regulär mit im Spin" ist, statt aus dem Nichts aufzutauchen.
    let sawGoldAmongFillerTiles = false;
    for(let i=0;i<20 && !sawGoldAmongFillerTiles; i++){
      const html = draftBuildReelHTML('Germany');
      if(html.includes('draft-reel-gold')) sawGoldAmongFillerTiles = true;
    }

    // ---------- (4) draftUsePlayersOnlyReroll funktioniert auch bei einem Gold-Fund (kein Land zum Behalten) ----------
    draftClearRollTimers(draftRollState);
    draftRollState.currentRoll = { isGold:true, nation:null, cards: draftDrawGoldFour(draftRollState.slots, draftRollState.usedNames) };
    draftRollState.revealedCount = 4; draftRollState.rollPhase = 'done';
    const cardsBeforeGoldPlayersReroll = draftRollState.currentRoll.cards.map(c=>c.id);
    draftUsePlayersOnlyReroll();
    const deadline2 = Date.now() + 4*2500 + 1500;
    while(draftRollState.rollPhase!=='done' && Date.now()<deadline2){ await new Promise(r=>setTimeout(r, 40)); }
    const goldPlayersOnlyRerollWorked = draftRollState.currentRoll.isGold === true
      && draftRollState.currentRoll.cards.every(c=>c.ov>=100)
      && JSON.stringify(draftRollState.currentRoll.cards.map(c=>c.id)) !== JSON.stringify(cardsBeforeGoldPlayersReroll);

    // ---------- (5) "Landen" und "Bekommen" sind IMMER dasselbe: die Walze bremst exakt auf der Kachel
    // ab, die auch tatsächlich ausgezahlt wird - kein Sonderfall, wo Anzeige und echtes Ergebnis
    // auseinanderlaufen könnten. Geprüft in beide Richtungen (Gold- UND Land-Ergebnis).
    draftRestartRoll();
    Math.random = () => 0; // garantierter Gold-Fund
    draftBeginRoll();
    Math.random = realMathRandom;
    await new Promise(r => setTimeout(r, 30)); // requestAnimationFrame + Layout kurz abwarten
    const goldStrip = document.getElementById('draft-reel-strip');
    const goldFinalTile = goldStrip.querySelector('.draft-reel-final');
    const goldTargetX = parseFloat(goldStrip.style.transform.replace(/[^\d.-]/g, ''));
    const goldItemW = goldStrip.children[0].getBoundingClientRect().width;
    const goldFinalIdx = Array.from(goldStrip.children).indexOf(goldFinalTile);
    const goldViewportCenter = document.getElementById('draft-reel-viewport').getBoundingClientRect().width / 2;
    // Die Zielposition der Walze zentriert exakt die Mitte der Ergebnis-Kachel unterm Indikator - das ist
    // dieselbe Formel wie in draftStartReelAnimation, hier unabhängig nachgerechnet.
    const goldAnimationTargetsTheGoldTile = Math.abs(goldTargetX - (goldViewportCenter - (goldFinalIdx*goldItemW + goldItemW/2))) < 0.5
      && goldFinalTile.classList.contains('draft-reel-gold');
    draftClearRollTimers(draftRollState);

    draftRestartRoll();
    Math.random = () => 0.99; // garantiert KEIN Gold-Fund
    draftBeginRoll();
    Math.random = realMathRandom;
    await new Promise(r => setTimeout(r, 30));
    const nationStrip = document.getElementById('draft-reel-strip');
    const nationFinalTile = nationStrip.querySelector('.draft-reel-final');
    const finalTileIsNotGoldWhenRollIsNotGold = !!nationFinalTile && !nationFinalTile.classList.contains('draft-reel-gold')
      && draftRollState.currentRoll.isGold !== true;
    const finalTileTextMatchesActualNation = nationFinalTile.querySelector('span').textContent === natDE(draftRollState.currentRoll.nation);
    draftClearRollTimers(draftRollState);

    document.getElementById('modal-root') && (document.getElementById('modal-root').innerHTML = '');

    return {
      allGoldRollsValid, forcedRollIsGold, forcedRollAllHundredPlus,
      reelStripPresent, finalTileIsGold, revealedGoldCardsAllHundredPlus, noNationShownDuringGoldReveal,
      sawGoldAmongFillerTiles, goldPlayersOnlyRerollWorked,
      goldAnimationTargetsTheGoldTile, finalTileIsNotGoldWhenRollIsNotGold, finalTileTextMatchesActualNation,
    };
  }));

  console.log('Draft-Modus-Gold-Fund-Test');
  noErrors(errors, 'Seite');
  eq(result.allGoldRollsValid, true, 'draftDrawGoldFour liefert zuverlässig 4 Karten mit 100+ OVR, davon mindestens 1 passend');
  eq(result.forcedRollIsGold, true, 'ein erzwungener Zufallstreffer liefert einen Gold-Fund (isGold, nation:null, 4 Karten)');
  eq(result.forcedRollAllHundredPlus, true, 'alle 4 Karten eines Gold-Funds haben mindestens 100 OVR');
  eq(result.reelStripPresent, true, 'ein Gold-Fund läuft über dasselbe Länder-Reel wie jedes normale Land, kein separater Screen');
  eq(result.finalTileIsGold, true, 'die Walze landet bei einem Gold-Fund sichtbar auf der Gold-Kachel selbst (nicht auf einem Land)');
  eq(result.revealedGoldCardsAllHundredPlus, true, 'die am Ende aufgedeckten Gold-Fund-Karten sind tatsächlich alle 100+ OVR');
  eq(result.noNationShownDuringGoldReveal, true, 'beim Gold-Fund wird keine Länderflagge angezeigt (kein Land beteiligt)');
  eq(result.sawGoldAmongFillerTiles, true, 'die Gold-Kachel läuft regulär unter den zufälligen Füll-Kacheln jeder Walze mit, nicht nur wenn sie tatsächlich gewonnen wird');
  eq(result.goldPlayersOnlyRerollWorked, true, '"Nur Spieler neu" funktioniert auch bei einem Gold-Fund und liefert 4 neue 100+-Karten');
  eq(result.goldAnimationTargetsTheGoldTile, true, 'die Walzen-Animation zentriert exakt auf die Gold-Kachel, wenn Gold tatsächlich gewonnen wurde - Landen und Bekommen sind garantiert dasselbe');
  eq(result.finalTileIsNotGoldWhenRollIsNotGold, true, 'bei einem normalen Land-Ergebnis ist die Ergebnis-Kachel NIE golden markiert');
  eq(result.finalTileTextMatchesActualNation, true, 'bei einem normalen Ergebnis zeigt die Ergebnis-Kachel exakt das Land, das auch tatsächlich gewürfelt wurde');

  summary('Draft-Modus-Gold-Fund-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
