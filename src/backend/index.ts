import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Clue, Game, Participant, Vote } from './entities.js';
import { startDiscordBot } from './discordbot.js';

config();

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'discordimpostor',
  synchronize: true,
  logging: false,
  entities: [Game, Participant, Clue, Vote],
});

async function bootstrap() {
  try {
    await dataSource.initialize();
    await startDiscordBot(dataSource);
  } catch (error) {
    console.error('Failed to bootstrap bot', error);
    process.exitCode = 1;
  }
}

bootstrap();
