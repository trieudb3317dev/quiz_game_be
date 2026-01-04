import { Controller } from '@nestjs/common';
import { SubjectService } from './subject.service';

@Controller('subjects')
export class SubjectController {
  // Implement subject-related endpoints here
  constructor(private readonly subjectService: SubjectService) {}
}
