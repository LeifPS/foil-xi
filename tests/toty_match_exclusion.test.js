// Regressionstest: TOTY-Karten (variant 'toty') bleiben DAUERHAFT aus adminFullCardPool()/uclClubXI()
// ausgeschlossen, auch nachdem das Pack live/käuflich ist - nicht wegen eines "noch nicht
// freigeschaltet"-Status wie zuvor, sondern weil das Roster sich auf sehr wenige echte Top-Klubs
// konzentriert (FC Barcelona: 8 von 24 Spielern; Paris Saint-Germain: 3 von 24). uclClubXI() würde die
// 105-112-OVR-TOTY-Varianten sonst automatisch als stärkste verfügbare Spieler in fast jedes UCL/UEL-
// Match gegen diese Klubs stellen - potenziell mehrere aufwendig gestaltete Foil-Shard-Karten
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
      // Die BASIS-Karten derselben Spieler sind ganz normale reale Karten - der neue toty-Ausschluss
      // in adminFullCardPool() darf NUR die 'toty'-Variante treffen, nicht die Basis-Karten selbst
      // (ob eine konkrete Basis-Karte es in die TOP-11 einer simulierten Klub-Elf schafft, hängt von
      // der Kaderstärke/Position ab und ist hier nicht die relevante Eigenschaft).
      baseCardsStillInPool: TOTY_BASE_CARDS.every(b => pool.includes(b)),
    };
  }));

  console.log('TOTY-Match-Ausschluss-Test');
  noErrors(errors, 'Seite');
  eq(result.totyInPoolCount, 0, 'adminFullCardPool()/uclIndexPool() enthält keine TOTY-Karten, obwohl das Pack live ist');
  eq(result.totyInBarcaXICount, 0, 'FC Barcelonas Klub-Elf enthält keine TOTY-Varianten ihrer eigenen Spieler (Bonmatí/Pina/Pedri/Putellas/Raphinha/Graham Hansen/Koundé/Bacha)');
  eq(result.totyInPsgXICount, 0, 'Paris Saint-Germains Klub-Elf enthält keine TOTY-Varianten ihrer eigenen Spieler (Dembélé/Nuno Mendes/Vitinha)');
  eq(result.totySpecialsStillRegistered, true, 'TOTY-Karten bleiben trotz Ausschluss aus dem Match-Pool ganz normal in BY_ID auflösbar (für echten Besitz nach dem Kauf)');
  eq(result.baseCardsStillInPool, true, 'die normalen Basis-Karten derselben Spieler bleiben im adminFullCardPool() - der Ausschluss betrifft ausschließlich die toty-Variante');

  summary('TOTY-Match-Ausschluss-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
