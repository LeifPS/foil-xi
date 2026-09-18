// Regressionstest für die dritte Feedback-Runde zum Draft-Modus: (1) der Draft zieht jetzt aus
// GENAU demselben Pool wie der Karten-Index (adminFullCardPool()) statt nur ALL_BASE+ALL_SPECIAL -
// jede im Index sichtbare Kartenvariante (TOTY, Prime, GOAT, Kronjuwelen, WM-Kapitän, ...) muss
// grundsätzlich draftbar sein. (2) EINZIGE Ausnahme: die WM-Variante-Basiskarten (jeder WM-2026-
// Nationalspieler bekommt eine, würde den Pool mit tausenden fast identischen +5-OVR-Reskins fluten)
// bleiben ausgeschlossen - die WM-Kapitän-Karten dagegen ausdrücklich NICHT. (3) im Rollen-Bildschirm
// werden nicht mehr passende Karten jetzt per echtem Graustufen-Filter ausgegraut, nicht nur per
// reduzierter Deckkraft.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId:'test', displayName:'Test FC', coins:1000, crest:{shape:'shield',primary:'#fff',secondary:'#000',letter:'T'}, achievementStats:{} };
    clubId = 'test'; fb = null; sSet = async () => true;

    const pool = draftCardPool();
    const indexPool = adminFullCardPool();

    // (1) Der Draft-Pool enthält tatsächlich Kartenvarianten jenseits von ALL_BASE/ALL_SPECIAL, die im
    // Karten-Index auftauchen (z.B. TOTY, Prime, GOAT, Kronjuwelen) - ein reiner ALL_BASE+ALL_SPECIAL-
    // Pool hätte KEINE dieser Varianten enthalten.
    const specialVariantsPresent = ['toty','prime','goat','dia','saph','rub'].filter(v => pool.some(c=>c.variant===v));
    const hasSpecialVariantsBeyondBase = specialVariantsPresent.length >= 3;

    // (2a) WM-Variante-Basiskarten (variant 'wm26_variante') sind explizit ausgeschlossen.
    const wm26VarianteInPool = pool.filter(c=>c.variant==='wm26_variante').length;
    // (2b) WM-Kapitän-Karten (variant 'wm26_kapitaen') bleiben dagegen enthalten.
    const wm26KapitaenInPool = pool.filter(c=>c.variant==='wm26_kapitaen').length;
    const wm26KapitaenAlsoInIndex = indexPool.filter(c=>c.variant==='wm26_kapitaen').length;

    // (2c) Der Draft-Pool entspricht dem Index-Pool MINUS genau der WM-Variante-Karten (keine anderen
    // zufälligen Unterschiede).
    const expectedSize = indexPool.filter(c=>c.variant!=='wm26_variante').length;
    const poolSizeMatchesIndexMinusWm26Variante = pool.length === expectedSize;

    // (3) Odds nochmal gebufft - Summe bleibt exakt 1, aber 90+ und 100+ sind jetzt höher als vorher.
    const oddsSum = DRAFT_ROLL_TIERS.reduce((s,t)=>s+t.chance,0);
    const oddsSumIsOne = Math.abs(oddsSum-1) < 0.0001;
    const tier90 = DRAFT_ROLL_TIERS.find(t=>t.min===90).chance;
    const tier100 = DRAFT_ROLL_TIERS.find(t=>t.min===100).chance;
    const oddsBuffedFurther = tier90 >= 0.2 && tier100 >= 0.06; // klar über der vorigen Fassung (0.15 / 0.04)

    // (4) Graues Ausgrauen nicht mehr passender Karten - echte UI-Prüfung über die Roll-Klasse.
    const def = CHALLENGE_DEFS.find(d=>d.id==='draft');
    openChallengeDetail(def);
    draftStartRoll();
    // Ein einzelnes offenes Slot übrig lassen (GK), Rest künstlich mit Dummy-Karten füllen, damit ein
    // Roll garantiert sowohl passende (GK) als auch unpassende (jede Feldspieler-Position) Kandidaten
    // enthalten kann, ohne von echtem Zufall abzuhängen.
    FORMATIONS['433'].slots.forEach(fs=>{
      if(fs.id==='gk') return;
      draftRollState.slots.find(s=>s.id===fs.id).card = {id:900666000+Math.random(), n:'Dummy '+fs.id, pos:fs.label, ov:70, pac:60,sho:60,pas:60,dri:60,defn:60,phy:60, traits:[], variant:'base', nat:'Germany'};
    });
    // Wiederholt rollen, bis ein Angebot mit garantiert mind. 1 nicht-passenden Feldspieler auftaucht
    // (bei nur GK offen passt jeder Nicht-Torwart nicht) - das ist der Normalfall, da GK-Karten selten sind.
    let foundUnfitCase = false;
    for(let attempt=0; attempt<15 && !foundUnfitCase; attempt++){
      draftClearRollTimers(draftRollState);
      draftRollState.currentRoll = null; draftRollState.rollPhase = 'idle'; draftRollState.revealedCount = 0;
      const roll = draftRollNationAndCards(draftRollState.slots, draftRollState.usedNames);
      if(roll.cards.some(c => !draftCardFitsAnyOpenSlot(c, draftOpenSlotLabels(draftRollState.slots)))){
        draftRollState.currentRoll = roll;
        draftRollState.revealedCount = 4;
        draftRollState.rollPhase = 'done';
        foundUnfitCase = true;
      }
    }
    renderDraftPanel();
    const unfitCardEls = document.querySelectorAll('#draft-roll-pick-list .draft-card-unfit');
    const grayscaleClassApplied = foundUnfitCase && unfitCardEls.length > 0;
    const grayscaleFilterActuallySet = grayscaleClassApplied && getComputedStyle(unfitCardEls[0]).filter.includes('grayscale');

    document.getElementById('modal-root') && (document.getElementById('modal-root').innerHTML = '');

    return {
      hasSpecialVariantsBeyondBase, specialVariantsPresent,
      wm26VarianteInPool, wm26KapitaenInPool, wm26KapitaenAlsoInIndex,
      poolSizeMatchesIndexMinusWm26Variante,
      oddsSumIsOne, oddsBuffedFurther,
      foundUnfitCase, grayscaleClassApplied, grayscaleFilterActuallySet,
    };
  }));

  console.log('Draft-Modus-Voller-Pool-Test');
  noErrors(errors, 'Seite');
  ok(result.hasSpecialVariantsBeyondBase, `der Draft-Pool enthält Kartenvarianten aus dem Karten-Index jenseits von Basis-/normalen Sonderkarten (gefunden: ${JSON.stringify(result.specialVariantsPresent)})`);
  eq(result.wm26VarianteInPool, 0, 'WM-Variante-Basiskarten (variant wm26_variante) sind vollständig aus dem Draft-Pool ausgeschlossen');
  ok(result.wm26KapitaenAlsoInIndex > 0, 'Vorbedingung: WM-Kapitän-Karten existieren überhaupt im Karten-Index');
  eq(result.wm26KapitaenInPool, result.wm26KapitaenAlsoInIndex, 'WM-Kapitän-Karten (variant wm26_kapitaen) bleiben dagegen VOLLSTÄNDIG im Draft-Pool enthalten');
  eq(result.poolSizeMatchesIndexMinusWm26Variante, true, 'der Draft-Pool entspricht exakt dem Karten-Index minus der WM-Variante-Karten, keine anderen Abweichungen');
  eq(result.oddsSumIsOne, true, 'die Odds-Verteilung summiert sich weiterhin exakt auf 100%');
  eq(result.oddsBuffedFurther, true, 'die 90+ und 100+ Odds wurden gegenüber der vorherigen Fassung nochmal spürbar erhöht');
  eq(result.foundUnfitCase, true, 'Testvorbedingung: ein Wurf mit mindestens einer nicht mehr passenden Karte konnte erzeugt werden');
  eq(result.grayscaleClassApplied, true, 'nicht mehr passende Karten bekommen die draft-card-unfit-Klasse');
  eq(result.grayscaleFilterActuallySet, true, 'nicht mehr passende Karten werden tatsächlich per Graustufen-Filter ausgegraut, nicht nur abgedunkelt');

  summary('Draft-Modus-Voller-Pool-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
