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

const InteractionType = {PING: 1, APPLICATION_COMMAND: 2};
const CallbackType = {PONG: 1, CHANNEL_MESSAGE_WITH_SOURCE: 4};

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

  return reply(`✅ Verknüpft mit Verein **${displayName}**.`, {ephemeral: true});
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

const COMMAND_HANDLERS = {verify: handleVerify, stats: handleStats, liga: handleLiga};

exports.discordInteractions = onRequest(
  {secrets: [DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_VERIFIED_ROLE_ID], cpu: 1, memory: '256MiB'},
  async (req, res) => {
    const signature = req.get('X-Signature-Ed25519');
    const timestamp = req.get('X-Signature-Timestamp');
    const isValid = signature && timestamp && req.rawBody &&
      verifyKey(req.rawBody, signature, timestamp, DISCORD_PUBLIC_KEY.value());
    if (!isValid) { res.status(401).send('invalid request signature'); return; }

    const interaction = req.body;
    if (interaction.type === InteractionType.PING) { res.json({type: CallbackType.PONG}); return; }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const handler = COMMAND_HANDLERS[interaction.data.name];
      if (!handler) { res.json(reply('Unbekannter Command.', {ephemeral: true})); return; }
      try {
        res.json(await handler(interaction));
      } catch (e) {
        console.error(`command ${interaction.data.name} failed`, e);
        res.json(reply('Fehler beim Ausführen des Commands.', {ephemeral: true}));
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
  {document: 'leagueHistory/{weekStart}', secrets: [DISCORD_ANNOUNCE_WEBHOOK_URL]},
  async (event) => {
    const webhookUrl = DISCORD_ANNOUNCE_WEBHOOK_URL.value();
    if (!webhookUrl) return;
    const history = event.data.data();
    const tables = history.tables || {};
    const letters = Object.keys(tables).sort();
    if (!letters.length) return;

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
);
