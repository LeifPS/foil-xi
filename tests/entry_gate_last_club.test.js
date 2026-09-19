// Regressionstest: gemeldeter Bug "iPad-Spieler verliert regelmäßig seinen Spielstand" - vor allem bei
// Nutzung als Homescreen-Icon räumt iOS die persistierte Firebase-Auth-Session (IndexedDB) für
// eigenständige Web-Apps deutlich aggressiver weg als für normale Safari-Tabs. Der Spieler landet dann
// öfter am leeren Eingabe-Gate (showEntryGate) und muss seinen Vereinsnamen aus dem Gedächtnis erneut
// eintippen - ein Tippfehler/eine andere Schreibweise dabei führt NICHT zu einer Fehlermeldung, sondern
// zu showSetPasswordModal() für eine zufällig noch unbenutzte Variante des Namens: der Spieler setzt
// dort scheinbar ganz normal sein Passwort und landet in einem brandneuen, leeren Account, während sein
// echter Spielstand unter der ursprünglichen Schreibweise unangetastet bleibt.
// Fix: (1) rememberLastClubId() merkt sich den zuletzt erfolgreich genutzten Vereinsnamen rein lokal
// (kein Passwort), showEntryGate() schlägt ihn als Vorbelegung vor, statt ein leeres Feld zu zeigen -
// verhindert die meisten Tippfehler von vornherein. (2) showSetPasswordModal() warnt zusätzlich
// explizit, wenn der gerade eingegebene Name vom zuletzt genutzten abweicht, statt stillschweigend
// "neuer Verein" anzunehmen.
// Zweiter, tatsächlich gemeldeter Vorfall genau dieser Art ("Reset - alle Einstellungen weg, auch der
// Champions-League-Zähler, als wäre ein komplett neuer Verein angelegt worden"): auf einem Gerät OHNE
// jede lokale Historie (frisch, oder Browser-Daten gerade erst geleert) feuerte die obige Warnung NIE -
// ausgerechnet im Moment mit dem höchsten Tippfehler-Risiko. (3) Ein schwächerer, nicht alarmierender
// Hinweis erscheint daher jetzt IMMER beim Neu-Anlegen, auch ganz ohne lokale Historie.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    localStorage.removeItem('foil11-last-club');

    // (1a) Ohne jede Vorbelegung/Historie bleibt das Feld leer wie bisher.
    showEntryGate();
    const emptyByDefault = document.getElementById('gate-input').value === '';

    // (1b) rememberLastClubId() gefolgt von einem leeren showEntryGate()-Aufruf (kein expliziter
    // prefill, wie es beim echten Boot ohne ?club=-URL und ohne restoredAuthUser passiert) schlägt den
    // gemerkten Namen als Vorbelegung vor.
    rememberLastClubId('meinverein92');
    showEntryGate();
    const prefilledFromLocalStorage = document.getElementById('gate-input').value === 'meinverein92';

    // (1c) Ein explizit übergebener prefill (z.B. von "Anderen Verein wählen" mit vorbelegtem Namen)
    // gewinnt weiterhin gegen den localStorage-Fallback.
    showEntryGate('expliziterverein');
    const explicitPrefillWins = document.getElementById('gate-input').value === 'expliziterverein';

    // (1d) Ein manipulierter/kaputter localStorage-Wert (z.B. Großschreibung/Sonderzeichen) wird über
    // sanitizeClubId() genauso normalisiert wie eine echte Nutzereingabe, nie roh übernommen.
    localStorage.setItem('foil11-last-club', 'MeinVerein! 92');
    showEntryGate();
    const sanitizedFallback = document.getElementById('gate-input').value;

    // (2a) Weicht der Name, für den gerade ein neues Passwort gesetzt werden soll, vom zuletzt
    // genutzten ab, warnt der Screen explizit davor statt es kommentarlos zu erlauben.
    localStorage.setItem('foil11-last-club', 'meinverein92');
    showSetPasswordModal('meinverein92tippfehler');
    const modalHTML = document.querySelector('#modal-root').innerHTML;
    const warnsOnMismatch = modalHTML.includes('meinverein92') && modalHTML.includes('meinverein92tippfehler');

    // (2b) Stimmt der Name exakt mit dem zuletzt genutzten überein (der ganz normale "endlich ein
    // Passwort setzen"-Fall bei einem wirklich neuen Verein), erscheint KEINE Warnung.
    localStorage.setItem('foil11-last-club', 'brandneuerverein');
    showSetPasswordModal('brandneuerverein');
    const noWarningWhenMatching = !document.querySelector('#modal-root').innerHTML.includes('Achtung');

    // (2c) Ganz ohne jede Historie auf diesem Gerät (allererster Besuch überhaupt, oder Browser-Daten
    // gerade erst geleert) erscheint KEINE der roten "Achtung"-Mismatch-Warnung (es gibt ja nichts,
    // wovon der Name nachweislich abweicht) - aber (3) ein schwächerer, nicht alarmierender
    // Rechtschreib-Hinweis erscheint trotzdem, weil genau dieser Moment das höchste Tippfehler-Risiko hat.
    localStorage.removeItem('foil11-last-club');
    showSetPasswordModal('irgendeinverein');
    const noHardWarningWithoutHistory = !document.querySelector('#modal-root').innerHTML.includes('Achtung');
    const softReminderShownWithoutHistory = document.querySelector('#modal-root').innerHTML.includes('irgendeinverein')
      && document.querySelector('#modal-root').innerHTML.toLowerCase().includes('schreibweise');

    localStorage.removeItem('foil11-last-club');
    document.getElementById('modal-root').innerHTML = '';

    return {
      emptyByDefault, prefilledFromLocalStorage, explicitPrefillWins, sanitizedFallback,
      warnsOnMismatch, noWarningWhenMatching, noHardWarningWithoutHistory, softReminderShownWithoutHistory,
    };
  }));

  console.log('Entry-Gate-Letzter-Verein-Test');
  noErrors(errors, 'Seite');
  eq(result.emptyByDefault, true, 'ohne jede Historie bleibt das Eingabefeld leer');
  eq(result.prefilledFromLocalStorage, true, 'ein zuvor gemerkter Vereinsname wird beim leeren Gate automatisch vorgeschlagen');
  eq(result.explicitPrefillWins, true, 'ein explizit übergebener prefill hat weiterhin Vorrang vor dem localStorage-Fallback');
  eq(result.sanitizedFallback, 'meinverein-92', 'ein kaputter/manipulierter localStorage-Wert wird über sanitizeClubId() normalisiert, nie roh übernommen');
  ok(result.warnsOnMismatch, 'showSetPasswordModal warnt explizit, wenn der neue Name vom zuletzt genutzten abweicht (Tippfehler-Schutz)');
  eq(result.noWarningWhenMatching, true, 'keine rote Achtung-Warnung, wenn der Name exakt dem zuletzt genutzten entspricht');
  eq(result.noHardWarningWithoutHistory, true, 'keine rote Achtung-Mismatch-Warnung ganz ohne Geräte-Historie (es gibt ja nichts, wovon der Name nachweislich abweicht)');
  eq(result.softReminderShownWithoutHistory, true, 'ganz ohne Geräte-Historie erscheint trotzdem ein schwächerer Rechtschreib-Hinweis, weil dieser Moment das höchste Tippfehler-Risiko hat (Bugfix für "Reset - alle Einstellungen weg, wie ein neuer Verein")');

  summary('Entry-Gate-Letzter-Verein-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
