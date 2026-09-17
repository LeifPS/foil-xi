// Regressionstest: TOTY-Karten (variant 'toty') bleiben DAUERHAFT aus adminFullCardPool()/uclClubXI()
// ausgeschlossen, auch nachdem sie über die TOTY-SBC erhältlich sind - das Roster konzentriert sich auf
// sehr wenige echte Top-Klubs (FC Barcelona: 8 von 24 Spielern; Paris Saint-Germain: 3 von 24).
// uclClubXI() würde die 105-112-OVR-TOTY-Varianten sonst automatisch als stärkste verfügbare Spieler in
// fast jedes UCL/UEL-Match gegen diese Klubs stellen - potenziell mehrere aufwendig gestaltete Karten
// gleichzeitig in einer simulierten Elf, genau das Muster, das in einer früheren Fassung bereits zu
// Abstürzen geführt hatte.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const pool = adminFullCardPool();
    const totyInPool = pool.filter(c => c.variant === 'toty');

    const barcaXI = uclClubXI('FC Barcelona');
    const totyInBarcaXI = barcaXI.players.filter(p => p.variant === 'toty');

    const psgXI = uclClubXI('Paris Saint-Germain');
    const totyInPsgXI = psgXI.players.filter(p => p.variant === 'toty');

    return {
      totyInPoolCount: totyInPool.length,
      totyInBarcaXICount: totyInBarcaXI.length,
      totyInPsgXICount: totyInPsgXI.length,
      totySpecialsStillRegistered: TOTY_SPECIALS.every(c => BY_ID.get(c.id) === c),
    };
  }));

  console.log('TOTY-Match-Ausschluss-Test');
  noErrors(errors, 'Seite');
  eq(result.totyInPoolCount, 0, 'adminFullCardPool()/uclIndexPool() enthält keine TOTY-Karten');
  eq(result.totyInBarcaXICount, 0, 'FC Barcelonas Klub-Elf enthält keine TOTY-Varianten ihrer eigenen Spieler (Bonmatí/Pina/Pedri/Putellas/Raphinha/Graham Hansen/Koundé/Bacha)');
  eq(result.totyInPsgXICount, 0, 'Paris Saint-Germains Klub-Elf enthält keine TOTY-Varianten ihrer eigenen Spieler (Dembélé/Nuno Mendes/Vitinha)');
  eq(result.totySpecialsStillRegistered, true, 'TOTY-Karten bleiben trotz Ausschluss aus dem Match-Pool ganz normal in BY_ID auflösbar (für echten Besitz nach der SBC)');

  summary('TOTY-Match-Ausschluss-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });

