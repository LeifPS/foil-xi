// Regressionstest für "Beim Abschluss soll der Ball 50% schneller sein, aber er soll deutlich
// deutlich schneller abbremsen und sich weniger wie ein Hockey anfühlen": deckt (1) den generellen
// SK_SHOT_SPEED_BOOST-Multiplikator in skReleaseShot (wirkt auf JEDEN Schusstyp gleichermaßen, vor
// allen move-spezifischen Multiplikatoren) und (2) die geschwindigkeitsabhängige Ballbremse in skStep
// (ersetzt die alte, konstante prozentuale Bremsung, die sich bei hohem Tempo wie ein gleitender
// Hockey-Puck anfühlte - jetzt bremst ein schnell fliegender Ball deutlich stärker als ein langsam
// gedribbelter).
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const card = {id:900000801, n:'Speed-Test', pos:'ST', ov:88, pac:75,sho:80,pas:70,dri:75,defn:40,phy:75, traits:[], variant:'base'};
    BY_ID.set(card.id, card);

    function shoot(vx, vy){
      const p = makeSkillPlayer(100, 100, '#fff', false, card);
      p.shotSpread = 0; // Zufallsstreuung ausschalten, damit Richtung exakt (dx,dy) entspricht und
                        // die seitliche Geschwindigkeitskomponente (perpSpeed) exakt 0 bleibt, wenn
                        // die Anlaufgeschwindigkeit exakt entlang der Schussachse liegt
      const ball = {x:110, y:100, vx:0, vy:0, r:8, spin:0, airborne:0};
      p.touchTimer = 0.2; p.lastTouchBallX = ball.x; p.lastTouchBallY = ball.y;
      p.lastTouchPlayerX = p.x; p.lastTouchPlayerY = p.y;
      p.vx = vx; p.vy = vy;
      skReleaseShot(p, ball);
      return Math.hypot(ball.vx, ball.vy);
    }

    // ---------- (1) deutlich mehr Schusstempo (>=50% mehr, seither auf erneuten Wunsch weiter erhöht -
    // Untergrenze statt exaktem Wert, damit ein künftiger weiterer "mehr Schusspower"-Buff diesen Test
    // nicht bricht) ----------
    const boostIsAtLeastFiftyPercent = SK_SHOT_SPEED_BOOST >= 1.5;
    const powerAtRest = shoot(0, 0);
    // Erwartete Basis-Power ohne Boost wäre SK_BASE_POWER*shotPowerMult (kein Momentum bei vx=vy=0) -
    // mit Boost muss sie um genau den Faktor SK_SHOT_SPEED_BOOST höher liegen.
    const p0 = makeSkillPlayer(100,100,'#fff',false,card);
    const expectedUnboosted = SK_BASE_POWER * p0.shotPowerMult;
    const shotIsFiftyPercentFaster = Math.abs(powerAtRest - expectedUnboosted*SK_SHOT_SPEED_BOOST) < 0.01;

    // Der Boost muss für JEDEN Schusstyp gelten, nicht nur den Sofortschuss ohne Anlauf - hier mit
    // Anlaufgeschwindigkeit (Momentum-Anteil), Verhältnis muss weiterhin exakt SK_SHOT_SPEED_BOOST sein.
    const powerWithMomentum = shoot(200, 0);
    const expectedUnboostedWithMomentum = (SK_BASE_POWER + 200*SK_MOMENTUM_FACTOR) * p0.shotPowerMult;
    const momentumShotAlsoBoosted = Math.abs(powerWithMomentum - expectedUnboostedWithMomentum*SK_SHOT_SPEED_BOOST) < 0.01;

    // ---------- (2) deutlich stärkere, geschwindigkeitsabhängige Bremse ----------
    function decayOverTime(v0, seconds){
      let vx = v0, vy = 0, t = 0;
      const dt = 1/60;
      while(t < seconds){
        const decay = Math.exp(-(SK_BALL_FRICTION + SK_BALL_HIGH_SPEED_DRAG*Math.hypot(vx,vy))*dt);
        vx *= decay; vy *= decay;
        t += dt;
      }
      return Math.hypot(vx, vy);
    }
    // Alte, rein konstante Bremse (nur SK_BALL_FRICTION, kein Tempoanteil) zum Vergleich nachgebaut.
    function oldConstantDecay(v0, seconds){
      let vx = v0, t = 0;
      const dt = 1/60;
      while(t < seconds){ vx *= Math.exp(-SK_BALL_FRICTION*dt); t += dt; }
      return vx;
    }
    const hardShotSpeed = 1200; // realistischer harter Schuss nach dem 50%-Boost
    const afterOld = oldConstantDecay(hardShotSpeed, 0.4);
    const afterNew = decayOverTime(hardShotSpeed, 0.4);
    const newBrakingIsMuchStronger = afterNew < afterOld * 0.7; // deutlich, nicht nur geringfügig stärker

    // Ein hohes Balltempo muss relativ zu seiner Ausgangsgeschwindigkeit SCHNELLER abgebaut werden als
    // ein niedriges (genau das "kein Hockey-Puck mehr" - Tempo-abhängige statt konstante Bremsung).
    const fastRetainedFrac = decayOverTime(1200, 0.3) / 1200;
    const slowRetainedFrac = decayOverTime(150, 0.3) / 150;
    const fastBallLosesRelativelyMoreSpeed = fastRetainedFrac < slowRetainedFrac;

    // Ein normal gedribbelter/leicht angespielter Ball (niedriges Tempo) darf sich gegenüber vorher
    // nicht drastisch anders anfühlen - die neue Bremse darf bei niedrigem Tempo nur geringfügig
    // stärker greifen als die alte rein konstante Bremse.
    const slowOld = oldConstantDecay(150, 0.3);
    const slowNew = decayOverTime(150, 0.3);
    const slowBallMostlyUnaffected = slowNew > slowOld * 0.85;

    BY_ID.delete(card.id);

    return {
      boostIsAtLeastFiftyPercent, shotIsFiftyPercentFaster, momentumShotAlsoBoosted,
      newBrakingIsMuchStronger, fastBallLosesRelativelyMoreSpeed, slowBallMostlyUnaffected,
    };
  }));

  console.log('Skill-Duell-Schusstempo-und-Ballbremse-Test');
  noErrors(errors, 'Seite');
  eq(result.boostIsAtLeastFiftyPercent, true, 'SK_SHOT_SPEED_BOOST liegt bei mindestens 1.5 (mindestens 50% mehr Schusstempo)');
  eq(result.shotIsFiftyPercentFaster, true, 'ein Schuss ohne Anlaufgeschwindigkeit ist exakt um den Faktor SK_SHOT_SPEED_BOOST schneller als die unmultiplizierte Basis-Power');
  eq(result.momentumShotAlsoBoosted, true, 'der 50%-Boost gilt auch für den Momentum-Anteil (Schuss mit Anlauf), nicht nur den Sofortschuss aus dem Stand');
  eq(result.newBrakingIsMuchStronger, true, 'ein harter Schuss (1200 Einheiten/s) verliert mit der neuen Bremse deutlich schneller an Tempo als mit der alten, rein konstanten Bremse');
  eq(result.fastBallLosesRelativelyMoreSpeed, true, 'ein schneller Ball verliert relativ zu seinem Ausgangstempo schneller an Fahrt als ein langsamer (kein gleichförmiges Hockey-Puck-Gleiten mehr)');
  eq(result.slowBallMostlyUnaffected, true, 'ein normal gedribbelter, langsamer Ball bremst gegenüber vorher nur geringfügig stärker (Dribbling/Ballannahme fühlen sich nicht grundlegend anders an)');

  summary('Skill-Duell-Schusstempo-und-Ballbremse-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
