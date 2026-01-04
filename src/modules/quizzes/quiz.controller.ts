import { Controller } from "@nestjs/common";
import { QuizService } from "./quiz.service";

@Controller('quizzes')
export class QuizController {
  // Implement quiz-related endpoints here
  constructor(
    private readonly quizService: QuizService
  ) {}
}