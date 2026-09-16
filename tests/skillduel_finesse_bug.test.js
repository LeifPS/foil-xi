// Regressionstest für einen gemeldeten Bug: "Finesse Shot (Trivela) - das Symbol kommt nie wenn man
// ihn triggert, man kann ihn auch mit Karten ohne Finesse benutzen". Root Cause in skApplyInput: die
// Flags finesseHeld/chipHeld wurden ERST gesetzt, NACHDEM skReleaseShot() im selben Funktionsaufruf
// bereits gefeuert hatte - ein Schuss, der im selben Frame wie das Drücken von Shift ausgelöst wird
// (das naheliegendste Bedienmuster: Shift+Leertaste gleichzeitig drücken), sah deshalb noch den Stand
// vom VORHERIGEN Frame. Zusätzlich waren die beiden Flags - anders als closeControl/rushing/blocking -
// nicht direkt am Erfassungsort per p.moves gegated, nur (redundant) am Verbrauchsort in skReleaseShot.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const finesseCard = {id:900000021, n:'Finesse-Test', pos:'ST', ov:88, pac:70, sho:75, pas:80, dri:70, defn:40, phy:70, traits:['Angeschn. Schuss'], variant:'base'};
    const plainCard = {id:900000022, n:'Kein-Finesse-Test', pos:'ST', ov:88, pac:70, sho:75, pas:80, dri:70, defn:40, phy:70, traits:[], variant:'base'};

    function shootWithFinesseHeld(card){
      const p = makeSkillPlayer(100, 100, '#fff', '#000', card);
      // Ball direkt in Ballführung (touchTimer>0), sonst würde der Schuss als "Whiff" ohne jede Wirkung
      // abgebrochen, bevor Finesse überhaupt geprüft wird.
      const ball = {x:105, y:100, vx:0, vy:0, r:13, mass:0.35, spin:0, airborne:0};
      p.touchTimer = 0.2; p.lastTouchBallX = ball.x; p.lastTouchBallY = ball.y; p.lastTouchPlayerX = p.x; p.lastTouchPlayerY = p.y;
      p.vx = 200; p.vy = 0; // Vorwärtsgeschwindigkeit, damit der Schuss überhaupt Power hat
      // Exakt das gemeldete Bedienmuster: Shift UND Leertaste werden im SELBEN Input-Snapshot gedrückt
      // (nicht Shift erst ein paar Frames vorher gehalten).
      const prev = {...SK_EMPTY_INPUT};
      const input = {...SK_EMPTY_INPUT, shoot:true, finesse:true};
      skApplyInput(p, input, prev, ball);
      return {finesseHeld: p.finesseHeld, toastIcon: p.toastIcon, ballSpin: ball.spin};
    }

    const withTrait = shootWithFinesseHeld(finesseCard);
    const withoutTrait = shootWithFinesseHeld(plainCard);

    // Zusätzliche Absicherung direkt an der Quelle (nicht erst am Verbrauchsort): finesseHeld darf für
    // eine Karte ohne den Trait niemals true werden, ganz unabhängig davon, ob/wann geschossen wird.
    const pNoTrait = makeSkillPlayer(0,0,'#fff','#000', plainCard);
    const ballDummy = {x:0,y:0,vx:0,vy:0,r:13,mass:0.35,spin:0,airborne:0};
    skApplyInput(pNoTrait, {...SK_EMPTY_INPUT, finesse:true}, {...SK_EMPTY_INPUT}, ballDummy);
    const gatedAtSource = pNoTrait.finesseHeld===false;

    return {
      withTraitTriggeredSameFrame: withTrait.finesseHeld===true && withTrait.toastIcon==='finesse',
      withoutTraitNeverTriggers: withoutTrait.finesseHeld===false && withoutTrait.toastIcon!=='finesse',
      curveDiffers: Math.abs(withTrait.ballSpin) !== Math.abs(withoutTrait.ballSpin) || withTrait.toastIcon!==withoutTrait.toastIcon,
      gatedAtSource,
    };
  }));

  console.log('Skill-Duell-Finesse-Shot-Bug-Test');
  noErrors(errors, 'Seite');
  eq(result.withTraitTriggeredSameFrame, true, 'Finesse triggert zuverlässig, auch wenn Shift+Leertaste im selben Frame gedrückt werden (vorher: 1 Frame zu spät erkannt)');
  eq(result.withoutTraitNeverTriggers, true, 'eine Karte ohne den Finesse-Trait kann den Move nie auslösen, selbst bei identisch gehaltener Shift-Taste');
  eq(result.gatedAtSource, true, 'finesseHeld wird bereits an der Quelle (skApplyInput) per p.moves gegated, nicht erst am Verbrauchsort');

  summary('Skill-Duell-Finesse-Shot-Bug-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
