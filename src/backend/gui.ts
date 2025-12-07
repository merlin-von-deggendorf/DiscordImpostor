import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export class PingGui {
  static createEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('Pong!')
      .setDescription('The bot is responding!')
      .setColor(0x00ff00); // Green color
  }

  static createActionRow(): ActionRowBuilder<ButtonBuilder> {
    const button = new ButtonBuilder()
      .setCustomId('okay')
      .setLabel('Okay')
      .setStyle(ButtonStyle.Primary);
    const hello = new ButtonBuilder()
      .setCustomId('hello')
      .setLabel('Hello World!')
      .setStyle(ButtonStyle.Primary);
    const start = new ButtonBuilder()
      .setCustomId('start')
      .setLabel('Start Game')
      .setStyle(ButtonStyle.Primary);
    

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button, hello, start);

  }
}