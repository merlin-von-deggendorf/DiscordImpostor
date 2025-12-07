import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { commands } from './commands';
import { PingGui } from './gui';
import gameLogic from './game-logic';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN!);

client.on('ready', async () => {
  console.log('Bot is ready!');

  // Register commands (run once for deployment)
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(client.user!.id),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ping') {
      const embed = PingGui.createEmbed();
      const actionRow = PingGui.createActionRow();
      await interaction.reply({ embeds: [embed], components: [actionRow] });
    }
    // Add handlers for other commands
  } else if (interaction.isButton()) {
    if (interaction.customId === 'okay') {

      if (!interaction.channel?.isVoiceBased()) {
        await interaction.reply('This command can only be used in voice channels.');
        return;
      }
      const newGame = await gameLogic.createGame(
        `Game in channel ${interaction.channelId}`,
        interaction.user.id,
        new Date(),
        30,
        // state defaults to waiting4players
      );
      await interaction.reply(`New game created with ID: ${newGame.id} channel type: ${interaction.channel?.isVoiceBased()} gamemaster: ${newGame.gamemaster}`);
    } else if (interaction.customId === 'hello') {
      await interaction.reply('Hello World button clicked!');
    }

  } else if (interaction.isUserContextMenuCommand()) {
    if (interaction.commandName === 'Ping') {
      const embed = PingGui.createEmbed();
      const actionRow = PingGui.createActionRow();
      await interaction.reply({ embeds: [embed], components: [actionRow] });
    }
  }
});


client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  // message.reply('hello world');
});

(async () => {
  console.log('Database connected and synchronized.');
  client.login(process.env.DISCORD_TOKEN);
})();
