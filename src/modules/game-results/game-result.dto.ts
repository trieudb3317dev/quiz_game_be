export class QueryDto {
  search?: string;
  sortBy?: 'created_at';
  order?: 'ASC' | 'DESC';
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
