export class JoinRoomDto {
  roomId: number;
  userId: number;
}

export class LeaveRoomDto {
  roomId: number;
  userId: number;
}

export class ListRoomMembersDto {
  roomId: number;
}

export class QueryDto {
  search?: string;
  sortBy?: 'joined_at';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
}

export class JoinersResponseDto {
  id: number;
  user_id: number;
  username: string;
  email: string;
  full_name: string;
  avatar_url: string;
  room_id: number;
  name: string;
  joined_at: Date;
}

export class PaginationDto {
  page?: number;
  limit?: number;
  totalItems: number;
  totalPages: number;
  nextPage: number | boolean;
  prevPage: number | boolean;
}

export class ResponseDto<T> {
  data: T[];
  pagination: PaginationDto;
}
