import { externalAttendanceSupabaseRepository } from '../adapters/external-attendance-supabase.js';
import { createExternalAttendanceReviewService } from './external-attendance-review-service.js';

export const externalAttendanceReviewService=createExternalAttendanceReviewService(externalAttendanceSupabaseRepository);
