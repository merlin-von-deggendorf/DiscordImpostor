import fs from 'fs/promises';
import path from 'path';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Interaction,
  ModalBuilder,
  Partials,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { DataSource } from 'typeorm';
import { Clue, Game, GameStatus, Participant, Vote } from './entities.js';

type GameContext = {
  game: Game;
  participants: Participant[];
  clues: Clue[];
  votes: Vote[];
};

const wordListPromise = loadWordList();

function asTextChannel(channel: unknown): channel is TextChannel {
  return Boolean(channel && typeof (channel as TextChannel).send === 'function');
}

async function loadWordList(): Promise<string[]> {
  const wordPath = path.join(process.cwd(), 'data', 'impostor_wordlist.txt');
  try {
    const raw = await fs.readFile(wordPath, { encoding: 'utf8' });
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    console.error('Failed to read impostor word list, falling back to defaults', error);
    return ['banana', 'spaceship', 'library', 'piano'];
  }
}

async function pickSecretWord(): Promise<string> {
  const words = await wordListPromise;
  if (words.length === 0) {
    return 'banana';
  }
  const index = Math.floor(Math.random() * words.length);
  return words[index];
}

function createLobbyComponents(gameId: string) {
  const joinRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`join_${gameId}`).setStyle(ButtonStyle.Success).setLabel('Join'),
    new ButtonBuilder().setCustomId(`leave_${gameId}`).setStyle(ButtonStyle.Secondary).setLabel('Leave'),
  );

  const startRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`start_${gameId}`).setStyle(ButtonStyle.Primary).setLabel('Start Game'),
  );

  return [joinRow, startRow];
}

function createClueComponents(gameId: string) {
  const clueRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`clue_${gameId}`).setStyle(ButtonStyle.Primary).setLabel('Submit clue'),
  );

  const hostRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`next_${gameId}`).setStyle(ButtonStyle.Secondary).setLabel('Next round / Finish clues'),
    new ButtonBuilder().setCustomId(`openvote_${gameId}`).setStyle(ButtonStyle.Danger).setLabel('Start voting'),
  );

  return [clueRow, hostRow];
}

function createDiscussionComponents(gameId: string) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`openvote_${gameId}`).setStyle(ButtonStyle.Danger).setLabel('Start voting'),
  );
  return [row];
}

function createVotingComponents(gameId: string) {
  const voteRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`vote_${gameId}`).setStyle(ButtonStyle.Primary).setLabel('Cast vote'),
  );
  const revealRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`reveal_${gameId}`).setStyle(ButtonStyle.Secondary).setLabel('Reveal results'),
  );
  return [voteRow, revealRow];
}

function createComponentsForStatus(game: Game) {
  switch (game.status) {
    case 'lobby':
      return createLobbyComponents(game.id);
    case 'clues':
      return createClueComponents(game.id);
    case 'discussion':
      return createDiscussionComponents(game.id);
    case 'voting':
      return createVotingComponents(game.id);
    default:
      return [];
  }
}

async function buildGameEmbed(client: Client, context: GameContext): Promise<EmbedBuilder> {
  const { game, participants, clues, votes } = context;
  const embed = new EmbedBuilder()
    .setTitle('Impostor Word Game')
    .setColor(0xf1c40f)
    .setFooter({ text: `Game ID: ${game.id}` })
    .setTimestamp();

  const statusLabel =
    game.status === 'lobby'
      ? 'Lobby: waiting for players'
      : game.status === 'clues'
        ? `Clue round ${game.currentRound}/${game.clueRounds}`
        : game.status === 'discussion'
          ? 'Discussion: talk it out'
          : game.status === 'voting'
            ? 'Voting: choose the impostor'
            : 'Finished';
  embed.addFields({ name: 'Status', value: statusLabel, inline: true });

  const participantLines = await Promise.all(
    participants.map(async (p) => {
      const user = await client.users.fetch(p.userId);
      const base = `${p.isHost ? '[HOST] ' : ''}<@${p.userId}>`;
      if (game.status === 'finished') {
        return `${base} - ${p.isImpostor ? 'Impostor' : 'Innocent'}`;
      }
      return base;
    }),
  );
  embed.addFields({
    name: `Players (${participants.length})`,
    value: participantLines.join('\n') || 'No players yet',
    inline: false,
  });

  const roundClues = clues.filter((clue) => clue.roundNumber === game.currentRound);
  if (game.status === 'clues' || game.status === 'discussion' || game.status === 'voting' || game.status === 'finished') {
    const clueLines = await Promise.all(
      roundClues.map(async (clue) => {
        const participant = participants.find((p) => p.id === clue.participantId);
        const userId = participant?.userId;
        const user = userId ? await client.users.fetch(userId) : null;
        const name = user ? user.username : 'Unknown';
        const mention = userId ? `<@${userId}>` : 'Unknown player';
        return `${mention} (${name}): ${clue.text}`;
      }),
    );
    embed.addFields({
      name: `Current round clues (${roundClues.length}/${participants.length})`,
      value: clueLines.join('\n') || 'No clues yet',
      inline: false,
    });
  }

  if (game.status === 'finished') {
    const tally = tallyVotes(votes);
    const voteLines =
      votes.length === 0
        ? 'No votes recorded'
        : Array.from(tally.entries())
            .map(([targetId, count]) => `<@${targetId}>: ${count}`)
            .join('\n');
    embed.addFields({ name: 'Votes', value: voteLines, inline: false });
    if (game.secretWord) {
      embed.addFields({ name: 'Secret word', value: game.secretWord, inline: true });
    }
    if (game.impostorUserId) {
      embed.addFields({ name: 'Impostor', value: `<@${game.impostorUserId}>`, inline: true });
    }
  }

  return embed;
}

async function fetchGameContext(dataSource: DataSource, gameId: string): Promise<GameContext | null> {
  const gameRepo = dataSource.getRepository(Game);
  const participantRepo = dataSource.getRepository(Participant);
  const clueRepo = dataSource.getRepository(Clue);
  const voteRepo = dataSource.getRepository(Vote);

  const game = await gameRepo.findOne({ where: { id: gameId } });
  if (!game) {
    return null;
  }

  const [participants, clues, votes] = await Promise.all([
    participantRepo.find({ where: { gameId }, order: { createdAt: 'ASC' } }),
    clueRepo.find({ where: { gameId }, order: { createdAt: 'ASC' } }),
    voteRepo.find({ where: { gameId }, order: { createdAt: 'ASC' } }),
  ]);

  return { game, participants, clues, votes };
}

async function updateControlMessage(client: Client, dataSource: DataSource, gameId: string) {
  const context = await fetchGameContext(dataSource, gameId);
  if (!context) {
    return;
  }
  const { game } = context;
  if (!game.controlMessageId) {
    return;
  }

  try {
    const channel = await client.channels.fetch(game.channelId);
    const textChannel = asTextChannel(channel) ? channel : null;
    if (!textChannel) {
      return;
    }
    const message = await textChannel.messages.fetch(game.controlMessageId);
    const embed = await buildGameEmbed(client, context);
    const components = createComponentsForStatus(game);
    await message.edit({ embeds: [embed], components });
  } catch (error) {
    console.error(`Failed to update control message for game ${gameId}`, error);
  }
}

function tallyVotes(votes: Vote[]) {
  const tally = new Map<string, number>();
  for (const vote of votes) {
    tally.set(vote.targetUserId, (tally.get(vote.targetUserId) ?? 0) + 1);
  }
  return tally;
}

function allCluesSubmitted(participants: Participant[], clues: Clue[], roundNumber: number) {
  const byParticipant = new Set(
    clues.filter((c) => c.roundNumber === roundNumber).map((c) => c.participantId),
  );
  return participants.every((p) => byParticipant.has(p.id));
}

async function finishGame(
  client: Client,
  dataSource: DataSource,
  context: GameContext,
  note?: string,
) {
  const { game, votes } = context;
  const gameRepo = dataSource.getRepository(Game);

  const tally = tallyVotes(votes);
  let topTarget: string | null = null;
  let topCount = 0;
  let tie = false;
  for (const [target, count] of tally.entries()) {
    if (count > topCount) {
      topTarget = target;
      topCount = count;
      tie = false;
    } else if (count === topCount) {
      tie = true;
    }
  }

  const impostorWins = !topTarget || tie || topTarget !== game.impostorUserId;
  game.status = 'finished';
  await gameRepo.save(game);

  await updateControlMessage(client, dataSource, game.id);

  const channel = await client.channels.fetch(game.channelId);
  const textChannel = asTextChannel(channel) ? channel : null;
  if (textChannel) {
    const resultLines = [
      `Votes locked in.${tie ? ' It was a tie!' : ''}`,
      impostorWins
        ? `Impostor wins! They were <@${game.impostorUserId}>.`
        : `Crew wins! They caught <@${game.impostorUserId}>.`,
      `Secret word: **${game.secretWord ?? 'unknown'}**`,
    ];
    if (note) {
      resultLines.push(note);
    }
    await textChannel.send(resultLines.join('\n'));
  }
}

async function concludeIfVotingDone(client: Client, dataSource: DataSource, context: GameContext) {
  const { participants, votes } = context;
  if (votes.length < participants.length) {
    return;
  }
  await finishGame(client, dataSource, context);
}

export async function startDiscordBot(dataSource: DataSource) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error('DISCORD_TOKEN is missing');
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel],
  });

  client.once('ready', async () => {
    console.log(`Logged in as ${client.user?.tag ?? 'unknown user'}`);
    const command = new SlashCommandBuilder()
      .setName('impostor')
      .setDescription('Start an impostor clue game')
      .addIntegerOption((option) =>
        option
          .setName('rounds')
          .setDescription('How many clue rounds before voting (default 2)')
          .setMinValue(1)
          .setMaxValue(5),
      );

    await client.application?.commands.set([command]);
    console.log('Slash command registered');
  });

  client.on('interactionCreate', async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === 'impostor') {
        await handleStartCommand(client, dataSource, interaction);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(client, dataSource, interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(client, dataSource, interaction);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(client, dataSource, interaction);
      }
    } catch (error) {
      console.error('Interaction handler failed', error);
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({ content: 'Something went wrong.', ephemeral: true });
      }
    }
  });

  await client.login(token);
}

async function handleStartCommand(client: Client, dataSource: DataSource, interaction: Interaction) {
  if (!interaction.isChatInputCommand()) return;
  const clueRounds = interaction.options.getInteger('rounds') ?? 2;
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: 'This game must be started in a server text channel.', ephemeral: true });
    return;
  }

  const gameRepo = dataSource.getRepository(Game);
  const participantRepo = dataSource.getRepository(Participant);
  const game = gameRepo.create({
    guildId: interaction.guildId ?? 'unknown',
    channelId: interaction.channelId,
    hostId: interaction.user.id,
    status: 'lobby' as GameStatus,
    currentRound: 1,
    clueRounds,
  });
  await gameRepo.save(game);

  const hostParticipant = participantRepo.create({
    gameId: game.id,
    userId: interaction.user.id,
    isHost: true,
  });
  await participantRepo.save(hostParticipant);

  const introEmbed = new EmbedBuilder()
    .setTitle('Impostor Word Game')
    .setDescription('Use the buttons to join. The host will start when everyone is in.')
    .setColor(0x2ecc71)
    .setFooter({ text: `Game ID: ${game.id}` });

  const message = await channel.send({
    embeds: [introEmbed],
    components: createLobbyComponents(game.id),
  });

  game.controlMessageId = message.id;
  await gameRepo.save(game);

  await interaction.reply({
    content: `Game created. Share this message link so players can join: ${message.url}`,
    ephemeral: true,
  });

  await updateControlMessage(client, dataSource, game.id);
}

async function handleButtonInteraction(client: Client, dataSource: DataSource, interaction: ButtonInteraction) {
  const [action, gameId] = interaction.customId.split('_');
  if (!action || !gameId) {
    return;
  }
  const context = await fetchGameContext(dataSource, gameId);
  if (!context) {
    await interaction.reply({ content: 'Game not found.', ephemeral: true });
    return;
  }
  const { game, participants } = context;

  switch (action) {
    case 'join':
      await handleJoin(interaction, dataSource, context);
      break;
    case 'leave':
      await handleLeave(interaction, dataSource, context);
      break;
    case 'start':
      await handleStartGame(client, dataSource, context, interaction);
      break;
    case 'clue':
      await handleClueModal(interaction, game);
      break;
    case 'next':
      await handleNextRound(client, dataSource, context, interaction);
      break;
    case 'openvote':
      await handleStartVoting(client, dataSource, context, interaction);
      break;
    case 'vote':
      await handleVotePrompt(client, dataSource, context, interaction);
      break;
    case 'reveal':
      await handleReveal(client, dataSource, context, interaction);
      break;
    default:
      await interaction.reply({ content: 'Unknown action.', ephemeral: true });
  }
}

async function handleJoin(interaction: ButtonInteraction, dataSource: DataSource, context: GameContext) {
  const { game, participants } = context;
  if (game.status !== 'lobby') {
    await interaction.reply({ content: 'The game has already started.', ephemeral: true });
    return;
  }
  const participantRepo = dataSource.getRepository(Participant);
  const existing = await participantRepo.findOne({
    where: { gameId: game.id, userId: interaction.user.id },
  });
  if (existing) {
    await interaction.reply({ content: 'You have already joined this game.', ephemeral: true });
    return;
  }
  const participant = participantRepo.create({ gameId: game.id, userId: interaction.user.id });
  await participantRepo.save(participant);
  await interaction.reply({ content: 'You joined the lobby.', ephemeral: true });
  await updateControlMessage(interaction.client, dataSource, game.id);
}

async function handleLeave(interaction: ButtonInteraction, dataSource: DataSource, context: GameContext) {
  const { game } = context;
  if (game.status !== 'lobby') {
    await interaction.reply({ content: 'You can only leave while the game is in the lobby.', ephemeral: true });
    return;
  }
  const participantRepo = dataSource.getRepository(Participant);
  const participant = await participantRepo.findOne({
    where: { gameId: game.id, userId: interaction.user.id },
  });
  if (!participant) {
    await interaction.reply({ content: 'You are not in this lobby.', ephemeral: true });
    return;
  }
  if (participant.isHost) {
    await interaction.reply({ content: 'The host cannot leave. You can start or delete the lobby manually.', ephemeral: true });
    return;
  }
  await participantRepo.remove(participant);
  await interaction.reply({ content: 'You left the lobby.', ephemeral: true });
  await updateControlMessage(interaction.client, dataSource, game.id);
}

async function handleStartGame(
  client: Client,
  dataSource: DataSource,
  context: GameContext,
  interaction: ButtonInteraction,
) {
  const { game, participants } = context;
  if (interaction.user.id !== game.hostId) {
    await interaction.reply({ content: 'Only the host can start the game.', ephemeral: true });
    return;
  }
  if (game.status !== 'lobby') {
    await interaction.reply({ content: 'The game is already underway.', ephemeral: true });
    return;
  }
  if (participants.length < 3) {
    await interaction.reply({ content: 'You need at least 3 players to start.', ephemeral: true });
    return;
  }

  const participantRepo = dataSource.getRepository(Participant);
  const gameRepo = dataSource.getRepository(Game);
  const impostorIndex = Math.floor(Math.random() * participants.length);
  const impostor = participants[impostorIndex];
  impostor.isImpostor = true;
  await participantRepo.save(impostor);

  const secretWord = await pickSecretWord();
  game.status = 'clues';
  game.secretWord = secretWord;
  game.impostorUserId = impostor.userId;
  game.currentRound = 1;
  await gameRepo.save(game);

  for (const participant of participants) {
    try {
      const user = await client.users.fetch(participant.userId);
      const dmContent =
        participant.userId === impostor.userId
          ? `You are the IMPOSTOR. Blend in without knowing the word.`
          : `Secret word: **${secretWord}**. Do not reveal it directly.`;
      await user.send(`Game ${game.id} update:\n${dmContent}`);
    } catch (error) {
      console.error(`Failed to DM ${participant.userId}`, error);
    }
  }

  await interaction.reply({ content: 'Game started! DMs sent.', ephemeral: true });
  await updateControlMessage(client, dataSource, game.id);
}

async function handleClueModal(interaction: ButtonInteraction, game: Game) {
  if (game.status !== 'clues') {
    await interaction.reply({ content: 'Clue submissions are closed.', ephemeral: true });
    return;
  }
  const modal = new ModalBuilder()
    .setCustomId(`cluemodal_${game.id}`)
    .setTitle(`Round ${game.currentRound} clue`);
  const input = new TextInputBuilder()
    .setCustomId('clue')
    .setLabel('Enter a single-word clue')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(50);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

async function handleModalSubmit(client: Client, dataSource: DataSource, interaction: Interaction) {
  if (!interaction.isModalSubmit()) return;
  const [prefix, gameId] = interaction.customId.split('_');
  if (prefix !== 'cluemodal' || !gameId) {
    return;
  }
  const context = await fetchGameContext(dataSource, gameId);
  if (!context) {
    await interaction.reply({ content: 'Game not found.', ephemeral: true });
    return;
  }
  const { game, participants, clues } = context;
  if (game.status !== 'clues') {
    await interaction.reply({ content: 'Clue submissions are closed.', ephemeral: true });
    return;
  }

  const participantRepo = dataSource.getRepository(Participant);
  const clueRepo = dataSource.getRepository(Clue);
  const participant = await participantRepo.findOne({
    where: { gameId: game.id, userId: interaction.user.id },
  });
  if (!participant) {
    await interaction.reply({ content: 'You are not part of this game.', ephemeral: true });
    return;
  }

  const existing = clues.find(
    (clue) => clue.roundNumber === game.currentRound && clue.participantId === participant.id,
  );
  if (existing) {
    await interaction.reply({ content: 'You already submitted a clue this round.', ephemeral: true });
    return;
  }

  const clueText = interaction.fields.getTextInputValue('clue').trim();
  const newClue = clueRepo.create({
    gameId: game.id,
    participantId: participant.id,
    roundNumber: game.currentRound,
    text: clueText,
  });
  await clueRepo.save(newClue);
  await interaction.reply({ content: 'Clue recorded.', ephemeral: true });
  await updateControlMessage(client, dataSource, game.id);
}

async function handleNextRound(
  client: Client,
  dataSource: DataSource,
  context: GameContext,
  interaction: ButtonInteraction,
) {
  const { game, participants, clues } = context;
  if (interaction.user.id !== game.hostId) {
    await interaction.reply({ content: 'Only the host can advance rounds.', ephemeral: true });
    return;
  }
  if (game.status !== 'clues') {
    await interaction.reply({ content: 'Clue rounds are over.', ephemeral: true });
    return;
  }

  const ready = allCluesSubmitted(participants, clues, game.currentRound);
  if (!ready) {
    await interaction.reply({ content: 'Wait for everyone to submit a clue first.', ephemeral: true });
    return;
  }

  const gameRepo = dataSource.getRepository(Game);
  if (game.currentRound < game.clueRounds) {
    game.currentRound += 1;
    await gameRepo.save(game);
    await interaction.reply({ content: `Starting round ${game.currentRound}.`, ephemeral: true });
  } else {
    game.status = 'discussion';
    await gameRepo.save(game);
    await interaction.reply({ content: 'Clue rounds complete. Discuss before voting.', ephemeral: true });
  }

  await updateControlMessage(client, dataSource, game.id);
}

async function handleStartVoting(
  client: Client,
  dataSource: DataSource,
  context: GameContext,
  interaction: ButtonInteraction,
) {
  const { game, participants, clues } = context;
  if (interaction.user.id !== game.hostId) {
    await interaction.reply({ content: 'Only the host can start voting.', ephemeral: true });
    return;
  }
  if (game.status !== 'discussion' && game.status !== 'clues') {
    await interaction.reply({ content: 'Voting has already started or the game is finished.', ephemeral: true });
    return;
  }
  if (game.status === 'clues') {
    const ready = allCluesSubmitted(participants, clues, game.currentRound);
    if (!ready) {
      await interaction.reply({ content: 'Finish the current round clues first.', ephemeral: true });
      return;
    }
  }

  const gameRepo = dataSource.getRepository(Game);
  game.status = 'voting';
  await gameRepo.save(game);

  await interaction.reply({ content: 'Voting started.', ephemeral: true });
  await updateControlMessage(client, dataSource, game.id);
}

async function handleVotePrompt(
  client: Client,
  dataSource: DataSource,
  context: GameContext,
  interaction: ButtonInteraction,
) {
  const { game, participants } = context;
  if (game.status !== 'voting') {
    await interaction.reply({ content: 'Voting is not active.', ephemeral: true });
    return;
  }
  const participantRepo = dataSource.getRepository(Participant);
  const participant = await participantRepo.findOne({
    where: { gameId: game.id, userId: interaction.user.id },
  });
  if (!participant) {
    await interaction.reply({ content: 'You are not in this game.', ephemeral: true });
    return;
  }

  const options = await Promise.all(
    participants.map(async (p) => {
      const user = await client.users.fetch(p.userId);
      return {
        label: user.username,
        value: p.userId,
        description: p.isHost ? 'Host' : 'Player',
      };
    }),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`voteselect_${game.id}`)
    .setPlaceholder('Choose who you think is the impostor')
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  await interaction.reply({ content: 'Select your vote:', components: [row], ephemeral: true });
}

async function handleSelectMenu(client: Client, dataSource: DataSource, interaction: Interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const [prefix, gameId] = interaction.customId.split('_');
  if (prefix !== 'voteselect' || !gameId) return;

  const context = await fetchGameContext(dataSource, gameId);
  if (!context) {
    await interaction.reply({ content: 'Game not found.', ephemeral: true });
    return;
  }
  const { game, participants } = context;
  if (game.status !== 'voting') {
    await interaction.reply({ content: 'Voting is not active.', ephemeral: true });
    return;
  }

  const participantRepo = dataSource.getRepository(Participant);
  const voteRepo = dataSource.getRepository(Vote);
  const participant = await participantRepo.findOne({
    where: { gameId: game.id, userId: interaction.user.id },
  });
  if (!participant) {
    await interaction.reply({ content: 'You are not in this game.', ephemeral: true });
    return;
  }

  const choice = interaction.values[0];
  if (!participants.some((p) => p.userId === choice)) {
    await interaction.reply({ content: 'Invalid vote target.', ephemeral: true });
    return;
  }
  const existing = await voteRepo.findOne({ where: { gameId: game.id, voterId: interaction.user.id } });
  if (existing) {
    existing.targetUserId = choice;
    await voteRepo.save(existing);
  } else {
    await voteRepo.save(
      voteRepo.create({
        gameId: game.id,
        voterId: interaction.user.id,
        targetUserId: choice,
      }),
    );
  }

  await interaction.reply({ content: `Vote recorded for <@${choice}>.`, ephemeral: true });
  const refreshed = await fetchGameContext(dataSource, game.id);
  if (refreshed) {
    await concludeIfVotingDone(client, dataSource, refreshed);
    await updateControlMessage(client, dataSource, game.id);
  }
}

async function handleReveal(
  client: Client,
  dataSource: DataSource,
  context: GameContext,
  interaction: ButtonInteraction,
) {
  const { game } = context;
  if (interaction.user.id !== game.hostId) {
    await interaction.reply({ content: 'Only the host can reveal results.', ephemeral: true });
    return;
  }
  if (game.status !== 'voting') {
    await interaction.reply({ content: 'Voting is not active.', ephemeral: true });
    return;
  }

  const refreshed = await fetchGameContext(dataSource, game.id);
  if (!refreshed) {
    await interaction.reply({ content: 'Game not found.', ephemeral: true });
    return;
  }
  if (refreshed.votes.length < refreshed.participants.length) {
    await finishGame(client, dataSource, refreshed, 'Host ended voting early.');
  } else {
    await concludeIfVotingDone(client, dataSource, refreshed);
  }
  await interaction.reply({ content: 'Results revealed.', ephemeral: true });
}
