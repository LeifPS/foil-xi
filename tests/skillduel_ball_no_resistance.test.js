// Regressionstest für "Der Ball soll keinen Widerstand haben wenn ich gegen den Ball laufe. Wenn ich
// mit dem Ball laufe ist es sonst zu schwer das zu machen.": vorher lief die Spieler-Ball-Kollision
// über dieselbe Zwei-Körper-Physik wie die Spieler-Spieler-Kollision (skCircleCollide mit echtem
// Massenverhältnis) - dadurch bremste JEDE Ballberührung beim Dribbeln den eigenen Spieler spürbar ab.
// Die neue skBallCollide behandelt den Spieler wie eine unbewegliche Wand: nur der Ball reagiert auf
// den Zusammenstoß, Position UND Geschwindigkeit des Spielers bleiben exakt unverändert.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const fakeCard = {id:900001401, n:'No-Resistance-Test', pos:'ST', ov:88, pac:80,sho:80,pas:70,dri:75,defn:40,phy:75, traits:[], variant:'base'};
    BY_ID.set(fakeCard.id, fakeCard);
    const p = makeSkillPlayer(100, 100, '#fff', false, fakeCard);
    const ball = {x:130, y:100, vx:0, vy:0, r:SK_BALL_RADIUS, mass:0.35, spin:0, airborne:0};
    p.vx = 300; p.vy = 0;
    const speedBefore = Math.hypot(p.vx, p.vy);
    const xBefore = p.x, yBefore = p.y;
    const rest = skBallRestitution(p);

    let ballGotPushed = false;
    for(let i=0; i<40; i++){
      p.x += p.vx*(1/60); p.y += p.vy*(1/60);
      ball.x += ball.vx*(1/60); ball.y += ball.vy*(1/60);
      const vxBeforeStep = ball.vx;
      skBallCollide(p, ball, rest);
      if(ball.vx !== vxBeforeStep) ballGotPushed = true;
    }
    const speedAfter = Math.hypot(p.vx, p.vy);
    const playerSpeedUnchanged = Math.abs(speedAfter - speedBefore) < 0.0001;
    const playerDirectionUnchanged = p.vx===300 && p.vy===0;

    // Auch die POSITION des Spielers darf durch die Ballberührung nicht künstlich zurückgesetzt werden -
    // nur die reine Bewegungsintegration (p.vx*dt) darf p.x/p.y verändert haben, kein Kollisions-Offset.
    const expectedX = xBefore + 300*(40/60);
    const positionOnlyFromMovement = Math.abs(p.x - expectedX) < 0.0001 && p.y===yBefore;

    // Der Ball selbst muss trotzdem echt reagieren (sonst wäre "kein Widerstand" nur ein Bug, der den
    // Ball komplett ignoriert statt ihn nur nicht zurückwirken zu lassen).
    const ballMovedAway = Math.hypot(ball.x-130, ball.y-100) > 1;

    // Ein ruhender Spieler (vx=vy=0), gegen den der BALL läuft, muss den Ball trotzdem ganz normal
    // abprallen lassen (reine Wand-Physik) - "kein Widerstand" gilt für den Spieler, nicht dafür, dass
    // der Ball plötzlich einfach durchfliegt.
    const p2 = makeSkillPlayer(300, 100, '#fff', false, fakeCard);
    const ball2 = {x:270, y:100, vx:200, vy:0, r:SK_BALL_RADIUS, mass:0.35, spin:0, airborne:0};
    const rest2 = skBallRestitution(p2);
    for(let i=0; i<20; i++){
      ball2.x += ball2.vx*(1/60);
      skBallCollide(p2, ball2, rest2);
    }
    const stationaryPlayerUnaffected = p2.vx===0 && p2.vy===0;
    const ballBouncesOffStationaryPlayer = ball2.vx < 0;

    BY_ID.delete(fakeCard.id);

    return {
      playerSpeedUnchanged, playerDirectionUnchanged, positionOnlyFromMovement, ballMovedAway, ballGotPushed,
      stationaryPlayerUnaffected, ballBouncesOffStationaryPlayer,
    };
  }));

  console.log('Skill-Duell-Ball-ohne-Widerstand-Test');
  noErrors(errors, 'Seite');
  eq(result.playerSpeedUnchanged, true, 'ein in den Ball hineinlaufender Spieler behält exakt sein Tempo (kein Abbremsen durch den Ball)');
  eq(result.playerDirectionUnchanged, true, 'auch die Richtung/Geschwindigkeitskomponenten des Spielers bleiben exakt unverändert');
  eq(result.positionOnlyFromMovement, true, 'die Position des Spielers wird nicht durch einen Kollisions-Offset zurückgesetzt');
  eq(result.ballGotPushed, true, 'der Ball bekommt beim Zusammenstoß tatsächlich einen Geschwindigkeits-Impuls');
  eq(result.ballMovedAway, true, 'der Ball bewegt sich durch den Zusammenstoß spürbar von seiner Ausgangsposition weg');
  eq(result.stationaryPlayerUnaffected, true, 'ein stillstehender Spieler bleibt bei null Geschwindigkeit, wenn der Ball gegen ihn läuft');
  eq(result.ballBouncesOffStationaryPlayer, true, 'der Ball prallt trotzdem ganz normal von einem (unbeweglichen) Spieler ab');

  summary('Skill-Duell-Ball-ohne-Widerstand-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
