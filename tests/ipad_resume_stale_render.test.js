// Regressionstest für die drei gemeldeten iPad-Symptome (mehrmals auf "Herausforderungen" klicken
// müssen, Ladebildschirm bei App-Wechsel, Kader-Kartenklick öffnet das Auswahlfenster scheinbar auf
// dem falschen Tab): iPadOS legt die Netzwerkverbindung im Hintergrund schlafen, sodass der ERSTE
// Firestore-Aufruf nach dem Zurückkommen mehrere Sekunden hängen kann. Zwei konkrete, dadurch
// aufgedeckte Bugs:
// (1) renderChallengeGrid() hielt eine Referenz auf #challenge-grid VOR einem await - tippt man während
//     dieser Wartezeit die Herausforderungen erneut an, baut renderSBCList() ein KOMPLETT NEUES
//     #challenge-grid-Element - der erste, jetzt veraltete Aufruf schreibt am Ende unsichtbar in den
//     losgelösten alten Knoten, nur der zweite Aufruf füllt sichtbar das tatsächlich angezeigte Grid.
// (2) openPicker()/openManagerPicker() öffneten das Auswahl-Modal erst NACH zwei potenziell langsamen
//     Firestore-Abrufen, unabhängig davon, ob der Spieler in der Zwischenzeit längst den Tab gewechselt
//     hat (openModal()/#modal-root zeichnen unabhängig vom aktuellen Tab) - das Fenster poppt dann über
//     dem inzwischen ausgewählten, komplett anderen Tab auf.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId:'test', displayName:'Test FC', coins:1000, crest:{shape:'shield',primary:'#fff',secondary:'#000',letter:'T'}, achievementStats:{} };
    clubId = 'test'; fb = null; sSet = async () => true;
    collection = []; managerCollection = [];
    squad = { formation:'433', slots:{}, managerUid:null, tactics:{...DEFAULT_TACTICS} };

    // ---------- (1) renderChallengeGrid: ein veralteter Aufruf schreibt NICHT mehr in ein Element,
    // das inzwischen durch einen neueren Aufruf ersetzt wurde ----------
    let resolvers = [];
    const realGetExternalLockedUids = getExternalLockedUids;
    getExternalLockedUids = () => new Promise(res => { resolvers.push(res); });

    const view = document.getElementById('view');
    renderSBCList(view); // 1. Aufruf, hängt in getExternalLockedUids()
    await new Promise(r => setTimeout(r, 10));
    const firstGridRef = document.getElementById('challenge-grid');
    const showsLoadingPlaceholder = firstGridRef.textContent.includes('Lädt');

    renderSBCList(view); // 2. Aufruf (z.B. erneutes Antippen) - view.innerHTML wird komplett ersetzt
    await new Promise(r => setTimeout(r, 10));
    const secondGridRef = document.getElementById('challenge-grid');
    const gridWasReplaced = firstGridRef !== secondGridRef;

    // Der zweite (neuere) Aufruf löst zuerst auf - genau das tatsächlich angezeigte Grid wird gefüllt.
    resolvers[1](new Set());
    await new Promise(r => setTimeout(r, 10));
    const secondCallFilledAttachedGrid = document.getElementById('challenge-grid') === secondGridRef
      && !document.getElementById('challenge-grid').textContent.includes('Lädt');

    // Jetzt löst der ERSTE (veraltete) Aufruf auf - er darf das aktuell angezeigte Grid NICHT nochmal
    // leeren/neu befüllen (das wäre sichtbares Flackern) und NICHT in den längst losgelösten alten
    // Knoten schreiben, als wäre das noch relevant.
    const attachedContentBeforeStaleResolve = document.getElementById('challenge-grid').innerHTML;
    resolvers[0](new Set());
    await new Promise(r => setTimeout(r, 10));
    const attachedGridUnchangedByStaleCall = document.getElementById('challenge-grid').innerHTML === attachedContentBeforeStaleResolve;
    const firstGridStillDetached = !document.body.contains(firstGridRef) || firstGridRef !== document.getElementById('challenge-grid');

    getExternalLockedUids = realGetExternalLockedUids;

    // ---------- (2) openPicker: bricht ab, wenn der Tab währenddessen gewechselt wurde ----------
    const fakeGkCard = {id:900333001, n:'Picker Test GK', pos:'GK', ov:80, pac:40,sho:20,pas:50,dri:40,defn:30,phy:70, traits:[], variant:'base', club:'FC Test', nat:'Germany', lg:'Bundesliga'};
    BY_ID.set(fakeGkCard.id, fakeGkCard);
    collection = [{uid:'uid-gk-1', cardId:fakeGkCard.id, xp:0}];
    currentTab = 'squad';
    let lockResolvers = [];
    const realGetMarketLockedUidsOnly = getMarketLockedUidsOnly;
    getExternalLockedUids = () => new Promise(res => { lockResolvers.push(res); });
    getMarketLockedUidsOnly = () => Promise.resolve(new Set());
    document.getElementById('modal-root').innerHTML = '';

    const gkSlot = FORMATIONS['433'].slots.find(s => s.id === 'gk');
    const pickerPromise = openPicker(gkSlot); // hängt in getExternalLockedUids()
    await new Promise(r => setTimeout(r, 10));
    currentTab = 'index'; // Spieler wechselt den Tab, während der Picker noch lädt
    lockResolvers[0](new Set());
    await pickerPromise;
    const modalDidNotOpenAfterTabChange = document.getElementById('modal-root').innerHTML.trim() === '';

    // Kontrollfall: bleibt der Tab unverändert, öffnet sich der Picker ganz normal.
    currentTab = 'squad';
    const pickerPromise2 = openPicker(gkSlot);
    await new Promise(r => setTimeout(r, 10));
    lockResolvers[1](new Set());
    await pickerPromise2;
    const modalOpensWhenTabUnchanged = document.getElementById('modal-root').innerHTML.includes('auswählen');

    getExternalLockedUids = realGetExternalLockedUids;
    getMarketLockedUidsOnly = realGetMarketLockedUidsOnly;
    document.getElementById('modal-root').innerHTML = '';

    return {
      showsLoadingPlaceholder, gridWasReplaced, secondCallFilledAttachedGrid,
      attachedGridUnchangedByStaleCall, firstGridStillDetached,
      modalDidNotOpenAfterTabChange, modalOpensWhenTabUnchanged,
    };
  }));

  console.log('iPad-Resume-Stale-Render-Test');
  noErrors(errors, 'Seite');
  eq(result.showsLoadingPlaceholder, true, 'die Herausforderungen-Liste zeigt während des Ladens sichtbar "Lädt…" statt leer/eingefroren zu wirken');
  eq(result.gridWasReplaced, true, 'ein erneuter Tab-Besuch baut ein komplett neues #challenge-grid-Element');
  eq(result.secondCallFilledAttachedGrid, true, 'der neuere (zweite) Aufruf füllt das tatsächlich angezeigte Grid');
  eq(result.attachedGridUnchangedByStaleCall, true, 'ein nachträglich auflösender, veralteter erster Aufruf verändert das angezeigte Grid NICHT mehr (kein Flackern/Doppel-Rendern)');
  ok(result.firstGridStillDetached, 'die alte, losgelöste Grid-Referenz aus dem ersten Aufruf ist nicht mehr die aktuell angezeigte');
  eq(result.modalDidNotOpenAfterTabChange, true, 'wechselt der Spieler während des Ladens den Tab, öffnet sich das Auswahlfenster NICHT mehr nachträglich auf dem falschen Tab');
  eq(result.modalOpensWhenTabUnchanged, true, 'bleibt der Tab unverändert, öffnet sich das Auswahlfenster weiterhin ganz normal');

  summary('iPad-Resume-Stale-Render-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
