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

export class AnswerDto {
  answer_text: string;
  is_correct: boolean;
  image_url?: string;
}

export class QuizResponseDto {
  id: number;
  sub_subject_id: number;
  title: string;
  slug: string;
  description?: string;
}

export class QuizDto<Ans> {
  id: number;
  sub_subject_id: number;
  title: string;
  slug: string;
  description?: string;
  answers: Ans[];
}

export class ResponseDto<T> {
  data: T[];
  pagination: PaginationDto;
}
