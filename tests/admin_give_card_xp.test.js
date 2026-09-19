// Regressionstest für das neue Admin-Tool "Karten-XP geben": lässt einen Admin einer Karte, die ein
// ANDERER Account bereits besitzt, direkt XP geben (oder abziehen), ohne dass dafür ein echtes Match
// nötig ist. Das Level wird danach ganz normal aus der neuen Gesamt-XP abgeleitet (cardLevelForXp) -
// es gibt bewusst keinen separaten "Level direkt setzen"-Weg, exakt wie bei echtem Karten-XP aus
// Matches (siehe awardCardXP).
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const fakeCard = {id:900444001, n:'Admin Test Card', pos:'ST', ov:80, pac:80,sho:80,pas:80,dri:80,defn:80,phy:80, traits:[], variant:'base'};
    BY_ID.set(fakeCard.id, fakeCard);
    const targetId = 'testtarget';
    const targetCollectionEntry = {uid:'uid-1', cardId:fakeCard.id, xp:0};
    const data = {collection:[targetCollectionEntry]};

    const toasts = []; toast = (m)=>toasts.push(m);
    const setDocCalls = [];
    fb = {
      doc: (db, col, id) => ({path: col+'/'+id}),
      setDoc: async (ref, val) => { setDocCalls.push({ref, val}); },
    };

    openAdminGiveCardXpModal(targetId, data);
    const cardShownWithZeroXp = document.querySelector('#admin-cardxp-results').textContent.includes('0 XP');

    // Karte anklicken -> öffnet askTextModal für die XP-Menge.
    document.querySelector('#admin-cardxp-results > div').click();
    const askModalShown = !!document.getElementById('ask-text-input');

    // 5000 XP eingeben -> reicht für Level 2 (Silber, Schwelle 2000 laut CARD_XP_THRESHOLDS).
    document.getElementById('ask-text-input').value = '5000';
    document.getElementById('ask-text-submit').click();
    await new Promise(r=>setTimeout(r, 20));

    const setDocCalledWithNewXp = setDocCalls.length===1 && setDocCalls[0].val.collection[0].xp === 5000;
    const setDocTargetsCorrectAccount = setDocCalls[0].ref.path === 'saves/'+targetId;
    const levelUpToastShown = toasts.some(t=>t.includes('+5000 XP') && t.includes('Silber'));
    // Nach dem Geben öffnet sich die Liste automatisch wieder, jetzt mit der neuen XP-Summe.
    const listReopenedWithNewXp = document.querySelector('#admin-cardxp-results').textContent.includes('5.000 XP');

    // Negative XP abziehen funktioniert ebenfalls (nie unter 0, siehe Math.max(0,...)).
    document.querySelector('#admin-cardxp-results > div').click();
    document.getElementById('ask-text-input').value = '-999999';
    document.getElementById('ask-text-submit').click();
    await new Promise(r=>setTimeout(r, 20));
    const xpNeverGoesNegative = setDocCalls.length===2 && setDocCalls[1].val.collection[0].xp === 0;

    // Abbrechen (Cancel-Button) ändert nichts und schreibt nicht erneut.
    document.querySelector('#admin-cardxp-results > div').click();
    document.getElementById('ask-text-cancel').click();
    await new Promise(r=>setTimeout(r, 20));
    const cancelDidNotWriteAgain = setDocCalls.length===2;

    document.getElementById('modal-root') && (document.getElementById('modal-root').innerHTML = '');

    return {
      cardShownWithZeroXp, askModalShown, setDocCalledWithNewXp, setDocTargetsCorrectAccount,
      levelUpToastShown, listReopenedWithNewXp, xpNeverGoesNegative, cancelDidNotWriteAgain,
    };
  }));

  console.log('Admin-Karten-XP-Test');
  noErrors(errors, 'Seite');
  eq(result.cardShownWithZeroXp, true, 'die Karte wird zunächst mit 0 XP angezeigt');
  eq(result.askModalShown, true, 'ein Klick auf die Karte öffnet die XP-Eingabe');
  eq(result.setDocCalledWithNewXp, true, 'die eingegebene XP-Menge wird korrekt in die Collection des Zielaccounts geschrieben');
  eq(result.setDocTargetsCorrectAccount, true, 'der Schreibvorgang zielt auf saves/{targetId}, nicht den eigenen Account');
  eq(result.levelUpToastShown, true, 'ein Toast bestätigt die vergebene XP inkl. neuem Level');
  eq(result.listReopenedWithNewXp, true, 'die Liste zeigt danach automatisch die aktualisierte XP-Summe');
  eq(result.xpNeverGoesNegative, true, 'XP kann nie unter 0 fallen, auch bei einem großen negativen Abzug');
  eq(result.cancelDidNotWriteAgain, true, 'ein Abbruch der XP-Eingabe schreibt nichts');

  summary('Admin-Karten-XP-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
