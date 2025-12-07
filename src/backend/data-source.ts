import 'reflect-metadata';
import { DataSource } from 'typeorm';
import path from 'path';
import { fileURLToPath } from 'url';
import { Game } from './entity/Game';
import { GameParticipant } from './entity/GameParticipant';


export const AppDataSource = new DataSource({
  type: 'mariadb',
  host: process.env.DB_HOST ,
  port:  Number(process.env.DB_PORT) ,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [ Game, GameParticipant],
  synchronize: true,
  // optional but explicit:
  connectorPackage: 'mysql2',
});

class DataBase{
  
}