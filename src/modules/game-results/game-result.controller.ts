import { Controller, Get, HttpCode, HttpStatus, Param, Query } from '@nestjs/common';
import { GameResultService } from './game-result.service';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { QueryDto } from './game-result.dto';

@Controller('game-results')
export class GameResultController {
  // Define controller methods and routes here
  constructor(private readonly gameResultService: GameResultService) {}

  @ApiOperation({ summary: 'Get all game results' })
  @ApiResponse({
    status: 200,
    description: 'Game results retrieved successfully.',
  })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllGameResults(@Query() query: QueryDto) {
    return await this.gameResultService.findAll(query);
  }

  @ApiOperation({ summary: 'Get all game results by session token' })
  @ApiResponse({
    status: 200,
    description: 'Game results retrieved successfully by session token.',
  })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Get('session-token/:token')
  @HttpCode(HttpStatus.OK)
  async getAllGameResultsBySessionToken(
    @Query() query: QueryDto,
    @Param('token') token: string,
  ) {
    return await this.gameResultService.findAllSessionToken(query, token);
  }
}
