import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Game, GameState } from './entity/Game';
import { GameParticipant } from './entity/GameParticipant';


const AppDataSource = new DataSource({
  type: 'mariadb',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [Game, GameParticipant],
  synchronize: true,
  // optional but explicit:
  connectorPackage: 'mysql2',
});

class DataBase {
  datasource: DataSource;

  constructor() {
    this.datasource = AppDataSource;
  }
  async initialize() {
    return await this.datasource.initialize();
  }
  async createGame(
    name: string,
    gamemaster: string,
    timestamp: Date,
    duration = 30,
    state: GameState = GameState.Waiting4Players,
  ): Promise<Game> {
    const gameRepo = this.datasource.getRepository(Game);
    const newGame = gameRepo.create({
      name,
      gamemaster,
      timestamp,
      duration,
      state,
    });
    return await gameRepo.save(newGame);
  }

}
const dbInstance = new DataBase();
await dbInstance.initialize();
export default dbInstance;
