// Regressionstest: goldene (Elite/"+") PlayStyles+ sind keine reine Freischalt-Kopie ihrer Basis-
// Variante, sondern eine spürbar ausgeprägtere Version derselben Mechanik (pro Move individuell
// abgestimmt, siehe die SK_ELITE_*-Konstanten in index.html). Prüft für alle acht Moves, dass die
// Elite-Variante messbar stärker ist als die Basis-Variante bei sonst identischen Substats.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const baseStats = {pac:75, sho:75, pas:75, dri:75, defn:75, phy:75};
    const cardWith = (trait) => ({id:900000030, n:'Elite-Test', pos:'ST', ov:88, ...baseStats, traits:[trait], variant:'base'});

    // Power Shot+: lädt in derselben Zeit weiter auf als die Basis-Variante (kürzere Ladezeit).
    const powerBase = makeSkillPlayer(0,0,'#fff','#000', cardWith('Powerschuss'));
    const powerElite = makeSkillPlayer(0,0,'#fff','#000', cardWith('Powerschuss+'));
    const powerShotChargeIsFaster = skPowerShotChargeTime(powerElite) < skPowerShotChargeTime(powerBase);

    // Finesse Shot+: stärkere Kurve bei einem ansonsten identischen Schuss. shotSpread wird auf 0
    // erzwungen, weil skReleaseShot sonst einen zufälligen Winkel-Offset einstreut (SHO-abhängige
    // Ungenauigkeit) - das würde den Kurve-Vergleich zwischen zwei Aufrufen unvorhersehbar machen.
    function finesseCurve(trait){
      const p = makeSkillPlayer(100,100,'#fff','#000', cardWith(trait));
      p.shotSpread = 0;
      const ball = {x:105,y:100,vx:0,vy:0,r:13,mass:0.35,spin:0,airborne:0};
      p.touchTimer=0.2; p.lastTouchBallX=ball.x; p.lastTouchBallY=ball.y; p.lastTouchPlayerX=p.x; p.lastTouchPlayerY=p.y;
      // vy sorgt für eine Geschwindigkeitskomponente QUER zur Schussrichtung (Ball liegt entlang der
      // x-Achse vor dem Spieler) - nur die macht sich als perpSpeed*curve überhaupt im Spin bemerkbar;
      // rein entlang der Schussrichtung (nur vx) bliebe der Spin immer exakt 0, unabhängig von curve.
      p.vx=150; p.vy=80; p.finesseHeld=true;
      skReleaseShot(p, ball);
      return Math.abs(ball.spin);
    }
    const finesseCurveIsStronger = finesseCurve('Angeschnittener Schuss+') > finesseCurve('Angeschn. Schuss');

    // Quick Step+: kürzerer Cooldown nach dem Dash.
    const dashBase = makeSkillPlayer(0,0,'#fff','#000', cardWith('Schneller Schritt'));
    const dashElite = makeSkillPlayer(0,0,'#fff','#000', cardWith('Schneller Schritt+'));
    dashBase.lastDirX=1; dashElite.lastDirX=1;
    skTryDash(dashBase); skTryDash(dashElite);
    const dashCooldownIsShorter = dashElite.dashCooldown < dashBase.dashCooldown;

    // Technical+: engere Ballführung (kleinerer Restitutions-Multiplikator = mehr Kontrolle).
    const techBase = makeSkillPlayer(0,0,'#fff','#000', cardWith('Technik')); techBase.closeControl = true;
    const techElite = makeSkillPlayer(0,0,'#fff','#000', cardWith('Technik+')); techElite.closeControl = true;
    const technicalGivesTighterControl = skBallRestitution(techElite) < skBallRestitution(techBase);

    // Grätsche+: größere Lunge-Reichweite (Impuls) Richtung Ball.
    function slideImpulse(trait){
      const p = makeSkillPlayer(0,0,'#fff','#000', cardWith(trait));
      const ball = {x:100,y:0,vx:0,vy:0,r:13,mass:0.35,spin:0,airborne:0};
      skTrySlide(p, ball);
      return Math.hypot(p.vx,p.vy);
    }
    const slideIsStronger = slideImpulse('Grätsche+') > slideImpulse('Grätsche');

    // Lupfer+: Ball bleibt länger "in der Luft" (ignoriert länger jede Spieler-Kollision).
    function chipAirborne(trait){
      const p = makeSkillPlayer(100,100,'#fff','#000', cardWith(trait));
      const ball = {x:105,y:100,vx:0,vy:0,r:13,mass:0.35,spin:0,airborne:0};
      p.touchTimer=0.2; p.lastTouchBallX=ball.x; p.lastTouchBallY=ball.y; p.lastTouchPlayerX=p.x; p.lastTouchPlayerY=p.y;
      p.vx=150; p.chipHeld=true;
      skReleaseShot(p, ball);
      return ball.airborne;
    }
    const chipAirborneIsLonger = chipAirborne('Lupfer+') > chipAirborne('Lupfer');

    // Raserei+: höheres Tempolimit im Sprint. Reine Dauerbeschleunigung erreicht das normale
    // Tempolimit wegen der Reibung nie (Terminalgeschwindigkeit liegt strukturell darunter) - das
    // Limit wird nur nach einem externen Geschwindigkeitsschub (Dash, Kollision) überhaupt relevant,
    // wenn es die überschüssige Geschwindigkeit auf sein jeweiliges Plateau herunterbremst. Deshalb
    // hier direkt mit einer schon sehr hohen Geschwindigkeit starten (wie nach einem Dash) und einen
    // einzelnen Schritt prüfen, ob genau dieses Plateau greift.
    function rushCappedSpeed(trait){
      const p = makeSkillPlayer(0,0,'#fff','#000', cardWith(trait));
      p.rushing = true; p.stamina = 100; p.vx = 700; p.vy = 0;
      skMovePlayer(p, 1/30, {...SK_EMPTY_INPUT, right:true});
      return Math.hypot(p.vx,p.vy);
    }
    const rushIsFaster = rushCappedSpeed('Raserei+') > rushCappedSpeed('Raserei');

    // Block+: schluckt Schüsse noch verlässlicher (kleinerer Restitutions-Multiplikator).
    const blockBase = makeSkillPlayer(0,0,'#fff','#000', cardWith('Block')); blockBase.blocking = true;
    const blockElite = makeSkillPlayer(0,0,'#fff','#000', cardWith('Block+')); blockElite.blocking = true;
    const blockAbsorbsMore = skBallRestitution(blockElite) < skBallRestitution(blockBase);

    return {powerShotChargeIsFaster, finesseCurveIsStronger, dashCooldownIsShorter, technicalGivesTighterControl,
      slideIsStronger, chipAirborneIsLonger, rushIsFaster, blockAbsorbsMore};
  }));

  console.log('Skill-Duell-Goldene-PlayStyles-Test');
  noErrors(errors, 'Seite');
  eq(result.powerShotChargeIsFaster, true, 'Power Shot+ lädt schneller auf als die Basis-Variante');
  eq(result.finesseCurveIsStronger, true, 'Finesse Shot+ kurvt stärker als die Basis-Variante');
  eq(result.dashCooldownIsShorter, true, 'Quick Step+ hat einen kürzeren Cooldown als die Basis-Variante');
  eq(result.technicalGivesTighterControl, true, 'Technical+ gibt engere Ballführung als die Basis-Variante');
  eq(result.slideIsStronger, true, 'Grätsche+ hat eine größere Lunge-Reichweite als die Basis-Variante');
  eq(result.chipAirborneIsLonger, true, 'Lupfer+ hält den Ball länger in der Luft als die Basis-Variante');
  eq(result.rushIsFaster, true, 'Raserei+ erlaubt höheres Tempo als die Basis-Variante');
  eq(result.blockAbsorbsMore, true, 'Block+ schluckt Schüsse verlässlicher als die Basis-Variante');

  summary('Skill-Duell-Goldene-PlayStyles-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
