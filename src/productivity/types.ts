export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';
export interface Reminder {
  id: string;
  title: string;
  description: string;
  dueAt: string;
  timeZone: string;
  recurrence: Recurrence;
  status: 'active' | 'done' | 'cancelled';
  origin: string;
  notePath?: string;
  taskId?: string;
  lastNotified?: string;
  nextRun: string;
  createdAt: string;
}
export type ParsedReminder =
  | { ok: true; title: string; dueAt: string; timeZone: string; recurrence: Recurrence }
  | { ok: false; question: string };
