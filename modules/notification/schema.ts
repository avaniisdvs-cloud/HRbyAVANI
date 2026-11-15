/**
 * notification schema re-exports — Sprint 2 skeleton.
 * Templates (configuration) and notification log (operational).
 */
export { notificationTemplates, notificationLog } from '@/drizzle/schema'

export type {
  NotificationTemplate,
  NotificationLogEntry,
  NewNotificationTemplate,
  NewNotificationLogEntry,
} from '@/drizzle/schema'
