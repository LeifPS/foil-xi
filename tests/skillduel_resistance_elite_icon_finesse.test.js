// Regressionstest für drei zusammenhängende Anpassungen in einer Nachricht:
// (1) "mach doch wieder Widerstand zum Ball" - die vorherige Änderung (Ball ohne Widerstand gegen den
//     Spieler) wurde zurückgenommen, Spieler-Ball-Kollision läuft wieder über die echte
//     Zwei-Körper-Physik (skCircleCollide mit Massenverhältnis) wie beim Zweikampf.
// (2) "wenn ich die Elite-Version (Gold) triggere, will ich dass über dem Spieler auch die Elite-
//     Version ist" - skShowIcon zeigt jetzt bei Elite-Auslösung das ECHTE Elite-Icon (aus
//     PLAYSTYLE_INFO, distinktes Bild pro "+"-Trait) statt immer nur das Basis-Icon.
// (3) Finesse Shot neu designt: der Schuss selbst bleibt normal (keine Power-Abschwächung mehr),
//     Finesse fügt nur Spin RICHTUNG GEGNERISCHES TOR hinzu (mittel bei Basis, viel bei Elite),
//     unabhängig von der eigenen Laufbewegung des Spielers.
// Zusätzlich: SK_SHOT_SPEED_BOOST wurde per "+30% Schusskraft" nochmal erhöht.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const fakeCard = {id:900001501, n:'Resist-Elite-Finesse-Test', pos:'ST', ov:88, pac:80,sho:80,pas:99,dri:75,defn:40,phy:75, traits:[], variant:'base'};
    BY_ID.set(fakeCard.id, fakeCard);

    // ---------- (1) Widerstand wieder da ----------
    const p = makeSkillPlayer(100, 100, '#fff', false, fakeCard);
    const ball = {x:130, y:100, vx:0, vy:0, r:SK_BALL_RADIUS, mass:0.35, spin:0, airborne:0};
    p.vx = 300; p.vy = 0;
    const rest = skBallRestitution(p);
    for(let i=0; i<30; i++){
      p.x += p.vx*(1/60); p.y += p.vy*(1/60);
      ball.x += ball.vx*(1/60); ball.y += ball.vy*(1/60);
      skCircleCollide(p, ball, rest, p.mass*(p.blocking?(p.eliteMoves.has('block')?SK_ELITE_BLOCK_MASS_MULT:1.6):1), 1);
    }
    const speedAfter = Math.hypot(p.vx, p.vy);
    const playerGetsSlowedDown = speedAfter < 299.9; // echte Zwei-Körper-Physik bremst wieder spürbar ab

    // ---------- (2) Elite-Icon bei Elite-Auslösung ----------
    const dashEliteCard = {...fakeCard, traits:['Schneller Schritt+']};
    BY_ID.set(dashEliteCard.id, dashEliteCard);
    const pDashElite = makeSkillPlayer(100, 100, '#fff', false, dashEliteCard);
    pDashElite.lastDirX = 1;
    skTryDash(pDashElite);
    const eliteTriggerShowsEliteFlag = pDashElite.toastIconElite === true;
    const eliteIconUrlDiffersFromBase = skMoveEliteIconImgs()['quickstep'].src !== skMoveIconImgs()['quickstep'].src;

    const dashBaseCard = {...fakeCard, traits:['Schneller Schritt']};
    BY_ID.set(dashBaseCard.id, dashBaseCard);
    const pDashBase = makeSkillPlayer(100, 100, '#fff', false, dashBaseCard);
    pDashBase.lastDirX = 1;
    skTryDash(pDashBase);
    const baseTriggerHasNoEliteFlag = pDashBase.toastIconElite === false;

    // Icon-Auswahl in skDrawPlayer muss tatsächlich zwischen beiden Bild-Caches umschalten.
    const eliteImgPicked = (pDashElite.toastIconElite ? skMoveEliteIconImgs() : skMoveIconImgs())['quickstep'];
    const baseImgPicked = (pDashBase.toastIconElite ? skMoveEliteIconImgs() : skMoveIconImgs())['quickstep'];
    const differentImagesUsed = eliteImgPicked.src !== baseImgPicked.src;

    // ---------- (3) Finesse Shot neu: normaler Schuss + Spin Richtung gegnerisches Tor ----------
    // ballOffset zeigt IMMER Richtung des eigenen Angriffstors (bei attackDir=1 nach rechts, bei
    // attackDir=-1 nach links) - realistische Schussgeometrie statt eines beliebigen, für die rechte
    // Spielfeldseite eigentlich rückwärts gerichteten Testschusses.
    function finesseShot(traits, spawnX, ballOffset){
      const c = {...fakeCard, traits};
      BY_ID.set(c.id + spawnX, c);
      const pl = makeSkillPlayer(spawnX, 100, '#fff', false, c);
      pl.shotSpread = 0;
      const b = {x:spawnX+ballOffset, y:100, vx:0, vy:0, r:SK_BALL_RADIUS, mass:0.35, spin:0, airborne:0};
      pl.touchTimer = 0.2; pl.lastTouchBallX=b.x; pl.lastTouchBallY=b.y; pl.lastTouchPlayerX=pl.x; pl.lastTouchPlayerY=pl.y;
      pl.finesseHeld = true;
      pl.vx = 0; pl.vy = 0; // KEINE eigene Laufbewegung - Spin darf trotzdem entstehen (Kernpunkt des Redesigns)
      skReleaseShot(pl, b);
      return {power: Math.hypot(b.vx,b.vy), spin: b.spin, attackDir: pl.attackDir};
    }
    // Normaler Schuss OHNE Finesse zum Power-Vergleich (identische Bedingungen).
    function plainShot(spawnX){
      const c = {...fakeCard};
      BY_ID.set(c.id + spawnX + 1, c);
      const pl = makeSkillPlayer(spawnX, 100, '#fff', false, c);
      pl.shotSpread = 0;
      const b = {x:spawnX+10, y:100, vx:0, vy:0, r:SK_BALL_RADIUS, mass:0.35, spin:0, airborne:0};
      pl.touchTimer = 0.2; pl.lastTouchBallX=b.x; pl.lastTouchBallY=b.y; pl.lastTouchPlayerX=pl.x; pl.lastTouchPlayerY=pl.y;
      skReleaseShot(pl, b);
      return Math.hypot(b.vx,b.vy);
    }
    const finesseResult = finesseShot(['Angeschn. Schuss'], 100, 10);
    const eliteFinesseResult = finesseShot(['Angeschnittener Schuss+'], 100, 10);
    const plainPower = plainShot(100);
    // Der Schuss bleibt "ganz normal" - keine Power-Abschwächung mehr durch Finesse.
    const finesseShotIsNormalPower = Math.abs(finesseResult.power - plainPower) < 0.01;
    // Spin entsteht auch OHNE jede eigene Laufbewegung (vx=vy=0) - das war vorher unmöglich, weil der
    // Spin an perpSpeed (die eigene Querbewegung) gekoppelt war.
    const spinWithoutOwnMovement = Math.abs(finesseResult.spin) > 0;
    // Elite = deutlich mehr Spin als Basis (bei sonst identischer Situation).
    const eliteSpinIsStronger = Math.abs(eliteFinesseResult.spin) > Math.abs(finesseResult.spin);
    // Spin muss auf beiden Spielfeldseiten Richtung des JEWEILIGEN gegnerischen Tors zeigen - für einen
    // links spawnenden Spieler (attackDir=1, Tor rechts) und einen rechts spawnenden Spieler
    // (attackDir=-1, Tor links) mit spiegelbildlicher Schuss-Geometrie muss das Vorzeichen umgekehrt sein.
    const rightSideResult = finesseShot(['Angeschn. Schuss'], SK_W-100, -10);
    const spinDirectionFlipsWithGoalSide = Math.sign(finesseResult.spin) !== Math.sign(rightSideResult.spin);

    BY_ID.delete(fakeCard.id); BY_ID.delete(dashEliteCard.id); BY_ID.delete(dashBaseCard.id);

    return {
      playerGetsSlowedDown,
      eliteTriggerShowsEliteFlag, eliteIconUrlDiffersFromBase, baseTriggerHasNoEliteFlag, differentImagesUsed,
      finesseShotIsNormalPower, spinWithoutOwnMovement, eliteSpinIsStronger, spinDirectionFlipsWithGoalSide,
      shotBoostIncreased: SK_SHOT_SPEED_BOOST >= 2.6,
    };
  }));

  console.log('Skill-Duell-Widerstand-Elite-Icon-Finesse-Test');
  noErrors(errors, 'Seite');
  eq(result.playerGetsSlowedDown, true, 'ein in den Ball hineinlaufender Spieler wird wieder spürbar abgebremst (echte Kollisionsphysik zurück)');
  eq(result.eliteTriggerShowsEliteFlag, true, 'eine Elite-Move-Auslösung setzt toastIconElite=true');
  eq(result.baseTriggerHasNoEliteFlag, true, 'eine Basis-Move-Auslösung setzt toastIconElite=false');
  eq(result.eliteIconUrlDiffersFromBase, true, 'das Elite-Icon eines Moves ist eine andere echte Bild-URL als das Basis-Icon');
  eq(result.differentImagesUsed, true, 'skDrawPlayer würde je nach toastIconElite tatsächlich ein anderes Bild zeichnen');
  eq(result.finesseShotIsNormalPower, true, 'Finesse Shot schießt mit ganz normaler Power (keine Abschwächung mehr)');
  eq(result.spinWithoutOwnMovement, true, 'Finesse erzeugt Spin auch ohne jede eigene Laufbewegung des Spielers');
  eq(result.eliteSpinIsStronger, true, 'Finesse Shot+ erzeugt deutlich mehr Spin als die Basis-Variante');
  eq(result.spinDirectionFlipsWithGoalSide, true, 'der Spin zeigt auf beiden Spielfeldseiten Richtung des jeweils gegnerischen Tors (Vorzeichen kehrt sich um)');
  eq(result.shotBoostIncreased, true, 'SK_SHOT_SPEED_BOOST wurde per "+30% Schusskraft" auf mindestens 2.6 angehoben');

  summary('Skill-Duell-Widerstand-Elite-Icon-Finesse-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
