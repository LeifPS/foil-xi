// Regressionstest für den gemeldeten Bug "die neuen (TOTY-)Karten sorgen für Probleme, manchmal werden
// sie nicht angezeigt oder lassen das Spiel abstürzen": TOTY-Karten behalten wie jede boostBaseToOv-
// Karte card.club vom echten Basisspieler (z.B. Bonmatí/Pedri/Putellas -> weiterhin "FC Barcelona").
// adminFullCardPool() (über uclIndexPool() von uclClubXI() genutzt, um die Elf eines echten Klubs zu
// bauen) schloss TOTY bisher NICHT aus - Barcelonas 107-110-OVR-TOTY-Varianten wurden dadurch
// automatisch als stärkste verfügbare Spieler in JEDES UCL/UEL-Match mit Barcelona gestellt, noch bevor
// das (comingSoon:true) Pack überhaupt kaufbar ist. Mehrere derart schwere Foil-Shard-Karten gleichzeitig
// in einer Elf gerendert erklärt die gemeldete Instabilität. Muss ausgeschlossen bleiben, bis das Pack
// im Kartenladen freigeschaltet wird.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const pool = adminFullCardPool();
    const totyInPool = pool.filter(c => c.variant === 'toty');

    // Reproduziert den gemeldeten Bug direkt: mehrere TOTY-Spieler (Bonmatí, Pina, Pedri, Putellas,
    // Raphinha, Graham Hansen, Koundé, Bacha) tragen alle "FC Barcelona" - eine echte Barcelona-Elf
    // darf keinen einzigen davon enthalten, solange das Pack nicht freigeschaltet ist.
    const barcaXI = uclClubXI('FC Barcelona');
    const totyInBarcaXI = barcaXI.players.filter(p => p.variant === 'toty');

    // PSG (Dembélé, Nuno Mendes, Vitinha) und Arsenal (Russo, Mariona, Williamson, Rice, Saliba) sind
    // die anderen stark betroffenen echten Klubs im TOTY-Roster - selbe Prüfung.
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
  eq(result.totyInPoolCount, 0, 'adminFullCardPool()/uclIndexPool() enthält keine TOTY-Karten (comingSoon, noch nicht freigeschaltet)');
  eq(result.totyInBarcaXICount, 0, 'FC Barcelonas Klub-Elf enthält keine TOTY-Varianten ihrer eigenen Spieler (Bonmatí/Pina/Pedri/Putellas/Raphinha/Graham Hansen/Koundé/Bacha)');
  eq(result.totyInPsgXICount, 0, 'Paris Saint-Germains Klub-Elf enthält keine TOTY-Varianten ihrer eigenen Spieler (Dembélé/Nuno Mendes/Vitinha)');
  eq(result.totySpecialsStillRegistered, true, 'TOTY-Karten bleiben trotz Ausschluss aus dem Match-Pool ganz normal in BY_ID auflösbar (z.B. für einen späteren Besitz nach Freischaltung)');

  summary('TOTY-Match-Ausschluss-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
