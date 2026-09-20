// Regressionstest für den gemeldeten Bug: "Wenn man im Draft-Modus eine Karte auswählt und von dem
// Modal wo man die Position auswählt wegklickt, dann darf man eine neue Karte und neues Land erhalten
// ohne dass man von vorne anfängt oder ein Powerup benutzt."
//
// Ursache: draftPlaceCardWithChoice() öffnet den Positions-Auswahl-Dialog erst NACHDEM der Aufrufer
// (renderDraftPanel()'s Klick-Handler) state.currentRoll bereits geleert und rollPhase auf 'idle'
// zurückgesetzt hat - die gewürfelte Karte ist also zu diesem Zeitpunkt schon "verbraucht" und wird nur
// noch über den offenen Dialog tatsächlich verteilt. Ein Wegklicken (Hintergrund-Klick oder Escape -
// beides von openModal()/dem globalen Escape-Handler standardmäßig unterstützt) schloss den Dialog
// bisher trotzdem, OHNE die Karte irgendeinem Slot zuzuweisen: die Karte verschwand spurlos, und weil
// der Lauf bereits als "idle" galt, konnte sofort kostenlos weitergewürfelt werden (neue Karte, neues
// Land) - ganz ohne Neustart oder Verbrauch eines der drei Werkzeuge.
// Fix: openModal(html, {dismissable:false}) unterdrückt für genau diesen Dialog Hintergrund-Klick UND
// Escape, sodass die im Dialogtext ohnehin schon angekündigte "einmalige, endgültige Wahl" auch
// tatsächlich erzwungen wird - der Spieler MUSS eine Position wählen, bevor es weitergeht.
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

    const multiCard = {id:900555099, n:'Dismiss Test', pos:'CB, LB', ov:82, pac:74,sho:40,pas:62,dri:62,defn:80,phy:76, traits:[], variant:'base'};
    let doneCalls = 0;
    draftPlaceCardWithChoice(state, multiCard, ()=>{ doneCalls++; });
    const modalShownInitially = !!document.querySelector('#modal-root [data-slot]');

    // ---------- (1) Klick auf den Hintergrund (außerhalb der Modal-Box) darf den Dialog NICHT schließen ----------
    document.getElementById('modal-overlay').click(); // simuliert einen Klick direkt auf den Overlay-Hintergrund
    const modalStillShownAfterBackgroundClick = !!document.querySelector('#modal-root [data-slot]');
    const cardStillUnplacedAfterBackgroundClick = state.slots.every(s => s.card === null);
    const onDoneNotCalledAfterBackgroundClick = doneCalls === 0;

    // ---------- (2) Escape darf den Dialog ebenfalls NICHT schließen ----------
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
    const modalStillShownAfterEscape = !!document.querySelector('#modal-root [data-slot]');
    const cardStillUnplacedAfterEscape = state.slots.every(s => s.card === null);
    const onDoneNotCalledAfterEscape = doneCalls === 0;

    // ---------- (3) Die eigentliche, gewollte Auswahl funktioniert weiterhin ganz normal ----------
    document.querySelector('#modal-root [data-slot="lb"]').click();
    const placedAfterActualChoice = state.slots.find(s=>s.id==='lb').card === multiCard;
    const doneCalledAfterActualChoice = doneCalls === 1;
    const modalClosedAfterActualChoice = !document.querySelector('#modal-root [data-slot]');

    // ---------- (4) Ganz normale, dismissable Modals (der überwiegende Regelfall im Spiel) schließen
    // sich weiterhin wie gewohnt per Hintergrund-Klick UND Escape - der Fix betrifft NUR explizit als
    // dismissable:false markierte Dialoge. ----------
    openModal('<h2>Normales Modal</h2>');
    document.getElementById('modal-overlay').click();
    const normalModalClosesOnBackgroundClick = !document.getElementById('modal-root').innerHTML.trim();

    openModal('<h2>Noch ein normales Modal</h2>');
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
    const normalModalClosesOnEscape = !document.getElementById('modal-root').innerHTML.trim();

    document.getElementById('modal-root').innerHTML = '';

    return {
      modalShownInitially,
      modalStillShownAfterBackgroundClick, cardStillUnplacedAfterBackgroundClick, onDoneNotCalledAfterBackgroundClick,
      modalStillShownAfterEscape, cardStillUnplacedAfterEscape, onDoneNotCalledAfterEscape,
      placedAfterActualChoice, doneCalledAfterActualChoice, modalClosedAfterActualChoice,
      normalModalClosesOnBackgroundClick, normalModalClosesOnEscape,
    };
  }));

  console.log('Draft-Modus-Positionswahl-Wegklick-Test');
  noErrors(errors, 'Seite');
  eq(result.modalShownInitially, true, 'bei mehreren Möglichkeiten öffnet sich der Positions-Auswahl-Dialog');
  eq(result.modalStillShownAfterBackgroundClick, true, 'ein Klick auf den Hintergrund schließt den Positions-Dialog NICHT mehr');
  eq(result.cardStillUnplacedAfterBackgroundClick, true, 'die Karte bleibt nach einem Hintergrund-Klick unplatziert, statt spurlos zu verschwinden');
  eq(result.onDoneNotCalledAfterBackgroundClick, true, 'onDone wird durch einen Hintergrund-Klick nicht ausgelöst');
  eq(result.modalStillShownAfterEscape, true, 'Escape schließt den Positions-Dialog ebenfalls NICHT mehr');
  eq(result.cardStillUnplacedAfterEscape, true, 'die Karte bleibt auch nach Escape unplatziert');
  eq(result.onDoneNotCalledAfterEscape, true, 'onDone wird durch Escape nicht ausgelöst');
  eq(result.placedAfterActualChoice, true, 'eine tatsächliche Auswahl platziert die Karte weiterhin korrekt auf dem gewählten Slot');
  eq(result.doneCalledAfterActualChoice, true, 'onDone wird nach der echten Auswahl ganz normal aufgerufen');
  eq(result.modalClosedAfterActualChoice, true, 'nach der echten Auswahl schließt sich der Dialog wie gewohnt');
  eq(result.normalModalClosesOnBackgroundClick, true, 'gewöhnliche Modals schließen sich weiterhin ganz normal per Hintergrund-Klick');
  eq(result.normalModalClosesOnEscape, true, 'gewöhnliche Modals schließen sich weiterhin ganz normal per Escape');

  summary('Draft-Modus-Positionswahl-Wegklick-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
