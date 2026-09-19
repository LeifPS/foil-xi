// Regressionstest für die vierte und sechste Feedback-Runde zum Draft-Modus:
// (1) die Land-Rollen-Cutscene läuft als echtes Walzen-/Slot-Machine-Reel (ein CSS-transform-Übergang
//     statt wiederholtem JS-Ticking) und landet garantiert auf dem tatsächlich gewürfelten Land.
// (2) 100+-Odds wurden beträchtlich gesenkt (siehe draft_mode_full_pool.test.js für die genauen Zahlen).
// (3) zwei Erfolge fürs Draft-Modus: "Kaderschmied" (gespeicherte Aufstellungen) und "Turnierlegende"
//     (gewonnene Turnier-Stufen), inkl. eigener Nametags.
// (4) NEU (sechste Runde): kommt beim Aufdecken der 4 Kandidaten eine 100+-Karte, wird VOR ihrem
//     Aufdecken ~1s pausiert (Vorfreude) und ihre eigene Aufdeck-Animation läuft danach deutlich
//     langsamer (~1.5s statt der üblichen ~0.4-0.55s) ab.
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

    // ---------- (1) Land-Cutscene (Walzen-Reel): landet exakt auf dem echten Ergebnis ----------
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

    // ---------- (4) 100+-Karte: Pause vor dem Aufdecken + langsame eigene Reveal-Animation ----------
    draftClearRollTimers(state);
    const legendaryCard = {id:900777001, n:'Legendary Test', pos:'ST', ov:105, pac:90,sho:95,pas:60,dri:80,defn:20,phy:75, traits:[], variant:'base', nat:'Germany'};
    const normalCard1 = {id:900777002, n:'Normal Test 1', pos:'ST', ov:75, pac:70,sho:70,pas:60,dri:65,defn:30,phy:70, traits:[], variant:'base', nat:'Germany'};
    const normalCard2 = {id:900777003, n:'Normal Test 2', pos:'ST', ov:75, pac:70,sho:70,pas:60,dri:65,defn:30,phy:70, traits:[], variant:'base', nat:'Germany'};
    const normalCard3 = {id:900777004, n:'Normal Test 3', pos:'ST', ov:75, pac:70,sho:70,pas:60,dri:65,defn:30,phy:70, traits:[], variant:'base', nat:'Germany'};
    // Die Legendary-Karte an Index 1 platzieren, damit sich messen lässt, ob NACH ihr zusätzlich pausiert
    // wird UND ihre eigene Aufdeck-Verzögerung (Index 1->2) deutlich länger ist als eine normale (0->1).
    state.currentRoll = { nation:'Germany', cards:[normalCard1, legendaryCard, normalCard2, normalCard3] };
    state.revealedCount = 0;
    state.rollPhase = 'revealing';
    renderDraftPanel();
    const revealTimestamps = [Date.now()];
    draftScheduleReveals(state);
    while(state.revealedCount < 4){
      await new Promise(r=>setTimeout(r, 20));
      if(revealTimestamps.length === state.revealedCount) revealTimestamps.push(Date.now());
    }
    const t0 = revealTimestamps[0]; // Start des Aufdeckens
    const gapNormal = revealTimestamps[1] - t0; // normalCard1 (Index 0) erscheint ~sofort
    const gapIntoLegendary = revealTimestamps[2] - revealTimestamps[1]; // Pause + Erscheinen der Legendary-Karte (Index 1)
    const gapAfterLegendary = revealTimestamps[3] - revealTimestamps[2]; // wartet auf das Ende von deren langsamer Animation
    const legendaryGapClearlyLongerThanNormal = gapIntoLegendary > gapNormal + 700; // deutlich länger als der übliche ~450ms-Takt
    const gapAfterLegendaryReflectsSlowReveal = gapAfterLegendary >= 1400; // die 1.5s-Aufdeck-Animation der Legendary-Karte wird abgewartet
    const epicProbe = document.createElement('div');
    epicProbe.className = 'draft-card-reveal-epic';
    document.body.appendChild(epicProbe);
    const epicAnimationIsSlow = getComputedStyle(epicProbe).animationDuration.includes('1.5s');
    epicProbe.remove();

    // ---------- (2)+(3) Erfolge: Kaderschmied (Aufstellung speichern) + Turnierlegende (Turnier-Stufen) ----------
    draftRestartRoll();
    const state2 = draftRollState;
    draftClearRollTimers(state2);
    let rounds = 0;
    while(state2.slots.some(s=>!s.card) && rounds<300){
      rounds++;
      if(!state2.currentRoll) state2.currentRoll = draftRollNationAndCards(state2.slots, state2.usedNames);
      const openLabels = draftOpenSlotLabels(state2.slots);
      const fitting = state2.currentRoll.cards.find(c=>draftCardFitsAnyOpenSlot(c, openLabels));
      if(!fitting) break;
      draftAssignCardToSlot(state2, fitting);
      state2.usedNames.add(fitting.n);
      state2.currentRoll = null;
    }
    const players = state2.slots.map(s=>({...s.card, pos:s.label, slotId:s.id}));
    const rating = draftRatingFromSlots(state2);
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

    const kaderschmiedDef = ACHIEVEMENTS.find(a=>a.id==='draftSquadsSaved');
    const turnierlegendeDef = ACHIEVEMENTS.find(a=>a.id==='draftStagesWon');
    const achievementsWellFormed = !!kaderschmiedDef && kaderschmiedDef.tiers.length===5 && kaderschmiedDef.rewards.length===5
      && kaderschmiedDef.rewards[4].nametag==='kaderschmied' && !!NAMETAGS['kaderschmied']
      && !!turnierlegendeDef && turnierlegendeDef.tiers.length===5 && turnierlegendeDef.rewards.length===5
      && turnierlegendeDef.rewards[4].nametag==='turnierlegende' && !!NAMETAGS['turnierlegende'];

    document.getElementById('modal-root') && (document.getElementById('modal-root').innerHTML = '');

    return {
      reelHasManyTiles, lastTileIsRealNation, transitionStarted, landedOnRealNation,
      legendaryGapClearlyLongerThanNormal, gapAfterLegendaryReflectsSlowReveal, epicAnimationIsSlow,
      draftSquadsSavedIncremented, draftStagesWonIncremented, achievementsWellFormed,
    };
  }));

  console.log('Draft-Modus-Politur-Test');
  noErrors(errors, 'Seite');
  eq(result.reelHasManyTiles, true, 'die Cutscene zeigt ein echtes Walzen-Reel mit vielen Länder-Kacheln statt einer einzelnen wechselnden Flagge');
  eq(result.lastTileIsRealNation, true, 'die letzte Kachel der Walze ist immer das tatsächlich gewürfelte Land');
  eq(result.transitionStarted, true, 'die Walze läuft über einen echten CSS-transform-Übergang, nicht mehr über wiederholtes JS-Ticking');
  eq(result.landedOnRealNation, true, 'die Cutscene landet garantiert auf dem tatsächlich gewürfelten Land');
  eq(result.legendaryGapClearlyLongerThanNormal, true, 'vor dem Aufdecken einer 100+-Karte wird spürbar länger pausiert als zwischen zwei normalen Karten');
  eq(result.gapAfterLegendaryReflectsSlowReveal, true, 'nach einer 100+-Karte wird bis zum Ende ihrer eigenen, deutlich langsameren Aufdeck-Animation gewartet, bevor die nächste Karte drankommt');
  eq(result.epicAnimationIsSlow, true, 'die CSS-Animation für 100+-Karten (draft-card-reveal-epic) läuft über die verlangsamte 1.5s-Dauer');
  eq(result.draftSquadsSavedIncremented, true, 'das Speichern einer Draft-Aufstellung zählt für den "Kaderschmied"-Erfolg');
  eq(result.draftStagesWonIncremented, true, 'gewonnene Turnier-Stufen zählen für den "Turnierlegende"-Erfolg');
  eq(result.achievementsWellFormed, true, 'beide neuen Erfolge sind korrekt mit 5 Stufen, 5 Belohnungen und einem eigenen Tier-V-Nametag definiert');

  summary('Draft-Modus-Politur-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
