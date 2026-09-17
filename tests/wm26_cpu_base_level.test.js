// Regressionstest: "Mach das in der WM die CPUs keine Diamant sondern Basis-Karten haben (Das Level
// meine ich die XP)" - boostBotXI() gab bisher JEDER CPU-Karte pauschal level:4 (Diamant, +4 OVR/+4 je
// Unterstat), unabhängig vom Modus. Jetzt nimmt boostBotXI() einen optionalen cpuLevel-Parameter
// (Default weiterhin 4, damit UCL/UEL/Freundschaftsspiel-Bots unverändert bleiben) - nur wm26NationXI()
// übergibt explizit 0 ("Basis-Level", kein Level-Bonus), damit WM-Gegner mit unleveled Karten spielen.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const wmXI = wm26NationXI('Brazil');
    const wmLevels = new Set(wmXI.players.map(p => p.level));
    const wmAllBaseLevel = wmLevels.size === 1 && wmLevels.has(0);
    // baseLevelOv (Basis+Level, ohne Trainer/Position/Chemie) muss bei Level 0 exakt der reinen
    // Basis-OVR der zugrunde liegenden Karte entsprechen - kein +4 mehr draufgerechnet.
    const wmBaseLevelOvMatchesRawOv = wmXI.players.every(p => {
      const raw = BY_ID.get(p.id);
      return raw && p.baseLevelOv === raw.ov;
    });

    // Andere Bot-Gegner (UCL/UEL-Klub-Elf) dürfen von dieser Änderung NICHT betroffen sein - bleiben bei
    // Level 4 (Diamant), exakt wie vorher.
    const uclXI = uclClubXI('FC Barcelona');
    const uclLevels = new Set(uclXI.players.map(p => p.level));
    const uclStillDiamant = uclLevels.size === 1 && uclLevels.has(4);
    const uclBaseLevelOvHasBonus = uclXI.players.every(p => {
      const raw = BY_ID.get(p.id);
      return raw && p.baseLevelOv === raw.ov + 4;
    });

    return { wmAllBaseLevel, wmBaseLevelOvMatchesRawOv, uclStillDiamant, uclBaseLevelOvHasBonus };
  }));

  console.log('WM26-CPU-Basis-Level-Test');
  noErrors(errors, 'Seite');
  eq(result.wmAllBaseLevel, true, 'jeder WM-CPU-Nationalelf-Spieler hat Level 0 (Basis) statt Level 4 (Diamant)');
  eq(result.wmBaseLevelOvMatchesRawOv, true, 'die angezeigte Basis+Level-OVR eines WM-Gegners entspricht exakt der reinen Grund-OVR (kein +4-Level-Bonus mehr)');
  eq(result.uclStillDiamant, true, 'UCL/UEL-Klub-Gegner bleiben unverändert bei Level 4 (Diamant) - die Änderung betrifft ausschließlich die WM');
  eq(result.uclBaseLevelOvHasBonus, true, 'UCL/UEL-Klub-Gegner behalten weiterhin den +4-OVR-Levelbonus');

  summary('WM26-CPU-Basis-Level-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
