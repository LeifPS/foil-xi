// Regressionstest für Controller-Support im Skill-Duell: L-Stick = Bewegung, Button 0 (A) = Schuss,
// Buttons 1-3 (B/X/Y) = die bis zu drei verfügbaren PlayStyle-Fähigkeiten (dieselbe Prioritätsreihenfolge
// wie bei den Touch-Buttons Ost/Nordost/Nord, siehe skMoveButtonKeys). Sobald ein Controller verbunden
// ist, muss sich das Touch-Overlay ausblenden (würde sonst auf einem Touchscreen mit angeschlossenem
// Controller einen Teil des Spielfelds blockieren) und beim Trennen wieder erscheinen.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    // Simuliert ein bereits VOR Matchstart angeschlossenes Gamepad.
    const fakeGamepad = {index:0, id:'Fake Pad', axes:[0,0,0,0], buttons:Array.from({length:8},()=>({pressed:false}))};
    navigator.getGamepads = () => [fakeGamepad];
    // Der Test-Browser selbst hat keinen echten Touchscreen (pointer:fine) - für den Touch-
    // Sichtbarkeits-Teil dieses Tests wird ein Touch-Gerät erzwungen, exakt wie andere Tests in diesem
    // Ordner an anderer Stelle Spielfunktionen für einen kontrollierten Testaufbau überschreiben.
    isSkillTouchDevice = () => true;

    const fakeCard = {id:900000052, n:'Gamepad-Test', pos:'ST', ov:90, pac:88, sho:85, pas:70, dri:80, defn:40, phy:78,
      traits:['Schneller Schritt+','Grätsche','Technik'], variant:'base'};
    BY_ID.set(fakeCard.id, fakeCard);

    startSkillMatch(null, true, {hostName:'Ich', guestName:'AFK-Bot', hostPick:fakeCard, guestPick:SK_BOT_CARD}, {vsBot:true});
    await new Promise(r=>setTimeout(r, 100));

    const touchHiddenWhenAlreadyConnected = !document.querySelector('.sk-touch.active');
    const gamepadMoveKeys = skillDuelState.gamepadMoveKeys.slice();

    const pressOnly = (idx) => {
      fakeGamepad.buttons.forEach((b,i)=>{ b.pressed = (i===idx); });
      const input = skReadGamepadInput();
      fakeGamepad.buttons.forEach(b=>{ b.pressed = false; });
      return input;
    };
    const shootOnA = pressOnly(0).shoot;
    const inputB = pressOnly(1); // erste verfügbare Fähigkeit (hier: Schneller Schritt+ -> dash)
    const inputX = pressOnly(2); // zweite (Grätsche -> slide)
    const inputY = pressOnly(3); // dritte (Technik -> tech)

    fakeGamepad.axes[0] = 0.9; // L-Stick ganz nach rechts
    const stickRight = skReadGamepadInput();
    fakeGamepad.axes[0] = -0.9; // L-Stick ganz nach links
    const stickLeft = skReadGamepadInput();
    fakeGamepad.axes[0] = 0;

    // Controller trennen - Touch-Overlay muss auf diesem (touch-fähigen) Gerät wieder erscheinen.
    const disconnectEvt = new Event('gamepaddisconnected');
    disconnectEvt.gamepad = {index:0};
    navigator.getGamepads = () => [];
    window.dispatchEvent(disconnectEvt);
    await new Promise(r=>setTimeout(r, 20));
    const touchVisibleAfterDisconnect = !!document.querySelector('.sk-touch.active');

    document.getElementById('sk-close-btn').click();
    BY_ID.delete(fakeCard.id);

    return {
      touchHiddenWhenAlreadyConnected,
      moveKeysMatchExpectedOrder: JSON.stringify(gamepadMoveKeys)===JSON.stringify(['dash','slide','tech']),
      shootOnA,
      bTriggersFirstMove: inputB.dash===true && !inputB.slide && !inputB.tech,
      xTriggersSecondMove: inputX.slide===true && !inputX.dash && !inputX.tech,
      yTriggersThirdMove: inputY.tech===true && !inputY.dash && !inputY.slide,
      stickMovesRight: stickRight.right===true && !stickRight.left,
      stickMovesLeft: stickLeft.left===true && !stickLeft.right,
      touchVisibleAfterDisconnect,
    };
  }));

  console.log('Skill-Duell-Controller-Support-Test');
  noErrors(errors, 'Seite');
  eq(result.touchHiddenWhenAlreadyConnected, true, 'Touch-Overlay bleibt versteckt, wenn beim Matchstart schon ein Controller verbunden ist');
  eq(result.moveKeysMatchExpectedOrder, true, 'B/X/Y werden in derselben Prioritätsreihenfolge belegt wie die Touch-Buttons Ost/Nordost/Nord');
  eq(result.shootOnA, true, 'Button 0 (A) löst den Schuss aus');
  eq(result.bTriggersFirstMove, true, 'Button 1 (B) löst genau die erste verfügbare PlayStyle-Fähigkeit aus');
  eq(result.xTriggersSecondMove, true, 'Button 2 (X) löst genau die zweite verfügbare PlayStyle-Fähigkeit aus');
  eq(result.yTriggersThirdMove, true, 'Button 3 (Y) löst genau die dritte verfügbare PlayStyle-Fähigkeit aus');
  eq(result.stickMovesRight, true, 'linker Stick nach rechts bewegt den Spieler nach rechts');
  eq(result.stickMovesLeft, true, 'linker Stick nach links bewegt den Spieler nach links');
  eq(result.touchVisibleAfterDisconnect, true, 'Touch-Overlay erscheint nach dem Trennen des Controllers wieder (Gerät ist touch-fähig)');

  summary('Skill-Duell-Controller-Support-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
