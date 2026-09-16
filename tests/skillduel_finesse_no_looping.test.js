// Regressionstest für "der Finesse Shot ist jetzt gut, aber gegen Ende wird der etwas übertrieben und
// dreht sich sogar im Kreis manchmal": der Ballspin zerfiel bisher mit einer fixen, sehr viel
// langsameren Rate (0.9) als das Balltempo selbst (das durch die stärkere, tempoabhängige Ballbremse
// inzwischen viel schneller sinkt) - gegen Ende der Flugbahn war der Spin dann relativ zum kaum noch
// vorhandenen Resttempo riesig, wodurch sich die Flugrichtung pro Frame extrem stark drehte (im
// Extremfall ein kompletter Kreis). Fix: der Spin zerfällt jetzt mit GENAU derselben Rate wie das
// Balltempo (ballDecay), sodass das Verhältnis Spin/Tempo über den ganzen Flug ungefähr konstant bleibt.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const fakeCard = {id:900001601, n:'No-Loop-Test', pos:'ST', ov:88, pac:80,sho:80,pas:99,dri:75,defn:40,phy:75, traits:['Angeschnittener Schuss+'], variant:'base'};
    BY_ID.set(fakeCard.id, fakeCard);

    function simulateFlight(seconds){
      const p1 = makeSkillPlayer(100, 100, '#fff', false, fakeCard);
      p1.shotSpread = 0;
      const ball = {x:110, y:100, vx:0, vy:0, r:SK_BALL_RADIUS, mass:0.35, spin:0, airborne:0};
      p1.touchTimer = 0.2; p1.lastTouchBallX=ball.x; p1.lastTouchBallY=ball.y; p1.lastTouchPlayerX=p1.x; p1.lastTouchPlayerY=p1.y;
      p1.finesseHeld = true;
      skReleaseShot(p1, ball);
      const p2 = makeSkillPlayer(SK_W-100, 100, '#fff', false, fakeCard);
      const engine = {p1, p2, ball, score:[0,0], timeLeft:180, ended:false, msg:null,
        p1Input:{...SK_EMPTY_INPUT}, p2Input:{...SK_EMPTY_INPUT}, p1Prev:{...SK_EMPTY_INPUT}, p2Prev:{...SK_EMPTY_INPUT}};
      let prevAngle = null, totalRotation = 0;
      const dt = 1/60, steps = Math.round(seconds/dt);
      for(let i=0; i<steps; i++){
        skStep(engine, dt);
        const speed = Math.hypot(ball.vx, ball.vy);
        if(speed < 1) break; // Ball praktisch zum Stillstand gekommen - Winkel ist dann bedeutungslos/verrauscht
        const angle = Math.atan2(ball.vy, ball.vx);
        if(prevAngle !== null){
          let d = angle - prevAngle;
          while(d > Math.PI) d -= 2*Math.PI;
          while(d < -Math.PI) d += 2*Math.PI;
          totalRotation += d;
        }
        prevAngle = angle;
      }
      return Math.abs(totalRotation) * 180/Math.PI;
    }

    const totalRotationDegrees3s = simulateFlight(3);
    const noFullCircle = totalRotationDegrees3s < 300; // deutlich unter 360° - keine geschlossene Kreisbahn

    // Direkter Nachweis der eigentlichen Ursache: Spin und Balltempo müssen im GLEICHEN Verhältnis
    // zueinander bleiben (zerfallen an derselben Rate), statt dass der Spin relativ zum Tempo immer
    // dominanter wird.
    const p3 = makeSkillPlayer(100, 100, '#fff', false, fakeCard);
    p3.shotSpread = 0;
    const ball3 = {x:110, y:100, vx:0, vy:0, r:SK_BALL_RADIUS, mass:0.35, spin:0, airborne:0};
    p3.touchTimer = 0.2; p3.lastTouchBallX=ball3.x; p3.lastTouchBallY=ball3.y; p3.lastTouchPlayerX=p3.x; p3.lastTouchPlayerY=p3.y;
    p3.finesseHeld = true;
    skReleaseShot(p3, ball3);
    const p4 = makeSkillPlayer(SK_W-100, 100, '#fff', false, fakeCard);
    const engine2 = {p1:p3, p2:p4, ball:ball3, score:[0,0], timeLeft:180, ended:false, msg:null,
      p1Input:{...SK_EMPTY_INPUT}, p2Input:{...SK_EMPTY_INPUT}, p1Prev:{...SK_EMPTY_INPUT}, p2Prev:{...SK_EMPTY_INPUT}};
    const speedAt0 = Math.hypot(ball3.vx, ball3.vy), spinAt0 = Math.abs(ball3.spin);
    const ratioAt0 = spinAt0/speedAt0;
    for(let i=0; i<90; i++) skStep(engine2, 1/60); // 1.5 Sekunden
    const speedAt1_5 = Math.hypot(ball3.vx, ball3.vy), spinAt1_5 = Math.abs(ball3.spin);
    const ratioAt1_5 = spinAt1_5/speedAt1_5;
    // "ungefähr konstant" statt exakt gleich - großzügiger Korridor, da die Kopplung nicht perfekt linear ist.
    const ratioStaysRoughlyConstant = ratioAt1_5 < ratioAt0*2.5;

    BY_ID.delete(fakeCard.id);

    return {noFullCircle, totalRotationDegrees3s, ratioAt0, ratioAt1_5, ratioStaysRoughlyConstant};
  }));

  console.log('Skill-Duell-Finesse-Kein-Kreiseln-Test');
  noErrors(errors, 'Seite');
  eq(result.noFullCircle, true, 'ein Finesse-Schuss dreht sich über 3 Sekunden Flugzeit nicht um mehr als 300° - kein Kreiseln');
  eq(result.ratioStaysRoughlyConstant, true, 'das Verhältnis Spin/Tempo bleibt über die Flugzeit ungefähr konstant statt immer dominanter zu werden');

  summary('Skill-Duell-Finesse-Kein-Kreiseln-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
