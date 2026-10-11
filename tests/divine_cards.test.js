// Regressionstest für die neue Kartenklasse DIVINE: stärkste Karten des Spiels, nur über das Divine Pack
// (100k, 3 Karten, 1 wählbar) erhältlich. Eigenes Kartenlayout: KEINE Stats, KEIN
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

    // KEINE ID-Kollision mit irgendeinem anderen Kartenpool (Regression: die ersten Divine-IDs überschrieben
    // 9 bestehende Karten, Besitzer sahen plötzlich Divine-Karten, die sie nie bekommen hatten)
    const poolNames = ['ALL_BASE','ALL_SPECIAL','EXCLUSIVE_SPECIALS','GOAT_SPECIALS','WM_SPECIALS','PRIME_CARDS','KRONJUWELEN_SPECIALS','BLACK_HOLE_SPECIALS','SIGNATURE_SEASON_CARDS','OGICON_CARDS','POETEN_CARDS','LEGENDS_SPECIALS','TOTY_SPECIALS','UCLW_SPECIALS','DERBY_SPECIALS','UNDERDOG_SPECIALS','WM_SPECIALS'];
    const divineIds = new Set(cards.map(c=>c.id));
    let collisions = 0, poolsChecked = 0;
    poolNames.forEach(nm=>{ let arr; try{ arr = eval(nm); }catch(e){ return; } if(!Array.isArray(arr)) return; poolsChecked++; arr.forEach(c=>{ if(c && divineIds.has(c.id) && c.theme!=='divine') collisions++; }); });
    const noIdCollision = collisions===0 && poolsChecked>=8;
    const oldCardsIntact = ['Dimarco','Caicedo','Barella','Alvarez'].every(nm=>{ const c = ALL_SPECIAL.concat(ALL_BASE).find(x=>x.n.includes(nm)); return c && BY_ID.get(c.id)===c && c.theme!=='divine'; });
    // Aufräumen: fälschlich vergebener Titel wird zurückgenommen, echter bleibt
    profile.unlockedNametags = ['divine','gold']; profile.nametag='divine'; profile.divinePackBought=false; collection=[{uid:'a', cardId:ALL_SPECIAL.find(x=>x.n.includes('Caicedo')).id}];
    const revoked = revokeUndeservedDivineNametag()===true && !profile.unlockedNametags.includes('divine') && profile.unlockedNametags.includes('gold') && profile.nametag===null;
    profile.unlockedNametags = ['divine']; collection=[{uid:'b', cardId:cards[0].id}];
    const keptWithRealCard = revokeUndeservedDivineNametag()===false && profile.unlockedNametags.includes('divine');
    profile.unlockedNametags = []; collection = [];
    // Divine Pack: letzte Seltenheit, 100k, 3 Karten, 1 wählbar
    const pack = PACKS.find(x=>x.id==='divine');
    const packOk = !!pack && pack.tier==='divine' && pack.cost===100000 && pack.count===3 && pack.pickCount===1 && PACKS[PACKS.length-1]===pack && !pack.hidden;
    const draws = Array.from({length:60},()=>pack.draw());
    const drawsOk = draws.every(d=>d.length===3 && new Set(d.map(c=>c.id)).size===3 && d.every(c=>c.theme==='divine'));
    const allNineReachable = new Set(draws.flat().map(c=>c.id)).size===9;
    // keine Challenge mehr für Divine-Karten
    const noSbc = !SBC_DEFS.some(s=>cards.some(c=>s.directCardId===c.id) || /^divine_/.test(s.id));
    const sourceMentionsPack = (cardSpecialSource(cards[0])||'').includes('Divine Pack');
    // Shop: eigener Abschnitt ganz unten mit Effekt-Layern
    coins=0; profile.coins = 500000; profile.packOpenMode='click';
    const view = document.getElementById('view'); renderStore(view);
    const sections = Array.from(document.querySelectorAll('.pack-tier-section'));
    const lastSec = sections[sections.length-1];
    const storeDivineLast = !!lastSec && lastSec.id==='pack-tier-divine' && lastSec.querySelectorAll('.pack-card.divine').length===1;
    const storeFx = !!lastSec.querySelector('.pack-card.divine .pack-divine-fx .pdx-rays') && lastSec.querySelectorAll('.pdx-mote').length===7 && lastSec.querySelectorAll('.pdx-shoot').length===2;
    const navHasDivine = !!document.querySelector('.pack-tier-nav-btn.divine');
    // Beliebig oft kaufbar: zwei Käufe nacheinander funktionieren beide (je 100.000 Coins, je 3 Karten), kein Limit-Flag
    atomicCoinChange = async (n)=>{ profile.coins += n; };
    profile.coins = 500000; collection = []; profile.unlockedNametags = []; profile.pendingPackPick = null;
    const noLimitProps = !('onceFlag' in pack);
    await buyPack(pack); await new Promise(r=>setTimeout(r,150)); document.getElementById('modal-root').innerHTML='';
    profile.pendingPackPick = null;
    await buyPack(pack); await new Promise(r=>setTimeout(r,150)); document.getElementById('modal-root').innerHTML='';
    const boughtTwice = profile.coins===300000 && collection.length===6;
    const pendingSaved = !!profile.pendingPackPick && profile.pendingPackPick.uids.length===3;
    // Neustart-Fortsetzung: offene Auswahl wird wieder aufgemacht und räumt auf (behält genau 1 der 3)
    const resumed = resumePendingPackPick()===true && !!document.getElementById('pick-grid');
    document.querySelectorAll('#pick-grid > div')[0].click();
    document.getElementById('pick-confirm').click();
    await new Promise(r=>setTimeout(r,300));
    const resumeKeptOne = collection.length===4 && profile.pendingPackPick===null;
    document.getElementById('modal-root').innerHTML='';
    // Shop zeigt das Pack immer als kaufbar (nie "Bereits gekauft")
    renderStore(document.getElementById('view'));
    const shopBtn = document.querySelector('#pack-tier-divine .buy-btn');
    const shopAlwaysBuyable = !!shopBtn && !/Bereits gekauft/.test(shopBtn.textContent);
    profile.coins = 500000; collection = []; profile.pendingPackPick = null; profile.unlockedNametags = [];
    // Admin-Geschenk gibt wie beim normalen Öffnen nur 1 Karte (pickCount) und ist wiederholbar
    const targetDocs = { 'saves/opfer': { profile: {} , collection: [], packCollection: [] } };
    const writesAdmin = [];
    const origFb = fb;
    fb = { doc:(db,c,id)=>({path:c+'/'+id}), getDoc: async (ref)=>({exists:()=>!!targetDocs[ref.path], data:()=>targetDocs[ref.path]}),
           setDoc: async (ref,val)=>{ writesAdmin.push({path:ref.path,val}); }, arrayUnion:(...a)=>({union:a}) };
    const clickPack = async (opener, label)=>{ opener('opfer', {}); await new Promise(r=>setTimeout(r,20));
      const btn = Array.from(document.querySelectorAll('#modal-root .picker-list button')).find(b=>b.textContent===label); btn.click(); await new Promise(r=>setTimeout(r,80)); };
    await clickPack(openAdminSendPackModal, 'Divine Pack'); await clickPack(openAdminSendPackModal, 'Divine Pack');
    const adminGivesOneEachTime = writesAdmin.length===2 && writesAdmin.every(w=>w.val.collection.union.length===1);
    fb = origFb; document.getElementById('modal-root').innerHTML='';
    // ---------- Aufstellungs-Regel: im Kader immer nur 1 Divine-Karte ----------
    const d0 = cards[0], d1 = cards[1], d2 = cards[2];
    collection = [{uid:'d0',cardId:d0.id},{uid:'d1',cardId:d1.id},{uid:'d2',cardId:d2.id}];
    squad = {formation:'433', slots:{st:'d0', lw:'d1', rw:'d2'}, managerUid:null, tactics:{}};
    // Start-Check räumt auf: nur die erste Divine-Karte (in Formations-Reihenfolge) bleibt
    const removed = stripExtraDivineFromSlots(squad.slots, '433');
    const keptOnlyFirst = removed===2 && Object.keys(squad.slots).length===1;
    // Picker: zweite Divine-Karte ist gesperrt ("MAX. 1 DIVINE"), die bereits eingesetzte bleibt wählbar
    squad = {formation:'433', slots:{st:'d0'}, managerUid:null, tactics:{}};
    const oldToast = toast; const toastsPick = []; toast = (m)=>toastsPick.push(m);
    const form = FORMATIONS['433']; const lwSlot = form.slots.find(s=>s.id==='lw');
    openPicker(lwSlot);
    await new Promise(r=>setTimeout(r,200));
    const badges = Array.from(document.querySelectorAll('#modal-root .sbc-inuse-badge')).map(b=>b.textContent);
    const pickerBadgeShown = badges.filter(x=>x==='MAX. 1 DIVINE').length>=1;
    toast = oldToast; document.getElementById('modal-root').innerHTML='';
    // Preset laden mit mehreren Divine-Karten: nur eine bleibt
    squadPresets = [{id:'pr1', name:'Test', formation:'433', slots:{st:'d0', lw:'d1', rw:'d2'}, managerUid:null}];
    await loadSquadPreset('pr1');
    const presetKeepsOne = Object.keys(squad.slots).length===1;
    collection = []; squad = {formation:'433', slots:{}, managerUid:null, tactics:{}}; squadPresets = [];
    // Öffnen: große Pack-Ansicht mit Effekten, Auswahl 1 von 3, Rest wird entfernt, Titel kommt
    collection = []; profile.unlockedNametags = [];
    const drawn = pack.draw();
    showPackOpening(pack, drawn);
    const visualHasFx = !!document.querySelector('#pack-visual.divine .pack-divine-fx');
    document.getElementById('pack-visual').click();
    await new Promise(r=>setTimeout(r,700));
    const threeGrantedUpFront = collection.length===3;
    // Reveal-Overlay jedes Divine-Karte: Divine-Variante
    let guard=0;
    while(!document.getElementById('pick-grid') && guard++<20){
      const ov = document.querySelector('.cutscene-overlay');
      if(ov){ if(ov.classList.contains('cs-divine')) window.__sawDivineReveal = true; ov.click(); ov.click(); ov.click(); }
      await new Promise(r=>setTimeout(r,400));
    }
    const pickScreen = !!document.getElementById('pick-grid');
    const pickGridCount = document.querySelectorAll('#pick-grid > div').length===3;
    document.querySelectorAll('#pick-grid > div')[1].click();
    document.getElementById('pick-confirm').click();
    await new Promise(r=>setTimeout(r,300));
    const exactlyOneKept = collection.length===1 && collection[0].cardId===drawn[1].id;
    const titleAfterPick = profile.unlockedNametags.includes('divine');
    const sawDivineReveal = !!window.__sawDivineReveal;
    document.getElementById('modal-root').innerHTML='';

    // in keinem ANDEREN Pack
    const inOtherPack = PACKS.filter(x=>x.id!=='divine').some(p=>{ try{ return (p.draw?Array.from({length:50},()=>p.draw()).flat():[]).some(c=>c && c.theme==='divine'); }catch(e){ return false; } });

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
    return { noLimitProps, boughtTwice, shopAlwaysBuyable, adminGivesOneEachTime, keptOnlyFirst, pickerBadgeShown, presetKeepsOne, noIdCollision, oldCardsIntact, revoked, keptWithRealCard, pendingSaved, resumed, resumeKeptOne, hasShooting, ntOk, ntHtml, ntFont, noCardNoTitle, grantedWithCard, idempotent, divineFullChem, nine, allStronger, registered, untradable, isDivineClass, nameText, noStats, noNormalName, iconsDirectlyUnderName, hasFx, longClass,
             packOk, drawsOk, allNineReachable, noSbc, sourceMentionsPack, storeDivineLast, storeFx, navHasDivine, visualHasFx, threeGrantedUpFront, pickScreen, pickGridCount, exactlyOneKept, titleAfterPick, sawDivineReveal, inOtherPack, hasIcons: !!iconsEl };
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
  eq(result.noIdCollision, true, 'keine Divine-ID kollidiert mit einer Karte in irgendeinem anderen Pool');
  eq(result.oldCardsIntact, true, 'die bisher überschriebenen Karten (Dimarco, Caicedo, Barella, Alvarez) sind wieder sie selbst');
  eq(result.revoked, true, 'ein fälschlich vergebener Divine-Titel wird zurückgenommen (und abgelegt)');
  eq(result.keptWithRealCard, true, 'wer wirklich eine Divine-Karte besitzt, behält den Titel');
  eq(result.noLimitProps, true, 'das Divine Pack hat kein Einmal-Limit mehr');
  eq(result.boughtTwice, true, 'das Divine Pack lässt sich beliebig oft kaufen (2 Käufe: 200.000 Coins, 6 Karten gezogen)');
  eq(result.shopAlwaysBuyable, true, 'der Shop zeigt das Pack immer als kaufbar');
  eq(result.adminGivesOneEachTime, true, 'Admin-Geschenk gibt je 1 Karte und ist wiederholbar');
  eq(result.keptOnlyFirst, true, 'Start-Check: stehen mehrere Divine-Karten im Kader, bleibt nur die erste');
  eq(result.pickerBadgeShown, true, 'im Aufstellungs-Picker ist jede weitere Divine-Karte als "MAX. 1 DIVINE" gesperrt');
  eq(result.presetKeepsOne, true, 'ein geladener Kader mit mehreren Divine-Karten behält nur eine');
  eq(result.pendingSaved, true, 'die offene Auswahl wird im Profil gemerkt');
  eq(result.resumed, true, 'nach einem Neustart wird die offene Auswahl wieder aufgemacht');
  eq(result.resumeKeptOne, true, 'die fortgesetzte Auswahl behält genau 1 Karte und löscht den Merker');
  eq(result.packOk, true, 'Divine Pack: Tier divine, 100.000 Coins, 3 Karten, 1 wählbar, letztes Pack im Shop');
  eq(result.drawsOk, true, 'jede Ziehung sind 3 verschiedene Divine-Karten');
  eq(result.allNineReachable, true, 'alle 9 Divine-Karten sind ziehbar');
  eq(result.noSbc, true, 'es gibt keine Divine-Challenges mehr');
  ok(result.sourceMentionsPack, 'Erhalt-Hinweis der Karte nennt das Divine Pack');
  eq(result.storeDivineLast, true, 'im Kartenladen steht Divine als eigener Abschnitt ganz unten');
  eq(result.storeFx, true, 'die Shop-Kachel hat die Effekt-Ebenen (Strahlen, 7 Partikel, 2 Sternschnuppen)');
  eq(result.navHasDivine, true, 'die Schnellnavigation hat einen Divine-Button');
  eq(result.visualHasFx, true, 'die große Pack-Ansicht beim Öffnen hat die Divine-Effekte');
  eq(result.threeGrantedUpFront, true, 'alle 3 Karten sind sofort gesichert (Verlustschutz bei Abbruch)');
  eq(result.sawDivineReveal, true, 'jede Divine-Karte bekommt das Divine-Reveal (cs-divine)');
  eq(result.pickScreen, true, 'danach erscheint der Auswahl-Bildschirm');
  eq(result.pickGridCount, true, 'es stehen genau 3 Karten zur Wahl');
  eq(result.exactlyOneKept, true, 'nach der Bestätigung bleibt genau die gewählte Karte übrig');
  eq(result.titleAfterPick, true, 'der Titel Divine wird nach der Auswahl freigeschaltet');
  eq(result.inOtherPack, false, 'Divine-Karten tauchen in keinem anderen Pack auf');
  summary('Divine-Karten-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
