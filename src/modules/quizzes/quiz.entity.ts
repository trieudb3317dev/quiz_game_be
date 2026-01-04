import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SubSubject } from '../subjects/sub-subject.entity';

@Entity('quizzes')
export class Quiz {
  // Define quiz entity properties and columns here
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => SubSubject, (subSubject) => subSubject.id, {
    onDelete: 'CASCADE',
  })
  sub_subject: SubSubject;

  @Column()
  title: string;

  @Column()
  slug: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}

@Entity('quiz_answers')
export class QuizAnswer {
  // Define quiz question entity properties and columns here
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Quiz, (quiz) => quiz.id, { onDelete: 'CASCADE' })
  quiz: Quiz;

  @Column()
  answer_text: string;

  @Column({ default: false })
  is_correct: boolean;

  @Column({ nullable: true })
  image_url: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
