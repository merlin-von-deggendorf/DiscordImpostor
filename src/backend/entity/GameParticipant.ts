import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, Unique, Column } from 'typeorm';
import { Game } from './Game';

@Entity()
@Unique(['game', 'userId'])
export class GameParticipant {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 50 })
  userId!: string;

  @ManyToOne(() => Game, game => game.participants)
  @JoinColumn({ name: 'gameId' })
  game!: Game;


  @CreateDateColumn()
  joinedAt!: Date;
}
