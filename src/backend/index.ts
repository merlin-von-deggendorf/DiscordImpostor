import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { commands } from './commands.js';
import { PingGui } from './gui.js';

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
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    const embed = PingGui.createEmbed();
    await interaction.reply({ embeds: [embed] });
  }
  // Add handlers for other commands
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  message.reply('hello world');
});

client.login(process.env.DISCORD_TOKEN);
