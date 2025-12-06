import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { GameParticipant } from "./GameParticipant"

@Entity()
export class Game {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @OneToMany(() => GameParticipant, participant => participant.game)
  participants!: GameParticipant[];
}