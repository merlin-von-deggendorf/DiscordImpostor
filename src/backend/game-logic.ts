import dbInstance from './data-source';
import { Game, GameState } from './entity/Game';
import { GameParticipant } from './entity/GameParticipant';

class GameLogic {
  constructor(private readonly db = dbInstance) {}

  async createGame(
    name: string,
    gamemaster: string,
    timestamp: Date,
    duration = 30,
    state: GameState = GameState.Waiting4Players,
  ): Promise<Game> {
    const gameRepo = this.db.datasource.getRepository(Game);
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
    const gameRepo = this.db.datasource.getRepository(Game);
    const participantRepo = this.db.datasource.getRepository(GameParticipant);

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
}

export const gameLogic = new GameLogic();
export default gameLogic;
