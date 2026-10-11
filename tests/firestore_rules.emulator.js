// Prüft die Firestore-Regeln gegen den lokalen Firebase-Emulator (NICHT gegen die echte Datenbank).
// Kernfrage: Kommen Foil-Vereine weiter an alles, und bleiben fremde Konten (z.B. künftige Canopy-ID-
// Konten mit Google-Login) draußen?
//
// Ausführen (braucht Java + Internet für den einmaligen Emulator-Download):
//   npm i --no-save firebase-tools @firebase/rules-unit-testing firebase
//   npx firebase emulators:exec --only firestore --project demo-foil "node tests/firestore_rules.emulator.js"
//
// Heißt bewusst *.emulator.js statt *.test.js, damit tests/run.sh (Playwright) es nicht mitnimmt.

const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-foil',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });

  const club = env.authenticatedContext('uidClub', { email: 'fcbeispiel@foileleven-club.auth' }).firestore();
  const admin = env.authenticatedContext('uidAdmin', { email: 'leifps@foileleven-club.auth' }).firestore();
  const canopyUser = env.authenticatedContext('uidCanopy', { email: 'jemand@gmail.com' }).firestore();
  const canopyNameUser = env.authenticatedContext('uidName', { email: 'max@canopy-id.auth' }).firestore();
  const noEmail = env.authenticatedContext('uidAnon', {}).firestore();
  const guest = env.unauthenticatedContext().firestore();

  let failed = 0;
  const check = async (label, p) => {
    try { await p; console.log('ok   ', label); }
    catch (e) { failed++; console.log('FAIL ', label, '-', e.message); }
  };

  // Vereine: alles wie bisher
  await check('Verein liest/schreibt saves', assertSucceeds(setDoc(doc(club, 'saves/fcbeispiel'), { a: 1 })));
  await check('Verein liest fremden save (wie bisher, Admin-Dialog)', assertSucceeds(getDoc(doc(club, 'saves/anderer'))));
  await check('Verein schreibt saveHistory', assertSucceeds(setDoc(doc(club, 'saveHistory/fcbeispiel/versions/v1'), { a: 1 })));
  await check('Verein schreibt leagueMeta', assertSucceeds(setDoc(doc(club, 'leagueMeta/x'), { a: 1 })));
  await check('Verein schreibt packOddsCache-Shard', assertSucceeds(setDoc(doc(club, 'packOddsCache/p/sourceShards/s'), { a: 1 })));
  await check('Verein schreibt eigenen clubRegistry-Eintrag', assertSucceeds(setDoc(doc(club, 'clubRegistry/fcbeispiel'), { a: 1 })));
  await check('Verein schreibt fremden clubRegistry-Eintrag NICHT', assertFails(setDoc(doc(club, 'clubRegistry/anderer'), { a: 1 })));
  await check('Admin schreibt config/resetEvent', assertSucceeds(setDoc(doc(admin, 'config/resetEvent'), { a: 1 })));
  await check('Normaler Verein schreibt config/resetEvent NICHT', assertFails(setDoc(doc(club, 'config/resetEvent'), { a: 1 })));

  // Offene Collections: für alle weiter offen (unverändert)
  await check('Gast liest market (offen, unverändert)', assertSucceeds(getDoc(doc(guest, 'market/x'))));
  await check('Gast liest clubRegistry (offen, unverändert)', assertSucceeds(getDoc(doc(guest, 'clubRegistry/x'))));

  // Neu: fremde Konten kommen NICHT an geschützte Foil-Daten
  for (const [name, db] of [['Google-Konto', canopyUser], ['Canopy-Nutzername-Konto', canopyNameUser], ['Konto ohne E-Mail', noEmail], ['Gast', guest]]) {
    await check(`${name} liest saves NICHT`, assertFails(getDoc(doc(db, 'saves/fcbeispiel'))));
    await check(`${name} schreibt saves NICHT`, assertFails(setDoc(doc(db, 'saves/fcbeispiel'), { kaputt: true })));
    await check(`${name} schreibt saveHistory NICHT`, assertFails(setDoc(doc(db, 'saveHistory/fcbeispiel/versions/v9'), { a: 1 })));
    await check(`${name} schreibt leagueMeta NICHT`, assertFails(setDoc(doc(db, 'leagueMeta/x'), { a: 1 })));
  }
  await check('Trick-E-Mail "x@foileleven-club.auth.evil.com" NICHT', assertFails(getDoc(doc(
    env.authenticatedContext('uidEvil', { email: 'x@foileleven-club.auth.evil.com' }).firestore(), 'saves/fcbeispiel'))));

  await env.cleanup();
  console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nAlle Regel-Tests bestanden');
  process.exit(failed ? 1 : 0);
})();
