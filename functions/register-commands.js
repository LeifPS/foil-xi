// One-off script to register/update the bot's global slash commands with Discord. Run locally
// whenever a command is added/changed (NOT automatically deployed - Discord's command list is
// separate from your function code):
//
//   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... node register-commands.js
//
// Global commands can take up to an hour to show up everywhere; register them as GUILD commands
// instead (see README.md) while iterating, for instant updates.
const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APPLICATION_ID || !BOT_TOKEN) {
  console.error('Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN env vars first.');
  process.exit(1);
}

const commands = [
  {
    name: 'verify',
    description: 'Verknüpfe deinen Discord-Account mit deinem FOIL ELEVEN Verein.',
    options: [
      {name: 'code', description: 'Der Code aus dem Spiel (Einstellungen → Discord verknüpfen)', type: 3, required: true},
    ],
  },
  {
    name: 'stats',
    description: 'Zeigt die Statistiken eines Vereins.',
    options: [
      {name: 'verein', description: 'Vereinsname (leer = dein verknüpfter Account)', type: 3, required: false},
    ],
  },
  {
    name: 'liga',
    description: 'Zeigt die Tabelle der letzten abgeschlossenen Liga-Woche.',
    options: [
      {name: 'buchstabe', description: 'Liga-Buchstabe, z.B. A', type: 3, required: false},
    ],
  },
];

async function main() {
  const res = await fetch(`https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    console.error('Registration failed:', res.status, await res.text());
    process.exit(1);
  }
  console.log(`Registered ${commands.length} global commands.`);
}

main();
