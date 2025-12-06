import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Game } from './Game';

@Entity()
export class GameParticipant {
  @PrimaryGeneratedColumn()
  id!: number;


  @ManyToOne(() => Game, game => game.participants)
  @JoinColumn({ name: 'gameId' })
  game!: Game;


  @CreateDateColumn()
  joinedAt!: Date;
}