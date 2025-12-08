import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  User,
} from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error('DISCORD_TOKEN is missing from the environment.');
}

// Resolve the word list once at startup so commands stay fast.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wordListPath = path.resolve(__dirname, '../../data/impostor_wordlist.txt');
const fallbackWords = ['Spaceship', 'Banana', 'Keyboard', 'Sunset', 'Lantern'];

function loadWords(): string[] {
  try {
    const raw = readFileSync(wordListPath, 'utf-8');
    const words = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return words.length ? words : fallbackWords;
  } catch (error) {
    console.warn(`Could not load word list at ${wordListPath}, using fallback words.`);
    return fallbackWords;
  }
}

const words = loadWords();
const userOptionNames = ['user1', 'user2', 'user3', 'user4', 'user5'] as const;

const impostorCommand = new SlashCommandBuilder()
  .setName('impostor')
  .setDescription('Send a secret word to all but one player to find the impostor.')
  .addUserOption((option) =>
    option.setName('user1').setDescription('First player').setRequired(true),
  )
  .addUserOption((option) =>
    option.setName('user2').setDescription('Second player').setRequired(true),
  )
  .addUserOption((option) =>
    option.setName('user3').setDescription('Third player').setRequired(true),
  )
  .addUserOption((option) =>
    option.setName('user4').setDescription('Fourth player (optional)'),
  )
  .addUserOption((option) =>
    option.setName('user5').setDescription('Fifth player (optional)'),
  );

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function collectPlayers(interactionUsers: Record<string, User | null>): User[] {
  const deduped = new Map<string, User>();
  for (const name of userOptionNames) {
    const user = interactionUsers[name];
    if (user) {
      deduped.set(user.id, user);
    }
  }
  return Array.from(deduped.values());
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user?.tag ?? client.user?.username ?? 'bot'}`);
  try {
    await client.application?.commands.set([impostorCommand.toJSON()]);
    console.log('Slash commands registered.');
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'impostor') {
    return;
  }

  const interactionUsers: Record<string, User | null> = {
    user1: interaction.options.getUser('user1'),
    user2: interaction.options.getUser('user2'),
    user3: interaction.options.getUser('user3'),
    user4: interaction.options.getUser('user4'),
    user5: interaction.options.getUser('user5'),
  };

  const players = collectPlayers(interactionUsers);
  if (players.length < 3) {
    await interaction.reply({
      content: 'Please pick at least three distinct users.',
      ephemeral: true,
    });
    return;
  }

  const impostorIndex = Math.floor(Math.random() * players.length);
  const impostor = players[impostorIndex];
  const secretWord = pickRandom(words);

  const sendResults = await Promise.all(
    players.map(async (user, index) => {
      const isImpostor = index === impostorIndex;
      const content = isImpostor
        ? 'You are the impostor this round. You do NOT know the word—blend in!'
        : `Your secret word is: **${secretWord}**`;
      try {
        await user.send(content);
        return { user, status: isImpostor ? 'impostor-notified' : 'sent-word' } as const;
      } catch (error) {
        console.error(`Failed to DM ${user.tag ?? user.username} (${user.id})`, error);
        return { user, status: isImpostor ? 'impostor-failed' : 'failed-word' } as const;
      }
    }),
  );

  const failures = sendResults.filter(
    (result) => result.status === 'failed-word' || result.status === 'impostor-failed',
  );
  const sentCount = sendResults.filter((result) => result.status === 'sent-word').length;
  const totalTargets = players.length - 1; // Number of people who should get the word.
  const impostorStatus = sendResults.find(
    (result) => result.status === 'impostor-notified' || result.status === 'impostor-failed',
  );

  const responseLines = [
    `Sent the word to ${sentCount}/${totalTargets} non-impostor players. The impostor stays secret.`,
  ];

  if (impostorStatus?.status === 'impostor-failed') {
    responseLines.push('Could not notify the impostor (DMs may be disabled).');
  }

  if (failures.length) {
    const failedUsers = failures
      .map((entry) => entry.user.tag ?? entry.user.username ?? entry.user.id)
      .join(', ');
    responseLines.push(`Failed to DM: ${failedUsers}. They may have DMs disabled.`);
  }

  await interaction.reply({
    content: responseLines.join(' '),
    ephemeral: true,
  });
});

client.login(token);
