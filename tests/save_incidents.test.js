// Regressionstest für das forensische Vorfalls-Protokoll (recordSaveIncident/flushQueuedSaveIncidents/
// openAdminSaveIncidentsModal): bei jedem bisher gemeldeten Datenverlust ("mindestens einmal täglich
// wird mein Verein gelöscht") war hinterher nicht mehr rekonstruierbar, WARUM das Spiel einen Account
// als leer/neu behandelt oder einen Schreibvorgang blockiert hat. Jetzt schreibt jede solche Stelle
// einen Eintrag mit vollem Kontext in eine eigene Collection (saveIncidents), sichtbar im Admin-Panel.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    clubId = 'testclub';
    localStorage.removeItem('foil11-queued-save-incidents');
    const writes = [];

    // ---------- (1) Ganz normaler Fall: fb verbunden -> sofortiger Write in saveIncidents ----------
    fb = {
      doc: (db, col, id) => ({ path: col + '/' + id }),
      setDoc: async (ref, val) => { writes.push({ path: ref.path, val }); return Promise.resolve(); },
    };
    recordSaveIncident('blocked-profile-collapse', { reason: 'careerWins 10 -> 0' });
    await new Promise(r => setTimeout(r, 10));
    const wroteToSaveIncidents = writes.length === 1 && writes[0].path.startsWith('saveIncidents/');
    const payload = writes[0] && writes[0].val;
    const clubIdRecorded = payload && payload.clubId === 'testclub';
    const kindRecorded = payload && payload.kind === 'blocked-profile-collapse';
    const detailRecorded = payload && payload.detail && payload.detail.reason === 'careerWins 10 -> 0';
    const contextRecorded = payload && typeof payload.ua === 'string' && typeof payload.online === 'boolean'
      && typeof payload.visibility === 'string' && typeof payload.msSincePageLoad === 'number';

    // Ein Vorfall für einen FREMDEN Account (forClubId) wird unter DESSEN clubId protokolliert, nicht
    // unter dem des gerade eingeloggten Schreibers - genau der Fall bei writeForeignProfileGuarded.
    recordSaveIncident('blocked-foreign-profile-collapse', { writtenBy: 'testclub' }, 'opferverein');
    await new Promise(r => setTimeout(r, 10));
    const foreignIncidentUnderVictimClub = writes.length === 2 && writes[1].val.clubId === 'opferverein';

    // ---------- (2) Ohne Verbindung (fb===null, z.B. offline-boot-blocked): nichts geht verloren, wird
    // stattdessen lokal zwischengespeichert. ----------
    fb = null;
    const writesBeforeOffline = writes.length;
    recordSaveIncident('offline-boot-blocked', {});
    const noWriteAttemptedWithoutFb = writes.length === writesBeforeOffline;
    const queuedLocally = JSON.parse(localStorage.getItem('foil11-queued-save-incidents') || '[]');
    const queuedCorrectly = queuedLocally.length === 1 && queuedLocally[0].kind === 'offline-boot-blocked';

    // ---------- (3) Sobald die Verbindung wieder da ist, wird der zwischengespeicherte Vorfall
    // nachgereicht (flushQueuedSaveIncidents, wie von init() beim nächsten Boot aufgerufen). ----------
    fb = {
      doc: (db, col, id) => ({ path: col + '/' + id }),
      setDoc: async (ref, val) => { writes.push({ path: ref.path, val }); return Promise.resolve(); },
    };
    flushQueuedSaveIncidents();
    await new Promise(r => setTimeout(r, 10));
    const flushedIncidentWritten = writes.length === writesBeforeOffline + 1;
    const flushedIncidentMarked = writes[writes.length - 1].val.flushedLate === true;
    const queueClearedAfterFlush = localStorage.getItem('foil11-queued-save-incidents') === null;

    // Ein Flush ohne irgendetwas in der Warteschlange (der Normalfall bei jedem Boot) tut einfach gar
    // nichts - kein leerer/kaputter Write.
    const writesBeforeEmptyFlush = writes.length;
    flushQueuedSaveIncidents();
    await new Promise(r => setTimeout(r, 10));
    const emptyFlushIsNoop = writes.length === writesBeforeEmptyFlush;

    // ---------- (4) Admin-Panel-Ansicht: Vorfälle werden nach Zeit absteigend sortiert angezeigt ----------
    const storedIncidents = [
      { id: 'a', data: () => ({ kind: 'blocked-profile-collapse', clubId: 'opferverein', at: 1000, detail: { reason: 'x' }, ua: 'UA-alt', online: true, visibility: 'visible', authed: true }) },
      { id: 'b', data: () => ({ kind: 'account-created', clubId: 'opferverein', at: 3000, detail: {}, ua: 'UA-neu', online: false, visibility: 'hidden', authed: false }) },
    ];
    fb = {
      collection: (db, col) => ({ col }),
      where: (field, op, val) => ({ field, op, val }),
      query: (...args) => args,
      getDocs: async () => ({ empty: false, docs: storedIncidents }),
    };
    await openAdminSaveIncidentsModal('opferverein');
    const modalHTML = document.querySelector('#modal-root').innerHTML;
    const showsBothIncidents = modalHTML.includes('Neuer, leerer Account angelegt') && modalHTML.includes('BLOCKIERT: Profil-Write hätte Fortschritt zurückgesetzt');
    // neuestes zuerst (at:3000 vor at:1000), obwohl die Query selbst unsortiert zurückkam.
    const sortedNewestFirst = modalHTML.indexOf('Neuer, leerer Account angelegt') < modalHTML.indexOf('BLOCKIERT: Profil-Write hätte Fortschritt zurückgesetzt');

    // Leere Historie zeigt einen klaren, unaufgeregten Hinweis statt einer leeren Liste.
    fb.getDocs = async () => ({ empty: true, docs: [] });
    await openAdminSaveIncidentsModal('sauberverein');
    const emptyStateShown = document.querySelector('#modal-root').innerHTML.includes('Keine Vorfälle protokolliert');

    document.getElementById('modal-root').innerHTML = '';

    return {
      wroteToSaveIncidents, clubIdRecorded, kindRecorded, detailRecorded, contextRecorded,
      foreignIncidentUnderVictimClub,
      noWriteAttemptedWithoutFb, queuedCorrectly,
      flushedIncidentWritten, flushedIncidentMarked, queueClearedAfterFlush, emptyFlushIsNoop,
      showsBothIncidents, sortedNewestFirst, emptyStateShown,
    };
  }));

  console.log('Vorfalls-Protokoll-Test');
  noErrors(errors, 'Seite');
  eq(result.wroteToSaveIncidents, true, 'ein Vorfall wird sofort in die saveIncidents-Collection geschrieben, wenn eine Verbindung besteht');
  eq(result.clubIdRecorded, true, 'der betroffene Verein wird im Vorfall festgehalten');
  eq(result.kindRecorded, true, 'die Art des Vorfalls wird festgehalten');
  eq(result.detailRecorded, true, 'zusätzliche Details zum Vorfall werden mitgespeichert');
  ok(result.contextRecorded, 'Gerät/Online-Status/Sichtbarkeit/Laufzeit werden mitprotokolliert - genau der Kontext, der bisher fehlte');
  eq(result.foreignIncidentUnderVictimClub, true, 'ein Vorfall bei einem Fremd-Schreibversuch wird unter dem BETROFFENEN Verein protokolliert, nicht dem des Schreibers');
  eq(result.noWriteAttemptedWithoutFb, true, 'ohne Verbindung wird kein Schreibversuch unternommen (der würde ohnehin scheitern)');
  eq(result.queuedCorrectly, true, 'stattdessen wird der Vorfall lokal zwischengespeichert, damit er nicht verloren geht');
  eq(result.flushedIncidentWritten, true, 'sobald die Verbindung wieder da ist, wird der zwischengespeicherte Vorfall nachgereicht');
  eq(result.flushedIncidentMarked, true, 'ein nachgereichter Vorfall ist als solcher erkennbar (flushedLate)');
  eq(result.queueClearedAfterFlush, true, 'die lokale Warteschlange wird nach dem Nachreichen geleert');
  eq(result.emptyFlushIsNoop, true, 'ein Flush ohne wartende Vorfälle tut nichts (kein leerer Write)');
  ok(result.showsBothIncidents, 'das Admin-Panel zeigt alle protokollierten Vorfälle eines Accounts mit Klartext-Bezeichnung');
  eq(result.sortedNewestFirst, true, 'die Vorfälle werden neueste zuerst angezeigt, unabhängig von der Reihenfolge aus der Query');
  eq(result.emptyStateShown, true, 'ohne jeden Vorfall erscheint ein klarer, beruhigender Hinweis statt einer leeren Liste');

  summary('Vorfalls-Protokoll-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
