import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { AnsSelectService } from './ans-select.service';

@Controller('answer-selects')
export class AnswerSelectController {
  constructor(private readonly ansSelectService: AnsSelectService) {}

  @Post('select')
  @HttpCode(HttpStatus.CREATED)
  async selectAnswer(
    @Req() req: any,
    @Body() body: { join_room_id: number; quiz_answer_id: number },
  ) {
    const userId = req.user ? req.user.id : null;
    const { join_room_id, quiz_answer_id } = body;
    return this.ansSelectService.selectAnswer(
      userId,
      Number(join_room_id),
      Number(quiz_answer_id),
    );
  }
}
