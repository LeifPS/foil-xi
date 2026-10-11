// Regressionstest für die neue Kartenklasse DIVINE: stärkste Karten des Spiels, nie in Packs, nur über je
// eine extrem schwere Einmal-SBC (directCardId) erhältlich. Eigenes Kartenlayout: KEINE Stats, KEIN
// normaler Name - ganz unten der Name in Signatur-Schrift (Jalliya), direkt darunter Nation/Liga/Verein.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId:'t', displayName:'T', coins:0, completedSBCs:{}, achievementStats:{} }; clubId='t';
    const cards = DIVINE_CARDS;
    const best = Math.max(...ALL_SPECIAL.concat(SIGNATURE_SEASON_CARDS, KRONJUWELEN_SPECIALS, GOAT_SPECIALS).map(c=>c.ov));
    const allStronger = cards.every(c=>c.ov > best);
    const registered = cards.every(c=>BY_ID.get(c.id)===c);
    const untradable = cards.every(c=>c.untradable===true);

    const node = cardEl(cards[0], '');
    const isDivineClass = node.classList.contains('theme-divine');
    const nameEl = node.querySelector('.divine-name');
    const nameText = nameEl && nameEl.textContent;
    const noStats = !node.querySelector('.stats') && !node.querySelector('.stat');
    const noNormalName = !node.querySelector('.name');
    const iconsEl = node.querySelector('.card-body .nat-club-icons');
    // Reihenfolge im Body: erst Name, direkt danach die Icons (beide unten)
    const body = node.querySelector('.card-body');
    const order = Array.from(body.children).map(e=>e.className.split(' ')[0]);
    const iconsDirectlyUnderName = order[0]==='divine-name' && order[1]==='nat-club-icons' && order.length===2;
    const hasFx = !!node.querySelector('.divine-fx .divine-halo') && node.querySelectorAll('.divine-mote').length===6;

    // Lange Namen bekommen automatisch eine kleinere Schriftgröße-Klasse
    const longNode = cardEl({...cards[1], signatureName:'Cristiano Ronaldo dos Santos'}, '');
    const longClass = longNode.querySelector('.divine-name').className.includes('dn-xlong');

    // alle Größen rendern ohne Fehler
    ['mini','xs'].forEach(sz=>cardEl(cards[2], sz));

    // SBCs
    const sbcs = SBC_DEFS.filter(s=>s.tier==='Divine');
    const sbcPerCard = sbcs.length===3 && cards.every(c=>sbcs.some(s=>s.directCardId===c.id));
    const sbcOnce = sbcs.every(s=>s.maxCompletions===1);
    const tile = buildSbcTile(sbcs[0], [], []);
    const tileHasDivineTier = tile.classList.contains('tier-divine');
    const sourceText = cardSpecialSource(cards[0]) || '';
    const sourceMentionsSbc = sourceText.includes(sbcs[0].name);

    // Anforderungen: ein 98er-Kader aus Sonderkarten mit 3 Stürmern erfüllt Messi-SBC, ein 96er-Kader nicht
    const mk = (ov,i,pos)=>({id:i,ov,pos,variant:'goat',n:'x'+i});
    const good = [...Array(3).fill(0).map((_,i)=>mk(99,i,'ST')), ...Array(8).fill(0).map((_,i)=>mk(98,10+i,'CM'))];
    const bad = good.map(c=>({...c,ov:94}));
    const passes = sbcs[0].reqs.every(r=>r.check(good));
    const fails = !sbcs[0].reqs.every(r=>r.check(bad));

    // nicht in Packs / Draft-Pool
    const inAnyPack = PACKS.some(p=>{ try{ return (p.draw?Array.from({length:50},()=>p.draw()).flat():[]).some(c=>c && c.theme==='divine'); }catch(e){ return false; } });

    return { allStronger, registered, untradable, isDivineClass, nameText, noStats, noNormalName, iconsDirectlyUnderName, hasFx, longClass,
             sbcPerCard, sbcOnce, tileHasDivineTier, sourceMentionsSbc, passes, fails, inAnyPack, hasIcons: !!iconsEl };
  }));

  console.log('Divine-Karten-Test');
  noErrors(errors, 'Seite');
  eq(result.allStronger, true, 'jede Divine-Karte ist stärker als jede bisherige Karte');
  eq(result.registered, true, 'alle Divine-Karten sind in BY_ID registiert');
  eq(result.untradable, true, 'Divine-Karten sind nicht handelbar');
  eq(result.isDivineClass, true, 'Karte bekommt die Klasse theme-divine');
  eq(result.nameText, 'Lionel Messi', 'der Name erscheint in voller Signatur-Schreibweise');
  eq(result.noStats, true, 'keine Stat-Balken auf der Karte');
  eq(result.noNormalName, true, 'kein normales Namensfeld mehr');
  eq(result.hasIcons, true, 'Nation/Liga/Verein sind vorhanden');
  eq(result.iconsDirectlyUnderName, true, 'Nation/Liga/Verein stehen direkt unter dem Namen, beide ganz unten');
  eq(result.hasFx, true, 'Divine-Effekt-Layer (Halo + 6 Lichtpartikel) vorhanden');
  eq(result.longClass, true, 'sehr lange Namen werden automatisch verkleinert');
  eq(result.sbcPerCard, true, 'für jede Divine-Karte gibt es genau eine eigene Herausforderung');
  eq(result.sbcOnce, true, 'jede Divine-Herausforderung ist nur einmal machbar');
  eq(result.tileHasDivineTier, true, 'SBC-Kachel nutzt das Divine-Tier-Design');
  ok(result.sourceMentionsSbc, 'Erhalt-Hinweis der Karte nennt die Herausforderung');
  eq(result.passes, true, 'ein 98er-Sonderkarten-Kader erfüllt die Messi-Herausforderung');
  eq(result.fails, true, 'ein schwächerer Kader erfüllt sie nicht');
  eq(result.inAnyPack, false, 'Divine-Karten tauchen in keinem Pack auf');
  summary('Divine-Karten-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
