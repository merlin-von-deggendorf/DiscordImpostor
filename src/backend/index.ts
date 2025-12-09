import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  GatewayIntentBits,
  MessageFlags,
  SlashCommandBuilder,
  User,
} from 'discord.js';
import dotenv from 'dotenv';
import {
  Column,
  CreateDateColumn,
  DataSource,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Repository,
  UpdateDateColumn,
} from 'typeorm';

dotenv.config();

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error('DISCORD_TOKEN is missing from the environment.');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wordListPath = path.resolve(__dirname, '../../data/impostor_wordlist.txt');
const fallbackWords = ['Spaceship', 'Banana', 'Keyboard', 'Sunset', 'Lantern'];
const isDev = Boolean(process.env.DEV ?? process.env.dev);

type GameStatus = 'waiting' | 'sent';

@Entity()
class Game {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  guildId!: string;

  @Column({ type: 'text' })
  channelId!: string;

  @Column({ type: 'text' })
  creatorId!: string;

  @Column({ type: 'text', default: 'waiting' })
  status!: GameStatus;

  @Column({ type: 'text', nullable: true })
  secretWord?: string | null;

  @Column({ type: 'text', nullable: true })
  impostorId?: string | null;

  @Column({ type: 'boolean', default: false })
  revealed!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => GameParticipant, (participant) => participant.game, {
    cascade: true,
  })
  participants?: GameParticipant[];
}

@Entity()
class GameParticipant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Game, (game) => game.participants, {
    onDelete: 'CASCADE',
  })
  game!: Game;

  @Column({ type: 'text' })
  userId!: string;

  @CreateDateColumn()
  joinedAt!: Date;
}

const dbHost = process.env.DB_HOST ?? 'localhost';
const dbPort = Number(process.env.DB_PORT ?? 3306);
const dbUser = process.env.DB_USER ?? 'root';
const dbPassword = process.env.DB_PASSWORD ?? '';
const dbName = process.env.DB_DATABASE ?? 'discordimpostor';
const dbPoolSize = Number(process.env.DB_POOL_SIZE ?? 10) || 10;

const dataSource = new DataSource({
  type: 'mariadb',
  host: dbHost,
  port: dbPort,
  username: dbUser,
  password: dbPassword,
  database: dbName,
  entities: [Game, GameParticipant],
  synchronize: true,
  extra: {
    connectionLimit: dbPoolSize,
  },
});

await dataSource.initialize();

const gameRepository: Repository<Game> = dataSource.getRepository(Game);
const participantRepository: Repository<GameParticipant> =
  dataSource.getRepository(GameParticipant);

function loadWords(): string[] {
  try {
    const raw = readFileSync(wordListPath, 'utf-8');
    const loadedWords = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return loadedWords.length ? loadedWords : fallbackWords;
  } catch (error) {
    console.warn(`Could not load word list at ${wordListPath}, using fallback words.`);
    return fallbackWords;
  }
}

const words = loadWords();

const impostorCommand = new SlashCommandBuilder()
  .setName('impostor')
  .setDescription('Start an impostor game with joinable buttons.');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function buildGameButtons(gameId: string, status: GameStatus, hasWord: boolean, revealed: boolean) {
  const joinButton = new ButtonBuilder()
    .setCustomId(`join:${gameId}`)
    .setLabel('Join game')
    .setStyle(ButtonStyle.Primary);
  const sendButton = new ButtonBuilder()
    .setCustomId(`send:${gameId}`)
    .setLabel('Send words')
    .setStyle(ButtonStyle.Success)
    .setDisabled(status === 'sent');
  const restartButton = new ButtonBuilder()
    .setCustomId(`restart:${gameId}`)
    .setLabel('Restart (new words)')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(status !== 'sent' || !revealed);
  const revealButton = new ButtonBuilder()
    .setCustomId(`reveal:${gameId}`)
    .setLabel('Reveal word & impostor')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(!hasWord);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      joinButton,
      sendButton,
      restartButton,
      revealButton,
    ),
  ];
}

function formatGameMessage(game: Game, participantCount: number): string {
  const intro = `Impostor game created by <@${game.creatorId}>.`;
  const instructions = [
    'Click "Join game" to participate.',
    'The creator clicks "Send words" once ready.',
    'After words are sent, click "Reveal" to show the word & impostor, then "Restart" for another round.',
  ].join(' ');
  const statusLine =
    game.status === 'waiting' ? 'Status: Waiting to send words.' : 'Status: Words sent.';
  const revealLine = game.secretWord
    ? game.revealed
      ? 'Reveal: done.'
      : 'Reveal: pending (creator must reveal before restart).'
    : 'Reveal: word not sent yet.';
  return `${intro}\n${instructions}\nPlayers joined: ${participantCount}\n${statusLine}\n${revealLine}`;
}

function parseButtonId(
  customId: string,
): { action: 'join' | 'send' | 'restart' | 'reveal'; gameId: string } | null {
  const [action, gameId] = customId.split(':');
  if (
    (action === 'join' || action === 'send' || action === 'restart' || action === 'reveal') &&
    gameId
  ) {
    return { action, gameId };
  }
  return null;
}

async function handleCreateGame(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId || !interaction.channelId) {
    await interaction.reply({
      content: 'Games can only be created inside a server channel.',
      ephemeral: true,
    });
    return;
  }

  const game = await gameRepository.save(
    gameRepository.create({
      creatorId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    }),
  );

  await participantRepository.save(
    participantRepository.create({
      game,
      userId: interaction.user.id,
    }),
  );

  const participantCount = await participantRepository.count({
    where: { game: { id: game.id } },
  });

  await interaction.reply({
    content: formatGameMessage(game, participantCount),
    components: buildGameButtons(
      game.id,
      game.status,
      Boolean(game.secretWord),
      Boolean(game.revealed),
    ),
  });
}

async function handleJoinButton(interaction: ButtonInteraction, gameId: string) {
  const game = await gameRepository.findOne({
    where: { id: gameId },
    relations: ['participants'],
  });

  if (!game) {
    await interaction.reply({
      content: 'This game is no longer available.',
      ephemeral: true,
    });
    return;
  }

  const alreadyIn = (game.participants ?? []).some(
    (participant) => participant.userId === interaction.user.id,
  );
  if (alreadyIn) {
    await interaction.reply({
      content: 'You already joined this game.',
      ephemeral: true,
    });
    return;
  }

  await participantRepository.save(
    participantRepository.create({
      game,
      userId: interaction.user.id,
    }),
  );

  const participantCount = await participantRepository.count({
    where: { game: { id: game.id } },
  });

  await interaction.reply({
    content: 'You joined the game.',
    ephemeral: true,
  });

  try {
    await interaction.message.edit({
      content: formatGameMessage(game, participantCount),
      components: buildGameButtons(
        game.id,
        game.status,
        Boolean(game.secretWord),
        Boolean(game.revealed),
      ),
    });
  } catch (error) {
    console.error('Failed to update game message after join', error);
  }
}

async function handleSendButton(interaction: ButtonInteraction, gameId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const game = await gameRepository.findOne({
    where: { id: gameId },
    relations: ['participants'],
  });

  if (!game) {
    await interaction.editReply({
      content: 'This game is no longer available.',
    });
    return;
  }

  if (game.creatorId !== interaction.user.id) {
    await interaction.editReply({
      content: 'Only the game creator can send the words.',
    });
    return;
  }

  if (game.status !== 'waiting') {
    await interaction.editReply({
      content: 'Words were already sent for this game.',
    });
    return;
  }

  const participantIds = Array.from(
    new Set((game.participants ?? []).map((participant) => participant.userId)),
  );

  const players: User[] = [];
  for (const userId of participantIds) {
    try {
      const user = await client.users.fetch(userId);
      players.push(user);
    } catch (error) {
      console.warn(`Could not fetch user ${userId}`, error);
    }
  }

  if (!players.length) {
    await interaction.editReply({
      content: 'Could not load any players (they may have left the server).',
    });
    return;
  }

  if (!isDev && players.length < 3) {
    await interaction.editReply({
      content: 'Need at least 3 distinct players before sending words (set DEV to bypass for testing).',
    });
    return;
  }

  const impostorIndex = Math.floor(Math.random() * players.length);
  const secretWord = pickRandom(words);

  const sendResults = await Promise.all(
    players.map(async (user, index) => {
      const isImpostor = index === impostorIndex;
      const content = isImpostor
        ? 'You are the impostor this round. You do NOT know the word, blend in!'
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

  game.status = 'sent';
  game.revealed = false;
  game.secretWord = secretWord;
  game.impostorId = players[impostorIndex]?.id;
  await gameRepository.save(game);

  const failures = sendResults.filter((result) => result.status === 'failed-word');
  const impostorFailure = sendResults.find((result) => result.status === 'impostor-failed');
  const sentCount = sendResults.filter((result) => result.status === 'sent-word').length;
  const totalTargets = players.length - 1; // Number of people who should get the word.

  const responseLines = [
    `Sent the word to ${sentCount}/${totalTargets} non-impostor players. The impostor stays secret.`,
  ];

  if (impostorFailure) {
    responseLines.push('Could not notify the impostor (DMs may be disabled).');
  }

  if (failures.length) {
    const failedUsers = failures
      .map((entry) => entry.user.tag ?? entry.user.username ?? entry.user.id)
      .join(', ');
    responseLines.push(`Failed to DM: ${failedUsers}. They may have DMs disabled.`);
  }

  await interaction.editReply({
    content: responseLines.join(' '),
  });

  try {
    await interaction.message.edit({
      content: formatGameMessage(game, players.length),
      components: buildGameButtons(
        game.id,
        game.status,
        Boolean(game.secretWord),
        Boolean(game.revealed),
      ),
    });
  } catch (error) {
    console.error('Failed to disable game buttons after sending words', error);
  }
}

async function handleRestartButton(interaction: ButtonInteraction, gameId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const game = await gameRepository.findOne({
    where: { id: gameId },
    relations: ['participants'],
  });

  if (!game) {
    await interaction.editReply({
      content: 'This game is no longer available.',
    });
    return;
  }

  if (game.creatorId !== interaction.user.id) {
    await interaction.editReply({
      content: 'Only the game creator can restart the game.',
    });
    return;
  }

  if (!game.revealed) {
    await interaction.editReply({
      content: 'Reveal the last round before restarting.',
    });
    return;
  }

  const participantIds = Array.from(
    new Set((game.participants ?? []).map((participant) => participant.userId)),
  );

  if (participantIds.length === 0) {
    await interaction.editReply({
      content: 'No players are in this game yet.',
    });
    return;
  }

  const players: User[] = [];
  for (const userId of participantIds) {
    try {
      const user = await client.users.fetch(userId);
      players.push(user);
    } catch (error) {
      console.warn(`Could not fetch user ${userId}`, error);
    }
  }

  if (!players.length) {
    await interaction.editReply({
      content: 'Could not load any players to restart the game.',
    });
    return;
  }

  if (!isDev && players.length < 3) {
    await interaction.editReply({
      content: 'Need at least 3 distinct players before sending words (set DEV to bypass for testing).',
    });
    return;
  }

  const impostorIndex = Math.floor(Math.random() * players.length);
  const secretWord = pickRandom(words);

  const sendResults = await Promise.all(
    players.map(async (user, index) => {
      const isImpostor = index === impostorIndex;
      const content = isImpostor
        ? 'You are the impostor this round. You do NOT know the word, blend in!'
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

  game.status = 'sent';
  game.revealed = false;
  game.secretWord = secretWord;
  game.impostorId = players[impostorIndex]?.id;
  await gameRepository.save(game);

  const failures = sendResults.filter((result) => result.status === 'failed-word');
  const impostorFailure = sendResults.find((result) => result.status === 'impostor-failed');
  const sentCount = sendResults.filter((result) => result.status === 'sent-word').length;
  const totalTargets = Math.max(players.length - 1, 0);

  const responseLines = [
    `Sent the word to ${sentCount}/${totalTargets} non-impostor players. The impostor stays secret.`,
  ];

  if (impostorFailure) {
    responseLines.push('Could not notify the impostor (DMs may be disabled).');
  }

  if (failures.length) {
    const failedUsers = failures
      .map((entry) => entry.user.tag ?? entry.user.username ?? entry.user.id)
      .join(', ');
    responseLines.push(`Failed to DM: ${failedUsers}. They may have DMs disabled.`);
  }

  await interaction.editReply({
    content: responseLines.join(' '),
  });

  try {
    await interaction.message.edit({
      content: formatGameMessage(game, players.length),
      components: buildGameButtons(
        game.id,
        game.status,
        Boolean(game.secretWord),
        Boolean(game.revealed),
      ),
    });
  } catch (error) {
    console.error('Failed to update game message after restart', error);
  }
}

async function handleRevealButton(interaction: ButtonInteraction, gameId: string) {
  const game = await gameRepository.findOne({
    where: { id: gameId },
  });

  if (!game) {
    await interaction.reply({
      content: 'This game is no longer available.',
      ephemeral: true,
    });
    return;
  }

  if (game.creatorId !== interaction.user.id) {
    await interaction.reply({
      content: 'Only the game creator can reveal the word and impostor.',
      ephemeral: true,
    });
    return;
  }

  if (!game.secretWord || !game.impostorId) {
    await interaction.reply({
      content: 'Words have not been sent yet, nothing to reveal.',
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `Reveal:\nWord: **${game.secretWord}**\nImpostor: <@${game.impostorId}>`,
    ephemeral: false,
  });

  game.revealed = true;
  await gameRepository.save(game);

  try {
    const participantCount = await participantRepository.count({
      where: { game: { id: game.id } },
    });
    await interaction.message.edit({
      content: formatGameMessage(game, participantCount),
      components: buildGameButtons(
        game.id,
        game.status,
        Boolean(game.secretWord),
        Boolean(game.revealed),
      ),
    });
  } catch (error) {
    console.error('Failed to update game message after reveal', error);
  }
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
  if (interaction.isChatInputCommand() && interaction.commandName === 'impostor') {
    await handleCreateGame(interaction);
    return;
  }

  if (!interaction.isButton()) {
    return;
  }

  const parsed = parseButtonId(interaction.customId);
  if (!parsed) {
    return;
  }

  if (parsed.action === 'join') {
    await handleJoinButton(interaction, parsed.gameId);
    return;
  }

  if (parsed.action === 'send') {
    await handleSendButton(interaction, parsed.gameId);
    return;
  }

  if (parsed.action === 'restart') {
    await handleRestartButton(interaction, parsed.gameId);
    return;
  }

  if (parsed.action === 'reveal') {
    await handleRevealButton(interaction, parsed.gameId);
  }
});

client.login(token);
