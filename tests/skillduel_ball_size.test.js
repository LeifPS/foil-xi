// Regressionstest für "mach den Ball etwas größer als den Spieler": der Ball war vorher (r:13) deutlich
// kleiner als ein Spieler (r:22) - jetzt muss der Ball-Radius über dem Spieler-Radius liegen, aber nur
// "etwas" (kein Vielfaches), sowohl als benannte Konstante als auch im tatsächlich gestarteten Match.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const ballBiggerThanPlayer = SK_BALL_RADIUS > SK_PLAYER_RADIUS;
    // "etwas größer", nicht drastisch - großzügiger, aber begrenzter Korridor.
    const ballOnlySlightlyBigger = SK_BALL_RADIUS <= SK_PLAYER_RADIUS * 1.3;

    const fakeCard = {id:900001201, n:'Ball-Size-Test', pos:'ST', ov:88, pac:75,sho:75,pas:70,dri:75,defn:40,phy:75, traits:[], variant:'base'};
    BY_ID.set(fakeCard.id, fakeCard);
    startSkillMatch(null, true, {hostName:'Ich', guestName:'AFK-Bot', hostPick:fakeCard, guestPick:SK_BOT_CARD}, {mode:'bot'});
    await new Promise(r=>setTimeout(r, 50));
    const realBallRadius = skillDuelState.engine.ball.r;
    const realPlayerRadius = skillDuelState.engine.p1.r;
    const realMatchMatchesConstants = realBallRadius===SK_BALL_RADIUS && realPlayerRadius===SK_PLAYER_RADIUS;
    const realBallBiggerThanRealPlayer = realBallRadius > realPlayerRadius;
    document.getElementById('sk-close-btn').click();
    BY_ID.delete(fakeCard.id);

    return {ballBiggerThanPlayer, ballOnlySlightlyBigger, realMatchMatchesConstants, realBallBiggerThanRealPlayer};
  }));

  console.log('Skill-Duell-Ballgröße-Test');
  noErrors(errors, 'Seite');
  eq(result.ballBiggerThanPlayer, true, 'SK_BALL_RADIUS ist größer als SK_PLAYER_RADIUS');
  eq(result.ballOnlySlightlyBigger, true, 'der Ball ist nur etwas größer als der Spieler, kein Vielfaches (<=1.3x)');
  eq(result.realMatchMatchesConstants, true, 'ein echt gestartetes Match verwendet exakt SK_BALL_RADIUS/SK_PLAYER_RADIUS für Ball und Spieler');
  eq(result.realBallBiggerThanRealPlayer, true, 'im echten Match ist der Ball tatsächlich größer als der Spieler');

  summary('Skill-Duell-Ballgröße-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
