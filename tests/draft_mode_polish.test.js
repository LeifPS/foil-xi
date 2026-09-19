// Regressionstest für die vierte Feedback-Runde zum Draft-Modus:
// (1) beim Verschieben einer Karte werden jetzt ALLE Positionen, die sie laut ihren gelisteten
//     Positionen ebenfalls spielen könnte, sichtbar hervorgehoben (behebt "man sieht ihre anderen
//     Positionen nicht") - Anzeige (draftIsValidMoveTarget) und tatsächliches Klick-Verhalten teilen
//     sich jetzt dieselbe Funktion, können also nicht mehr auseinanderlaufen ("Spieler switchen klappt
//     nicht").
// (2) die Land-Rollen-Cutscene läuft jetzt als echtes Walzen-/Slot-Machine-Reel (ein CSS-transform-
//     Übergang statt wiederholtem JS-Ticking) und landet garantiert auf dem tatsächlich gewürfelten Land.
// (3) 100+-Odds wurden beträchtlich gesenkt (siehe draft_mode_full_pool.test.js für die genauen Zahlen).
// (4) zwei neue Erfolge fürs Draft-Modus: "Kaderschmied" (gespeicherte Aufstellungen) und
//     "Turnierlegende" (gewonnene Turnier-Stufen), inkl. eigener Nametags.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId:'test', displayName:'Test FC', coins:1000, crest:{shape:'shield',primary:'#fff',secondary:'#000',letter:'T'}, achievementStats:{}, achievementClaimed:{}, unlockedNametags:[] };
    clubId = 'test'; fb = null; sSet = async () => true;

    const def = CHALLENGE_DEFS.find(d=>d.id==='draft');
    openChallengeDetail(def);
    draftStartRoll();
    const state = draftRollState;
    // Eine Karte, die CB UND LB spielen kann (zwei potenzielle Ziele), plus eine reine ST-Karte, die
    // NUR auf einen der beiden ST/LW/RW-Slots passt - deckt sowohl "mehrere mögliche Ziele" als auch
    // "nur ein einziges anderes Ziel" ab.
    const multiPosCard = {id:900888001, n:'Multi Pos', pos:'CB, LB', ov:82, pac:74,sho:40,pas:62,dri:62,defn:80,phy:76, traits:[], variant:'base', nat:'Germany'};
    const stCard = {id:900888002, n:'Striker', pos:'ST', ov:85, pac:80,sho:85,pas:60,dri:75,defn:30,phy:70, traits:[], variant:'base', nat:'Germany'};
    // BY_ID.set nötig, damit startDraftTournament() diese Testkarten aus der gespeicherten Aufstellung
    // später wieder auflösen kann (echte Karten sind dort ja bereits registriert, diese Fake-Karten nicht).
    BY_ID.set(multiPosCard.id, multiPosCard);
    BY_ID.set(stCard.id, stCard);
    state.slots.find(s=>s.id==='cb1').card = multiPosCard;
    state.slots.find(s=>s.id==='st').card = stCard;
    renderDraftPanel();

    // ---------- (1) Ziel-Hervorhebung beim Verschieben ----------
    // Multi-Pos-Karte (cb1) auswählen: sie kann laut positionEligibility auf cb1 (aktuell), cb2 UND lb
    // spielen - cb2 und lb müssen jetzt als gültige Ziele markiert sein, alle anderen offenen Slots nicht.
    draftHandlePitchSlotClick(state, 'cb1');
    renderDraftPanel();
    const validTargetsForMultiPos = FORMATIONS['433'].slots
      .filter(fs => draftIsValidMoveTarget(state, 'cb1', fs.id))
      .map(fs => fs.id)
      .sort();
    const expectedTargets = ['cb2', 'lb'].sort();
    const highlightMatchesEligibility = JSON.stringify(validTargetsForMultiPos) === JSON.stringify(expectedTargets);
    // Die UI markiert genau diese Ziele auch tatsächlich sichtbar (goldener Rahmen auf dem leeren Slot
    // bzw. der Karte) - keine bloße Funktions-Prüfung ohne sichtbaren Effekt.
    const cb2El = document.querySelectorAll('#draft-pitch-wrap .pitch-slot')[3]; // gk,lb,cb1,cb2
    const lbEmptyElHighlighted = false; // lb ist hier besetzt (multiPosCard nicht dort) -> eigentlich leer, prüfen wir separat
    const cb2Highlighted = cb2El && cb2El.style.zIndex === '5';

    // Ein tatsächlicher Klick auf ein NICHT-eligibles Ziel (st, kann kein CB/LB) lehnt ab UND hebt die Auswahl auf.
    draftHandlePitchSlotClick(state, 'st');
    const rejectedInvalidMove = state.slots.find(s=>s.id==='cb1').card === multiPosCard && draftMoveSelectedSlotId === null;

    // Jetzt ein echter Verschieben-Vorgang auf ein gültiges Ziel (lb, aktuell leer).
    draftHandlePitchSlotClick(state, 'cb1');
    draftHandlePitchSlotClick(state, 'lb');
    const movedToLb = state.slots.find(s=>s.id==='lb').card === multiPosCard && state.slots.find(s=>s.id==='cb1').card === null;

    // ---------- (2) Land-Cutscene (Walzen-Reel): landet exakt auf dem echten Ergebnis ----------
    draftClearRollTimers(state);
    state.currentRoll = null; state.rollPhase = 'idle'; state.revealedCount = 0;
    const roll = draftRollNationAndCards(state.slots, state.usedNames);
    draftRunRevealSequence(state, roll);
    await new Promise(r => setTimeout(r, 30)); // requestAnimationFrame + Layout kurz abwarten
    const strip = document.getElementById('draft-reel-strip');
    const reelHasManyTiles = !!strip && strip.children.length === DRAFT_REEL_ITEM_COUNT+1;
    // Die letzte Kachel der Walze ist immer das tatsächliche Ergebnis (siehe draftBuildReelHTML).
    const lastTileText = strip ? strip.lastElementChild.querySelector('span').textContent : null;
    const lastTileIsRealNation = lastTileText === natDE(roll.nation);
    // Ein echter CSS-transform-Übergang wurde tatsächlich gestartet (kein JS-Ticking mehr).
    const transitionStarted = !!strip && strip.style.transition.includes('transform') && strip.style.transform.startsWith('translateX');
    await new Promise(r => setTimeout(r, 1500 + 4*450 + 300)); // Übergang + Aufdeck-Sequenz fertig laufen lassen
    const landedOnRealNation = state.currentRoll && state.currentRoll.nation === roll.nation;

    // ---------- (4) Erfolge: Kaderschmied (Aufstellung speichern) + Turnierlegende (Turnier-Stufen) ----------
    draftClearRollTimers(state);
    let rounds = 0;
    while(state.slots.some(s=>!s.card) && rounds<300){
      rounds++;
      if(!state.currentRoll) state.currentRoll = draftRollNationAndCards(state.slots, state.usedNames);
      const openLabels = draftOpenSlotLabels(state.slots);
      const fitting = state.currentRoll.cards.find(c=>draftCardFitsAnyOpenSlot(c, openLabels));
      if(!fitting) break;
      draftAssignCardToSlot(state, fitting);
      state.usedNames.add(fitting.n);
      state.currentRoll = null;
    }
    const players = state.slots.map(s=>({...s.card, pos:s.label, slotId:s.id}));
    const rating = draftRatingFromSlots(state);
    const statBefore = profile.achievementStats.draftSquadsSaved||0;
    await draftSaveSquad(0, players, rating);
    const draftSquadsSavedIncremented = (profile.achievementStats.draftSquadsSaved||0) === statBefore+1;

    await startDraftTournament(0);
    draftTournamentState.stageIdx = 4; // 4 Stufen gewonnen simuliert
    const stagesBefore = profile.achievementStats.draftStagesWon||0;
    const realAtomicCoinChange = atomicCoinChange;
    atomicCoinChange = async (delta) => { profile.coins += delta; };
    await claimDraftTournamentReward();
    atomicCoinChange = realAtomicCoinChange;
    const draftStagesWonIncremented = (profile.achievementStats.draftStagesWon||0) === stagesBefore+4;

    // Beide Achievement-Linien existieren korrekt in ACHIEVEMENTS mit eigenem Tier-V-Nametag.
    const kaderschmiedDef = ACHIEVEMENTS.find(a=>a.id==='draftSquadsSaved');
    const turnierlegendeDef = ACHIEVEMENTS.find(a=>a.id==='draftStagesWon');
    const achievementsWellFormed = !!kaderschmiedDef && kaderschmiedDef.tiers.length===5 && kaderschmiedDef.rewards.length===5
      && kaderschmiedDef.rewards[4].nametag==='kaderschmied' && !!NAMETAGS['kaderschmied']
      && !!turnierlegendeDef && turnierlegendeDef.tiers.length===5 && turnierlegendeDef.rewards.length===5
      && turnierlegendeDef.rewards[4].nametag==='turnierlegende' && !!NAMETAGS['turnierlegende'];

    document.getElementById('modal-root') && (document.getElementById('modal-root').innerHTML = '');

    return {
      highlightMatchesEligibility, cb2Highlighted, rejectedInvalidMove, movedToLb,
      reelHasManyTiles, lastTileIsRealNation, transitionStarted, landedOnRealNation,
      draftSquadsSavedIncremented, draftStagesWonIncremented, achievementsWellFormed,
    };
  }));

  console.log('Draft-Modus-Politur-Test');
  noErrors(errors, 'Seite');
  eq(result.highlightMatchesEligibility, true, 'eine Multi-Positions-Karte zeigt beim Verschieben genau die Slots als gültige Ziele, die sie laut ihren gelisteten Positionen tatsächlich spielen kann');
  eq(result.cb2Highlighted, true, 'ein gültiges Ziel wird auch sichtbar (höherer z-index/Hervorhebung) markiert, nicht nur intern berechnet');
  eq(result.rejectedInvalidMove, true, 'ein Klick auf eine nicht-berechtigte Position lehnt das Verschieben ab und hebt die Auswahl korrekt auf');
  eq(result.movedToLb, true, 'das eigentliche Verschieben auf ein gültiges, leeres Ziel funktioniert zuverlässig');
  eq(result.reelHasManyTiles, true, 'die Cutscene zeigt ein echtes Walzen-Reel mit vielen Länder-Kacheln statt einer einzelnen wechselnden Flagge');
  eq(result.lastTileIsRealNation, true, 'die letzte Kachel der Walze ist immer das tatsächlich gewürfelte Land');
  eq(result.transitionStarted, true, 'die Walze läuft über einen echten CSS-transform-Übergang, nicht mehr über wiederholtes JS-Ticking');
  eq(result.landedOnRealNation, true, 'die Cutscene landet garantiert auf dem tatsächlich gewürfelten Land');
  eq(result.draftSquadsSavedIncremented, true, 'das Speichern einer Draft-Aufstellung zählt für den "Kaderschmied"-Erfolg');
  eq(result.draftStagesWonIncremented, true, 'gewonnene Turnier-Stufen zählen für den "Turnierlegende"-Erfolg');
  eq(result.achievementsWellFormed, true, 'beide neuen Erfolge sind korrekt mit 5 Stufen, 5 Belohnungen und einem eigenen Tier-V-Nametag definiert');

  summary('Draft-Modus-Politur-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
