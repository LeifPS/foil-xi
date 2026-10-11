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
    const nine = cards.length===9 && cards.every(c=>c.ov===121);
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
    const hasFx = !!node.querySelector('.divine-fx .divine-aura') && node.querySelectorAll('.divine-mote').length===3;

    const hasShooting = node.querySelectorAll('.divine-shoot').length===2;
    // Alle Namen gleich groß: keine Längen-Klassen mehr
    const longClass = !cards.some(c=>/dn-/.test(cardEl(c,'').querySelector('.divine-name').className));

    // alle Größen rendern ohne Fehler
    ['mini','xs'].forEach(sz=>cardEl(cards[2], sz));

    // SBCs
    const sbcs = SBC_DEFS.filter(s=>s.tier==='Divine');
    const sbcPerCard = sbcs.length===9 && cards.every(c=>sbcs.some(s=>s.directCardId===c.id));
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

    // Volle Chemie: auch ganz allein und ohne jede Verbindung zu den Mitspielern -> 3 Sterne (+3 Rating)
    const lone = computeChemistry([{...cards[0], club:'X1', lg:'Y1', nat:'Z1'}, {n:'o', ov:80, club:'X2', lg:'Y2', nat:'Z2', variant:'base'}], null);
    const divineFullChem = lone[0].chem===3 && lone[0].chemOv===cards[0].ov+3 && lone[1].chem===0;
    // Titel "Divine": nur mit Divine-Karte, Symbol ✵, Name in eigener Klasse (Jalliya)
    const nt = NAMETAGS.divine;
    const ntOk = !!nt && nt.symbol==='\u2735' && nt.cls==='nt-divine';
    const html = nametagHTML('Max', 'divine');
    const ntHtml = html.includes('nt-divine') && html.includes('\u2735') && html.includes('Max');
    const fontFam = (()=>{ const d=document.createElement('div'); d.innerHTML=html; document.body.appendChild(d); const f=getComputedStyle(d.querySelector('.nt-divine')).fontFamily; d.remove(); return f; })();
    const ntFont = /Jalliya/.test(fontFam);
    collection = []; profile.unlockedNametags = [];
    const noCardNoTitle = grantDivineNametagIfOwned()===false && !profile.unlockedNametags.includes('divine');
    collection = [{uid:'u1', cardId:cards[0].id}];
    const grantedWithCard = grantDivineNametagIfOwned()===true && profile.unlockedNametags.includes('divine');
    const idempotent = grantDivineNametagIfOwned()===false && profile.unlockedNametags.filter(x=>x==='divine').length===1;
    return { hasShooting, ntOk, ntHtml, ntFont, noCardNoTitle, grantedWithCard, idempotent, divineFullChem, nine, allStronger, registered, untradable, isDivineClass, nameText, noStats, noNormalName, iconsDirectlyUnderName, hasFx, longClass,
             sbcPerCard, sbcOnce, tileHasDivineTier, sourceMentionsSbc, passes, fails, inAnyPack, hasIcons: !!iconsEl };
  }));

  console.log('Divine-Karten-Test');
  noErrors(errors, 'Seite');
  eq(result.divineFullChem, true, 'Divine-Karten haben immer volle Chemie (3 Sterne, +3 Rating), auch ohne Verbindungen - gewöhnliche Karten nicht');
  eq(result.hasShooting, true, 'zwei Sternschnuppen-Elemente sind auf der Karte');
  eq(result.ntOk, true, 'Titel Divine existiert mit Symbol ✵');
  eq(result.ntHtml, true, 'der Titel rendert Symbol + Name mit der Klasse nt-divine');
  eq(result.ntFont, true, 'der Name im Titel nutzt die Signatur-Schrift Jalliya');
  eq(result.noCardNoTitle, true, 'ohne Divine-Karte gibt es den Titel nicht');
  eq(result.grantedWithCard, true, 'mit einer Divine-Karte wird der Titel freigeschaltet');
  eq(result.idempotent, true, 'der Titel wird nicht doppelt vergeben');
  eq(result.nine, true, 'Divine hat genau 9 Karten, alle mit 121 OVR');
  eq(result.allStronger, true, 'jede Divine-Karte ist stärker als jede bisherige Karte');
  eq(result.registered, true, 'alle Divine-Karten sind in BY_ID registiert');
  eq(result.untradable, true, 'Divine-Karten sind nicht handelbar');
  eq(result.isDivineClass, true, 'Karte bekommt die Klasse theme-divine');
  eq(result.nameText, 'Ferenc Puskas', 'der Name erscheint (Akzente entfernt, da die Schrift keine kennt) in voller Signatur-Schreibweise');
  eq(result.noStats, true, 'keine Stat-Balken auf der Karte');
  eq(result.noNormalName, true, 'kein normales Namensfeld mehr');
  eq(result.hasIcons, true, 'Nation/Liga/Verein sind vorhanden');
  eq(result.iconsDirectlyUnderName, true, 'Nation/Liga/Verein stehen direkt unter dem Namen, beide ganz unten');
  eq(result.hasFx, true, 'Divine-Effekt-Layer (Aura + 3 Lichtpartikel) vorhanden');
  eq(result.longClass, true, 'alle Namen sind gleich groß (keine Längen-Klassen)');
  eq(result.sbcPerCard, true, 'für jede Divine-Karte gibt es genau eine eigene Herausforderung');
  eq(result.sbcOnce, true, 'jede Divine-Herausforderung ist nur einmal machbar');
  eq(result.tileHasDivineTier, true, 'SBC-Kachel nutzt das Divine-Tier-Design');
  ok(result.sourceMentionsSbc, 'Erhalt-Hinweis der Karte nennt die Herausforderung');
  eq(result.passes, true, 'ein 98er-Sonderkarten-Kader erfüllt die Puskás-Herausforderung');
  eq(result.fails, true, 'ein schwächerer Kader erfüllt sie nicht');
  eq(result.inAnyPack, false, 'Divine-Karten tauchen in keinem Pack auf');
  summary('Divine-Karten-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
