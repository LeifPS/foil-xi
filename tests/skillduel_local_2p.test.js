// Regressionstest für den lokalen Zwei-Spieler-Modus (zwei Controller an einem Gerät, kein zweiter
// Account/keine Internetverbindung nötig). Kernanforderung: die physische USB-/Bluetooth-Reihenfolge
// der Controller ist nicht vorhersagbar, also entscheidet NICHT der Array-Index über Spieler 1/2,
// sondern wer zuerst einen Knopf drückt (siehe openLocalTwoPlayerSetup) - danach steuert jeder
// Controller GARANTIERT nur noch seinen eigenen Spieler, nie den des anderen.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const cardA = {id:900000111, n:'P1-Karte', pos:'ST', ov:88, pac:80,sho:75,pas:75,dri:75,defn:40,phy:75, traits:['Schneller Schritt'], variant:'base'};
    const cardB = {id:900000112, n:'P2-Karte', pos:'ST', ov:88, pac:80,sho:75,pas:75,dri:75,defn:40,phy:75, traits:['Grätsche'], variant:'base'};
    BY_ID.set(cardA.id, cardA); BY_ID.set(cardB.id, cardB);
    const savedCollection = collection;
    collection = [{uid:'sk-local-p1', cardId:cardA.id, xp:0}, {uid:'sk-local-p2', cardId:cardB.id, xp:0}];

    // Absichtlich NICHT an Index 0/1, um zu beweisen, dass die Zuordnung wirklich per Tastendruck
    // läuft statt einfach nach Array-Reihenfolge zu sortieren.
    const gpA = {index:3, id:'Pad A', axes:[0,0], buttons:Array.from({length:8},()=>({pressed:false}))};
    const gpB = {index:1, id:'Pad B', axes:[0,0], buttons:Array.from({length:8},()=>({pressed:false}))};
    navigator.getGamepads = () => [null, gpB, null, gpA];

    // Zu wenige Controller -> darf gar nicht erst starten.
    navigator.getGamepads = () => [null];
    let openedWithOnlyOnePad = false;
    const originalToast = window.toast;
    window.toast = (msg)=>{ if(msg.includes('zwei Controller')) openedWithOnlyOnePad = true; };
    openLocalTwoPlayerSetup();
    const modalOpenedWithOnePad = !!document.getElementById('sk-local-p1-status');
    window.toast = originalToast;

    navigator.getGamepads = () => [null, gpB, null, gpA];
    openLocalTwoPlayerSetup();
    await new Promise(r=>setTimeout(r, 30));
    const modalShown = !!document.getElementById('sk-local-p1-status');

    // Pad B drückt zuerst -> Spieler 1.
    gpB.buttons[0].pressed = true;
    await new Promise(r=>setTimeout(r, 40));
    gpB.buttons[0].pressed = false;
    await new Promise(r=>setTimeout(r, 20));
    const p1AssignedText = document.getElementById('sk-local-p1-status').textContent;

    // Pad A drückt danach -> Spieler 2.
    gpA.buttons[2].pressed = true;
    await new Promise(r=>setTimeout(r, 40));
    gpA.buttons[2].pressed = false;
    await new Promise(r=>setTimeout(r, 40));

    const pickerTitleP1 = document.querySelector('h2')?.textContent;
    document.querySelector('.sk-pick-tile').click();
    await new Promise(r=>setTimeout(r, 40));
    const pickerTitleP2 = document.querySelector('h2')?.textContent;
    document.querySelector('.sk-pick-tile').click();
    await new Promise(r=>setTimeout(r, 80));

    const modeIsLocal = skillDuelState && skillDuelState.mode==='local';
    const p1GamepadIsPadB = skillDuelState && skillDuelState.p1GamepadIndex===1;
    const p2GamepadIsPadA = skillDuelState && skillDuelState.p2GamepadIndex===3;
    const touchNeverCreated = !document.querySelector('.sk-touch');
    const gamepadHintNeverShown = !document.getElementById('sk-gamepad-hint') || document.getElementById('sk-gamepad-hint').style.display==='none';

    const p1xBefore = skillDuelState.engine.p1.x, p2xBefore = skillDuelState.engine.p2.x;
    gpA.axes[0] = 0.9; // Pad A steuert jetzt Spieler 2 - Spieler 1 (Pad B) darf sich NICHT mitbewegen
    await new Promise(r=>setTimeout(r, 250));
    const p1Unmoved = skillDuelState.engine.p1.x === p1xBefore;
    const p2Moved = skillDuelState.engine.p2.x > p2xBefore;

    document.getElementById('sk-close-btn').click();
    const stateNullAfterClose = skillDuelState===null;

    collection = savedCollection;
    BY_ID.delete(cardA.id); BY_ID.delete(cardB.id);

    return {
      openedWithOnlyOnePad, modalOpenedWithOnePad, modalShown,
      p1AssignedText, pickerTitleP1, pickerTitleP2,
      modeIsLocal, p1GamepadIsPadB, p2GamepadIsPadA, touchNeverCreated, gamepadHintNeverShown,
      p1Unmoved, p2Moved, stateNullAfterClose,
    };
  }));

  console.log('Skill-Duell-Lokal-Zwei-Spieler-Test');
  noErrors(errors, 'Seite');
  eq(result.openedWithOnlyOnePad, true, 'mit nur einem Controller wird ein Hinweis gezeigt statt zu starten');
  eq(result.modalOpenedWithOnePad, false, 'die Zuordnungs-Ansicht öffnet sich nicht, wenn weniger als zwei Controller verbunden sind');
  eq(result.modalShown, true, 'mit zwei Controllern öffnet sich die Zuordnungs-Ansicht');
  eq(result.p1AssignedText, 'Controller 2 zugeordnet ✓', 'der zuerst drückende Controller (Pad B, Index 1) wird Spieler 1 zugeordnet');
  eq(result.pickerTitleP1, 'Spieler 1: Karte wählen', 'nach der Zuordnung wählt zuerst Spieler 1 seine Karte');
  eq(result.pickerTitleP2, 'Spieler 2: Karte wählen', 'danach wählt Spieler 2 seine Karte');
  eq(result.modeIsLocal, true, 'das gestartete Match läuft im Modus "local"');
  eq(result.p1GamepadIsPadB, true, 'Spieler 1 ist wirklich an den zuerst drückenden Controller gebunden (Index nach Tastendruck, nicht nach Array-Position)');
  eq(result.p2GamepadIsPadA, true, 'Spieler 2 ist an den zweiten Controller gebunden');
  eq(result.touchNeverCreated, true, 'im lokalen Zwei-Spieler-Modus wird kein Touch-Overlay erzeugt (zwei echte Controller sind da)');
  eq(result.gamepadHintNeverShown, true, 'die Ein-Controller-Legende (für den Bot/Online-Modus) wird im lokalen Zwei-Spieler-Modus nicht angezeigt');
  eq(result.p1Unmoved, true, 'Spieler 1 bewegt sich NICHT mit, wenn nur der Controller von Spieler 2 den Stick bewegt');
  eq(result.p2Moved, true, 'Spieler 2 bewegt sich, wenn sein eigener Controller den Stick bewegt');
  eq(result.stateNullAfterClose, true, '"Verlassen" räumt den lokalen Zwei-Spieler-Match-Zustand vollständig auf');

  summary('Skill-Duell-Lokal-Zwei-Spieler-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
