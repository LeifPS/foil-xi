// Regressionstest für: "statt einem Land kann man auch zu 2% Gold bekommen wo man 4x 100+ Karte
// bekommt zum auswählen" - mit DRAFT_GOLD_CHANCE (2%) gibt es statt der normalen Land-Ziehung einen
// Gold-Fund: kein Land, direkt 4 Karten mit 100+ OVR zur Auswahl (mit derselben "mindestens 1 passt auf
// einen offenen Slot"-Garantie). Auch die UI zeigt dafür eine eigene, landlose Gold-Cutscene statt des
// Länder-Reels.
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

    // ---------- (3) UI: ein erzwungener Gold-Fund zeigt eine eigene Cutscene, kein Länder-Reel ----------
    Math.random = () => 0;
    draftBeginRoll();
    Math.random = realMathRandom;
    const goldSpinShownInsteadOfReel = !!document.querySelector('.draft-gold-spin') && !document.getElementById('draft-reel-strip');
    // Nach der (kürzeren, ohne echten Reel-Übergang wartenden) Spin-Phase + Aufdeck-Sequenz: alle 4
    // gezeigten Karten sind tatsächlich 100+ (worst case inkl. Legendary-Pause+Slow-Reveal je Karte).
    const deadline = Date.now() + 2200 + 4*2500 + 1500;
    while(draftRollState.rollPhase!=='done' && Date.now()<deadline){ await new Promise(r=>setTimeout(r, 40)); }
    const revealedGoldCardsAllHundredPlus = draftRollState.currentRoll.cards.every(c=>c.ov>=100);
    const noNationShownDuringGoldReveal = !document.querySelector('.draft-roll-flag');

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

    document.getElementById('modal-root') && (document.getElementById('modal-root').innerHTML = '');

    return {
      allGoldRollsValid, forcedRollIsGold, forcedRollAllHundredPlus,
      goldSpinShownInsteadOfReel, revealedGoldCardsAllHundredPlus, noNationShownDuringGoldReveal,
      goldPlayersOnlyRerollWorked,
    };
  }));

  console.log('Draft-Modus-Gold-Fund-Test');
  noErrors(errors, 'Seite');
  eq(result.allGoldRollsValid, true, 'draftDrawGoldFour liefert zuverlässig 4 Karten mit 100+ OVR, davon mindestens 1 passend');
  eq(result.forcedRollIsGold, true, 'ein erzwungener Zufallstreffer liefert einen Gold-Fund (isGold, nation:null, 4 Karten)');
  eq(result.forcedRollAllHundredPlus, true, 'alle 4 Karten eines Gold-Funds haben mindestens 100 OVR');
  eq(result.goldSpinShownInsteadOfReel, true, 'ein Gold-Fund zeigt eine eigene Cutscene statt des normalen Länder-Reels');
  eq(result.revealedGoldCardsAllHundredPlus, true, 'die am Ende aufgedeckten Gold-Fund-Karten sind tatsächlich alle 100+ OVR');
  eq(result.noNationShownDuringGoldReveal, true, 'beim Gold-Fund wird keine Länderflagge angezeigt (kein Land beteiligt)');
  eq(result.goldPlayersOnlyRerollWorked, true, '"Nur Spieler neu" funktioniert auch bei einem Gold-Fund und liefert 4 neue 100+-Karten');

  summary('Draft-Modus-Gold-Fund-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
