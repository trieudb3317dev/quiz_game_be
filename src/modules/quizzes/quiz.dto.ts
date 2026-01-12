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
  id: number;
  answer_type?: string;
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
  sub_subject: object;
  title: string;
  slug: string;
  description?: string;
  time_limit: number;
  score: number;
  score_remaining: number;
  score_reward: number;
  answers: Ans[];
}

export class ResponseDto<T> {
  data: T[];
  pagination: PaginationDto;
  time_started?: Date;
  time_completed?: Date;
}
