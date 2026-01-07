import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Room } from '../rooms/room.entity';
import { GameResult } from '../game-results/game-result.entity';

@Entity('join_rooms')
export class JoinRoom {
  // Define join room entity properties and columns here
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.id, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  user: User;

  @ManyToOne(() => Room, (room) => room.id, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  room: Room;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  joined_at: Date;
}
