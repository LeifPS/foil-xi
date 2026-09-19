// Regressionstest für den komplett neu gebauten Draft-Modus ("Neues Prinzip: Der Draft Modus komplett
// neu"): feste 4-3-3-Formation, pro offenem Slot eine Land+4-Spieler-Ziehung nach einer festen
// Rating-Verteilung (mindestens 1 der 4 passt garantiert auf einen offenen Slot), volles Restart statt
// Teil-Undo, 3 dauerhafte Speicher-Slots, ein endloser K.o.-Turnierbaum ab dem Achtelfinale (80 OVR,
// +5 OVR je Stufe) mit Belohnung nach der weitesten gewonnenen Stufe, sowie eine globale Draft-Rangliste.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId:'test', displayName:'Test FC', coins:1000, crest:{shape:'shield',primary:'#fff',secondary:'#000',letter:'T'}, achievementStats:{} };
    clubId = 'test'; fb = null;
    sSet = async () => true;

    // ---------- (1) Grunddaten der Stufen-/Belohnungstabelle ----------
    const oddsSum = DRAFT_ROLL_TIERS.reduce((s,t)=>s+t.chance,0);
    const oddsSumIsOne = Math.abs(oddsSum-1) < 0.001;
    const stageLabels = [0,1,2,3,4,5,6].map(draftStageLabel);
    const stageOvs = [0,1,2,3,4].map(draftStageOv);
    const stageRewards = [0,1,2,3,4,5,6,7,8,9].map(draftStageReward);

    // ---------- (2) Nation+4-Karten-Ziehung: Garantie, dass immer mind. 1 Kandidat passt ----------
    let allRollsHadAFit = true;
    for(let i=0;i<40;i++){
      const slots = FORMATIONS['433'].slots.map(s=>({id:s.id, label:s.label, card: Math.random()<0.5 ? {n:'dummy'+i} : null}));
      if(slots.every(s=>s.card)) slots[0].card = null; // nie alle Slots gleichzeitig zu (sonst gäbe es gar keine Ziehung)
      const openLabels = draftOpenSlotLabels(slots);
      const {cards} = draftRollNationAndCards(slots, new Set());
      if(!cards.some(c=>draftCardFitsAnyOpenSlot(c, openLabels))) allRollsHadAFit = false;
    }

    // ---------- (3) Kompletter Durchlauf: alle 11 Slots per echtem Rollen+Zuweisen füllen ----------
    draftStartRoll();
    let rounds = 0;
    while(draftRollState.slots.some(s=>!s.card) && rounds<200){
      rounds++;
      const state = draftRollState;
      if(!state.currentRoll) state.currentRoll = draftRollNationAndCards(state.slots, state.usedNames);
      const openLabels = draftOpenSlotLabels(state.slots);
      const fitting = state.currentRoll.cards.find(c=>draftCardFitsAnyOpenSlot(c, openLabels));
      if(!fitting) break; // dürfte wegen der Garantie nie passieren - unten separat geprüft
      draftAssignCardToSlot(state, fitting);
      state.usedNames.add(fitting.n);
      state.currentRoll = null;
    }
    const fullSquadFilled = draftRollState.slots.every(s=>!!s.card);
    const noDuplicatePlayers = new Set(draftRollState.slots.map(s=>s.card.n)).size === 11;

    // ---------- (4) Restart wirft die KOMPLETTE Aufstellung weg (kein Teil-Undo) ----------
    draftRestartRoll();
    const restartWipesEverything = draftRollState.slots.every(s=>!s.card);

    // Für den Rest wieder komplett durchspielen (einfachste Möglichkeit an eine valide 11er-Elf zu kommen)
    let rounds2 = 0;
    while(draftRollState.slots.some(s=>!s.card) && rounds2<200){
      rounds2++;
      const state = draftRollState;
      if(!state.currentRoll) state.currentRoll = draftRollNationAndCards(state.slots, state.usedNames);
      const openLabels = draftOpenSlotLabels(state.slots);
      const fitting = state.currentRoll.cards.find(c=>draftCardFitsAnyOpenSlot(c, openLabels));
      if(!fitting) break;
      draftAssignCardToSlot(state, fitting);
      state.usedNames.add(fitting.n);
      state.currentRoll = null;
    }

    // ---------- (5) Speichern in Slot 0 - Karten gehören dem Spieler NICHT (keine collection-Änderung) ----------
    const collectionBefore = JSON.stringify(typeof collection !== 'undefined' ? collection : null);
    const players = draftRollState.slots.map(s=>({...s.card, pos:s.label}));
    const chem = computeChemistry(players, null);
    const rating = Math.round(chem.reduce((s,p)=>s+p.chemOv,0)/chem.length);
    await draftSaveSquad(0, players, rating);
    const savedCorrectly = profile.draftSquads && profile.draftSquads[0] && profile.draftSquads[0].rating===rating && profile.draftSquads[0].players.length===11;
    const collectionUnchanged = JSON.stringify(typeof collection !== 'undefined' ? collection : null) === collectionBefore;
    const rollStateResetAfterSave = draftRollState === null;

    // ---------- (6) Turnier: Stufen-Fortschritt + Belohnung nach weitester gewonnener Stufe ----------
    await startDraftTournament(0);
    const tournamentStartedAtStage0 = draftTournamentState.stageIdx === 0;
    draftTournamentState.stageIdx = 3; // simuliert: Achtelfinale/Viertelfinale/Halbfinale/Finale gewonnen
    const coinsBefore = profile.coins;
    const coinCalls = [];
    const realAtomicCoinChange = atomicCoinChange;
    atomicCoinChange = async (delta) => { coinCalls.push(delta); profile.coins += delta; };
    await claimDraftTournamentReward();
    atomicCoinChange = realAtomicCoinChange;
    const rewardForThreeWins = coinCalls[0]; // 3 gewonnene Stufen (Index 0,1,2) -> Belohnung von draftStageReward(2)
    const tournamentStateResetAfterClaim = draftTournamentState === null;

    // Kein gewonnener Durchlauf (sofort verloren) -> keine Belohnung
    await startDraftTournament(0);
    const coinCalls2 = [];
    atomicCoinChange = async (delta) => { coinCalls2.push(delta); profile.coins += delta; };
    await claimDraftTournamentReward();
    atomicCoinChange = realAtomicCoinChange;

    // ---------- (7) Geld gibt es NUR beim aktiven Auscashen VOR einer Niederlage - eine Niederlage
    // selbst zahlt NICHTS aus, auch wenn zuvor mehrere Stufen gewonnen wurden.
    await startDraftTournament(0);
    draftTournamentState.stageIdx = 3; // dieselben 3 gewonnenen Stufen wie oben, diesmal aber verloren statt ausgecasht
    const coinsBeforeLoss = profile.coins;
    const statBeforeLoss = profile.achievementStats.draftStagesWon||0;
    const coinCalls3 = [];
    atomicCoinChange = async (delta) => { coinCalls3.push(delta); profile.coins += delta; };
    await draftTournamentLoseWithoutPayout();
    atomicCoinChange = realAtomicCoinChange;
    const noPayoutOnLossDespiteWonStages = coinCalls3.length === 0 && profile.coins === coinsBeforeLoss;
    const tournamentStateResetAfterLoss = draftTournamentState === null;
    // Der sportliche Fortschritt (gewonnene Stufen) für den "Turnierlegende"-Erfolg zählt trotzdem, auch
    // ohne Auszahlung - er misst die Leistung, nicht das Geld.
    const achievementStillCountedOnLoss = (profile.achievementStats.draftStagesWon||0) === statBeforeLoss + 3;

    return {
      oddsSumIsOne, stageLabels, stageOvs, stageRewards,
      allRollsHadAFit, fullSquadFilled, noDuplicatePlayers, restartWipesEverything,
      savedCorrectly, collectionUnchanged, rollStateResetAfterSave,
      tournamentStartedAtStage0, rewardForThreeWins, tournamentStateResetAfterClaim,
      noRewardWithoutAWin: coinCalls2.length === 0,
      noPayoutOnLossDespiteWonStages, tournamentStateResetAfterLoss, achievementStillCountedOnLoss,
    };
  }));

  console.log('Draft-Modus-Test');
  noErrors(errors, 'Seite');
  ok(result.oddsSumIsOne, `DRAFT_ROLL_TIERS-Wahrscheinlichkeiten summieren sich auf 100% (war ${result.oddsSumIsOne})`);
  eq(JSON.stringify(result.stageLabels), JSON.stringify(['Achtelfinale','Viertelfinale','Halbfinale','Finale','Finale ★','Finale ★★','Finale ★★★']), 'Stufen-Namen: Achtelfinale...Finale, danach Finale ★/★★/★★★ ...');
  eq(JSON.stringify(result.stageOvs), JSON.stringify([80,85,90,95,100]), 'Gegner-OVR: 80 im Achtelfinale, +5 je weitere Stufe');
  eq(JSON.stringify(result.stageRewards), JSON.stringify([250,500,1000,2000,4000,8000,16000,24000,32000,40000]), 'Belohnung: 250/500/1000/2000/4000/8000/16000 (Verdopplung), danach +8000 je weitere Stufe');
  eq(result.allRollsHadAFit, true, 'jede Land+4-Spieler-Ziehung enthält garantiert mindestens 1 Karte, die auf einen offenen Slot passt');
  eq(result.fullSquadFilled, true, 'ein kompletter Durchlauf füllt tatsächlich alle 11 Slots');
  eq(result.noDuplicatePlayers, true, 'kein echter Spieler wird innerhalb eines Laufs doppelt gedraftet');
  eq(result.restartWipesEverything, true, 'Neu starten wirft die KOMPLETTE bisherige Aufstellung weg, kein Teil-Undo');
  eq(result.savedCorrectly, true, 'eine fertige Aufstellung lässt sich mit korrektem Rating in einen Slot speichern');
  eq(result.collectionUnchanged, true, 'gedraftete Karten werden NICHT der echten Kartensammlung hinzugefügt (reine Fantasie-Aufstellung)');
  eq(result.rollStateResetAfterSave, true, 'nach dem Speichern ist der Roll-Zustand wieder sauber zurückgesetzt');
  eq(result.tournamentStartedAtStage0, true, 'ein neu gestarteter Turnierlauf beginnt beim Achtelfinale (Stufe 0)');
  eq(result.rewardForThreeWins, 1000, '3 gewonnene Stufen (bis Halbfinale) zahlen die Belohnung der zuletzt gewonnenen Stufe (draftStageReward(2)=1000)');
  eq(result.tournamentStateResetAfterClaim, true, 'nach dem Abholen der Belohnung ist der Turnierlauf beendet/zurückgesetzt');
  eq(result.noRewardWithoutAWin, true, 'ein Lauf ohne eine einzige gewonnene Stufe zahlt keine Belohnung aus');
  eq(result.noPayoutOnLossDespiteWonStages, true, 'eine Niederlage OHNE vorheriges Auscashen zahlt nichts aus, selbst nach mehreren gewonnenen Stufen');
  eq(result.tournamentStateResetAfterLoss, true, 'nach einer Niederlage ohne Auszahlung ist der Turnierlauf trotzdem beendet/zurückgesetzt');
  eq(result.achievementStillCountedOnLoss, true, 'der "Turnierlegende"-Fortschritt (gewonnene Stufen) zählt auch ohne Auszahlung, da er die sportliche Leistung misst');

  summary('Draft-Modus-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
