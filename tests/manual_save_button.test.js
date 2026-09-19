// Regressionstest für den neuen manuellen "Jetzt sichern"-Knopf im Topbar (💾, neben Sound/Verein
// wechseln): der eigentliche Spielstand ist zwar schon nach jeder Aktion live gesichert (siehe sSet),
// aber das war für den Spieler bisher unsichtbar - der Knopf legt zusätzlich sofort einen eigenen
// Wiederherstellungspunkt in der Versionshistorie an (recordSaveSnapshot, sonst nur einmal pro Login)
// und bestätigt das Ergebnis explizit per Toast.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    clubId = 'testclub';
    profile = { coins: 500, careerWins: 3, prestige: 0 };
    collection = [{ uid: 'x', cardId: 1 }];
    managerCollection = []; packCollection = []; squad = null; squadPresets = [];
    const toasts = []; toast = (m) => toasts.push(m);
    const btn = document.getElementById('manual-save-btn');
    ok_manualSaveBtnExists = !!btn;

    // ---------- (1) Erfolgreicher manueller Save: legt einen Snapshot an, bestätigt per Toast, Knopf
    // ist danach wieder normal bedienbar (nicht dauerhaft "eingefroren"). ----------
    const writes = [];
    fb = {
      doc: (db, ...rest) => ({ path: [db && 'db', ...rest].join('/') }),
      setDoc: async (ref, val) => { writes.push({ path: ref.path, val }); },
      collection: (db, ...rest) => ({ path: rest.join('/') }),
      query: (...args) => args,
      orderBy: (f, d) => ({ f, d }),
      getDocs: async () => ({ docs: [] }), // keine alten Versionen zum Aufräumen
    };
    btn.textContent = '\u{1F4BE}';
    await performManualSave(btn);
    const snapshotWritten = writes.length === 1 && writes[0].val.profile === profile && writes[0].val.collection === collection;
    const successToastShown = toasts.some(t => t.includes('gesichert'));
    const iconRestoredAfterSuccess = btn.textContent === '\u{1F4BE}';
    const buttonReenabledAfterSuccess = btn.disabled === false;

    // Während des Speicherns selbst zeigt der Knopf sichtbar an, dass gerade etwas passiert (Sanduhr),
    // statt so auszusehen, als hätte der Klick gar nichts bewirkt.
    let iconDuringSave = null;
    fb.setDoc = async (ref, val) => { iconDuringSave = btn.textContent; writes.push({ path: ref.path, val }); };
    await performManualSave(btn);
    const showedBusyIconWhileSaving = iconDuringSave === '⏳';

    // Ein Doppelklick, während der erste Save noch läuft, löst KEINEN zweiten, überlappenden Save aus.
    let resolveSlowSave;
    fb.setDoc = async (ref, val) => new Promise(res => { resolveSlowSave = () => { writes.push({ path: ref.path, val }); res(); }; });
    const writesBeforeDoubleClick = writes.length;
    const firstSavePromise = performManualSave(btn);
    await new Promise(r => setTimeout(r, 5)); // sicherstellen, dass der erste Aufruf btn.disabled bereits gesetzt hat
    await performManualSave(btn); // sollte sofort no-op zurückkehren, weil btn.disabled
    const secondClickIgnoredWhileBusy = writes.length === writesBeforeDoubleClick; // noch nichts geschrieben (erster Save hängt noch in setDoc)
    resolveSlowSave();
    await firstSavePromise;
    const exactlyOneWriteAfterResolving = writes.length === writesBeforeDoubleClick + 1;

    // ---------- (2) Fehlgeschlagener Save (z.B. Verbindungsproblem): klarer Fehler-Toast statt eines
    // stillen Misserfolgs, der dem Spieler ein falsches Sicherheitsgefühl gäbe. ----------
    toasts.length = 0;
    fb.setDoc = async () => { throw new Error('network'); };
    await performManualSave(btn);
    const failureToastShown = toasts.some(t => t.toLowerCase().includes('fehlgeschlagen'));
    const noFalseSuccessClaimOnFailure = !toasts.some(t => t.includes('gesichert'));
    const buttonReenabledAfterFailure = btn.disabled === false;

    return {
      manualSaveBtnExists: ok_manualSaveBtnExists,
      snapshotWritten, successToastShown, iconRestoredAfterSuccess, buttonReenabledAfterSuccess,
      showedBusyIconWhileSaving, secondClickIgnoredWhileBusy, exactlyOneWriteAfterResolving,
      failureToastShown, noFalseSuccessClaimOnFailure, buttonReenabledAfterFailure,
    };
  }));

  console.log('Manueller-Speichern-Knopf-Test');
  noErrors(errors, 'Seite');
  ok(result.manualSaveBtnExists, 'der Speichern-Knopf ist Teil des immer sichtbaren Topbars');
  eq(result.snapshotWritten, true, 'ein Klick legt sofort einen neuen Wiederherstellungspunkt mit dem aktuellen Spielstand an');
  ok(result.successToastShown, 'ein Erfolgs-Toast bestätigt dem Spieler, dass gerade wirklich gesichert wurde');
  eq(result.iconRestoredAfterSuccess, true, 'das Knopf-Icon kehrt nach dem Speichern zum Normalzustand zurück');
  eq(result.buttonReenabledAfterSuccess, true, 'der Knopf ist danach wieder normal bedienbar');
  eq(result.showedBusyIconWhileSaving, true, 'während des Speicherns zeigt der Knopf sichtbar an, dass gerade etwas passiert');
  eq(result.secondClickIgnoredWhileBusy, true, 'ein Klick während eines laufenden Saves löst keinen zweiten, überlappenden Save aus');
  eq(result.exactlyOneWriteAfterResolving, true, 'am Ende wurde trotz Doppelklick nur genau einmal geschrieben');
  ok(result.failureToastShown, 'schlägt das Speichern fehl, sagt ein klarer Fehler-Toast das auch');
  ok(result.noFalseSuccessClaimOnFailure, 'bei einem Fehlschlag wird NIE fälschlich "gesichert" behauptet');
  eq(result.buttonReenabledAfterFailure, true, 'auch nach einem Fehlschlag bleibt der Knopf bedienbar (kein dauerhaftes Einfrieren)');

  summary('Manueller-Speichern-Knopf-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
