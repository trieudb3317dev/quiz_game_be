import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { AnswerSelect } from "./ans-select.entity";
import { Repository } from "typeorm";
import { QuizAnswer } from "../quizzes/quiz.entity";
import { User } from "../users/user.entity";
import { JoinRoom } from "../join-rooms/join-room.entity";
import { GameResult } from '../game-results/game-result.entity';
import { HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class AnsSelectService {
    private readonly logger = new Logger(AnsSelectService.name);
    constructor(
        @InjectRepository(AnswerSelect)
        private readonly ansSelectRepository: Repository<AnswerSelect>,
        @InjectRepository(QuizAnswer)
        private readonly quizAnswerRepository: Repository<QuizAnswer>,
        @InjectRepository(JoinRoom)
        private readonly joinRoomRepository: Repository<JoinRoom>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
            @InjectRepository(GameResult)
            private readonly gameResultRepository: Repository<GameResult>,
    ) {}

        /**
         * User selects an answer for a quiz (joiner chooses an answer).
         * - Validates user and joinRoom belong to the user
         * - Creates or updates an AnswerSelect record (increment select_count)
         * - Creates a GameResult record recording score for this selection
         */
        async selectAnswer(
            userId: number,
            joinRoomId: number,
            quizAnswerId: number,
        ): Promise<{ correct: boolean; score: number; answer_select_id: number }> {
            // validate user
            const user = await this.userRepository.findOne({ where: { id: userId } });
            if (!user) {
                throw new HttpException('User not found', HttpStatus.NOT_FOUND);
            }

            // validate joinRoom
            const joinRoom = await this.joinRoomRepository.findOne({ where: { id: joinRoomId } });
            if (!joinRoom) {
                throw new HttpException('Join room not found', HttpStatus.NOT_FOUND);
            }

            if ((joinRoom as any).user && (joinRoom as any).user.id && (joinRoom as any).user.id !== userId) {
                // joinRoom does not belong to this user
                throw new HttpException('Forbidden: join room does not belong to user', HttpStatus.FORBIDDEN);
            }

            // find quiz answer
            const quizAnswer = await this.quizAnswerRepository.findOne({ where: { id: quizAnswerId } as any, relations: ['quiz'] as any });
            if (!quizAnswer) {
                throw new HttpException('Quiz answer not found', HttpStatus.NOT_FOUND);
            }

            // create or update AnswerSelect
            let ansSelect: any = await this.ansSelectRepository.findOne({ where: { quiz_answer: { id: quizAnswerId }, join_room: { id: joinRoomId } } as any, relations: ['quiz_answer', 'join_room'] as any });
            if (ansSelect) {
                ansSelect.select_count = (ansSelect.select_count || 0) + 1;
                await this.ansSelectRepository.save(ansSelect);
            } else {
                ansSelect = this.ansSelectRepository.create({ quiz_answer: quizAnswer as any, join_room: joinRoom as any, select_count: 1 } as any);
                await this.ansSelectRepository.save(ansSelect);
            }

            // compute score: if selected answer is correct, award quiz.score (fallback to 0)
            const quiz = (quizAnswer as any).quiz as any;
            const reward = quiz && quiz.score ? Number(quiz.score) : 0;
            const correct = !!quizAnswer.is_correct;
            const score = correct ? reward : 0;

            // create GameResult record
            const gameResult = this.gameResultRepository.create({ join_room: joinRoom as any, answer_select: ansSelect as any, score } as any);
            await this.gameResultRepository.save(gameResult);

            return { correct, score, answer_select_id: ansSelect.id };
        }
}