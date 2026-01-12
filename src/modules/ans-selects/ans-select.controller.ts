import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AnsSelectService } from './ans-select.service';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/auth.guard';
import { QueryDto } from './ans-select.dto';

@Controller('answer-selects')
export class AnswerSelectController {
  constructor(private readonly ansSelectService: AnsSelectService) {}

  @ApiOperation({ summary: 'Select an answer for a quiz' })
  @ApiResponse({ status: 201, description: 'Answer selected successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Post(':answerSelectId/join-rooms/:joinRoomId/select')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async selectAnswer(
    @Req() req: any,
    @Param() body: { answerSelectId: number; joinRoomId: number },
  ) {
    const userId = req.user ? req.user.id : null;
    const { joinRoomId, answerSelectId } = body;
    return this.ansSelectService.selectAnswer(
      userId,
      Number(joinRoomId),
      Number(answerSelectId),
    );
  }

  @ApiOperation({ summary: 'Select an answer for a quiz' })
  @ApiResponse({ status: 201, description: 'Answer selected successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Get(':subSubjectId/room-answers')
  @HttpCode(HttpStatus.CREATED)
  // @UseGuards(JwtAuthGuard)
  async getSelectedAnswer(
    @Param('subSubjectId') subSubjectId: number,
    @Query() query: QueryDto,
  ) {
    return this.ansSelectService.getAnswerSelectsOfRoom(subSubjectId, query);
  }

  @ApiOperation({ summary: 'Get total answer selects of a room by joiner' })
  @ApiResponse({
    status: 200,
    description: 'Total answer selects retrieved successfully.',
  })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Get(':subSubjectId/room-answers/joiner/:joinerId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async getTotalAnswerSelectsOfRoomByJoiner(
    @Param('subSubjectId') subSubjectId: number,
    @Param('joinerId') joinerId: number,
    @Query() query: QueryDto,
  ) {
    return this.ansSelectService.getTotalAnswerSelectsOfRoomByJoiner(
      joinerId,
      subSubjectId,
      query,
    );
  }
}
