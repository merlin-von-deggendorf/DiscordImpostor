import { Client } from 'discord.js';
import dbInstance, { DataBase } from './data-source';
import { Game, GameState } from './entity/Game';
import { GameParticipant } from './entity/GameParticipant';

class GameLogic {
  constructor(private readonly db: DataBase = dbInstance) {}

  async createGame(
    name: string,
    gamemaster: string,
    timestamp: Date,
    duration = 30,
    state: GameState = GameState.Waiting4Players,
  ): Promise<Game> {
    return await this.db.createGame(name, gamemaster, timestamp, duration, state);
  }

  async addPlayer(gameId: number, userId: string): Promise<GameParticipant> {
    return await this.db.addPlayer(gameId, userId);
  }

  async startGame(gameId: number, client: Client): Promise<Game> {
    const game = await this.db.getGameWithParticipants(gameId);
    if (!game) {
      throw new Error(`Game with id ${gameId} not found`);
    }
    if (game.state === GameState.Running) {
      throw new Error(`Game ${gameId} is already running`);
    }
    if (game.state === GameState.Finished) {
      throw new Error(`Game ${gameId} is already finished`);
    }

    await this.db.updateGameState(gameId, GameState.Running);
    const updatedGame = await this.db.getGameWithParticipants(gameId);
    if (!updatedGame) {
      throw new Error(`Game with id ${gameId} not found after update`);
    }

    const notifications = updatedGame.participants.map(async participant => {
      try {
        const user = await client.users.fetch(participant.userId);
        await user.send(`Game "${updatedGame.name}" has started!`);
      } catch (err) {
        console.warn(`Failed to notify user ${participant.userId} about game ${gameId} start`, err);
      }
    });
    await Promise.all(notifications);

    return updatedGame;
  }
}

export const gameLogic = new GameLogic();
export default gameLogic;
