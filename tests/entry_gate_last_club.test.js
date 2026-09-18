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

    // (2c) Ganz ohne jede Historie auf diesem Gerät (allererster Besuch überhaupt) erscheint ebenfalls
    // keine Warnung - es gibt schlicht nichts, wovon der Name abweichen könnte.
    localStorage.removeItem('foil11-last-club');
    showSetPasswordModal('irgendeinverein');
    const noWarningWithoutHistory = !document.querySelector('#modal-root').innerHTML.includes('Achtung');

    localStorage.removeItem('foil11-last-club');
    document.getElementById('modal-root').innerHTML = '';

    return {
      emptyByDefault, prefilledFromLocalStorage, explicitPrefillWins, sanitizedFallback,
      warnsOnMismatch, noWarningWhenMatching, noWarningWithoutHistory,
    };
  }));

  console.log('Entry-Gate-Letzter-Verein-Test');
  noErrors(errors, 'Seite');
  eq(result.emptyByDefault, true, 'ohne jede Historie bleibt das Eingabefeld leer');
  eq(result.prefilledFromLocalStorage, true, 'ein zuvor gemerkter Vereinsname wird beim leeren Gate automatisch vorgeschlagen');
  eq(result.explicitPrefillWins, true, 'ein explizit übergebener prefill hat weiterhin Vorrang vor dem localStorage-Fallback');
  eq(result.sanitizedFallback, 'meinverein-92', 'ein kaputter/manipulierter localStorage-Wert wird über sanitizeClubId() normalisiert, nie roh übernommen');
  ok(result.warnsOnMismatch, 'showSetPasswordModal warnt explizit, wenn der neue Name vom zuletzt genutzten abweicht (Tippfehler-Schutz)');
  eq(result.noWarningWhenMatching, true, 'keine Warnung, wenn der Name exakt dem zuletzt genutzten entspricht');
  eq(result.noWarningWithoutHistory, true, 'keine Warnung ganz ohne Geräte-Historie (echter Erstbesuch)');

  summary('Entry-Gate-Letzter-Verein-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
