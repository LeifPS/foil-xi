// Regressionstest: gemeldeter Bug "iPad-Spieler verliert regelmäßig seinen Spielstand" - kein erneutes
// Login nötig, tritt beim Öffnen/Fortsetzen der App auf. Ursache: initFirebase() lädt Firebase per
// dynamischem Import nach; scheitert das (z.B. direkt nach dem Aufwecken aus dem Hintergrund auf dem
// iPad, während WLAN/Mobilfunk noch neu verhandeln - siehe initFirebase's eigener Kommentar zu genau
// diesem Fall), bleibt fb===null für die ganze Sitzung. boot() ruft dann über den ?club=-URL-Fallback
// (der Normalfall für eine wiederkehrende Sitzung mit bereits bekanntem Vereinsnamen) proceedWithClubId()
// auf, die bei fb===null bisher UNGESCHÜTZT direkt init() startete - "no backend reachable, fall back
// straight into local/offline mode". Da window.storage in dieser Deployment nirgends gesetzt wird, war
// das nie ein echtes alternatives Backend, sondern nur der leere memoryStore: init() liest jeden Key als
// null zurück, hält das für "brandneuer Account" und rendert sofort ein Spiel mit 0 Coins/0 Karten -
// ganz ohne Login-Abfrage und ohne jede Fehlermeldung. Fix: bei fb===null (und ohne echtes
// window.storage) blockiert proceedWithClubId() jetzt mit showOfflineBootScreen() statt eine leere
// Fake-Session zu rendern.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    // Simuliert genau den gemeldeten Fall: initFirebase ist (schon vorher) gescheitert, fb bleibt null,
    // aber der Spieler hat einen bekannten Vereinsnamen (genau wie beim ?club=-URL-Fallback in boot()).
    fb = null;
    let initWasCalled = false;
    const realInit = init;
    init = async () => { initWasCalled = true; return realInit(); };

    await proceedWithClubId('test');

    const modalHTML = document.getElementById('modal-root').innerHTML;
    const showsOfflineScreen = modalHTML.includes('Keine Verbindung') && !!document.getElementById('offline-boot-retry');
    const profileStayedNull = profile === null; // init() (das die leere Fake-Session anlegen würde) darf gar nicht erst laufen

    init = realInit;
    document.getElementById('modal-root').innerHTML = '';

    // Der bewusst erhaltene Ausnahmefall: existiert doch einmal ein echtes alternatives Storage-Backend
    // (window.storage), bleibt der Offline-Fallback weiterhin erlaubt - kein Blockieren, kein Datenverlust-Risiko.
    window.storage = { get: async () => null, set: async () => true };
    let initCalledWithRealBackend = false;
    init = async () => { initCalledWithRealBackend = true; };
    await proceedWithClubId('test');
    init = realInit;
    delete window.storage;
    document.getElementById('modal-root').innerHTML = '';

    return { initWasCalled, showsOfflineScreen, profileStayedNull, initCalledWithRealBackend };
  }));

  console.log('Offline-Boot-Keine-Fake-Leere-Test');
  noErrors(errors, 'Seite');
  eq(result.initWasCalled, false, 'init() (das die leere Fake-Session anlegen würde) läuft NICHT, solange fb===null und kein echtes window.storage existiert');
  eq(result.showsOfflineScreen, true, 'stattdessen erscheint ein blockierender Offline-Bildschirm mit Retry-Button');
  eq(result.profileStayedNull, true, 'profile bleibt null statt eines fälschlich leeren Fake-Profils');
  eq(result.initCalledWithRealBackend, true, 'existiert ein echtes window.storage-Backend, bleibt der Offline-Modus weiterhin erlaubt (kein Blockieren)');

  summary('Offline-Boot-Keine-Fake-Leere-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
