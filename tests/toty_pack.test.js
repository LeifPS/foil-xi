// Regressionstest für das neue TOTY Pack (Team of the Year): 24 real geboostete Spieler (107-110 OVR),
// im Kartenladen bereits SICHTBAR aber noch nicht käuflich (comingSoon, nicht hidden), und ein "1 von 2
// Pick" (pickCount:1 bei count:2) über den bereits bestehenden showPickScreen-Mechanismus.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId: 'test', displayName: 'Test FC', coins: 5000000, achievementStats: {} };
    clubId = 'test'; collection = []; managerCollection = []; packCollection = [];
    squad = { formation: '433', slots: {}, managerUid: null, tactics: { ...DEFAULT_TACTICS } };
    fb = null;

    const totyPack = PACKS.find(p => p.id === 'toty');

    // 1) Datenmodell: 24 Karten, alle auflösbar, Ratings passend (107-110).
    const rosterCount = TOTY_SPECIALS.length;
    const allInRange = TOTY_SPECIALS.every(c => c.ov >= 107 && c.ov <= 110);
    const allResolvable = TOTY_SPECIALS.every(c => BY_ID.get(c.id) === c);

    // 2) comingSoon statt hidden -> taucht im Shop AUF, ist aber nicht käuflich.
    const isComingSoon = !!totyPack.comingSoon;
    const isNotHidden = !totyPack.hidden;

    // 3) buyPack lehnt den Kauf ab, ohne Coins abzuziehen.
    const coinsBefore = profile.coins;
    let toastMsg = null; toast = (m) => { toastMsg = m; };
    await buyPack(totyPack);
    const coinsUnchangedAfterBlockedBuy = profile.coins === coinsBefore;
    const collectionEmptyAfterBlockedBuy = collection.length === 0;

    // 4) draw() liefert 2 GARANTIERT unterschiedliche Karten aus dem TOTY-Pool, viele Male hintereinander.
    let allDrawsDistinctAndInPool = true;
    for (let i = 0; i < 200; i++) {
      const drawn = totyPack.draw();
      const inPool = drawn.every(c => TOTY_SPECIALS.includes(c));
      const distinct = drawn[0].id !== drawn[1].id;
      if (drawn.length !== 2 || !inPool || !distinct) { allDrawsDistinctAndInPool = false; break; }
    }

    // 5) Store-Kachel: Buy-Button deaktiviert, "Bald"-Beschriftung statt Preis-Kauf-Flow.
    currentTab = 'store';
    renderView('store');
    await new Promise(r => setTimeout(r, 50));
    const packCards = Array.from(document.querySelectorAll('.pack-card'));
    const totyCardEl = packCards.find(el => el.querySelector('h3')?.textContent === 'TOTY Pack');
    const buyBtnDisabled = totyCardEl ? totyCardEl.querySelector('.buy-btn').disabled : null;

    return {
      rosterCount, allInRange, allResolvable, isComingSoon, isNotHidden,
      coinsUnchangedAfterBlockedBuy, collectionEmptyAfterBlockedBuy, toastMsg,
      allDrawsDistinctAndInPool, totyVisibleInShop: !!totyCardEl, buyBtnDisabled,
    };
  }));

  console.log('TOTY-Pack-Test');
  noErrors(errors, 'Seite');
  eq(result.rosterCount, 24, 'TOTY_SPECIALS enthält alle 24 Spieler');
  eq(result.allInRange, true, 'alle TOTY-Karten liegen im gemeldeten Rating-Bereich (107-110)');
  eq(result.allResolvable, true, 'jede TOTY-Karte ist eager in BY_ID registriert (keine Lazy-Build-Falle wie zuvor bei den UCL/UEL-Siegerkarten)');
  eq(result.isComingSoon, true, 'das Pack ist als comingSoon markiert');
  eq(result.isNotHidden, true, 'das Pack ist NICHT hidden - taucht im Kartenladen also sichtbar auf, nur ausgegraut');
  eq(result.totyVisibleInShop, true, 'die TOTY-Pack-Kachel erscheint tatsächlich im Kartenladen');
  eq(result.buyBtnDisabled, true, 'der Kauf-Button ist im Shop deaktiviert, solange comingSoon gilt');
  eq(result.coinsUnchangedAfterBlockedBuy, true, 'ein Kaufversuch über buyPack() wird abgelehnt, ohne Coins abzuziehen');
  eq(result.collectionEmptyAfterBlockedBuy, true, 'ein abgelehnter Kaufversuch fügt keine Karte zur Sammlung hinzu');
  ok(!!result.toastMsg && result.toastMsg.includes('noch nicht freigeschaltet'), `Toast erklärt, dass das Pack noch nicht freigeschaltet ist (war: ${result.toastMsg})`);
  eq(result.allDrawsDistinctAndInPool, true, 'draw() liefert über viele Wiederholungen immer 2 unterschiedliche, echte TOTY-Karten (1-von-2-Pick braucht zwei verschiedene Optionen)');

  summary('TOTY-Pack-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
