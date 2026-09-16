// Regressionstest für "mach die UI 100x besser": deckt die sichtbaren/strukturellen Ergebnisse der
// Skill-Duell-UI-Politur ab, die sich automatisiert prüfen lassen (Farben/Layout selbst sind nicht
// sinnvoll zu testen, siehe README) - die neue Ergebnis-Anzeige (Badge/Titel-Klasse je nach Ausgang),
// den neuen "Nochmal spielen"-Button (nur im sicheren, rein lokalen Bot-Modus verfügbar, siehe
// skEndMatch-Kommentar) und die Tor-Anzeige, die jetzt über eine CSS-Klasse statt Inline-Opacity
// gesteuert wird (Voraussetzung für die neue Pop-Animation).
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const fakeCard = {id:900001101, n:'UI-Polish-Test', pos:'ST', ov:88, pac:75,sho:75,pas:70,dri:75,defn:40,phy:75, traits:[], variant:'base'};
    BY_ID.set(fakeCard.id, fakeCard);

    startSkillMatch(null, true, {hostName:'Ich', guestName:'AFK-Bot', hostPick:fakeCard, guestPick:SK_BOT_CARD}, {mode:'bot'});
    await new Promise(r=>setTimeout(r, 50));

    // ---------- Tor-Anzeige nutzt eine CSS-Klasse statt Inline-Opacity ----------
    const msgEl = document.getElementById('sk-msg');
    skillDuelState.engine.msg = {text:'TOR!', side:1, ts:Date.now()};
    skRender(document.getElementById('sk-canvas').getContext('2d'), skillDuelState.engine);
    const msgShowsViaClass = msgEl.classList.contains('show');
    skillDuelState.engine.msg = {text:'TOR!', side:1, ts:Date.now()-2000};
    skRender(document.getElementById('sk-canvas').getContext('2d'), skillDuelState.engine);
    const msgHidesViaClass = !msgEl.classList.contains('show');

    // ---------- Ergebnis-Anzeige: Sieg (mit Rematch, weil Bot-Modus rein lokal ist) ----------
    skillDuelState.engine.score = [3,1];
    skEndMatch(skillDuelState.engine, null, true, 'Ich', 'AFK-Bot', ()=>startSkillMatch(null, true, {hostName:'Ich', guestName:'AFK-Bot', hostPick:fakeCard, guestPick:SK_BOT_CARD}, {mode:'bot'}));
    await new Promise(r=>setTimeout(r, 30));
    const winBadge = document.querySelector('.sk-result-badge')?.textContent;
    const winTitleClass = document.querySelector('.sk-result-title')?.classList.contains('win');
    const rematchButtonExistsForBot = !!document.getElementById('sk-result-rematch');
    const scoreLineText = document.querySelector('.sk-result-score')?.textContent;

    // Rematch-Klick startet tatsächlich ein neues Match (schließt das Modal, öffnet das Overlay erneut).
    document.getElementById('sk-result-rematch').click();
    await new Promise(r=>setTimeout(r, 60));
    const rematchReopenedOverlay = !!document.getElementById('sk-overlay');
    const resultModalGoneAfterRematch = !document.querySelector('.sk-result');
    document.getElementById('sk-close-btn')?.click();

    // ---------- Ergebnis-Anzeige: Niederlage/Unentschieden bekommen jeweils eigene Klasse/Badge ----------
    startSkillMatch(null, true, {hostName:'Ich', guestName:'AFK-Bot', hostPick:fakeCard, guestPick:SK_BOT_CARD}, {mode:'bot'});
    await new Promise(r=>setTimeout(r, 30));
    skillDuelState.engine.score = [0,2];
    skEndMatch(skillDuelState.engine, null, true, 'Ich', 'AFK-Bot');
    await new Promise(r=>setTimeout(r, 30));
    const loseBadge = document.querySelector('.sk-result-badge')?.textContent;
    const loseTitleClass = document.querySelector('.sk-result-title')?.classList.contains('lose');
    // Ohne übergebene rematch-Funktion (wie es z.B. für Online-Matches der Fall wäre) darf der Button
    // gar nicht erst existieren - kein toter/kaputter Klick möglich.
    const noRematchButtonWithoutCallback = !document.getElementById('sk-result-rematch');
    document.getElementById('sk-result-close')?.click();

    BY_ID.delete(fakeCard.id);

    return {
      msgShowsViaClass, msgHidesViaClass,
      winBadge, winTitleClass, rematchButtonExistsForBot, scoreLineText,
      rematchReopenedOverlay, resultModalGoneAfterRematch,
      loseBadge, loseTitleClass, noRematchButtonWithoutCallback,
    };
  }));

  console.log('Skill-Duell-UI-Politur-Test');
  noErrors(errors, 'Seite');
  eq(result.msgShowsViaClass, true, 'die Tor-Anzeige wird über die CSS-Klasse "show" sichtbar gemacht (Grundlage für die Pop-Animation)');
  eq(result.msgHidesViaClass, true, 'die Tor-Anzeige verliert die "show"-Klasse wieder, sobald sie abgelaufen ist');
  eq(result.winBadge, '🏆', 'ein gewonnenes Match zeigt das Pokal-Badge');
  eq(result.winTitleClass, true, 'der Ergebnis-Titel trägt bei einem Sieg die Klasse "win"');
  eq(result.rematchButtonExistsForBot, true, 'im Bot-Modus wird ein "Nochmal spielen"-Button angezeigt (rein lokal, kein Risiko für Online-Matchmaking)');
  eq(result.scoreLineText, 'Ich 3 : 1 AFK-Bot', 'die Ergebniszeile zeigt Namen und Endstand korrekt an');
  eq(result.rematchReopenedOverlay, true, 'ein Klick auf "Nochmal spielen" startet tatsächlich ein neues Match (Overlay öffnet sich erneut)');
  eq(result.resultModalGoneAfterRematch, true, 'das Ergebnis-Modal schließt sich beim Rematch-Klick');
  eq(result.loseBadge, '💀', 'eine Niederlage zeigt das Totenkopf-Badge');
  eq(result.loseTitleClass, true, 'der Ergebnis-Titel trägt bei einer Niederlage die Klasse "lose"');
  eq(result.noRematchButtonWithoutCallback, true, 'ohne übergebene rematch-Funktion (z.B. Online-Modus) erscheint kein Rematch-Button');

  summary('Skill-Duell-UI-Politur-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
