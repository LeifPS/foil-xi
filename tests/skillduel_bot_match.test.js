// Regressionstest für den AFK-Bot-Testmodus im Skill-Duell (openSkillBotCardPicker/startSkillMatch mit
// {vsBot:true}) - der einzige Teil des Skill-Modus, der komplett lokal läuft (kein Firestore/RTDB, kein
// zweiter Account nötig) und sich deshalb tatsächlich end-to-end automatisieren lässt: eigene Karte
// wählen, Match startet ohne matchId/Netzwerkaufrufe, ein paar Physik-Frames laufen, Verlassen räumt
// sauber auf ohne fb.rtdb anzufassen (das existiert im Test gar nicht - ein Zugriff darauf wäre also
// ein sofortiger Crash und würde vom "keine JS-Fehler"-Check unten aufgedeckt).
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    fb = null; // wie ein Gerät ohne (oder vor) Realtime-Database-Setup - der Bot-Modus darf das nie anfassen
    const fakeCard = {id:900000003, n:'Bot-Test-Spieler', pos:'ST', ov:88, club:'Test FC', nat:'DE', lg:'Test-Liga',
      pac:90, sho:90, pas:70, dri:80, defn:40, phy:75, traits:['Schneller Schritt+'], variant:'base'};
    BY_ID.set(fakeCard.id, fakeCard);
    const savedCollection = collection;
    collection = [{uid:'sk-bot-test', cardId:fakeCard.id, xp:0}];

    startSkillMatch(null, true, {hostName:'Ich', guestName:'AFK-Bot', hostPick:fakeCard, guestPick:SK_BOT_CARD}, {mode:'bot'});
    await new Promise(r=>setTimeout(r, 50));
    const overlayPresentAfterStart = !!document.getElementById('sk-overlay');
    const stateAfterStart = skillDuelState ? {mode:skillDuelState.mode, isHost:skillDuelState.isHost, matchId:skillDuelState.matchId} : null;
    const p2InputIsEmpty = skillDuelState ? JSON.stringify(skillDuelState.engine.p2Input)===JSON.stringify(SK_EMPTY_INPUT) : false;
    const p1HasQuickstep = skillDuelState ? skillDuelState.engine.p1.moves.has('quickstep') : false;

    // Ein paar Frames simulieren (ohne echte requestAnimationFrame-Ticks abzuwarten): direkter skStep-
    // Aufruf muss ohne jeden fb-Zugriff funktionieren, exakt wie es die eigene Bot-Schleife tut.
    let stepError = null;
    try{ for(let i=0;i<10;i++) skStep(skillDuelState.engine, 1/30); }catch(e){ stepError = e.message; }

    document.getElementById('sk-close-btn').click();
    const overlayGoneAfterClose = !document.getElementById('sk-overlay');
    const stateNullAfterClose = skillDuelState===null;

    collection = savedCollection;
    BY_ID.delete(fakeCard.id);

    return {overlayPresentAfterStart, stateAfterStart, p2InputIsEmpty, p1HasQuickstep, stepError, overlayGoneAfterClose, stateNullAfterClose};
  }));

  console.log('Skill-Duell-AFK-Bot-Test');
  noErrors(errors, 'Seite');
  eq(result.overlayPresentAfterStart, true, 'das Match-Overlay öffnet sich, obwohl fb=null ist (Bot-Modus braucht kein Backend)');
  eq(result.stateAfterStart && result.stateAfterStart.mode, 'bot', 'skillDuelState.mode ist auf "bot" gesetzt');
  eq(result.stateAfterStart && result.stateAfterStart.matchId, null, 'Bot-Match hat keine matchId (kein Firestore/RTDB-Dokument dahinter)');
  eq(result.p2InputIsEmpty, true, 'der Bot-Input bleibt für immer SK_EMPTY_INPUT (echtes AFK-Verhalten)');
  eq(result.p1HasQuickstep, true, 'die eigene gewählte Karte behält ihre echten PlayStyle+-Moves auch im Bot-Modus');
  eq(result.stepError, null, 'zehn Physik-Frames laufen ohne Fehler, ohne dass irgendwo fb/fb.rtdb angefasst wird');
  eq(result.overlayGoneAfterClose, true, '"Verlassen" entfernt das Overlay wieder');
  eq(result.stateNullAfterClose, true, '"Verlassen" räumt skillDuelState vollständig auf (kein Leck für ein künftiges echtes Match)');

  summary('Skill-Duell-AFK-Bot-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
