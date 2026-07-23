/**
 * @file notificationTemplates — Default template content and template types.
 * INTENT: Single source of truth for notification template defaults (FR-SET-08 reset source).
 */

export type TriggerType =
  | 'rent_due'
  | 'overdue'
  | 'contract_expiring'
  | 'escalation_upcoming'
  | 'recurring_expense_due'
  | 'document_expiring'
  | 'backup_failed'

export type TemplateLanguage = 'ar' | 'tr' | 'en'

export interface TemplateRow {
  id: number
  name: string
  trigger_type: TriggerType
  language: TemplateLanguage
  message_body: string
}

/** Default template content — matches migration seed data (FR-SET-08 reset source). */
export const DEFAULT_TEMPLATES: Record<TriggerType, Record<TemplateLanguage, string>> = {
  rent_due: {
    ar: 'مرحباً {tenant_name}، نذكّرك بأن إيجار العقار "{property_name}" بقيمة {amount} مستحق في {due_date}. شكراً لك.',
    en: 'Hello {tenant_name}, this is a reminder that rent of {amount} for "{property_name}" is due on {due_date}. Thank you.',
    tr: 'Merhaba {tenant_name}, "{property_name}" adresindeki kiranızın {amount} tutarındaki ödemesi {due_date} tarihinde vadesi dolacaktır. Teşekkür ederiz.'
  },
  overdue: {
    ar: 'مرحباً {tenant_name}، إيجار العقار "{property_name}" بقيمة {amount} كان مستحقاً في {due_date}. يرجى السداد في أقرب وقت.',
    en: 'Hello {tenant_name}, the rent of {amount} for "{property_name}" was due on {due_date}. Please pay as soon as possible.',
    tr: 'Merhaba {tenant_name}, "{property_name}" adresindeki kiranızın {amount} tutarındaki ödemesi {due_date} tarihinde vadesini doldurmuştur. Lütfen en kısa sürede ödeme yapınız.'
  },
  contract_expiring: {
    ar: 'عقد إيجار العقار "{property_name}" للعميل {tenant_name} سينتهي في {due_date}.',
    en: 'The lease contract for "{property_name}" ({tenant_name}) expires on {due_date}.',
    tr: '"{property_name}" ({tenant_name}) adresindeki kira sözleşmesi {due_date} tarihinde sona erecektir.'
  },
  escalation_upcoming: {
    ar: 'سيتم تطبيق زيادة الإيجار الجديدة للعقد على العقار "{property_name}" ({tenant_name}) اعتباراً من {due_date}.',
    en: 'The rent escalation for "{property_name}" ({tenant_name}) comes into effect on {due_date}.',
    tr: '"{property_name}" ({tenant_name}) adresindeki kira artışı {due_date} tarihinde yürürlüğe girecektir.'
  },
  recurring_expense_due: {
    ar: 'مصروف دوري مستحق للخصم: {expense_category} بقيمة {amount} للعقار "{property_name}" بتاريخ {due_date}.',
    en: 'Recurring expense due: {expense_category} of {amount} for "{property_name}" on {due_date}.',
    tr: 'Vadesi gelen tekrarlayan gider: "{property_name}" için {due_date} tarihinde {amount} tutarında {expense_category}.'
  },
  document_expiring: {
    ar: 'المستند الرقمي "{document_name}" ({document_type}) ينتهي بتاريخ {expiry_date}.',
    en: 'The document "{document_name}" ({document_type}) expires on {expiry_date}.',
    tr: '"{document_name}" ({document_type}) belgesinin süresi {expiry_date} tarihinde doluyor.'
  },
  backup_failed: {
    ar: 'فشلت عملية النسخ الاحتياطي التلقائي بتاريخ {due_date}. يرجى فحص المساحة وإعدادات النسخ الاحتياطي.',
    en: 'Automatic backup failed on {due_date}. Please verify disk space and backup configuration.',
    tr: '{due_date} tarihindeki otomatik yedekleme başarısız oldu. Lütfen disk alanını ve yedekleme ayarlarını kontrol edin.'
  }
}
