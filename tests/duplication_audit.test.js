// Regressionstests für den Dopplungs-Sicherheitsaudit (Direktangebote/Transfermarkt/Turniere):
// 1. buyMarketListing: zwei "gleichzeitige" Käufe desselben Listings dürfen die Karte/den Preis
//    nicht doppelt vergeben (siehe buyMarketListing-Kommentar in index.html).
// 2. claimTournamentPrize: wenn der Host die gestakte Karte nicht mehr besitzt (z. B. weil eine
//    frühere Sicherheitslücke sie verkaufbar machte), darf der Sieger beim Abholen KEINE frisch
//    gemünzte Kopie bekommen - siehe cardMissing-Guard.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

function applyFieldData(target, data) {
  for (const [k, v] of Object.entries(data)) {
    if (v && v.__op === 'increment') {
      const parts = k.split('.'); let cur = target;
      for (let i = 0; i < parts.length - 1; i++) { if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {}; cur = cur[parts[i]]; }
      cur[parts[parts.length - 1]] = (cur[parts[parts.length - 1]] || 0) + v.n;
    } else if (v && v.__op === 'arrayRemove') {
      const parts = k.split('.'); let cur = target;
      for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
      const arr = cur[parts[parts.length - 1]] || [];
      cur[parts[parts.length - 1]] = arr.filter(x => !v.vals.some(rv => JSON.stringify(rv) === JSON.stringify(x)));
    } else if (v && v.__op === 'arrayUnion') {
      const parts = k.split('.'); let cur = target;
      for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
      const arr = cur[parts[parts.length - 1]] || [];
      cur[parts[parts.length - 1]] = arr.concat(v.vals);
    } else {
      const parts = k.split('.'); let cur = target;
      for (let i = 0; i < parts.length - 1; i++) { if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {}; cur = cur[parts[i]]; }
      cur[parts[parts.length - 1]] = v;
    }
  }
}

async function installMockFb(page, store) {
  await page.exposeFunction('__storeGet', (path) => {
    const rec = store[path];
    return rec ? { exists: true, data: JSON.parse(JSON.stringify(rec.data)), v: rec.v } : { exists: false, v: -1 };
  });
  await page.exposeFunction('__txCommit', (reads, writes) => {
    for (const r of reads) { const rec = store[r.path]; const curV = rec ? rec.v : -1; if (curV !== r.v) return { conflict: true }; }
    for (const w of writes) {
      if (w.type === 'delete') delete store[w.path];
      else { store[w.path] = store[w.path] || { v: 0, data: {} }; applyFieldData(store[w.path].data, w.data); store[w.path].v++; }
    }
    return { conflict: false };
  });
  await page.evaluate(() => {
    fb = {
      doc: (db, col, id) => ({ path: col + '/' + id }),
      increment: (n) => ({ __op: 'increment', n }),
      arrayRemove: (...vals) => ({ __op: 'arrayRemove', vals }),
      arrayUnion: (...vals) => ({ __op: 'arrayUnion', vals }),
      getDoc: async (ref) => { const r = await window.__storeGet(ref.path); return { exists: () => r.exists, data: () => r.data }; },
      runTransaction: async (db, fn) => {
        for (let attempt = 0; attempt < 10; attempt++) {
          const reads = []; const writes = [];
          const tx = {
            get: async (ref) => { const r = await window.__storeGet(ref.path); reads.push({ path: ref.path, v: r.v }); return { exists: () => r.exists, data: () => r.data }; },
            update: (ref, data) => writes.push({ type: 'update', path: ref.path, data }),
            delete: (ref) => writes.push({ type: 'delete', path: ref.path }),
            set: (ref, data) => writes.push({ type: 'update', path: ref.path, data }),
          };
          const result = await fn(tx);
          const commit = await window.__txCommit(reads, writes);
          if (commit.conflict) continue;
          return result;
        }
        throw new Error('too many retries');
      },
    };
  });
}

function loadPlaywright() {
  try { return require('playwright'); }
  catch (e) { return require('/opt/node22/lib/node_modules/playwright'); }
}

async function testMarketRace() {
  const { chromium } = loadPlaywright();
  const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium';
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const store = {};
  store['saves/seller1'] = { v: 0, data: { profile: { coins: 1000, achievementStats: {} }, collection: [{ uid: 'card-uid-1', cardId: 1, xp: 0, obtainedAt: 1, obtainedFrom: 'seller1' }] } };
  store['market/listing1'] = { v: 0, data: { id: 'listing1', sellerUserId: 'seller1', sellerName: 'Seller', itemType: 'card', cardUid: 'card-uid-1', cardId: 1, price: 100 } };
  const pages = [await browser.newPage(), await browser.newPage()];
  const errorsByPage = [[], []];
  for (let i = 0; i < 2; i++) {
    const page = pages[i];
    page.on('pageerror', e => errorsByPage[i].push(e.message));
    await page.goto(process.env.FOIL_TEST_URL || 'http://localhost:8931/index.html?nosave=1');
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      document.getElementById('gate-overlay')?.remove();
      warnStorageOnce = () => {}; initFirebase = async () => false;
      invalidateReadCache = () => {}; loadMarketListings = () => {}; recordSale = () => {};
      closeModal = () => {}; toast = () => {}; withdrawMarketListing = async () => {};
      updateCoinDisplay = () => {}; applyAchievementDeltas = () => {}; bumpWeekPassQuest = () => false;
    });
    await installMockFb(page, store);
  }
  const setupBuyer = (page, userId) => page.evaluate((userId) => {
    profile = { userId, displayName: userId, coins: 5000, achievementStats: {} };
    clubId = userId; collection = []; managerCollection = []; packCollection = [];
  }, userId);
  await setupBuyer(pages[0], 'buyerA');
  await setupBuyer(pages[1], 'buyerB');
  const listing = { id: 'listing1', sellerUserId: 'seller1', sellerName: 'Seller', itemType: 'card', cardUid: 'card-uid-1', cardId: 1, price: 100 };
  const [resA, resB] = await Promise.all([
    pages[0].evaluate(async (listing) => { await buyMarketListing(listing); return { collectionLen: collection.length, coins: profile.coins }; }, listing),
    pages[1].evaluate(async (listing) => { await buyMarketListing(listing); return { collectionLen: collection.length, coins: profile.coins }; }, listing),
  ]);
  const totalCardsReceived = resA.collectionLen + resB.collectionLen;
  const sellerCoins = store['saves/seller1'].data.profile.coins;
  const errors = errorsByPage[0].concat(errorsByPage[1]);
  await browser.close();
  return { totalCardsReceived, sellerCoins, errors };
}

async function testTournamentCardMissingGuard() {
  return withPage(async (page) => {
    const store = {};
    store['saves/host1'] = { v: 0, data: { profile: { coins: 0 }, collection: [] } }; // host already lost the staked card
    store['saves/winner1'] = { v: 0, data: { profile: { coins: 500 }, collection: [] } };
    store['tournaments/t1'] = { v: 0, data: { hostUserId: 'host1', winnerUserId: 'winner1', prizeClaimed: false, prizeType: 'card', prizeCard: { stakedUid: 'staked-uid-1', cardId: 42, n: 'Test Player' }, winnerPrizeCoins: 0, participants: [], rounds: [] } };
    await installMockFb(page, store);
    const result = await page.evaluate(async () => {
      profile = { userId: 'winner1', coins: 500, achievementStats: {} };
      clubId = 'winner1'; collection = [];
      playSfx = () => {}; toast = (m) => { window.__lastToast = m; };
      invalidateReadCache = () => {}; loadMyTournamentResults = () => {}; applyAchievementDeltas = () => {}; updateCoinDisplay = () => {};
      await claimTournamentPrize('t1', 'winner');
      return { collectionLen: collection.length, lastToast: window.__lastToast };
    });
    return { ...result, hostCollectionLen: store['saves/host1'].data.collection.length, prizeClaimed: store['tournaments/t1'].data.prizeClaimed };
  });
}

(async () => {
  console.log('Dopplungs-Audit: buyMarketListing (Transfermarkt-Race)');
  const marketRes = await testMarketRace();
  noErrors(marketRes.errors, 'buyMarketListing race');
  eq(marketRes.totalCardsReceived, 1, 'genau EIN Käufer bekommt die Karte, nicht beide');
  eq(marketRes.sellerCoins, 1100, 'Verkäufer wird nur einmal bezahlt (1000 + 100)');

  console.log('\nDopplungs-Audit: claimTournamentPrize (Host besitzt gestakte Karte nicht mehr)');
  const { result: tRes, errors: tErrors } = await testTournamentCardMissingGuard();
  noErrors(tErrors, 'claimTournamentPrize cardMissing guard');
  eq(tRes.collectionLen, 0, 'Sieger bekommt KEINE frisch gemünzte Kopie, wenn die Originalkarte weg ist');
  eq(tRes.prizeClaimed, true, 'Preis gilt trotzdem als abgeholt (kein endloses Retry-Locking)');
  ok(tRes.lastToast && tRes.lastToast.includes('nicht mehr verfügbar'), `Toast erklärt ehrlich, dass die Karte fehlt (war: ${tRes.lastToast})`);

  summary('Dopplungs-Audit');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
