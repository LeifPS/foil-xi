// Regressionstest für: "Man kann nicht aus dem Draften herausgehen nur neustarten [...] zurück auf den
// Drafting screen mit Turnier und dso" - man konnte einen laufenden Draft bisher nur per komplettem
// Neustart verlassen. Jetzt gibt es einen "Zurück zur Übersicht"-Button, der zur Haupt-Draft-Übersicht
// (gespeicherte Aufstellungen + Rangliste + Turnier) zurückspringt, OHNE den laufenden Draft zu verwerfen
// - von dort lässt sich der Lauf per "Laufenden Draft fortsetzen" wieder aufnehmen. Ein komplett neuer
// Lauf über "Neue Aufstellung draften" fragt in dem Fall erst nach, bevor der alte Fortschritt verloren geht.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId:'test', displayName:'Test FC', coins:1000, crest:{shape:'shield',primary:'#fff',secondary:'#000',letter:'T'}, achievementStats:{} };
    clubId = 'test'; fb = null; sSet = async () => true;

    const def = CHALLENGE_DEFS.find(d=>d.id==='draft');
    openChallengeDetail(def);
    draftStartRoll();
    // Einen Slot befüllen, damit der Lauf einen sichtbaren, nicht-trivialen Fortschritt hat.
    const testCard = {id:900999001, n:'Test GK', pos:'GK', ov:80, pac:40,sho:20,pas:50,dri:40,defn:30,phy:70, traits:[], variant:'base'};
    draftAssignCardToSlot(draftRollState, testCard);
    draftRollState.usedNames.add(testCard.n);
    renderDraftPanel();

    // ---------- (1) "Zurück zur Übersicht" verlässt den Roll-Screen, OHNE den Lauf zu verwerfen ----------
    const backBtnVisibleWhileRolling = !!document.getElementById('draft-back-to-hub-btn');
    document.getElementById('draft-back-to-hub-btn').click();
    const nowShowsHub = !!document.getElementById('draft-slots-list');
    const rollStateStillAlive = draftRollState !== null && draftRollState.slots.filter(s=>s.card).length === 1;
    const resumeBtnShowsProgress = document.getElementById('draft-resume-btn') && document.getElementById('draft-resume-btn').textContent.includes('1/11');

    // ---------- (2) "Laufenden Draft fortsetzen" springt zurück in genau den Zustand, wie er verlassen wurde ----------
    document.getElementById('draft-resume-btn').click();
    const backOnRollScreen = !!document.getElementById('draft-pitch-wrap') && !document.getElementById('draft-slots-list');
    const progressPreservedAfterResume = draftRollState.slots.find(s=>s.id==='gk').card === testCard;

    // ---------- (3) "Neue Aufstellung draften" fragt nach, wenn dabei unsaved Fortschritt verloren ginge ----------
    document.getElementById('draft-back-to-hub-btn').click(); // wieder zur Übersicht
    document.getElementById('draft-roll-start-btn').click();
    const confirmModalShown = !!document.getElementById('draft-confirm-newrun-yes');
    const rollStateUnchangedBeforeConfirm = draftRollState.slots.find(s=>s.id==='gk').card === testCard;
    document.getElementById('draft-confirm-newrun-no').click(); // abbrechen -> nichts passiert
    const stillSameRunAfterCancel = draftRollState.slots.find(s=>s.id==='gk').card === testCard;
    document.getElementById('draft-roll-start-btn').click();
    document.getElementById('draft-confirm-newrun-yes').click(); // jetzt wirklich bestätigen
    const newRunActuallyStarted = draftRollState.slots.every(s=>s.card===null);

    document.getElementById('modal-root') && (document.getElementById('modal-root').innerHTML = '');

    return {
      backBtnVisibleWhileRolling, nowShowsHub, rollStateStillAlive, resumeBtnShowsProgress,
      backOnRollScreen, progressPreservedAfterResume,
      confirmModalShown, rollStateUnchangedBeforeConfirm, stillSameRunAfterCancel, newRunActuallyStarted,
    };
  }));

  console.log('Draft-Modus-Übersicht-Navigation-Test');
  noErrors(errors, 'Seite');
  eq(result.backBtnVisibleWhileRolling, true, 'während eines laufenden Drafts gibt es einen "Zurück zur Übersicht"-Button');
  eq(result.nowShowsHub, true, 'ein Klick darauf zeigt die Haupt-Draft-Übersicht (gespeicherte Aufstellungen/Rangliste/Turnier)');
  eq(result.rollStateStillAlive, true, 'der laufende Draft-Fortschritt bleibt beim Zurückgehen erhalten, wird NICHT verworfen');
  eq(result.resumeBtnShowsProgress, true, 'die Übersicht zeigt einen "Laufenden Draft fortsetzen"-Button mit dem aktuellen Fortschritt (1/11)');
  eq(result.backOnRollScreen, true, '"Laufenden Draft fortsetzen" springt zurück auf den Roll-Screen');
  eq(result.progressPreservedAfterResume, true, 'der Fortschritt ist nach dem Fortsetzen exakt wie beim Verlassen erhalten');
  eq(result.confirmModalShown, true, '"Neue Aufstellung draften" fragt nach, wenn dabei ein laufender Draft verworfen würde');
  eq(result.rollStateUnchangedBeforeConfirm, true, 'vor der Bestätigung ist der alte Lauf noch unangetastet');
  eq(result.stillSameRunAfterCancel, true, 'ein Abbrechen der Nachfrage lässt den alten Lauf komplett unangetastet');
  eq(result.newRunActuallyStarted, true, 'nach der Bestätigung wird tatsächlich ein neuer, leerer Lauf gestartet');

  summary('Draft-Modus-Übersicht-Navigation-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
