import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type GameStatus = 'lobby' | 'clues' | 'discussion' | 'voting' | 'finished';

@Entity()
export class Game {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  guildId!: string;

  @Column({ type: 'varchar', length: 64 })
  channelId!: string;

  @Column({ type: 'varchar', length: 64 })
  hostId!: string;

  @Column({ type: 'varchar' })
  status!: GameStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  controlMessageId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  secretWord?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  impostorUserId?: string;

  @Column({ type: 'int', default: 1 })
  currentRound!: number;

  @Column({ type: 'int', default: 2 })
  clueRounds!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Participant, (participant) => participant.game)
  participants!: Participant[];

  @OneToMany(() => Clue, (clue) => clue.game)
  clues!: Clue[];

  @OneToMany(() => Vote, (vote) => vote.game)
  votes!: Vote[];
}

@Entity()
@Unique(['gameId', 'userId'])
export class Participant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  gameId!: string;

  @ManyToOne(() => Game, (game) => game.participants, { onDelete: 'CASCADE' })
  game!: Game;

  @Column({ type: 'varchar', length: 64 })
  userId!: string;

  @Column({ type: 'boolean', default: false })
  isHost!: boolean;

  @Column({ type: 'boolean', default: false })
  isImpostor!: boolean;

  @OneToMany(() => Clue, (clue) => clue.participant)
  clues!: Clue[];

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity()
@Unique(['gameId', 'participantId', 'roundNumber'])
export class Clue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  gameId!: string;

  @ManyToOne(() => Game, (game) => game.clues, { onDelete: 'CASCADE' })
  game!: Game;

  @Column({ type: 'uuid' })
  participantId!: string;

  @ManyToOne(() => Participant, (participant) => participant.clues, { onDelete: 'CASCADE' })
  participant!: Participant;

  @Column({ type: 'int' })
  roundNumber!: number;

  @Column({ type: 'varchar', length: 200 })
  text!: string;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity()
@Unique(['gameId', 'voterId'])
export class Vote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  gameId!: string;

  @ManyToOne(() => Game, (game) => game.votes, { onDelete: 'CASCADE' })
  game!: Game;

  @Column({ type: 'varchar', length: 64 })
  voterId!: string;

  @Column({ type: 'varchar', length: 64 })
  targetUserId!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
