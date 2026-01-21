import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RoomService } from './room.service';
import { CreateRoomDto } from './room.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { JwtAdminAuthGuard } from '../admin/admin.guard';

@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @ApiOperation({ summary: 'Create a new room' })
  @ApiResponse({ status: 201, description: 'Room created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @Post('/sub-subject/:subSubjectId')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  // @UseGuards(JwtAdminAuthGuard)
  async createRoom(
    @Body() body: CreateRoomDto,
    @Req() req: any,
    @Param('subSubjectId') subSubjectId: number,
  ) {
    console.log('User ID:', req.user ? req.user.id : null);
    const userId = req.user ? req.user.id : null;
    return this.roomService.createRoom(body, userId, subSubjectId);
  }

  @ApiOperation({ summary: 'List rooms' })
  @ApiResponse({ status: 200, description: 'Rooms retrieved successfully.' })
  @Get()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAdminAuthGuard)
  async listRooms() {
    return this.roomService.listRooms();
  }

  @ApiOperation({ summary: 'Get room by ID' })
  @ApiResponse({ status: 200, description: 'Room retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Room not found.' })
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getRoomById(@Param('id') id: number) {
    return this.roomService.getRoomById(id);
  }

  @ApiOperation({ summary: 'Update a room' })
  @ApiResponse({ status: 200, description: 'Room updated successfully.' })
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @UseGuards(JwtAdminAuthGuard)
  async updateRoom(@Param('id') id: number, @Body() body: any) {
    return this.roomService.updateRoom(id, body);
  }

  @ApiOperation({ summary: 'Delete a room' })
  @ApiResponse({ status: 200, description: 'Room deleted successfully.' })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @UseGuards(JwtAdminAuthGuard)
  async deleteRoom(@Param('id') id: number) {
    return this.roomService.deleteRoom(id);
  }

  @ApiOperation({ summary: 'Find room ID by session token' })
  @ApiResponse({ status: 200, description: 'Room ID retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Room not found.' })
  @Get('session/:token')
  @HttpCode(HttpStatus.OK)
  async findRoomIdBySessionToken(@Param('token') token: string) {
    return this.roomService.findRoomIdBySessionToken(token);
  }
}
