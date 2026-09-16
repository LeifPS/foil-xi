// Regressionstest für den großen Skill-Duell-Umbau "Mach das nur Finesse Curved, mach alles 10x
// besser, füge für alle restlichen PlayStyles Fähigkeiten ein": deckt (1) den Kurve-nur-bei-Finesse-
// Fix in skReleaseShot, (2) die 13 neu ergänzten PlayStyle+ -> Move-Zuordnungen (skillMovesForCard),
// (3) die Elite-Variante jedes neuen aktiven/passiven Moves gegenüber der Basis-Variante, (4) den
// manualTraits-Bugfix in resolveSkillCardRef (verhindert doppelte OV-Elite-Herleitung nach dem
// Netzwerk-Roundtrip) und (5) die beiden zuletzt gefundenen Bugfixes (SK_MOVE_NO_BUTTON fehlte
// 'powershot'; isLowshot konnte sich mit Volley/Header stapeln, wenn der Ball zufällig in der Luft war).
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    function makeCard(id, traits, extra){
      return {id, n:'T'+id, pos:'ST', ov:88, club:'Test FC', nat:'DE', lg:'Test-Liga',
        pac:75, sho:80, pas:70, dri:75, defn:40, phy:75, traits, variant:'base', ...extra};
    }

    // ---------- (1) Kurve NUR bei Finesse Shot ----------
    const finesseCard = makeCard(900000201, ['Angeschn. Schuss']);
    BY_ID.set(finesseCard.id, finesseCard);
    const p1 = makeSkillPlayer(100, 100, '#fff', false, finesseCard);
    const ball = {x:110, y:100, vx:0, vy:0, r:8, spin:0, airborne:0};
    p1.touchTimer = 0.2; p1.lastTouchBallX = ball.x; p1.lastTouchBallY = ball.y;
    p1.lastTouchPlayerX = p1.x; p1.lastTouchPlayerY = p1.y;
    p1.vx = 0; p1.vy = 300; // starke seitliche (perpendikuläre) Geschwindigkeit relativ zur Schussrichtung
    p1.finesseHeld = false;
    skReleaseShot(p1, ball);
    const noCurveWithoutFinesse = ball.spin === 0;

    const p2 = makeSkillPlayer(100, 100, '#fff', false, finesseCard);
    const ball2 = {x:110, y:100, vx:0, vy:0, r:8, spin:0, airborne:0};
    p2.touchTimer = 0.2; p2.lastTouchBallX = ball2.x; p2.lastTouchBallY = ball2.y;
    p2.lastTouchPlayerX = p2.x; p2.lastTouchPlayerY = p2.y;
    p2.vx = 0; p2.vy = 300;
    p2.finesseHeld = true; // Karte hat den Move UND hält ihn -> jetzt darf Kurve entstehen
    skReleaseShot(p2, ball2);
    const curveWithFinesse = ball2.spin !== 0;

    // Ohne den Move auf der Karte darf gehaltenes finesseHeld (sollte durch skApplyInput ohnehin nie
    // gesetzt werden können) trotzdem keine Kurve erzeugen, falls irgendwas das Flag doch mal setzt -
    // skReleaseShot selbst verlässt sich nur auf isFinesse=p.finesseHeld, die eigentliche Gate steckt in
    // skApplyInput; hier wird nur sichergestellt, dass jemand OHNE Move (finesseHeld bleibt false, weil
    // makeSkillPlayer/skApplyInput das nie setzen würde) tatsächlich geradeaus schießt.
    const noFinesseCard = makeCard(900000202, []);
    BY_ID.set(noFinesseCard.id, noFinesseCard);
    const p3 = makeSkillPlayer(100, 100, '#fff', false, noFinesseCard);
    const ball3 = {x:110, y:100, vx:0, vy:0, r:8, spin:0, airborne:0};
    p3.touchTimer = 0.2; p3.lastTouchBallX = ball3.x; p3.lastTouchBallY = ball3.y;
    p3.lastTouchPlayerX = p3.x; p3.lastTouchPlayerY = p3.y;
    p3.vx = 0; p3.vy = 300; p3.finesseHeld = false;
    skReleaseShot(p3, ball3);
    const noCurveWithoutTrait = ball3.spin === 0;

    // ---------- (2) Alle 13 neuen PlayStyle+ -> Move-Zuordnungen ----------
    const newTraitMoveMap = {
      'Beinarbeit':'feint', 'Abdrängen':'jockey', 'Tricks':'trick', 'Flacher Vollspannschuss':'lowshot',
      'Präziser Kopfball':'header', 'Kopfballmacht':'header', 'Akrobat.':'volley',
      'Abfangen':'intercept', 'Antizipation':'anticipate', 'Durchsetzungskraft':'enforcer',
      'Kante':'bruiser', 'Ruhepol':'pressproven', 'Unerbittlich':'relentless', 'First Touch':'firsttouch',
    };
    const newMoveMappingCorrect = Object.entries(newTraitMoveMap).every(([label, move]) => {
      const c = makeCard(900000300 + Math.floor(Math.random()*100000), [label]);
      BY_ID.set(c.id, c);
      const moves = skillMovesForCard(c);
      BY_ID.delete(c.id);
      return moves.has(move) && moves.size === 1;
    });

    // Elite-Variante jedes neuen Traits schaltet denselben Move UND dessen Elite-Flag frei.
    const eliteVariants = ['Beinarbeit+','Abdrängen+','Tricks+','Flacher Vollspannschuss+','Präziser Kopfball+','Akrobat.+',
      'Abfangen+','Antizipation+','Durchsetzungskraft+','Kante+','Ruhepol+','Unerbittlich+','First Touch+'];
    const eliteMovesCorrect = eliteVariants.every(label => {
      const c = makeCard(900000400 + Math.floor(Math.random()*100000), [label]);
      BY_ID.set(c.id, c);
      const moves = skillMovesForCard(c);
      const elite = skillEliteMovesForCard(c);
      const move = newTraitMoveMap[label.replace('+','')];
      BY_ID.delete(c.id);
      return moves.has(move) && elite.has(move);
    });

    // ---------- (3) Passive Traits verändern tatsächlich die Physik-Parameter ----------
    const baseCard = makeCard(900000501, []);
    const interceptCard = makeCard(900000502, ['Abfangen']);
    const interceptEliteCard = makeCard(900000503, ['Abfangen+']);
    [baseCard, interceptCard, interceptEliteCard].forEach(c=>BY_ID.set(c.id, c));
    const bp1 = makeSkillPlayer(0,0,'#fff',false,baseCard);
    const bp2 = makeSkillPlayer(0,0,'#fff',false,interceptCard);
    const bp3 = makeSkillPlayer(0,0,'#fff',false,interceptEliteCard);
    const interceptGivesReach = bp2.interceptReach > bp1.interceptReach;
    const eliteInterceptStronger = bp3.interceptReach > bp2.interceptReach;

    const bruiserCard = makeCard(900000504, ['Kante']);
    const bruiserEliteCard = makeCard(900000505, ['Kante+']);
    [bruiserCard, bruiserEliteCard].forEach(c=>BY_ID.set(c.id, c));
    const bp4 = makeSkillPlayer(0,0,'#fff',false,bruiserCard);
    const bp5 = makeSkillPlayer(0,0,'#fff',false,bruiserEliteCard);
    const bruiserGivesMass = bp4.mass > bp1.mass;
    const eliteBruiserStronger = bp5.mass > bp4.mass;

    const relentlessCard = makeCard(900000506, ['Unerbittlich']);
    BY_ID.set(relentlessCard.id, relentlessCard);
    const bp6 = makeSkillPlayer(0,0,'#fff',false,relentlessCard);
    const relentlessGivesRegen = bp6.staminaRegen > bp1.staminaRegen;

    [baseCard, interceptCard, interceptEliteCard, bruiserCard, bruiserEliteCard, relentlessCard]
      .forEach(c=>BY_ID.delete(c.id));

    // ---------- (4) manualTraits-Fix: resolveSkillCardRef darf die OV-Elite-Herleitung nicht erneut
    // draufsatteln (die Karte kommt bereits mit den fertig aufgelösten Original-Traits über die Leitung).
    const traitCard = makeCard(900000601, ['Abdrängen+'], {ov:99});
    BY_ID.set(traitCard.id, traitCard);
    const ref = fullCardRefForSkillPick(traitCard);
    const rebuilt = resolveSkillCardRef(ref);
    const manualTraitsSet = rebuilt.manualTraits === true;
    const rebuiltMovesMatch = skillMovesForCard(rebuilt).has('jockey') && skillEliteMovesForCard(rebuilt).has('jockey');
    BY_ID.delete(traitCard.id);

    // ---------- (5a) Bugfix: SK_MOVE_NO_BUTTON muss jetzt auch 'powershot' enthalten ----------
    const powershotTaggedNoButton = SK_MOVE_NO_BUTTON.has('powershot');

    // ---------- (5b) Bugfix: Low Driven Shot darf sich NICHT mit Volley/Header stapeln, wenn der Ball
    // zufällig gerade in der Luft ist (wasAirborne=true) UND die Karte zusätzlich Low Driven Shot trägt.
    const stackCard = makeCard(900000701, ['Flacher Vollspannschuss', 'Akrobat.']);
    BY_ID.set(stackCard.id, stackCard);
    const p4 = makeSkillPlayer(100, 100, '#fff', false, stackCard);
    const ball4 = {x:110, y:100, vx:0, vy:0, r:8, spin:0, airborne:0.5}; // Ball ist bereits in der Luft (z.B. nach Lupfer)
    p4.touchTimer = 0.2; p4.lastTouchBallX = ball4.x; p4.lastTouchBallY = ball4.y;
    p4.lastTouchPlayerX = p4.x; p4.lastTouchPlayerY = p4.y;
    p4.lowshotHeld = true;
    const powerWithBothPossible = (() => {
      // Direkter Vergleich: derselbe Schuss mit NUR Volley (kein lowshotHeld) vs. dem obigen (lowshotHeld
      // UND airborne) muss exakt dieselbe Power ergeben, wenn der Fix greift (Low Driven Shot darf gar
      // nicht erst aktiv werden, weil wasAirborne=true ist).
      const only = makeSkillPlayer(100, 100, '#fff', false, stackCard);
      const ballOnly = {x:110, y:100, vx:0, vy:0, r:8, spin:0, airborne:0.5};
      only.touchTimer = 0.2; only.lastTouchBallX = ballOnly.x; only.lastTouchBallY = ballOnly.y;
      only.lastTouchPlayerX = only.x; only.lastTouchPlayerY = only.y;
      only.lowshotHeld = false;
      skReleaseShot(only, ballOnly);
      skReleaseShot(p4, ball4);
      const powOnly = Math.hypot(ballOnly.vx, ballOnly.vy);
      const powStack = Math.hypot(ball4.vx, ball4.vy);
      return Math.abs(powOnly - powStack) < 0.001;
    })();
    BY_ID.delete(stackCard.id);

    return {
      noCurveWithoutFinesse, curveWithFinesse, noCurveWithoutTrait,
      newMoveMappingCorrect, eliteMovesCorrect,
      interceptGivesReach, eliteInterceptStronger, bruiserGivesMass, eliteBruiserStronger, relentlessGivesRegen,
      manualTraitsSet, rebuiltMovesMatch,
      powershotTaggedNoButton, powerWithBothPossible,
    };
  }));

  console.log('Skill-Duell-Kurve-und-neue-Moves-Test');
  noErrors(errors, 'Seite');
  eq(result.noCurveWithoutFinesse, true, 'ein Schuss OHNE gehaltenen Finesse Shot bekommt trotz starker seitlicher Geschwindigkeit KEINE Kurve mehr (Kern-Fix)');
  eq(result.curveWithFinesse, true, 'ein echter Finesse Shot (Move vorhanden UND gehalten) erzeugt weiterhin Kurve');
  eq(result.noCurveWithoutTrait, true, 'ohne den Trait auf der Karte bleibt der Schuss ebenfalls geradeaus');
  eq(result.newMoveMappingCorrect, true, 'alle 13 neuen PlayStyle+-Traits schalten exakt ihren zugehörigen Move frei, sonst nichts');
  eq(result.eliteMovesCorrect, true, 'die Elite-Variante jedes neuen Traits schaltet denselben Move UND dessen Elite-Flag frei');
  eq(result.interceptGivesReach, true, 'Abfangen erhöht die Abfangreichweite gegenüber einer Karte ohne den Trait');
  eq(result.eliteInterceptStronger, true, 'Abfangen+ erhöht die Reichweite stärker als die Basis-Variante');
  eq(result.bruiserGivesMass, true, 'Kante erhöht die Masse (körperlich robuster)');
  eq(result.eliteBruiserStronger, true, 'Kante+ erhöht die Masse stärker als die Basis-Variante');
  eq(result.relentlessGivesRegen, true, 'Unerbittlich erhöht die Ausdauer-Regeneration');
  eq(result.manualTraitsSet, true, 'resolveSkillCardRef markiert rekonstruierte Karten mit manualTraits, um doppelte OV-Elite-Herleitung zu verhindern');
  eq(result.rebuiltMovesMatch, true, 'nach dem Roundtrip sind Move UND Elite-Status auf der Gegenseite identisch nutzbar');
  eq(result.powershotTaggedNoButton, true, 'Bugfix: Power Shot ist wie Header/Volley in SK_MOVE_NO_BUTTON getaggt (kein eigener Knopf nötig)');
  eq(result.powerWithBothPossible, true, 'Bugfix: Low Driven Shot kann sich nicht mehr mit Volley/Header stapeln, wenn der Ball zufällig schon in der Luft ist');

  summary('Skill-Duell-Kurve-und-neue-Moves-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
