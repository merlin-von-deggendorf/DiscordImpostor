import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on('ready', () => {
  console.log('Bot is ready!');
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  message.reply('hello world');
});

client.login(process.env.DISCORD_TOKEN);
