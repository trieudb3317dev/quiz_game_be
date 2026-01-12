export class RoomDto {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
}

export class CreateRoomDto {
  name: string;
  slug?: string;
  description?: string;
}

export class UpdateRoomDto {
  name?: string;
  slug?: string;
  description?: string;
  is_active?: boolean;
}

export class QueryDto {
  search?: string;
  sortBy?: 'created_at';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
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
