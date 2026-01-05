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
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RoomService } from './room.service';
import { CreateRoomDto } from './room.dto';

@Controller('rooms')
export class RoomController {
    constructor(private readonly roomService: RoomService) {}

    @ApiOperation({ summary: 'Create a new room' })
    @ApiResponse({ status: 201, description: 'Room created successfully.' })
    @ApiResponse({ status: 400, description: 'Bad Request.' })
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async createRoom(@Body() body: CreateRoomDto, @Req() req: any) {
        const userId = req.user ? req.user.id : null;
        return this.roomService.createRoom(body, userId);
    }

    @ApiOperation({ summary: 'List rooms' })
    @ApiResponse({ status: 200, description: 'Rooms retrieved successfully.' })
    @Get()
    @HttpCode(HttpStatus.OK)
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
    async updateRoom(@Param('id') id: number, @Body() body: any) {
        return this.roomService.updateRoom(id, body);
    }

    @ApiOperation({ summary: 'Delete a room' })
    @ApiResponse({ status: 200, description: 'Room deleted successfully.' })
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    async deleteRoom(@Param('id') id: number) {
        return this.roomService.deleteRoom(id);
    }
}