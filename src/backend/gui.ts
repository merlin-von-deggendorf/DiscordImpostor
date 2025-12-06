import { EmbedBuilder } from 'discord.js';

export class PingGui {
  static createEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('Pong!')
      .setDescription('The bot is responding!')
      .setColor(0x00ff00); // Green color
  }
}