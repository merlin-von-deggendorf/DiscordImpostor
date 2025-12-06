import { SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  new ContextMenuCommandBuilder()
    .setName('Ping')
    .setType(ApplicationCommandType.User),
  // Add more commands here
].map(command => command.toJSON());