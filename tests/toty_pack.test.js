// Regressionstest für das neue TOTY Pack (Team of the Year), diesmal LIVE und käuflich: 24 real
// geboostete Spieler mit über 105-112 OVR verstreuten Ratings (nach individueller Stärke, nicht in
// wenigen groben Stufen geklumpt) plus die normalen Basis-Karten derselben 24 Spieler im selben Pool
// ("in diesem Pack sind auch die Basis-Version von allen diesen Karten"). "1 von 2 Pick" (pickCount:1
// bei count:2) über den bereits bestehenden showPickScreen-Mechanismus.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId: 'test', displayName: 'Test FC', coins: 5000000, achievementStats: {} };
    clubId = 'test'; collection = []; managerCollection = []; packCollection = [];
    squad = { formation: '433', slots: {}, managerUid: null, tactics: { ...DEFAULT_TACTICS } };
    fb = null;

    const totyPack = PACKS.find(p => p.id === 'toty');

    // 1) Datenmodell: 24 TOTY-Karten, alle auflösbar, Ratings über 105-112 verstreut (mehr als nur 4
    // grobe Stufen wie im ursprünglichen 107-110-Entwurf).
    const rosterCount = TOTY_SPECIALS.length;
    const allInRange = TOTY_SPECIALS.every(c => c.ov >= 105 && c.ov <= 112);
    const allResolvable = TOTY_SPECIALS.every(c => BY_ID.get(c.id) === c);
    const distinctOvValues = new Set(TOTY_SPECIALS.map(c => c.ov)).size;

    // 2) Die Basis-Version jedes der 24 Spieler ist ebenfalls Teil des Pack-Datenmodells.
    const baseCount = TOTY_BASE_CARDS.length;
    const baseCardsAreRealBaseCards = TOTY_BASE_CARDS.every(c => c.variant !== 'toty');
    const baseCardsMatchRoster = TOTY_ROSTER.every(r => TOTY_BASE_CARDS.some(c => c.id === r.baseId));

    // 3) Das Pack ist LIVE: nicht hidden, kein comingSoon mehr.
    const isNotComingSoon = !totyPack.comingSoon;
    const isNotHidden = !totyPack.hidden;

    // 4) draw() liefert immer 2 unterschiedliche Karten, jede entweder eine echte TOTY-Karte oder eine
    // der 24 Basis-Karten - nie irgendetwas anderes.
    let allDrawsValid = true, sawToty = false, sawBase = false;
    for (let i = 0; i < 300; i++) {
      const drawn = totyPack.draw();
      const distinct = drawn[0].id !== drawn[1].id;
      const inPool = drawn.every(c => TOTY_SPECIALS.includes(c) || TOTY_BASE_CARDS.includes(c));
      drawn.forEach(c => { if (c.variant === 'toty') sawToty = true; else sawBase = true; });
      if (drawn.length !== 2 || !distinct || !inPool) { allDrawsValid = false; break; }
    }

    // 5) Echter Kaufvorgang: Coins werden abgezogen, die Sammlung wächst um beide gezogenen Karten
    // (die Pick-UI kürzt sie später auf eine - buyPack/addCardsToCollection selbst fügt aber erstmal
    // beide hinzu, siehe showPackOpening-Kommentar "grant immediately, before any animation/modal").
    const coinsBefore = profile.coins;
    const collectionBefore = collection.length;
    await buyPack(totyPack);
    await new Promise(r => setTimeout(r, 30));
    const coinsDeducted = profile.coins === coinsBefore - totyPack.cost;
    const collectionGrew = collection.length === collectionBefore + totyPack.count;

    // 6) Store-Kachel: normaler, aktivierter Kauf-Button (kein "Bald"/gesperrt mehr).
    currentTab = 'store';
    renderView('store');
    await new Promise(r => setTimeout(r, 50));
    const packCards = Array.from(document.querySelectorAll('.pack-card'));
    const totyCardEl = packCards.find(el => el.querySelector('h3')?.textContent === 'TOTY Pack');
    const buyBtnEnabled = totyCardEl ? !totyCardEl.querySelector('.buy-btn').disabled : false;

    return {
      rosterCount, allInRange, allResolvable, distinctOvValues, baseCount, baseCardsAreRealBaseCards,
      baseCardsMatchRoster, isNotComingSoon, isNotHidden, allDrawsValid, sawToty, sawBase,
      coinsDeducted, collectionGrew, totyVisibleInShop: !!totyCardEl, buyBtnEnabled,
    };
  }));

  console.log('TOTY-Pack-Test');
  noErrors(errors, 'Seite');
  eq(result.rosterCount, 24, 'TOTY_SPECIALS enthält alle 24 Spieler');
  eq(result.allInRange, true, 'alle TOTY-Karten liegen im gemeldeten Rating-Bereich (105-112)');
  eq(result.allResolvable, true, 'jede TOTY-Karte ist eager in BY_ID registriert (keine Lazy-Build-Falle wie zuvor bei den UCL/UEL-Siegerkarten)');
  ok(result.distinctOvValues >= 8, `die Ratings sind über mehr als nur wenige grobe Stufen verstreut (war: ${result.distinctOvValues} unterschiedliche Werte)`);
  eq(result.baseCount, 24, 'die Basis-Version aller 24 Spieler ist Teil des Pack-Pools');
  eq(result.baseCardsAreRealBaseCards, true, 'die Basis-Karten im Pool sind echte, unboostete Karten (kein toty-Variant)');
  eq(result.baseCardsMatchRoster, true, 'jede Basis-Karte im Pool gehört zu genau einem der 24 TOTY-Roster-Spieler');
  eq(result.isNotComingSoon, true, 'das Pack ist NICHT mehr comingSoon - vollständig live');
  eq(result.isNotHidden, true, 'das Pack ist nicht hidden - erscheint normal im Kartenladen');
  eq(result.allDrawsValid, true, 'draw() liefert über viele Wiederholungen immer 2 unterschiedliche Karten aus TOTY-Varianten oder Basis-Karten');
  eq(result.sawToty, true, 'draw() zieht über genug Wiederholungen mindestens einmal eine echte TOTY-Variante');
  eq(result.sawBase, true, 'draw() zieht über genug Wiederholungen mindestens einmal eine Basis-Karte');
  eq(result.coinsDeducted, true, 'ein echter Kauf zieht die Coins tatsächlich ab');
  eq(result.collectionGrew, true, 'ein echter Kauf fügt beide gezogenen Karten der Sammlung hinzu (Pick-UI kürzt später auf eine)');
  eq(result.totyVisibleInShop, true, 'die TOTY-Pack-Kachel erscheint im Kartenladen');
  eq(result.buyBtnEnabled, true, 'der Kauf-Button ist aktiv (kein "Bald"/gesperrter Zustand mehr)');

  summary('TOTY-Pack-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
