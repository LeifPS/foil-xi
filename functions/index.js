// FOIL ELEVEN Discord bot backend.
//
// Runs as Firebase Cloud Functions (2nd gen) in the SAME project as the game (Firestore + Auth) - no
// separate server, no persistent process. Slash commands arrive as signed HTTP POSTs from Discord
// ("Interactions Endpoint URL" mode, see README.md) instead of a live gateway connection, and the
// weekly Liga rollover announcement is a Firestore trigger (fires the instant leagueHistory/{weekStart}
// is written by resolveWeeklyRolloverIfNeeded in the game itself) instead of polling on a schedule -
// both are effectively free at hobby-project volume on the Blaze plan.
const {onRequest} = require('firebase-functions/v2/https');
const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {defineSecret} = require('firebase-functions/params');
const {verifyKey} = require('discord-interactions');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const DISCORD_PUBLIC_KEY = defineSecret('DISCORD_PUBLIC_KEY');
const DISCORD_BOT_TOKEN = defineSecret('DISCORD_BOT_TOKEN');
const DISCORD_GUILD_ID = defineSecret('DISCORD_GUILD_ID');
const DISCORD_VERIFIED_ROLE_ID = defineSecret('DISCORD_VERIFIED_ROLE_ID');
const DISCORD_ANNOUNCE_WEBHOOK_URL = defineSecret('DISCORD_ANNOUNCE_WEBHOOK_URL');
// One role per Liga A/B/C, everything D and below (the game supports up to 26 leagues, A-Z, growing
// at the bottom as the playerbase does - see LIGA_LETTERS) shares a single "Liga D+" role instead of
// one role per letter, since nobody wants a 26-role picker.
const DISCORD_ROLE_LIGA_A = defineSecret('DISCORD_ROLE_LIGA_A');
const DISCORD_ROLE_LIGA_B = defineSecret('DISCORD_ROLE_LIGA_B');
const DISCORD_ROLE_LIGA_C = defineSecret('DISCORD_ROLE_LIGA_C');
const DISCORD_ROLE_LIGA_DPLUS = defineSecret('DISCORD_ROLE_LIGA_DPLUS');
const LIGA_ROLE_SECRETS = [DISCORD_ROLE_LIGA_A, DISCORD_ROLE_LIGA_B, DISCORD_ROLE_LIGA_C, DISCORD_ROLE_LIGA_DPLUS];

function ligaRoleIdForLetter(letter) {
  if (letter === 'A') return DISCORD_ROLE_LIGA_A.value();
  if (letter === 'B') return DISCORD_ROLE_LIGA_B.value();
  if (letter === 'C') return DISCORD_ROLE_LIGA_C.value();
  return DISCORD_ROLE_LIGA_DPLUS.value();
}
function allLigaRoleIds() {
  return LIGA_ROLE_SECRETS.map(s => s.value()).filter(Boolean);
}

// Swaps a member's Liga-role for the one matching their CURRENT league - reads their full role list
// first (PATCHing the whole array in one call) instead of separately DELETEing the old role and PUTting
// the new one, since a member's actual previous league isn't tracked anywhere the bot could look up
// directly; comparing against their real current Discord roles is the only reliable source of truth.
async function syncLigaRole(guildId, discordUserId, letter) {
  const botToken = DISCORD_BOT_TOKEN.value();
  const targetRoleId = ligaRoleIdForLetter(letter);
  const ligaRoleIds = new Set(allLigaRoleIds());
  const memberRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}`, {
    headers: {Authorization: `Bot ${botToken}`},
  });
  if (!memberRes.ok) { console.error('syncLigaRole: member fetch failed', discordUserId, memberRes.status, await memberRes.text()); return; }
  const member = await memberRes.json();
  const currentRoles = member.roles || [];
  if (currentRoles.includes(targetRoleId) && currentRoles.filter(r => ligaRoleIds.has(r)).length === 1) return; // already correct, skip the write
  const nextRoles = currentRoles.filter(r => !ligaRoleIds.has(r)).concat(targetRoleId ? [targetRoleId] : []);
  const patchRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}`, {
    method: 'PATCH',
    headers: {Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({roles: nextRoles}),
  });
  if (!patchRes.ok) console.error('syncLigaRole: role patch failed', discordUserId, patchRes.status, await patchRes.text());
}

// leagueMembership/{letter} = {letter, members:[clubId,...]} - array-contains lets Firestore find the
// one league doc holding this club directly, instead of fetching all ~26 possible letters and scanning.
async function getLeagueLetterForClub(clubId) {
  const snap = await db.collection('leagueMembership').where('members', 'array-contains', clubId).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

const InteractionType = {PING: 1, APPLICATION_COMMAND: 2};
const CallbackType = {PONG: 1, CHANNEL_MESSAGE_WITH_SOURCE: 4, DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5};

function reply(content, {ephemeral = false, embeds = null} = {}) {
  const data = {flags: ephemeral ? 64 : 0};
  if (embeds) data.embeds = embeds; else data.content = content;
  return {type: CallbackType.CHANNEL_MESSAGE_WITH_SOURCE, data};
}

function optionValue(interaction, name) {
  return interaction.data.options?.find(o => o.name === name)?.value ?? null;
}

function discordUserIdOf(interaction) {
  return interaction.member?.user?.id || interaction.user?.id || null;
}

async function getLinkedClubId(discordUserId) {
  const snap = await db.collection('discordLinks').doc(discordUserId).get();
  return snap.exists ? snap.data().clubId : null;
}

// ===== /verify code:XXXXXX =====
// The game shows a short-lived random code (profile.discordVerifyCode) under Einstellungen - this
// looks it up, links discordUserId -> clubId in a new 'discordLinks' collection, clears the code (so
// it can't be reused or guessed afterward), and assigns the Verified role via Discord's REST API so
// the rest of the server (locked to that role) opens up.
async function handleVerify(interaction) {
  const code = (optionValue(interaction, 'code') || '').trim();
  const discordUserId = discordUserIdOf(interaction);
  if (!code) return reply('Bitte gib deinen Code aus dem Spiel an: `/verify code:XXXXXX` (Einstellungen → Discord verknüpfen).', {ephemeral: true});

  const snap = await db.collection('saves').where('profile.discordVerifyCode', '==', code).limit(1).get();
  if (snap.empty) return reply('Code nicht gefunden oder abgelaufen. Erzeuge im Spiel unter Einstellungen einen neuen Code.', {ephemeral: true});

  const clubDoc = snap.docs[0];
  const clubData = clubDoc.data();
  // the code itself never gets deleted until a match is found (so a re-roll before first use just
  // overwrites it), but a MATCHED code past its own 15-minute window from the game must still be
  // rejected here - otherwise an old code some other client happens to still display stays valid
  // forever instead of actually expiring.
  if (!clubData.profile?.discordVerifyCodeExpiresAt || clubData.profile.discordVerifyCodeExpiresAt < Date.now()) {
    return reply('Code ist abgelaufen. Erzeuge im Spiel unter Einstellungen einen neuen Code.', {ephemeral: true});
  }
  const clubId = clubDoc.id;
  const displayName = clubData.profile?.displayName || clubId;

  await db.collection('discordLinks').doc(discordUserId).set({clubId, linkedAt: Date.now()});
  await clubDoc.ref.set({profile: {discordVerifyCode: FieldValue.delete(), discordVerifyCodeExpiresAt: FieldValue.delete()}}, {merge: true});

  const guildId = DISCORD_GUILD_ID.value();
  const roleId = DISCORD_VERIFIED_ROLE_ID.value();
  if (guildId && roleId) {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, {
      method: 'PUT',
      headers: {Authorization: `Bot ${DISCORD_BOT_TOKEN.value()}`},
    });
    if (!res.ok) console.error('role assign failed', res.status, await res.text());
  }

  let ligaNote = '';
  if (guildId) {
    const letter = await getLeagueLetterForClub(clubId);
    if (letter) {
      await syncLigaRole(guildId, discordUserId, letter);
      ligaNote = ` Liga-Rolle gesetzt: **${letter === 'A' || letter === 'B' || letter === 'C' ? 'Liga ' + letter : 'Liga D+'}**.`;
    }
  }

  return reply(`✅ Verknüpft mit Verein **${displayName}**.${ligaNote}`, {ephemeral: true});
}

// ===== /stats [verein] =====
async function handleStats(interaction) {
  let clubId = optionValue(interaction, 'verein');
  if (!clubId) {
    clubId = await getLinkedClubId(discordUserIdOf(interaction));
    if (!clubId) return reply('Kein Verein angegeben und kein verknüpfter Account gefunden. Nutze zuerst `/verify` oder gib `verein:<Name>` an.', {ephemeral: true});
  }
  const doc = await db.collection('saves').doc(clubId).get();
  if (!doc.exists) return reply(`Kein Verein "${clubId}" gefunden.`, {ephemeral: true});
  const p = doc.data().profile || {};
  const cardCount = (doc.data().collection || []).length;

  return reply(null, {
    embeds: [{
      title: p.displayName || clubId,
      color: 0x3ddc84,
      fields: [
        {name: 'Coins', value: (p.coins || 0).toLocaleString('de-DE'), inline: true},
        {name: 'Siege', value: String(p.wins || 0), inline: true},
        {name: 'Niederlagen', value: String(p.losses || 0), inline: true},
        {name: 'Unentschieden', value: String(p.draws || 0), inline: true},
        {name: 'Karten', value: String(cardCount), inline: true},
        {name: 'Karriere-Siege', value: String(p.careerWins ?? p.wins ?? 0), inline: true},
      ],
    }],
  });
}

// ===== /liga buchstabe:A =====
// Reads the last FINISHED week's table straight out of leagueHistory/{weekStart} (written once by the
// game's own resolveWeeklyRolloverIfNeeded at rollover time) instead of re-deriving a live, in-progress
// table - that would mean porting the reveal-timing rules (ligaMatchIsRevealed et al.) into the bot as
// well, which isn't worth it just to show a table that's usually a few days stale anyway if it's not
// the finished one. Add a live variant later if that turns out to matter.
async function handleLiga(interaction) {
  let letter = (optionValue(interaction, 'buchstabe') || '').toUpperCase();
  if (!letter) {
    const clubId = await getLinkedClubId(discordUserIdOf(interaction));
    if (clubId) {
      const membershipSnap = await db.collection('leagueMembership').get();
      const found = membershipSnap.docs.find(d => (d.data().members || []).includes(clubId));
      if (found) letter = found.id;
    }
  }
  if (!letter) return reply('Welche Liga? `/liga buchstabe:A` (oder erst `/verify`, dann ohne Parameter).', {ephemeral: true});

  const historySnap = await db.collection('leagueHistory').orderBy('weekStart', 'desc').limit(1).get();
  if (historySnap.empty) return reply('Noch keine abgeschlossene Liga-Woche gefunden.', {ephemeral: true});
  const history = historySnap.docs[0].data();
  const table = (history.tables || {})[letter];
  if (!table || !table.length) return reply(`Keine Tabelle für Liga ${letter} in der letzten Woche.`, {ephemeral: true});

  const lines = table.slice(0, 10).map(row =>
    `**${row.displayRank}.** ${row.name} — ${row.pts} Pkt (${row.w}S/${row.d}U/${row.l}N, Tore ${row.gf}:${row.ga})`
  ).join('\n');
  const weekDate = new Date(history.weekStart).toLocaleDateString('de-DE');

  return reply(null, {
    embeds: [{
      title: `Liga ${letter} — Tabelle (Woche vom ${weekDate})`,
      description: lines,
      color: 0xffd76a,
    }],
  });
}

// ===== /vergleich verein1:X verein2:Y =====
async function handleVergleich(interaction) {
  const id1 = optionValue(interaction, 'verein1');
  const id2 = optionValue(interaction, 'verein2');
  if (!id1 || !id2) return reply('Bitte beide Vereine angeben: `/vergleich verein1:X verein2:Y`.', {ephemeral: true});

  const [doc1, doc2] = await Promise.all([db.collection('saves').doc(id1).get(), db.collection('saves').doc(id2).get()]);
  if (!doc1.exists) return reply(`Kein Verein "${id1}" gefunden.`, {ephemeral: true});
  if (!doc2.exists) return reply(`Kein Verein "${id2}" gefunden.`, {ephemeral: true});
  const p1 = doc1.data().profile || {}, p2 = doc2.data().profile || {};
  const c1 = (doc1.data().collection || []).length, c2 = (doc2.data().collection || []).length;

  // compares the RAW numbers (so e.g. 1000 vs 999 sorts correctly) but displays each value already
  // formatted for its own locale/unit - keeping the two separate avoids the classic bug of comparing
  // already-formatted strings ("1.000" vs "999") lexicographically instead of numerically.
  const row = (label, n1, n2, fmt = String) => ({
    name: label,
    value: `${fmt(n1)}${n1 > n2 ? ' 🟢' : ''} — ${fmt(n2)}${n2 > n1 ? ' 🟢' : ''}`,
    inline: false,
  });
  const coins = n => n.toLocaleString('de-DE');
  return reply(null, {
    embeds: [{
      title: `${p1.displayName || id1} vs. ${p2.displayName || id2}`,
      color: 0x3ddc84,
      fields: [
        row('Coins', p1.coins || 0, p2.coins || 0, coins),
        row('Siege', p1.wins || 0, p2.wins || 0),
        row('Niederlagen', p1.losses || 0, p2.losses || 0),
        row('Karten', c1, c2),
      ],
    }],
  });
}

// ===== /leaderboard kategorie:coins|siege =====
const LEADERBOARD_FIELDS = {coins: {path: 'profile.coins', label: 'Coins'}, siege: {path: 'profile.wins', label: 'Siege'}};
async function handleLeaderboard(interaction) {
  const kategorie = optionValue(interaction, 'kategorie') || 'coins';
  const field = LEADERBOARD_FIELDS[kategorie];
  if (!field) return reply('Unbekannte Kategorie. Erlaubt: `coins`, `siege`.', {ephemeral: true});

  const snap = await db.collection('saves').orderBy(field.path, 'desc').limit(10).get();
  if (snap.empty) return reply('Keine Daten gefunden.', {ephemeral: true});
  const lines = snap.docs.map((d, i) => {
    const p = d.data().profile || {};
    const value = kategorie === 'coins' ? (p.coins || 0).toLocaleString('de-DE') : String(p.wins || 0);
    return `**${i + 1}.** ${p.displayName || d.id} — ${value}`;
  }).join('\n');

  return reply(null, {embeds: [{title: `Bestenliste — ${field.label}`, description: lines, color: 0xffd76a}]});
}

// ===== /liga-preise buchstabe:A =====
// Small, rarely-changing static table copied straight from the game's LIGA_REWARD_TABLE - not worth
// a Firestore round-trip for data that's effectively a constant.
const LIGA_REWARD_TABLE = {
  A: {1: {coins: 75000, packs: '1x Liga-Pack + 2x 27 Ratings Pack'}, 2: {coins: 25000, packs: '2x 27 Ratings Pack'}, 3: {coins: 10000, packs: '1x 27 Ratings Pack'}, rest: {coins: 10000, packs: '—'}},
  B: {1: {coins: 45000, packs: '2x 27 Ratings Pack'}, 2: {coins: 15000, packs: '1x 27 Ratings Pack'}, 3: {coins: 5000, packs: '—'}, rest: {coins: 5000, packs: '—'}},
  C: {1: {coins: 15000, packs: '—'}, 2: {coins: 5000, packs: '—'}, 3: {coins: 2000, packs: '—'}, rest: {coins: 2000, packs: '—'}},
  D: {1: {coins: 10000, packs: '—'}, 2: {coins: 4000, packs: '—'}, 3: {coins: 1000, packs: '—'}, rest: {coins: 1000, packs: '—'}},
};
async function handleLigaPreise(interaction) {
  const letter = (optionValue(interaction, 'buchstabe') || 'A').toUpperCase();
  const bracket = LIGA_REWARD_TABLE[letter] || LIGA_REWARD_TABLE.D; // D's numbers apply to every league from D downward
  const rows = [
    ['🥇 1. Platz', bracket[1]], ['🥈 2. Platz', bracket[2]], ['🥉 3. Platz', bracket[3]], ['4. Platz+', bracket.rest],
  ].map(([label, r]) => ({name: label, value: `${r.coins.toLocaleString('de-DE')} Coins${r.packs !== '—' ? `, ${r.packs}` : ''}`, inline: false}));

  return reply(null, {embeds: [{title: `Liga ${letter} — Belohnungen`, fields: rows, color: 0xffd76a}]});
}

// ===== /naechster-rollover =====
// Both rollover generations (V1 and the current V2) finalize on Samstag, Europe/Berlin - V2 additionally
// starts its multi-phase promotion playoffs at 12:00 that day (see resolveWeeklyRolloverV2IfNeeded).
function berlinNow() {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false}).formatToParts(new Date());
  const get = t => Number(parts.find(p => p.type === t).value);
  const hour = get('hour');
  return new Date(get('year'), get('month') - 1, get('day'), hour === 24 ? 0 : hour, get('minute'), get('second'));
}
async function handleNaechsterRollover() {
  const now = berlinNow();
  const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSaturday, 12, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 7); // already past 12:00 this Samstag - next week's
  const diffMs = target.getTime() - now.getTime();
  const days = Math.floor(diffMs / 86400000), hours = Math.floor((diffMs % 86400000) / 3600000), mins = Math.floor((diffMs % 3600000) / 60000);
  return reply(`⏳ Nächster Liga-Rollover beginnt in **${days}T ${hours}h ${mins}min** (Samstag, 12:00 Uhr Berlin).`);
}

// ===== /karte name:X =====
// Only the REAL current-rating base card (players_data.js, a copy of the game's own real-player
// database - see functions/players_data.js's header comment for how to refresh it). Boosted/special
// pack- and SBC-variant cards are built entirely client-side at runtime in the game and aren't stored
// anywhere the bot could read them from, so this deliberately doesn't try to reproduce those.
function normalizeName(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
async function handleKarte(interaction) {
  const query = (optionValue(interaction, 'name') || '').trim();
  if (!query) return reply('Bitte einen Spielernamen angeben: `/karte name:...`.', {ephemeral: true});
  const players = require('./players_data.js');
  const q = normalizeName(query);
  const matches = players.filter(p => normalizeName(p.n).includes(q));
  if (!matches.length) return reply(`Kein Spieler gefunden für "${query}".`, {ephemeral: true});
  const p = matches.sort((a, b) => b.ov - a.ov)[0];

  return reply(null, {
    embeds: [{
      title: `${p.n} (${p.ov} OVR)`,
      description: `${p.club} · ${p.nat} · ${p.pos}`,
      color: 0x3ddc84,
      thumbnail: p.img ? {url: p.img} : undefined,
      fields: [
        {name: 'PAC', value: String(p.pac), inline: true},
        {name: 'SHO', value: String(p.sho), inline: true},
        {name: 'PAS', value: String(p.pas), inline: true},
        {name: 'DRI', value: String(p.dri), inline: true},
        {name: 'DEF', value: String(p.defn), inline: true},
        {name: 'PHY', value: String(p.phy), inline: true},
      ],
      footer: {text: matches.length > 1 ? `${matches.length} Treffer, bester gezeigt - reale Basis-Karte, keine Pack-Sondervariante.` : 'Reale Basis-Karte, keine Pack-Sondervariante.'},
    }],
  });
}

const COMMAND_HANDLERS = {
  verify: handleVerify, stats: handleStats, liga: handleLiga,
  vergleich: handleVergleich, leaderboard: handleLeaderboard, 'liga-preise': handleLigaPreise,
  'naechster-rollover': handleNaechsterRollover, karte: handleKarte,
};
// EVERY command defers now, not just the obviously slow ones (/verify's up to 7 sequential Firestore/
// Discord-API calls, /karte's 13 MB players_data.js parse). A cold Cloud Run start alone was already
// observed (via `firebase functions:log`) taking multiple seconds just to boot the container - "Starting
// new instance... Default STARTUP TCP probe succeeded after 1 attempt" - BEFORE any handler code even
// runs, which blew straight through Discord's 3-second window for even the simplest single-Firestore-
// read commands (/stats, /liga, ...) and produced the same "hat nicht rechtzeitig reagiert" as /verify
// did. Deferring uniformly removes this whole class of cold-start-vs-3-second-timeout races instead of
// trying to guess which commands are "fast enough" - Discord waits up to 15 minutes for the followup.
// Discord fixes a deferred interaction's visibility (ephemeral or not) at the moment of the initial
// ACK - the later followup can't override it - so this still has to match each command's normal reply
// style up front: /verify is ephemeral (account-linking chatter, not for the channel), everything else
// is public like it always was.
const DEFERRED_EPHEMERAL = {
  verify: true, stats: false, liga: false, vergleich: false, leaderboard: false,
  'liga-preise': false, 'naechster-rollover': false, karte: false,
};

async function sendFollowup(interaction, data) {
  const url = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;
  const res = await fetch(url, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  if (!res.ok) console.error('followup send failed', res.status, await res.text());
}

exports.discordInteractions = onRequest(
  {secrets: [DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_VERIFIED_ROLE_ID, ...LIGA_ROLE_SECRETS], cpu: 1, memory: '256MiB'},
  async (req, res) => {
    const signature = req.get('X-Signature-Ed25519');
    const timestamp = req.get('X-Signature-Timestamp');
    const isValid = signature && timestamp && req.rawBody &&
      verifyKey(req.rawBody, signature, timestamp, DISCORD_PUBLIC_KEY.value());
    if (!isValid) { res.status(401).send('invalid request signature'); return; }

    const interaction = req.body;
    if (interaction.type === InteractionType.PING) { res.json({type: CallbackType.PONG}); return; }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const name = interaction.data.name;
      const handler = COMMAND_HANDLERS[name];
      if (!handler) { res.json(reply('Unbekannter Command.', {ephemeral: true})); return; }

      // ACK immediately, always - Discord now waits up to 15 minutes for the real answer via a
      // followup message instead of racing the 3-second window on the initial response. Any future
      // command not yet listed in DEFERRED_EPHEMERAL still gets deferred (falls back to public/
      // non-ephemeral) - safer default than silently reverting to the old immediate-response path,
      // which is exactly the bug this whole mechanism exists to avoid.
      res.json({type: CallbackType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, data: {flags: DEFERRED_EPHEMERAL[name] ? 64 : 0}});
      try {
        const result = await handler(interaction);
        await sendFollowup(interaction, result.data);
      } catch (e) {
        console.error(`command ${name} failed`, e);
        await sendFollowup(interaction, {content: 'Fehler beim Ausführen des Commands.', flags: 64});
      }
      return;
    }
    res.status(400).send('unhandled interaction type');
  }
);

// ===== Liga-Rollover-Ankündigung =====
// Fires the instant the game writes leagueHistory/{weekStart} (once, at the end of
// resolveWeeklyRolloverIfNeeded) - event-driven, not polling, so there's no delay and no wasted
// invocations the other 6 days and 23-ish hours of the week nothing happens.
exports.announceLigaRollover = onDocumentCreated(
  {document: 'leagueHistory/{weekStart}', secrets: [DISCORD_ANNOUNCE_WEBHOOK_URL, DISCORD_GUILD_ID, DISCORD_BOT_TOKEN, ...LIGA_ROLE_SECRETS]},
  async (event) => {
    const history = event.data.data();
    const tables = history.tables || {};
    const letters = Object.keys(tables).sort();
    if (!letters.length) return;

    const webhookUrl = DISCORD_ANNOUNCE_WEBHOOK_URL.value();
    if (webhookUrl) {
      const fields = letters.map(letter => {
        const top3 = tables[letter].slice(0, 3)
          .map((row, i) => `${['🥇', '🥈', '🥉'][i]} ${row.name} (${row.pts} Pkt)`)
          .join('\n') || 'keine Einträge';
        return {name: `Liga ${letter}`, value: top3, inline: true};
      });
      const relegationNote = (history.relegationResults || []).length
        ? `\n${history.relegationResults.length} Relegations-Duell(e) wurden entschieden.`
        : '';
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          embeds: [{
            title: '🏆 Die Liga-Woche ist vorbei!',
            description: `Neue Tabellen, Auf- und Abstiege sind da.${relegationNote}`,
            color: 0xffd76a,
            fields,
          }],
        }),
      });
    }

    // Liga-Rollen für alle verknüpften Spieler nachziehen - leagueMembership wurde vom Spiel selbst
    // bereits VOR diesem leagueHistory-Dokument auf den neuen (Nach-Auf-/Abstieg) Stand geschrieben
    // (siehe resolveWeeklyRolloverIfNeeded/-V2 im Spiel), also spiegelt eine frische Abfrage hier schon
    // die Liga wider, in der jeder ab jetzt spielt - nicht die, in der er diese Woche gespielt hat.
    const guildId = DISCORD_GUILD_ID.value();
    if (!guildId) return;
    const [membershipSnap, linksSnap] = await Promise.all([
      db.collection('leagueMembership').get(),
      db.collection('discordLinks').get(),
    ]);
    const letterByClubId = new Map();
    membershipSnap.docs.forEach(d => {
      (d.data().members || []).forEach(clubId => letterByClubId.set(clubId, d.id));
    });
    for (const linkDoc of linksSnap.docs) {
      const {clubId} = linkDoc.data();
      const letter = letterByClubId.get(clubId);
      if (letter) await syncLigaRole(guildId, linkDoc.id, letter);
    }
  }
);
