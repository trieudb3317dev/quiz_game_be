import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JoinRoomService } from './join-room.service';
import { QueryDto } from './join-room.dto';
import { JwtAuthGuard } from '../auth/auth.guard';

@Controller('join-rooms')
export class JoinRoomController {
  constructor(private readonly joinRoomService: JoinRoomService) {}

  @ApiOperation({ summary: 'Join a room (authenticated user)' })
  @ApiResponse({ status: 201, description: 'Joined room successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @Post(':roomId/join')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async joinRoom(@Param('roomId') roomId: number, @Req() req: any) {
    const userId = req.user ? req.user.id : null;
    return this.joinRoomService.joinRoom(userId, Number(roomId));
  }

  @ApiOperation({ summary: 'Leave a room (authenticated user)' })
  @ApiResponse({ status: 200, description: 'Left room successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @Post(':roomId/leave')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async leaveRoom(@Param('roomId') roomId: number, @Req() req: any) {
    const userId = req.user ? req.user.id : null;
    return this.joinRoomService.leaveRoom(userId, Number(roomId));
  }

  @ApiOperation({
    summary: 'List joiners of a room (supports search, sort, pagination)',
  })
  @ApiResponse({ status: 200, description: 'Joiners retrieved successfully.' })
  @Get(':roomId/joiners')
  @HttpCode(HttpStatus.OK)
  async getJoiners(@Param('roomId') roomId: number, @Query() query: QueryDto) {
    return this.joinRoomService.getJoinersByRoom(Number(roomId), query);
  }

  @ApiOperation({
    summary: 'Get a joiner record for a specific user in a room',
  })
  @ApiResponse({ status: 200, description: 'Joiner retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Joiner not found.' })
  @Get(':roomId/joiners/:joinerId')
  @HttpCode(HttpStatus.OK)
  async getJoiner(
    @Param('roomId') roomId: number,
    @Param('joinerId') joinerId: number,
  ) {
    return this.joinRoomService.getJoiner(Number(joinerId), Number(roomId));
  }
}
