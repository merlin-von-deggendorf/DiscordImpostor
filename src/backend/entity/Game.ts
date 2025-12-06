import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { GameParticipant } from "./GameParticipant"

@Entity()
export class Game {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  gamemaster!: string;

  @Column({ type: 'timestamp' })
  timestamp!: Date;

  @Column({ type: 'int' })
  duration!: number;

  @OneToMany(() => GameParticipant, participant => participant.game)
  participants!: GameParticipant[];
}