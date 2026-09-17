// Regressionstest für die TOTY-SBC (Team of the Year): kein Kartenladen-Pack mehr, sondern eine
// Squad-Building-Challenge - genau 1x pro Account machbar (maxCompletions:1), kostet ein komplettes
// 4-3-3 aus 11 Karten mit 100+ OVR, JEDE auf ihrer eigenen "++"-Position (Hauptposition) eingesetzt.
// Belohnung: 1 zufällige TOTY-Karte (105-112 OVR, untradable) aus dem 24-Spieler-Roster.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId: 'test', displayName: 'Test FC', coins: 0, achievementStats: {}, completedSBCs: {} };
    clubId = 'test'; managerCollection = []; packCollection = [];
    squad = { formation: '433', slots: {}, managerUid: null, tactics: { ...DEFAULT_TACTICS } };
    fb = null;
    sSet = async () => {};

    // 1) Datenmodell: 24 TOTY-Karten, alle auflösbar, Ratings über 105-112 verstreut. Kein Kartenladen-
    // Pack mehr (hidden:true, cost:0, count:1 - nur Belohnungshülle für die SBC).
    const rosterCount = TOTY_SPECIALS.length;
    const allInRange = TOTY_SPECIALS.every(c => c.ov >= 105 && c.ov <= 112);
    const allResolvable = TOTY_SPECIALS.every(c => BY_ID.get(c.id) === c);
    const distinctOvValues = new Set(TOTY_SPECIALS.map(c => c.ov)).size;

    const pack = PACKS.find(p => p.id === 'toty');
    const packIsHiddenRewardOnly = !!pack && !!pack.hidden && pack.cost === 0 && pack.count === 1;
    const packDrawsOnlyToty = pack.draw().every(c => c.variant === 'toty');
    const noBaseCardsPoolLeftover = typeof TOTY_BASE_CARDS === 'undefined';

    // 2) Die SBC existiert, ist genau 1x machbar, referenziert das toty-Pack als Belohnung.
    const sbc = SBC_DEFS.find(s => s.id === 'toty_sbc');
    const sbcExists = !!sbc;
    const sbcSizeIsEleven = sbc.size === 11;
    const sbcMaxOnce = sbc.maxCompletions === 1;
    const sbcRewardIsToty = sbc.reward === 'toty';

    const labels = FORMATIONS['433'].slots.map(s => s.label);
    const makeCard = (id, pos, ov) => ({ id, n: 'T' + id, pos, ov, pot: ov, variant: 'base' });

    // 3) Eine echte, gültige 4-3-3-Aufstellung (jede Karte exakt auf ihrer Hauptposition, 100+ OVR)
    // erfüllt die Anforderungen.
    const validCards = labels.map((l, i) => makeCard(9001000 + i, l, 100 + i));
    const validPasses = sbc.reqs.every(r => r.check(validCards));

    // 4) Eine Karte unter 100 OVR lässt die SBC scheitern.
    const lowOvCards = labels.map((l, i) => makeCard(9002000 + i, l, i === 0 ? 99 : 100));
    const lowOvFails = !sbc.reqs.every(r => r.check(lowOvCards));

    // 5) Eine Karte, die im zugewiesenen Slot nur "+" (Nebenposition) statt "++" (Hauptposition) hätte,
    // lässt die SBC scheitern - eine reine "irgendwo ++" Prüfung würde das übersehen.
    const secondaryPosCard = makeCard(9003000, 'ST,CM', 100); // CM ist Rang 1 -> nur "+", nicht "++"
    const withSecondaryCards = labels.map((l, i) => l === 'CM' && i === 5 ? secondaryPosCard : makeCard(9003100 + i, l, 100));
    const secondaryPosFails = !sbc.reqs.every(r => r.check(withSecondaryCards));

    // 6) Vollständiger Ablauf: Sammlung mit den 11 gültigen Karten aufbauen, SBC abschicken.
    collection = validCards.map((c, i) => {
      BY_ID.set(c.id, c);
      return { uid: 'u' + i, cardId: c.id, obtainedAt: Date.now(), obtainedFrom: 'test' };
    });
    activeSBC = sbc;
    sbcSelection = new Set(collection.map(c => c.uid));
    sbcManagerSelection = null;
    const collectionBeforeSubmit = collection.length;
    await submitSBC();
    await new Promise(r => setTimeout(r, 30));
    const collectionAfterSubmit = collection.length;
    const grantedEntry = collection[0];
    const grantedCard = grantedEntry ? BY_ID.get(grantedEntry.cardId) : null;
    const rewardIsTotyCard = grantedCard && grantedCard.variant === 'toty';
    const rewardIsUntradable = !!grantedEntry?.untradable;
    const completionsAfter = profile.completedSBCs['toty_sbc'];

    // 7) Ein zweiter Versuch ist blockiert (maxCompletions:1).
    let toastMsg = null; toast = m => { toastMsg = m; };
    sbcSelection = new Set();
    await submitSBC();
    const secondAttemptBlocked = !!toastMsg && toastMsg.includes('bereits maximal');

    return {
      rosterCount, allInRange, allResolvable, distinctOvValues,
      packIsHiddenRewardOnly, packDrawsOnlyToty, noBaseCardsPoolLeftover,
      sbcExists, sbcSizeIsEleven, sbcMaxOnce, sbcRewardIsToty,
      validPasses, lowOvFails, secondaryPosFails,
      collectionBeforeSubmit, collectionAfterSubmit, rewardIsTotyCard, rewardIsUntradable, completionsAfter,
      secondAttemptBlocked,
    };
  }));

  console.log('TOTY-SBC-Test');
  noErrors(errors, 'Seite');
  eq(result.rosterCount, 24, 'TOTY_SPECIALS enthält alle 24 Spieler');
  eq(result.allInRange, true, 'alle TOTY-Karten liegen im gemeldeten Rating-Bereich (105-112)');
  eq(result.allResolvable, true, 'jede TOTY-Karte ist eager in BY_ID registriert');
  ok(result.distinctOvValues >= 8, `die Ratings sind über mehr als nur wenige grobe Stufen verstreut (war: ${result.distinctOvValues} unterschiedliche Werte)`);
  eq(result.packIsHiddenRewardOnly, true, 'das toty-Pack ist nur noch eine versteckte Belohnungshülle (hidden, cost 0, count 1) - kein Kartenladen-Pack mehr');
  eq(result.packDrawsOnlyToty, true, 'das toty-Pack zieht ausschließlich echte TOTY-Karten (keine Basis-Karten mehr im Pool)');
  eq(result.noBaseCardsPoolLeftover, true, 'TOTY_BASE_CARDS wurde komplett entfernt (keine Basis-Karten mehr Teil von TOTY)');
  eq(result.sbcExists, true, 'die TOTY-SBC (id: toty_sbc) existiert');
  eq(result.sbcSizeIsEleven, true, 'die SBC verlangt 11 Karten (volle Aufstellung)');
  eq(result.sbcMaxOnce, true, 'die SBC ist maxCompletions:1 - genau einmal pro Account machbar');
  eq(result.sbcRewardIsToty, true, 'die SBC-Belohnung ist das toty-Pack');
  eq(result.validPasses, true, 'eine echte, gültige 4-3-3-Aufstellung (jede Karte 100+ auf ihrer Hauptposition) erfüllt die Anforderungen');
  eq(result.lowOvFails, true, 'eine Karte unter 100 OVR lässt die SBC scheitern');
  eq(result.secondaryPosFails, true, 'eine Karte auf ihrer Nebenposition ("+" statt "++") lässt die SBC scheitern');
  eq(result.collectionBeforeSubmit, 11, 'vor dem Abschicken sind alle 11 eingesetzten Karten in der Sammlung');
  eq(result.collectionAfterSubmit, 1, 'nach dem Abschicken sind alle 11 eingesetzten Karten weg, nur die 1 Belohnungskarte bleibt');
  eq(result.rewardIsTotyCard, true, 'die erhaltene Karte ist eine echte TOTY-Variante');
  eq(result.rewardIsUntradable, true, 'die erhaltene TOTY-Karte ist untradable');
  eq(result.completionsAfter, 1, 'profile.completedSBCs zählt genau 1 Abschluss');
  eq(result.secondAttemptBlocked, true, 'ein zweiter Versuch wird abgelehnt ("bereits maximal oft abgeschlossen")');

  summary('TOTY-SBC-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
