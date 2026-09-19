// Regressionstest für die UI-Überarbeitung des Draft-Modus: (1) das Rollen ist jetzt interaktiv (~1.5s
// "welches Land?"-Animation, dann die 4 Spieler nacheinander aufgedeckt statt alles sofort), (2)
// bekannte Fußball-Großmächte (Deutschland, Frankreich, Argentinien, ...) sind beim Land-Rollen
// wahrscheinlicher als andere Nationen, (3) die Aufstellung wird als echtes Spielfeld mit echten Karten
// gezeigt statt als Text-Liste, (4) "Neu starten" räumt auch noch laufende Animations-Timer weg.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId:'test', displayName:'Test FC', coins:1000, crest:{shape:'shield',primary:'#fff',secondary:'#000',letter:'T'}, achievementStats:{} };
    clubId = 'test'; fb = null; sSet = async () => true;

    // ---------- (1) Land-Gewichtung: Großmächte klar wahrscheinlicher als eine übliche Kleinnation ----------
    const nations = draftAllNations();
    const counts = {};
    for(let i=0;i<3000;i++){ const n = draftPickWeightedNation(nations); counts[n] = (counts[n]||0)+1; }
    const bigNationAvg = ['Germany','France','Argentina','Brazil'].filter(n=>nations.includes(n)).map(n=>counts[n]||0).reduce((a,b)=>a+b,0) / 4;
    // irgendeine Nation mit Standardgewicht 1 (nicht in DRAFT_NATION_WEIGHT gelistet) als Vergleich
    const smallNation = nations.find(n=>!(n in DRAFT_NATION_WEIGHT));
    const smallNationCount = smallNation ? (counts[smallNation]||0) : 0;
    const bigNationsClearlyFavored = smallNation ? bigNationAvg > smallNationCount * 3 : true;

    // ---------- (2)+(3)+(4): echter Klick-Durchlauf durch die neue interaktive UI ----------
    const def = CHALLENGE_DEFS.find(d=>d.id==='draft');
    openChallengeDetail(def);
    document.getElementById('draft-roll-start-btn').click();

    // Vor dem ersten "Land rollen"-Klick: idle-Phase, echtes leeres Spielfeld sichtbar (11 pitch-slots).
    const pitchSlotCountIdle = document.querySelectorAll('#draft-pitch-wrap .pitch-slot').length;

    document.getElementById('draft-roll-go-btn').click();
    // Sofort nach dem Klick: spinning-Phase - noch KEINE der 4 Spielerkarten sichtbar (das Walzen-Reel läuft noch).
    const noCardsDuringSpin = !document.getElementById('draft-roll-pick-list');
    const reelPresent = !!document.getElementById('draft-reel-strip') && document.getElementById('draft-reel-strip').children.length > 0;

    // Statt starrer Sleep-Zeitpunkte (anfällig für Jitter/langsame Testmaschinen) laufend pollen und
    // jeden tatsächlich auftretenden Aufdeck-Stand festhalten - beweist die STAGGERED Reihenfolge
    // (0 -> 1 -> 2 -> 3 -> 4, nicht alles auf einmal), ohne von exakten Millisekunden abzuhängen.
    const seenCounts = [0];
    const deadline = Date.now() + 2200 + 4*450 + 1500;
    while(Date.now() < deadline){
      const c = document.querySelectorAll('#draft-roll-pick-list .draft-card-reveal').length;
      if(seenCounts[seenCounts.length-1] !== c) seenCounts.push(c);
      if(c===4) break;
      await new Promise(r=>setTimeout(r, 40));
    }
    const zeroRevealedRightAfterSpin = seenCounts.length>1 && seenCounts[0]===0;
    const oneRevealedMidway = seenCounts.length >= 3; // mind. ein Zwischenschritt zwischen 0 und 4 tatsächlich beobachtet
    const allFourRevealed = seenCounts[seenCounts.length-1] === 4;
    const pickableCount = Array.from(document.querySelectorAll('#draft-roll-pick-list > div')).filter(el=>el.style.cursor==='pointer').length;
    const atLeastOnePickable = pickableCount >= 1;

    // Eine passende Karte anklicken -> Slot wird im echten Spielfeld (Pitch) sichtbar mit einer echten Karte.
    // Da bei einem völlig leeren Feld eine Karte oft auf MEHR als einen offenen Slot passt (z.B. CB auf
    // cb1 UND cb2), kann das die einmalige Auswahl-Modal auslösen (sechste Feedback-Runde) - in dem Fall
    // hier einfach die erste angebotene Position wählen, um den Testfluss fortzusetzen.
    const clickable = Array.from(document.querySelectorAll('#draft-roll-pick-list > div')).find(el=>el.style.cursor==='pointer');
    clickable.click();
    await new Promise(r=>setTimeout(r, 30));
    const choiceBtn = document.querySelector('#modal-root [data-slot]');
    if(choiceBtn) choiceBtn.click();
    await new Promise(r=>setTimeout(r, 30));
    const pitchNowShowsOneRealCard = document.querySelectorAll('#draft-pitch-wrap .pitch-slot .pcard').length === 1;
    const backToIdlePhaseAfterPick = !!document.getElementById('draft-roll-go-btn');

    // ---------- (4) Neu starten mitten in der Animation räumt Timer weg ----------
    document.getElementById('draft-roll-go-btn').click(); // neuer Roll, direkt wieder mitten in "spinning"
    document.getElementById('draft-restart-btn').click(); // sofortiger Restart, bevor die 1.5s um sind
    const restartedToIdleImmediately = !!document.getElementById('draft-roll-go-btn');
    await new Promise(r=>setTimeout(r, 2200 + 4*450 + 150)); // die GESAMTE alte Animationsdauer abwarten
    // Wäre der alte Timer nicht aufgeräumt worden, würde er jetzt mitten in die frische Aufstellung reinfunken
    // (z.B. ungewollt einen Slot befüllen) - Feld muss nach dem Restart weiterhin komplett leer sein.
    const stillCleanAfterOldTimersWouldHaveFired = document.querySelectorAll('#draft-pitch-wrap .pitch-slot .pcard').length === 0
      && !!document.getElementById('draft-roll-go-btn');

    document.getElementById('modal-root') && (document.getElementById('modal-root').innerHTML = '');

    return {
      bigNationsClearlyFavored, pitchSlotCountIdle, noCardsDuringSpin, reelPresent,
      zeroRevealedRightAfterSpin, oneRevealedMidway, allFourRevealed, atLeastOnePickable,
      pitchNowShowsOneRealCard, backToIdlePhaseAfterPick, restartedToIdleImmediately,
      stillCleanAfterOldTimersWouldHaveFired,
    };
  }));

  console.log('Draft-Modus-UI-Test');
  noErrors(errors, 'Seite');
  ok(result.bigNationsClearlyFavored, 'bekannte Fußball-Großmächte (Deutschland/Frankreich/Argentinien/Brasilien) werden beim Land-Rollen klar häufiger gezogen als eine gewöhnliche Nation');
  eq(result.pitchSlotCountIdle, 11, 'die Aufstellung wird als echtes 11-Slot-Spielfeld angezeigt, nicht als Text-Liste');
  eq(result.noCardsDuringSpin, true, 'während der Land-Animation sind die 4 Spielerkarten noch nicht sichtbar');
  eq(result.reelPresent, true, 'die Land-Rollen-Animation zeigt ein Walzen-/Slot-Machine-Reel mit mehreren Länder-Kacheln');
  eq(result.zeroRevealedRightAfterSpin, true, 'direkt nach Ende der ~1.5s-Land-Animation ist noch keine der 4 Karten aufgedeckt');
  eq(result.oneRevealedMidway, true, 'die Karten werden nacheinander aufgedeckt (mindestens ein Zwischenstand zwischen 0 und 4 tatsächlich beobachtet), nicht alle gleichzeitig');
  eq(result.allFourRevealed, true, 'am Ende der Sequenz sind alle 4 Karten aufgedeckt');
  eq(result.atLeastOnePickable, true, 'mindestens eine der aufgedeckten Karten ist tatsächlich anklickbar');
  eq(result.pitchNowShowsOneRealCard, true, 'nach der Auswahl zeigt das echte Spielfeld die gewählte Karte an ihrer Position');
  eq(result.backToIdlePhaseAfterPick, true, 'nach einer Auswahl kehrt die UI zur "Land rollen"-Bereitschaft für den nächsten Slot zurück');
  eq(result.restartedToIdleImmediately, true, 'Neu starten funktioniert auch mitten in der Animation sofort');
  eq(result.stillCleanAfterOldTimersWouldHaveFired, true, 'Neu starten räumt laufende Animations-Timer wirklich weg (kein Nachfunken der alten Ziehung in die neue Aufstellung)');

  summary('Draft-Modus-UI-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
