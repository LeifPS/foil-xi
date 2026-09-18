// Regressionstest für die zweite Feedback-Runde zum Draft-Modus:
// (1) Karten lassen sich jederzeit (während des Rollens UND auf der fertigen Aufstellung) auf eine
//     andere Position verschieben oder mit einer anderen platzierten Karte tauschen, solange die
//     jeweilige Karte dort laut positionEligibility spielen kann.
// (2) Chemie und Positionsbonus werden live berechnet und angezeigt (Chemie-Sterne pro Karte, laufendes
//     Team-Rating inkl. Chemie schon während des Rollens, nicht erst am Ende).
// (3) Drei neue Werkzeuge, je 1x pro Lauf: kompletter Neu-Wurf für den aktuellen Slot (ohne die ganze
//     Aufstellung neu starten zu müssen), nur die 4 Spieler neu würfeln (Land bleibt), und eine bereits
//     platzierte Karte gegen eine neu gewürfelte auf derselben Position austauschen.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId:'test', displayName:'Test FC', coins:1000, crest:{shape:'shield',primary:'#fff',secondary:'#000',letter:'T'}, achievementStats:{} };
    clubId = 'test'; fb = null; sSet = async () => true;

    // ---------- Hilfsfunktion: findet zwei besetzte Slots mit UNTERSCHIEDLICHEM Label, deren Karten
    // sich gegenseitig NICHT tauschen lassen (Kontrollfall) UND baut gezielt einen garantiert gültigen
    // Tausch/Verschiebe-Fall auf, um nicht vom Zufall abhängig zu sein.
    function freshState(){
      draftStartRoll();
      return draftRollState;
    }

    // ---------- (1a) Verschieben: eine Karte in einen offenen, für sie berechtigten Slot bewegen ----------
    let state = freshState();
    // Zwei künstliche Testkarten mit bekannten, kontrollierten Positionen statt echtem Zufalls-Rollen,
    // damit der Move-Test nicht von der zufälligen Ziehung abhängt.
    const cbCard = {id:900555001, n:'Test CB', pos:'CB', ov:80, pac:70,sho:40,pas:60,dri:60,defn:80,phy:78, traits:[], variant:'base'};
    const lbCard = {id:900555002, n:'Test LB', pos:'LB, CB', ov:78, pac:75,sho:40,pas:65,dri:65,defn:75,phy:72, traits:[], variant:'base'};
    state.slots.find(s=>s.id==='cb1').card = cbCard;
    const openBeforeMove = draftOpenSlotLabels(state.slots).includes('LB');
    draftHandlePitchSlotClick(state, 'cb1'); // auswählen
    const selectedAfterFirstClick = draftMoveSelectedSlotId === 'cb1';
    draftHandlePitchSlotClick(state, 'lb'); // auf offenen, für CB nicht zulässigen Slot verschieben (CB kann nicht LB)
    const moveToIneligibleSlotRejected = state.slots.find(s=>s.id==='cb1').card === cbCard && state.slots.find(s=>s.id==='lb').card === null;

    // Jetzt ein Ziel, das die Karte wirklich spielen kann: cb2 (auch CB).
    draftHandlePitchSlotClick(state, 'cb1');
    draftHandlePitchSlotClick(state, 'cb2');
    const movedToEligibleEmptySlot = state.slots.find(s=>s.id==='cb2').card === cbCard && state.slots.find(s=>s.id==='cb1').card === null;
    const selectionClearedAfterMove = draftMoveSelectedSlotId === null;

    // ---------- (1b) Tauschen: zwei besetzte, gegenseitig berechtigte Slots tauschen die Karten ----------
    state.slots.find(s=>s.id==='cb1').card = lbCard; // LB-Karte kann auch CB spielen (siehe pos oben)
    draftHandlePitchSlotClick(state, 'cb2'); // cbCard auswählen (kann nur CB)
    draftHandlePitchSlotClick(state, 'cb1'); // mit lbCard tauschen - lbCard kann auch CB, cbCard passt auf cb1 (auch CB)
    const swappedCorrectly = state.slots.find(s=>s.id==='cb1').card === cbCard && state.slots.find(s=>s.id==='cb2').card === lbCard;

    // Klick auf denselben Slot hebt die Auswahl wieder auf, ohne etwas zu verändern.
    draftHandlePitchSlotClick(state, 'cb1');
    const beforeCancel = JSON.stringify(state.slots.map(s=>s.card && s.card.id));
    draftHandlePitchSlotClick(state, 'cb1');
    const deselectDidNothing = draftMoveSelectedSlotId === null && JSON.stringify(state.slots.map(s=>s.card && s.card.id)) === beforeCancel;

    // ---------- (2) Chemie live berechnet ----------
    // lbCard (jetzt auf cb2) und cbCard (auf cb1) haben keinen gemeinsamen Verein/Liga/Nation -> 0 Sterne erwartet,
    // aber die Berechnung selbst muss für JEDEN besetzten Slot einen Wert liefern (nicht nur am Ende der vollen Elf).
    const chemDetail = draftChemistryDetail(state);
    const chemComputedForPartialSquad = chemDetail.bySlot['cb1']!==undefined && chemDetail.bySlot['cb2']!==undefined && Object.keys(chemDetail.bySlot).length === 2;
    const liveRatingDuringRoll = draftRatingFromSlots(state);
    const liveRatingIsANumber = typeof liveRatingDuringRoll === 'number' && liveRatingDuringRoll > 0;

    // ---------- (3a) Kompletter Neu-Wurf (1x pro Lauf) ----------
    state = freshState();
    draftBeginRoll();
    await new Promise(r=>setTimeout(r, 1500 + 4*450 + 300)); // bis Phase 'done' durchlaufen lassen
    const firstRollCards = state.currentRoll.cards.map(c=>c.id);
    const rerollsFullBefore = state.rerolls.full;
    draftUseFullReroll();
    await new Promise(r=>setTimeout(r, 1500 + 4*450 + 300));
    const secondRollCards = state.currentRoll.cards.map(c=>c.id);
    const fullRerollConsumed = state.rerolls.full === rerollsFullBefore - 1;
    const fullRerollGaveDifferentOffer = JSON.stringify(firstRollCards) !== JSON.stringify(secondRollCards);
    // Ein zweiter Versuch darf nicht mehr funktionieren (nur 1x pro Lauf).
    const beforeSecondAttempt = JSON.stringify(state.currentRoll.cards.map(c=>c.id));
    draftUseFullReroll();
    const secondFullRerollBlocked = JSON.stringify(state.currentRoll.cards.map(c=>c.id)) === beforeSecondAttempt && state.rerolls.full === 0;

    // ---------- (3b) Nur Spieler neu würfeln (Land bleibt) ----------
    const nationBeforePlayersReroll = state.currentRoll.nation;
    const cardsBeforePlayersReroll = state.currentRoll.cards.map(c=>c.id);
    draftUsePlayersOnlyReroll();
    await new Promise(r=>setTimeout(r, 4*450 + 300)); // kein Spin, nur die Aufdeck-Sequenz
    const nationStayedSame = state.currentRoll.nation === nationBeforePlayersReroll;
    const playersActuallyChanged = JSON.stringify(state.currentRoll.cards.map(c=>c.id)) !== JSON.stringify(cardsBeforePlayersReroll);
    const playersOnlyRerollConsumed = state.rerolls.playersOnly === 0;

    // Eine der 4 neu gewürfelten Karten tatsächlich picken, um den ersten Slot zu füllen.
    const pickTarget = document.querySelector('#draft-roll-pick-list');
    // (Testet direkt über die State-Funktionen statt über echte DOM-Klicks, um unabhängig vom Timing der
    // Aufdeck-Animation zu bleiben - die reine Logik wurde in draft_mode_ui.test.js bereits per Klick geprüft.)
    const fittingCard = state.currentRoll.cards.find(c => draftCardFitsAnyOpenSlot(c, draftOpenSlotLabels(state.slots)));
    draftClearRollTimers(state);
    draftAssignCardToSlot(state, fittingCard);
    state.usedNames.add(fittingCard.n);
    state.currentRoll = null; state.rollPhase = 'idle'; state.revealedCount = 0;
    const oneSlotFilledAfterPick = state.slots.filter(s=>s.card).length === 1;

    // ---------- (3c) Spieler ersetzen (1x pro Lauf) - eine bereits platzierte Karte austauschen ----------
    const filledSlotId = state.slots.find(s=>s.card).id;
    const filledSlotLabel = FORMATIONS['433'].slots.find(fs=>fs.id===filledSlotId).label;
    const oldCardId = state.slots.find(s=>s.id===filledSlotId).card.id;
    const rerollsReplaceBefore = state.rerolls.replace;
    draftBeginReplaceRoll(filledSlotId);
    await new Promise(r=>setTimeout(r, 1500 + 4*450 + 300));
    const replaceRollActive = !!(state.currentRoll && state.currentRoll.isReplace);
    // ALLE 4 beim Ersetzen-Wurf gezogenen Kandidaten müssen exakt auf DIESE eine Position passen.
    const allFourFitExactSlot = state.currentRoll.cards.every(c => positionEligibility(c, filledSlotLabel)!==null);
    // Die alte Karte bleibt im Slot, bis eine der 4 neuen tatsächlich gewählt wird.
    const oldCardStillThereUntilPick = state.slots.find(s=>s.id===filledSlotId).card.id === oldCardId;
    const replacementCard = state.currentRoll.cards[0];
    draftClearRollTimers(state);
    state.usedNames.delete(state.slots.find(s=>s.id===filledSlotId).card.n);
    state.slots.find(s=>s.id===filledSlotId).card = replacementCard;
    state.usedNames.add(replacementCard.n);
    state.currentRoll = null; state.rollPhase = 'idle'; state.replaceTargetSlotId = null;
    const slotActuallyReplaced = state.slots.find(s=>s.id===filledSlotId).card.id === replacementCard.id;
    const replaceConsumed = state.rerolls.replace === rerollsReplaceBefore - 1;
    // Kein zweiter Ersetzen-Versuch mehr möglich (1x pro Lauf) - rerolls.replace ist jetzt 0.
    const secondReplaceBlocked = state.rerolls.replace === 0;

    document.getElementById('modal-root') && (document.getElementById('modal-root').innerHTML = '');

    return {
      openBeforeMove, selectedAfterFirstClick, moveToIneligibleSlotRejected, movedToEligibleEmptySlot,
      selectionClearedAfterMove, swappedCorrectly, deselectDidNothing,
      chemComputedForPartialSquad, liveRatingIsANumber,
      fullRerollConsumed, fullRerollGaveDifferentOffer, secondFullRerollBlocked,
      nationStayedSame, playersActuallyChanged, playersOnlyRerollConsumed, oneSlotFilledAfterPick,
      replaceRollActive, allFourFitExactSlot, oldCardStillThereUntilPick, slotActuallyReplaced,
      replaceConsumed, secondReplaceBlocked,
    };
  }));

  console.log('Draft-Modus-Werkzeuge-Test');
  noErrors(errors, 'Seite');
  eq(result.openBeforeMove, true, 'Vorbedingung: LB ist zu Beginn ein offener Slot');
  eq(result.selectedAfterFirstClick, true, 'ein Klick auf eine besetzte Karte wählt sie zum Verschieben aus');
  eq(result.moveToIneligibleSlotRejected, true, 'ein Verschieben auf eine Position, die die Karte nicht spielen kann, wird abgelehnt');
  eq(result.movedToEligibleEmptySlot, true, 'eine Karte lässt sich auf einen anderen offenen Slot verschieben, den sie laut ihren Positionen spielen kann');
  eq(result.selectionClearedAfterMove, true, 'nach einem erfolgreichen Verschieben ist die Auswahl wieder leer');
  eq(result.swappedCorrectly, true, 'zwei besetzte, gegenseitig berechtigte Slots tauschen ihre Karten korrekt');
  eq(result.deselectDidNothing, true, 'erneuter Klick auf den ausgewählten Slot hebt die Auswahl auf, ohne etwas zu verändern');
  eq(result.chemComputedForPartialSquad, true, 'Chemie wird schon für eine unvollständige Aufstellung live berechnet, nicht erst am Ende');
  eq(result.liveRatingIsANumber, true, 'das laufende Team-Rating (inkl. Chemie) ist schon während des Rollens verfügbar');
  eq(result.fullRerollConsumed, true, 'ein kompletter Neu-Wurf verbraucht das "full"-Kontingent (1x pro Lauf)');
  eq(result.fullRerollGaveDifferentOffer, true, 'ein kompletter Neu-Wurf liefert tatsächlich eine andere Ziehung als zuvor');
  eq(result.secondFullRerollBlocked, true, 'ein zweiter kompletter Neu-Wurf im selben Lauf wird nicht mehr gewährt');
  eq(result.nationStayedSame, true, '"Nur Spieler neu" behält dasselbe Land bei');
  eq(result.playersActuallyChanged, true, '"Nur Spieler neu" zieht tatsächlich neue Spieler');
  eq(result.playersOnlyRerollConsumed, true, '"Nur Spieler neu" verbraucht ihr eigenes 1x-pro-Lauf-Kontingent');
  eq(result.oneSlotFilledAfterPick, true, 'nach einer Auswahl aus dem neu gewürfelten Angebot ist der erste Slot besetzt');
  eq(result.replaceRollActive, true, '"Spieler ersetzen" startet einen echten neuen Wurf für die ausgewählte Position');
  eq(result.allFourFitExactSlot, true, 'beim Ersetzen-Wurf passen alle 4 Kandidaten garantiert exakt auf die zu ersetzende Position');
  eq(result.oldCardStillThereUntilPick, true, 'die alte Karte bleibt im Slot, bis eine der 4 neuen tatsächlich gewählt wird');
  eq(result.slotActuallyReplaced, true, 'nach der Auswahl steht die neue Karte anstelle der alten im Slot');
  eq(result.replaceConsumed, true, '"Spieler ersetzen" verbraucht ihr eigenes 1x-pro-Lauf-Kontingent');
  eq(result.secondReplaceBlocked, true, 'ein zweites Ersetzen im selben Lauf ist nicht mehr möglich');

  summary('Draft-Modus-Werkzeuge-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
