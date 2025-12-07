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

export class DataBase {
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

  async addPlayer(gameId: number, userId: string): Promise<GameParticipant> {
    const gameRepo = this.datasource.getRepository(Game);
    const participantRepo = this.datasource.getRepository(GameParticipant);

    const game = await gameRepo.findOne({ where: { id: gameId } });
    if (!game) {
      throw new Error(`Game with id ${gameId} not found`);
    }

    const existing = await participantRepo.findOne({
      where: { game: { id: gameId }, userId },
      relations: ['game'],
    });
    if (existing) {
      throw new Error(`User ${userId} is already a participant in game ${gameId}`);
    }

    const participant = participantRepo.create({ game, userId });
    return await participantRepo.save(participant);
  }

  async getGameWithParticipants(gameId: number): Promise<Game | null> {
    const gameRepo = this.datasource.getRepository(Game);
    return await gameRepo.findOne({
      where: { id: gameId },
      relations: ['participants'],
    });
  }

  async updateGameState(gameId: number, state: GameState): Promise<void> {
    const gameRepo = this.datasource.getRepository(Game);
    await gameRepo.update({ id: gameId }, { state });
  }

}
const dbInstance = new DataBase();
await dbInstance.initialize();
export default dbInstance;
