// Regressionstest: Ballon d'Or 2026 Event (19.10.-27.10.2026 00:00). 30+30 Nominee-Karten (107), 5+5 Trainer (+8 %), 4 Gewinner-
// Platzhalter (126 / +10 %), Token aus 130er-Matches, Packs (1 bzw. 3 Token), Umwandlung am Verkündungstag, Admin-Gewinner.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId:'t', displayName:'T', coins:0, completedSBCs:{}, achievementStats:{}, unlockedNametags:[], crest:{shape:'shield',primary:'#fff',secondary:'#000',letter:'T'} };
    clubId = 't'; fb = null; sSet = async ()=>true; collection = []; managerCollection = [];
    const toasts = []; toast = (m)=>toasts.push(m);

    // ---------- Daten ----------
    const dataOk = BDO26_MEN.length===30 && BDO26_WOMEN.length===30 && BDO26_COACHES_MEN.length===5 && BDO26_COACHES_WOMEN.length===5;
    const allIds = BDO26_NOMINEES.map(c=>c.id).concat([BDO26_WIN_MEN.id, BDO26_WIN_WOMEN.id]);
    const idsUnique = new Set(allIds).size===allIds.length && new Set(BDO26_COACHES.map(c=>c.id).concat([BDO26_WIN_COACH_MEN.id, BDO26_WIN_COACH_WOMEN.id])).size===12;
    // keine Kollision mit irgendeinem anderen Kartenpool (Lehre aus dem Divine-ID-Fehler)
    const poolNames = ['ALL_BASE','ALL_SPECIAL','EXCLUSIVE_SPECIALS','GOAT_SPECIALS','WM_SPECIALS','PRIME_CARDS','KRONJUWELEN_SPECIALS','BLACK_HOLE_SPECIALS','SIGNATURE_SEASON_CARDS','OGICON_CARDS','POETEN_CARDS','LEGENDS_SPECIALS','TOTY_SPECIALS','UCLW_SPECIALS','DIVINE_CARDS'];
    const idSet = new Set(allIds); let collisions = 0, checked = 0;
    poolNames.forEach(nm=>{ let arr; try{ arr = eval(nm); }catch(e){ return; } if(!Array.isArray(arr)) return; checked++; arr.forEach(c=>{ if(c && idSet.has(c.id) && !String(c.theme).startsWith('bdo26')) collisions++; }); });
    const noCollision = collisions===0 && checked>=8;
    const mgrCollision = BDO26_COACHES.concat([BDO26_WIN_COACH_MEN,BDO26_WIN_COACH_WOMEN]).every(m=>MGR_BY_ID.get(m.id)===m);
    const nomineeProps = BDO26_NOMINEES.every(c=>c.ov===107 && c.untradable===true && BY_ID.get(c.id)===c && c.variant==='bdo26' && typeof c.pac==='number');
    const coachProps = BDO26_COACHES.every(c=>c.isManager && c.boostType==='percent' && c.boostValue===8 && c.untradable===true);
    const placeholders = [BDO26_WIN_MEN, BDO26_WIN_WOMEN].every(c=>c.ov===126 && c.placeholder===true && c.n==='???') && [BDO26_WIN_COACH_MEN, BDO26_WIN_COACH_WOMEN].every(c=>c.boostValue===10 && c.placeholder===true);
    // nicht in Packs / Pools
    const notInPacks = !PACKS.some(p=>{ try{ return (p.draw?Array.from({length:40},()=>p.draw()).flat():[]).some(c=>c && String(c.theme).startsWith('bdo26')); }catch(e){ return false; } });

    // ---------- Karten-Darstellung ----------
    const nomNode = cardEl(BDO26_MEN[10], '');
    const nomineeNode = nomNode.classList.contains('theme-bdo26') && !!nomNode.querySelector('.stats') && nomNode.querySelector('.name').textContent==='K. Mbappé';
    const winNode = cardEl(BDO26_WIN_MEN, '');
    const winPlaceholderNode = winNode.classList.contains('theme-bdo26win') && winNode.classList.contains('is-placeholder') && !winNode.querySelector('.stats')
      && winNode.querySelector('.divine-name').textContent==='???' && winNode.querySelector('.ov').textContent==='???' && !!winNode.querySelector('.bdo-rays');
    // Design v2: kleines Rundfoto + Lorbeerkranz + Band auf Nominee-, Gewinner- UND Trainerkarten
    const deco = (c)=>{ const n = cardEl(c,''); return n.classList.contains('bdo-card') && !!n.querySelector('.bdo-wreath') && !!n.querySelector('.bdo-frame') && !!n.querySelector('.bdo-burst') ? n.querySelector('.bdo-ribbon').textContent : null; };
    const designV2 = deco(BDO26_MEN[0])==='NOMINEE 2026' && deco(BDO26_COACHES[0])==='NOMINEE 2026' && deco(BDO26_WIN_MEN)==='WINNER 2026' && deco(BDO26_WIN_COACH_MEN)==='WINNER 2026';
    const roundPhoto = (()=>{ const host = document.createElement('div'); host.style.cssText='position:absolute;left:-9999px;'; document.body.appendChild(host); const out = {};
      ['','mini','xs'].forEach(sz=>{ const n = cardEl(BDO26_MEN[0], sz); host.appendChild(n); const f = n.querySelector('.photo-frame').getBoundingClientRect(); out[sz||'normal'] = Math.abs(f.width-f.height)<1.5 && f.width<125 && getComputedStyle(n.querySelector('.photo-frame')).borderRadius.indexOf('50%')>=0; }); host.remove(); return out.normal && out.mini && out.xs; })();
    const winnerSignatureFont = (()=>{ const host = document.createElement('div'); host.style.cssText='position:absolute;left:-9999px;'; document.body.appendChild(host); const n = cardEl(BDO26_WIN_MEN,''); host.appendChild(n); const ff = getComputedStyle(n.querySelector('.divine-name')).fontFamily; host.remove(); return /Jalliya/.test(ff); })();
    const coachNode = cardEl(BDO26_COACHES[4], '');
    const coachHasPhoto = !!coachNode.querySelector('img.face-photo') && /\+8%/.test(coachNode.textContent);
    const missingCard = {...BDO26_MEN[0], img:BDO26_PLACEHOLDER_IMG};
    const placeholderImgDirect = cardEl(missingCard,'').querySelector('img.face-photo').src.startsWith('data:image/svg+xml');
    const withPhoto = BDO26_MEN[10].img.startsWith('https://sportal365images.com/') && cardEl(BDO26_MEN[10],'').querySelector('img.face-photo').dataset.raw===BDO26_MEN[10].img;
    const photoCount = BDO26_NOMINEES.concat(BDO26_COACHES).filter(c=>c.img.startsWith('https://')).length;
    const photosMapped = photoCount===70 && BDO26_COACHES.every(c=>c.img.startsWith('https://')); // alle 60 Spieler:innen + 10 Trainer

    // ---------- Phasen ----------
    const t = (s)=>new Date(s).getTime();
    const phases = [bdo26Phase(t('2026-10-18T23:59:59')), bdo26Phase(t('2026-10-19T00:00:00')), bdo26Phase(t('2026-10-25T23:59:59')),
                    bdo26Phase(t('2026-10-26T00:00:00')), bdo26Phase(t('2026-10-26T23:59:59')), bdo26Phase(t('2026-10-27T00:00:00')), bdo26Phase(t('2026-11-02T00:00:00'))];
    const phasesOk = JSON.stringify(phases)===JSON.stringify(['before','earn','earn','convert','convert','ended','ended']);

    // ---------- Event-Woche: Matches, Token, Packs (Phase 'earn' erzwingen) ----------
    const realPhase = bdo26Phase;
    bdo26Phase = ()=>'earn';
    squad = {formation:'433', slots:{}, managerUid:null, tactics:{}};
    squadRating = ()=>({rating:90, filled:11});
    buildFixedRatingOpponent = (r)=>{ buildFixedRatingOpponent.last = r; return {owner:'Gegner', rating:r, players:[], managerName:'X'}; };
    let nextResult = 'WIN';
    runLocalMatch = async (rating, opp, o)=>{ await o.onComplete({result:nextResult}); };
    view = document.getElementById('view'); currentTab = 'store'; // wie im echten Spiel: Banner -> renderView('bdo26') setzt currentTab nicht
    renderBdo26Hub(view);
    const hubRendered = !!document.querySelector('.bdo-head') && document.querySelectorAll('.bdo-own-grid .pcard').length===70;
    profile.bdo26Tokens = 0;
    await playBdo26Match();
    const matchTargets130 = buildFixedRatingOpponent.last===130;
    const winGivesToken = profile.bdo26Tokens===1 && profile.bdo26Wins===1;
    const liveHudAfterWin = document.querySelector('.bdo-head-tokens').textContent.trim().startsWith('1') && document.getElementById('bdo26-wins').textContent==='1'
      && document.getElementById('bdo26-open-pack').disabled===false && document.getElementById('bdo26-match-btn').style.display!=='none';
    nextResult = 'LOSS'; await playBdo26Match();
    const lossNoToken = profile.bdo26Tokens===1;
    // Pack: 1 Token -> 1 Nominee (Karte in Sammlung, Token weg); ohne Token nichts
    showPackOpening = (pack, drawn, o)=>{ showPackOpening.last = {pack, drawn, o}; collection.push(...drawn.filter(c=>!c.isManager).map(c=>({uid:'u'+Math.random(), cardId:c.id}))); managerCollection.push(...drawn.filter(c=>c.isManager).map(c=>({uid:'m'+Math.random(), mgrId:c.id}))); };
    profile.bdo26Tokens = 1;
    await openBdo26Pack('player');
    const liveHudAfterPack = document.querySelector('.bdo-head-tokens').textContent.trim().startsWith('0') && document.getElementById('bdo26-open-pack').disabled===true;
    const playerPackOk = profile.bdo26Tokens===0 && collection.length===1 && showPackOpening.last.drawn.length===1 && BDO26_NOMINEES.includes(showPackOpening.last.drawn[0]) && showPackOpening.last.o.untradable===true;
    await openBdo26Pack('player');
    const noTokenNoPack = collection.length===1;
    // Trainer-Pack kostet 3
    profile.bdo26Tokens = 2; await openBdo26Pack('coach');
    const coachNeeds3 = profile.bdo26Tokens===2 && managerCollection.length===0;
    profile.bdo26Tokens = 3; await openBdo26Pack('coach');
    const coachPackOk = profile.bdo26Tokens===0 && managerCollection.length===1 && BDO26_COACHES.some(c=>c.id===managerCollection[0].mgrId);
    // Packs liefern immer neue Karten, bis alles gesammelt ist
    collection = BDO26_NOMINEES.slice(0,-1).map((c,i)=>({uid:'n'+i, cardId:c.id})); profile.bdo26Tokens = 1;
    await openBdo26Pack('player');
    const lastMissingDrawn = showPackOpening.last.drawn[0]===BDO26_NOMINEES[BDO26_NOMINEES.length-1];
    collection = BDO26_NOMINEES.map((c,i)=>({uid:'f'+i, cardId:c.id})); profile.bdo26Tokens = 1;
    await openBdo26Pack('player');
    const dupesWhenComplete = BDO26_NOMINEES.includes(showPackOpening.last.drawn[0]);
    // Herren UND Damen werden gezogen (Gleichverteilung grob)
    let m=0,w=0; for(let i=0;i<400;i++){ const c = pick(BDO26_NOMINEES); if(c.gender==='m') m++; else w++; }
    const bothGendersDrawn = m>120 && w>120;
    // Doppelklick-Schutz: zwei Aufrufe direkt hintereinander mit 1 Token -> nur 1 Pack
    collection = []; profile.bdo26Tokens = 1;
    await Promise.all([openBdo26Pack('player'), openBdo26Pack('player')]);
    const doubleClickSafe = collection.length===1 && profile.bdo26Tokens===0;
    // Nach der Event-Woche: keine Matches/Packs mehr
    bdo26Phase = ()=> 'convert'; profile.bdo26Tokens = 5; collection = [];
    await playBdo26Match(); await openBdo26Pack('player');
    const lockedAfterAnnouncement = collection.length===0 && profile.bdo26Tokens===5 && buildFixedRatingOpponent.last===130;
    bdo26Phase = realPhase;

    // ---------- Umwandlung am Verkündungstag ----------
    const mbappe = BDO26_MEN.find(c=>c.slug==='mbappe'), pina = BDO26_WOMEN.find(c=>c.slug==='pina'), enrique = BDO26_COACHES.find(c=>c.slug==='luis-enrique'), romeu = BDO26_COACHES.find(c=>c.slug==='romeu');
    collection = [{uid:'a1', cardId:mbappe.id}, {uid:'a2', cardId:mbappe.id}, {uid:'b1', cardId:BDO26_MEN[0].id}];
    managerCollection = [{uid:'m1', mgrId:enrique.id}];
    squad = {formation:'433', slots:{st:'a1'}, managerUid:'m1', tactics:{}};
    profile.bdo26Converted = {};
    bdo26Config = {winners:{men:'mbappe', women:'pina', coachMen:'luis-enrique', coachWomen:'romeu'}, announcedAt:Date.now()};
    bdo26ApplyWinners(bdo26Config);
    const winnerFilled = BDO26_WIN_MEN.n==='K. Mbappé' && BDO26_WIN_MEN.placeholder===false && BDO26_WIN_MEN.ov===126 && BDO26_WIN_MEN.pac===mbappe.pac+19
      && BDO26_WIN_WOMEN.n==='C. Pina' && BDO26_WIN_COACH_MEN.n==='Luis Enrique' && BDO26_WIN_COACH_MEN.placeholder===false;
    // vor dem Verkündungstag: nichts passiert
    const early = await bdo26ConvertOwned(new Date('2026-10-25T12:00:00').getTime());
    const noEarlyConvert = early.length===0 && collection.every(c=>c.cardId!==BDO26_WIN_MEN.id);
    const conv = await bdo26ConvertOwned(new Date('2026-10-26T08:00:00').getTime());
    const oneCopyOnly = collection.filter(c=>c.cardId===BDO26_WIN_MEN.id).length===1 && collection.filter(c=>c.cardId===mbappe.id).length===1;
    const uidKept = collection.find(c=>c.uid==='a1').cardId===BDO26_WIN_MEN.id && squad.slots.st==='a1'; // erste Kopie (die aufgestellte) wurde umgewandelt, bleibt aufgestellt
    const unrelatedUntouched = collection.find(c=>c.uid==='b1').cardId===BDO26_MEN[0].id;
    const coachConverted = managerCollection[0].mgrId===BDO26_WIN_COACH_MEN.id && BDO26_WIN_COACH_MEN.boostValue===10 && ownedMgrBoost(BDO26_WIN_COACH_MEN)===10;
    function ownedMgrBoost(mm){ return mm.boostValue; }
    const noCardNoConversion = !collection.some(c=>c.cardId===BDO26_WIN_WOMEN.id) && conv.length===2 && !managerCollection.some(x=>x.mgrId===BDO26_WIN_COACH_WOMEN.id);
    const secondRunNoop = (await bdo26ConvertOwned(new Date('2026-10-27T08:00:00').getTime())).length===0 && collection.filter(c=>c.cardId===BDO26_WIN_MEN.id).length===1;
    const resolvesToWinnerCard = ownedCard('a1') && ownedCard('a1').id===BDO26_WIN_MEN.id && ownedCard('a1').ov===126;
    // wer die Damen-Nominee erst NACH der ersten Umwandlung hat (z.B. spät eingeloggt), bekommt sie beim nächsten Lauf
    collection.push({uid:'p1', cardId:pina.id});
    const late = await bdo26ConvertOwned(new Date('2026-11-05T08:00:00').getTime());
    const lateConvert = late.length===1 && collection.find(c=>c.uid==='p1').cardId===BDO26_WIN_WOMEN.id;

    // ---------- Admin: Gewinner festlegen ----------
    const writes = [];
    fb = { doc:(db,c,id)=>({path:c+'/'+id}), getDoc: async ()=>({exists:()=>false, data:()=>null}), setDoc: async (ref,val)=>{ writes.push({path:ref.path,val}); } };
    bdo26Config = null;
    await openAdminBdo26Modal();
    const selects = ['men','women','coachMen','coachWomen'].every(c=>!!document.getElementById('bdo26-win-'+c));
    const optionCounts = document.getElementById('bdo26-win-men').options.length===31 && document.getElementById('bdo26-win-coachWomen').options.length===6;
    document.getElementById('bdo26-win-men').value = 'messi'; document.getElementById('bdo26-win-coachMen').value = 'kompany';
    document.getElementById('bdo26-win-save').click(); await new Promise(r=>setTimeout(r,50));
    const adminSaved = writes.length===1 && writes[0].path==='config/ballondor2026' && writes[0].val.winners.men==='messi' && writes[0].val.winners.coachMen==='kompany' && !('women' in writes[0].val.winners);
    fb = null;

    // ---------- Banner ----------
    const bannerBefore = renderBdo26Banner();
    const bannerOk = bdo26Phase()==='ended' ? bannerBefore==='' : bannerBefore.includes('bdo-banner');

    return { designV2, roundPhoto, winnerSignatureFont, withPhoto, photosMapped, dataOk, idsUnique, noCollision, mgrCollision, nomineeProps, coachProps, placeholders, notInPacks, nomineeNode, winPlaceholderNode, coachHasPhoto, placeholderImgDirect,
      phasesOk, hubRendered, matchTargets130, winGivesToken, lastMissingDrawn, dupesWhenComplete, liveHudAfterWin, liveHudAfterPack, lossNoToken, playerPackOk, noTokenNoPack, coachNeeds3, coachPackOk, bothGendersDrawn, doubleClickSafe, lockedAfterAnnouncement,
      winnerFilled, noEarlyConvert, oneCopyOnly, uidKept, unrelatedUntouched, coachConverted, noCardNoConversion, secondRunNoop, resolvesToWinnerCard, lateConvert,
      selects, optionCounts, adminSaved, bannerOk };
  }));

  console.log('Ballon-dOr-2026-Test');
  noErrors(errors, 'Seite');
  const E = (k, msg)=>eq(result[k], true, msg);
  E('dataOk','30 Herren + 30 Damen Nominees, je 5 Trainer');
  E('idsUnique','alle Karten-/Trainer-IDs sind eindeutig');
  E('noCollision','keine ID-Kollision mit einem anderen Kartenpool');
  E('mgrCollision','Trainer sind in MGR_BY_ID registriert');
  E('nomineeProps','alle Nominees: 107 OVR, nicht handelbar, in BY_ID, Stats vorhanden');
  E('coachProps','alle Trainer-Nominees: +8 %, nicht handelbar');
  E('placeholders','Gewinner-Platzhalter: 126 OVR / +10 %, "???"');
  E('notInPacks','Event-Karten tauchen in keinem normalen Pack auf');
  E('nomineeNode','Nominee-Karte rendert mit Event-Design und normalen Stats');
  E('winPlaceholderNode','Gewinner-Platzhalter: "???", Signatur-Layout ohne Stats, Lichtstrahlen');
  E('coachHasPhoto','Trainerkarte zeigt ein Foto (Platzhalter) und +8 %');
  E('designV2','Nominee-, Gewinner- und Trainerkarten haben Rundfoto-Dekor (Kranz, Rahmen, Strahlen) und das Band NOMINEE/WINNER 2026');
  E('roundPhoto','das Foto ist in allen Größen (normal/mini/xs) klein und wirklich rund (Breite = Höhe)');
  E('winnerSignatureFont','der Gewinner-Name nutzt die Signatur-Schrift Jalliya');
  E('withPhoto','Karten mit Bildlink zeigen das echte Foto (über den Bildproxy, Original als Fallback)');
  E('photosMapped','alle 70 Bilder eingetragen (60 Spieler/innen, 10 Trainer)');
  E('placeholderImgDirect','Platzhalterbild wird direkt eingebunden (nicht über den Bildproxy)');
  E('phasesOk','Phasen: vor Start / Event-Woche / Umwandlung / beendet an den richtigen Zeitpunkten');
  E('hubRendered','Event-Hub rendert Kopf und Sammlungsraster (30+30+10 Karten)');
  E('matchTargets130','das Event-Match baut ein 130er-Team');
  E('lastMissingDrawn','ein Pack zieht nur Karten, die man noch nicht hat (fehlt nur eine, kommt genau diese)');
  E('dupesWhenComplete','sind alle gesammelt, kommen weiter Karten (Duplikate)');
  E('winGivesToken','ein Sieg gibt genau 1 Token');
  E('liveHudAfterWin','nach einem Sieg aktualisieren sich Token-Anzeige, Sieg-Zähler, Pack-Knopf und Match-Knopf sofort (Hub über renderView geöffnet, ohne Tab-Wechsel)');
  E('liveHudAfterPack','nach dem Pack-Öffnen sinkt die Token-Anzeige sofort und der Pack-Knopf sperrt sich');
  E('lossNoToken','eine Niederlage gibt keinen Token');
  E('playerPackOk','1 Token = 1 Pack mit genau 1 zufälliger Nominee-Karte (untradable)');
  E('noTokenNoPack','ohne Token lässt sich kein Pack öffnen');
  E('coachNeeds3','das Trainer-Pack braucht 3 Token');
  E('coachPackOk','3 Token = 1 Trainer-Nominee');
  E('bothGendersDrawn','Herren und Damen werden etwa gleich oft gezogen');
  E('doubleClickSafe','zwei schnelle Klicks mit 1 Token öffnen nur 1 Pack');
  E('lockedAfterAnnouncement','ab der Verkündung: keine Matches/Packs mehr, Token bleiben');
  E('winnerFilled','Gewinner-Karten werden mit den Daten des Gewinners gefüllt (126 OVR, +19 auf alle Stats)');
  E('noEarlyConvert','vor dem Verkündungstag wird nichts umgewandelt');
  E('oneCopyOnly','von mehreren Kopien wird genau EINE umgewandelt');
  E('uidKept','die umgewandelte Karte behält uid und Aufstellung');
  E('unrelatedUntouched','andere Nominee-Karten bleiben unberührt');
  E('coachConverted','Trainer-Nominee wird zur +10-%-Version');
  E('noCardNoConversion','wer die Gewinner-Nominee nicht hat, bekommt nichts');
  E('secondRunNoop','die Umwandlung läuft pro Kategorie nur einmal');
  E('resolvesToWinnerCard','die Sammlung löst die umgewandelte Karte als 126er-Gewinnerkarte auf');
  E('lateConvert','wer die Nominee-Karte erst später hat, bekommt beim nächsten Lauf die Umwandlung');
  E('selects','Admin-Modal hat 4 Gewinner-Auswahlfelder');
  E('optionCounts','Auswahl enthält alle Nominees (30 / 5)');
  E('adminSaved','Admin speichert config/ballondor2026 mit den gewählten Gewinnern');
  E('bannerOk','Banner im Kartenladen passend zur Phase');
  summary('Ballon-dOr-2026-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
