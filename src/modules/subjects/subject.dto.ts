export class SubjectDto {
  title: string;
  slug?: string;
  image_url?: string;
  description?: string;
}

export class SubSubjectDto {
  subject_id: number;
  title: string;
  slug?: string;
  image_url?: string;
  description?: string;
}

export class ImportSubjectsDto {
  file_url: string;
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

export class SubjectResponseDto {
  id: number;
  title: string;
  slug?: string;
  image_url?: string;
  field_type?: string;
  description?: string;
  subCount: number;
}

export class SubSubjectResponseDto {
  id: number;
  subject_id: number | null;
  title: string;
  slug?: string | null;
  image_url?: string | null;
  description?: string | null;
  quizCount: number;
}

export class ResponseDto<T> {
  data: T[];
  pagination: PaginationDto;
}
