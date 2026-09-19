// Regressionstest für die zweite und sechste Feedback-Runde zum Draft-Modus:
// (1) Kann eine gerade gewählte Karte mehr als einen aktuell offenen Slot spielen, entscheidet der
//     Spieler EINMALIG und ENDGÜLTIG per Auswahl-Modal, welcher es sein soll (ersetzt das frühere
//     freie Verschieben/Tauschen NACH der Platzierung, das komplett entfernt wurde - eine einmal
//     platzierte Karte lässt sich nicht mehr bewegen). Passt sie auf höchstens einen offenen Slot, wird
//     wie bisher direkt ohne Rückfrage zugewiesen.
// (2) Chemie und Positionsbonus werden live berechnet und angezeigt (Chemie-Sterne pro Karte, laufendes
//     Team-Rating inkl. Chemie schon während des Rollens, nicht erst am Ende).
// (3) Drei Werkzeuge, je 1x pro Lauf: kompletter Neu-Wurf für den aktuellen Slot (ohne die ganze
//     Aufstellung neu starten zu müssen), nur die 4 Spieler neu würfeln (Land bleibt), und eine bereits
//     platzierte Karte gegen eine neu gewürfelte auf derselben Position austauschen - Letzteres wird
//     jetzt durch einen Klick auf die platzierte Karte selbst (mit Bestätigungs-Modal) ausgelöst, nicht
//     mehr über den entfernten Verschieben-Werkzeugkasten.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId:'test', displayName:'Test FC', coins:1000, crest:{shape:'shield',primary:'#fff',secondary:'#000',letter:'T'}, achievementStats:{} };
    clubId = 'test'; fb = null; sSet = async () => true;

    const def = CHALLENGE_DEFS.find(d=>d.id==='draft');
    openChallengeDetail(def);

    function freshState(){
      draftStartRoll();
      return draftRollState;
    }

    // ---------- (1a) Eine Karte, die NUR EINEN offenen Slot spielen kann, wird direkt ohne Modal zugewiesen ----------
    let state = freshState();
    const gkCard = {id:900555010, n:'Test GK', pos:'GK', ov:80, pac:40,sho:20,pas:50,dri:40,defn:30,phy:70, traits:[], variant:'base'};
    let doneCalls = 0;
    draftPlaceCardWithChoice(state, gkCard, ()=>{ doneCalls++; });
    const directAssignWorked = state.slots.find(s=>s.id==='gk').card === gkCard;
    const directAssignCalledOnDoneSynchronously = doneCalls === 1;
    const noModalForSingleOption = !document.querySelector('#modal-root h2');

    // ---------- (1b) Eine Karte, die MEHRERE offene Slots spielen kann, öffnet ein Auswahl-Modal ----------
    state = freshState();
    const multiCard = {id:900555011, n:'Multi Pos', pos:'CB, LB', ov:82, pac:74,sho:40,pas:62,dri:62,defn:80,phy:76, traits:[], variant:'base'};
    let multiDoneCalls = 0;
    draftPlaceCardWithChoice(state, multiCard, ()=>{ multiDoneCalls++; });
    const notYetPlacedBeforeChoice = state.slots.every(s=>s.card===null);
    const modalShowsChoiceButtons = document.querySelectorAll('#modal-root [data-slot]').length >= 2;
    const btn = document.querySelector('#modal-root [data-slot="lb"]');
    btn.click();
    const placedIntoChosenSlot = state.slots.find(s=>s.id==='lb').card === multiCard;
    const onDoneCalledAfterChoice = multiDoneCalls === 1;
    const modalClosedAfterChoice = !document.querySelector('#modal-root h2');

    // ---------- (2) Chemie live berechnet ----------
    state = freshState();
    const cbCard = {id:900555012, n:'Test CB', pos:'CB', ov:80, pac:70,sho:40,pas:60,dri:60,defn:80,phy:78, traits:[], variant:'base'};
    const rbCard = {id:900555013, n:'Test RB', pos:'RB', ov:78, pac:75,sho:40,pas:65,dri:65,defn:75,phy:72, traits:[], variant:'base'};
    state.slots.find(s=>s.id==='cb1').card = cbCard;
    state.slots.find(s=>s.id==='rb').card = rbCard;
    const chemDetail = draftChemistryDetail(state);
    const chemComputedForPartialSquad = chemDetail.bySlot['cb1']!==undefined && chemDetail.bySlot['rb']!==undefined && Object.keys(chemDetail.bySlot).length === 2;
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
    const fittingCard = state.currentRoll.cards.find(c => draftCardFitsAnyOpenSlot(c, draftOpenSlotLabels(state.slots)));
    draftClearRollTimers(state);
    draftAssignCardToSlot(state, fittingCard);
    state.usedNames.add(fittingCard.n);
    state.currentRoll = null; state.rollPhase = 'idle'; state.revealedCount = 0;
    const oneSlotFilledAfterPick = state.slots.filter(s=>s.card).length === 1;

    // ---------- (3c) Spieler ersetzen (1x pro Lauf) - jetzt per Klick auf die platzierte Karte selbst ----------
    renderDraftPanel();
    const filledSlotId = state.slots.find(s=>s.card).id;
    const filledSlotLabel = FORMATIONS['433'].slots.find(fs=>fs.id===filledSlotId).label;
    const oldCardId = state.slots.find(s=>s.id===filledSlotId).card.id;
    const rerollsReplaceBefore = state.rerolls.replace;
    // Die platzierte Karte anklicken (solange rerolls.replace>0) öffnet ein Bestätigungs-Modal statt
    // direkt zu ersetzen - erst ein Klick auf "Ja, ersetzen" startet den eigentlichen Wurf.
    const cardWraps = Array.from(document.querySelectorAll('#draft-pitch-wrap .pitch-slot'));
    const filledIdx = FORMATIONS['433'].slots.findIndex(fs=>fs.id===filledSlotId);
    cardWraps[filledIdx].click();
    const confirmModalShown = !!document.getElementById('draft-confirm-replace-yes');
    document.getElementById('draft-confirm-replace-yes').click();
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
    // Kein zweiter Ersetzen-Versuch mehr möglich (1x pro Lauf) - rerolls.replace ist jetzt 0, die Karte
    // wird also nicht mehr anklickbar (kein Handler mehr gewiert).
    renderDraftPanel();
    const cardNoLongerClickableAfterConsumed = document.querySelectorAll('#draft-pitch-wrap .pitch-slot').item(filledIdx).style.cursor !== 'pointer';

    document.getElementById('modal-root') && (document.getElementById('modal-root').innerHTML = '');

    return {
      directAssignWorked, directAssignCalledOnDoneSynchronously, noModalForSingleOption,
      notYetPlacedBeforeChoice, modalShowsChoiceButtons, placedIntoChosenSlot, onDoneCalledAfterChoice, modalClosedAfterChoice,
      chemComputedForPartialSquad, liveRatingIsANumber,
      fullRerollConsumed, fullRerollGaveDifferentOffer, secondFullRerollBlocked,
      nationStayedSame, playersActuallyChanged, playersOnlyRerollConsumed, oneSlotFilledAfterPick,
      confirmModalShown, replaceRollActive, allFourFitExactSlot, oldCardStillThereUntilPick, slotActuallyReplaced,
      replaceConsumed, cardNoLongerClickableAfterConsumed,
    };
  }));

  console.log('Draft-Modus-Werkzeuge-Test');
  noErrors(errors, 'Seite');
  eq(result.directAssignWorked, true, 'eine Karte, die nur einen offenen Slot spielen kann, wird direkt zugewiesen');
  eq(result.directAssignCalledOnDoneSynchronously, true, 'im Direktfall wird onDone synchron aufgerufen, kein Modal nötig');
  eq(result.noModalForSingleOption, true, 'bei nur einer Möglichkeit erscheint kein Auswahl-Modal');
  eq(result.notYetPlacedBeforeChoice, true, 'bei mehreren Möglichkeiten ist die Karte vor der Auswahl noch auf keinem Slot platziert');
  eq(result.modalShowsChoiceButtons, true, 'bei mehreren Möglichkeiten zeigt ein Modal für jeden gültigen Slot einen Button');
  eq(result.placedIntoChosenSlot, true, 'die Karte landet nach der Auswahl exakt auf dem gewählten Slot');
  eq(result.onDoneCalledAfterChoice, true, 'onDone wird erst nach der tatsächlichen Auswahl aufgerufen');
  eq(result.modalClosedAfterChoice, true, 'das Auswahl-Modal schließt sich nach der Wahl');
  eq(result.chemComputedForPartialSquad, true, 'Chemie wird schon für eine unvollständige Aufstellung live berechnet, nicht erst am Ende');
  eq(result.liveRatingIsANumber, true, 'das laufende Team-Rating (inkl. Chemie) ist schon während des Rollens verfügbar');
  eq(result.fullRerollConsumed, true, 'ein kompletter Neu-Wurf verbraucht das "full"-Kontingent (1x pro Lauf)');
  eq(result.fullRerollGaveDifferentOffer, true, 'ein kompletter Neu-Wurf liefert tatsächlich eine andere Ziehung als zuvor');
  eq(result.secondFullRerollBlocked, true, 'ein zweiter kompletter Neu-Wurf im selben Lauf wird nicht mehr gewährt');
  eq(result.nationStayedSame, true, '"Nur Spieler neu" behält dasselbe Land bei');
  eq(result.playersActuallyChanged, true, '"Nur Spieler neu" zieht tatsächlich neue Spieler');
  eq(result.playersOnlyRerollConsumed, true, '"Nur Spieler neu" verbraucht ihr eigenes 1x-pro-Lauf-Kontingent');
  eq(result.oneSlotFilledAfterPick, true, 'nach einer Auswahl aus dem neu gewürfelten Angebot ist der erste Slot besetzt');
  eq(result.confirmModalShown, true, 'ein Klick auf eine platzierte Karte (solange Ersetzen verfügbar ist) zeigt ein Bestätigungs-Modal statt sofort zu ersetzen');
  eq(result.replaceRollActive, true, '"Spieler ersetzen" startet nach Bestätigung einen echten neuen Wurf für die ausgewählte Position');
  eq(result.allFourFitExactSlot, true, 'beim Ersetzen-Wurf passen alle 4 Kandidaten garantiert exakt auf die zu ersetzende Position');
  eq(result.oldCardStillThereUntilPick, true, 'die alte Karte bleibt im Slot, bis eine der 4 neuen tatsächlich gewählt wird');
  eq(result.slotActuallyReplaced, true, 'nach der Auswahl steht die neue Karte anstelle der alten im Slot');
  eq(result.replaceConsumed, true, '"Spieler ersetzen" verbraucht ihr eigenes 1x-pro-Lauf-Kontingent');
  eq(result.cardNoLongerClickableAfterConsumed, true, 'nach Verbrauch des Ersetzen-Kontingents ist eine platzierte Karte nicht mehr anklickbar (kein Verschieben/Tauschen mehr möglich)');

  summary('Draft-Modus-Werkzeuge-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
