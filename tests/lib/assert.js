// Minimaler Assertion-Helfer, damit ein Test wirklich mit Exit-Code 1 fehlschlägt statt nur JSON
// auszudrucken, das man selbst durchlesen muss. Kein externes Test-Framework nötig für diese Größe.
let passes = 0, failures = 0;

function ok(cond, msg) {
  if (cond) { passes++; console.log(`  ✓ ${msg}`); }
  else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
}

function eq(actual, expected, msg) {
  ok(actual === expected, `${msg} (erwartet ${JSON.stringify(expected)}, war ${JSON.stringify(actual)})`);
}

function noErrors(errors, context) {
  ok(errors.length === 0, `${context}: keine JS-Fehler${errors.length ? ' - ' + errors[0] : ''}`);
}

// Am Ende jeder Testdatei aufrufen - druckt die Bilanz und beendet den Prozess mit 1 bei jedem Fehlschlag,
// damit ein Test-Runner (run.sh) oder CI zuverlässig erkennt, ob etwas kaputt ist.
function summary(label) {
  const total = passes + failures;
  console.log(`\n${label || 'Test'}: ${passes}/${total} bestanden`);
  if (failures > 0) process.exit(1);
}

module.exports = { ok, eq, noErrors, summary };
