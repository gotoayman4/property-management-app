-- FR-NOT-06 / FR-SET-08: Seed Turkish notification templates.
-- INTENT: Tenants with preferred_language = 'tr' must receive notifications in Turkish.
--         Previously only Arabic and English templates existed; this migration adds Turkish
--         defaults so resolveTemplateMessage('...', 'tr', vars) never returns null.
-- CONSTRAINT: UNIQUE(trigger_type, language) means INSERT OR IGNORE is safe for idempotency.

INSERT OR IGNORE INTO notification_templates (name, trigger_type, language, message_body) VALUES
('Rent Due', 'rent_due', 'tr', 'Merhaba {tenant_name}, "{property_name}" adresindeki kiranızın {amount} tutarındaki ödemesi {due_date} tarihinde vadesi dolacaktır. Teşekkür ederiz.'),
('Overdue', 'overdue', 'tr', 'Merhaba {tenant_name}, "{property_name}" adresindeki kiranızın {amount} tutarındaki ödemesi {due_date} tarihinde vadesini doldurmuştur. Lütfen en kısa sürede ödeme yapınız.'),
('Contract Expiring', 'contract_expiring', 'tr', '"{property_name}" ({tenant_name}) adresindeki kira sözleşmesi {due_date} tarihinde sona erecektir.'),
('Escalation Upcoming', 'escalation_upcoming', 'tr', '"{property_name}" ({tenant_name}) adresindeki sözleşme için planlanan bir sonraki kira değişikliği {due_date} tarihinde yürürlüğe girecektir.'),
('Recurring Expense Due', 'recurring_expense_due', 'tr', '"{property_name}" adlı tekrarlayan giderin ödeme tarihi {due_date} dir.'),
('Document Expiring', 'document_expiring', 'tr', '"{property_name}" adresindeki "{document_type}" belgesinin geçerlilik süresi {due_date} tarihinde dolacaktır.'),
('Backup Failed', 'backup_failed', 'tr', '{due_date} tarihinde yedekleme başarısız oldu. Lütfen yedekleme ayarlarını kontrol edin.');
