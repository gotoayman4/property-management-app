# IPC Channel Catalog

All IPC handlers are registered in `src/main/ipc/` and invoked from the renderer via
`window.api.<domain>.<method>()` (defined in `src/preload/index.ts`).

Channel naming convention: `domain:verb`. All handlers validate input with Zod and return
results or throw machine-readable error codes (never stack traces).

## Properties

| Channel             | File           | Description                                    |
| ------------------- | -------------- | ---------------------------------------------- |
| `properties:create` | propertyIpc.ts | Create a new property with auto-generated code |
| `properties:update` | propertyIpc.ts | Update property details                        |
| `properties:delete` | propertyIpc.ts | Soft-delete (archive) a property               |
| `properties:get`    | propertyIpc.ts | Get property by ID with details                |

## Tenants

| Channel                | File         | Description                                  |
| ---------------------- | ------------ | -------------------------------------------- |
| `tenants:create`       | tenantIpc.ts | Create a new tenant with auto-generated code |
| `tenants:update`       | tenantIpc.ts | Update tenant details                        |
| `tenants:delete`       | tenantIpc.ts | Soft-delete (archive) a tenant               |
| `tenants:get`          | tenantIpc.ts | Get tenant by ID with details                |
| `tenants:generateCode` | tenantIpc.ts | Generate next available tenant code          |

## Contracts

| Channel                         | File           | Description                                          |
| ------------------------------- | -------------- | ---------------------------------------------------- |
| `contracts:create`              | contractIpc.ts | Create a new lease contract                          |
| `contracts:update`              | contractIpc.ts | Update contract details                              |
| `contracts:delete`              | contractIpc.ts | Delete a draft/cancelled contract                    |
| `contracts:get`                 | contractIpc.ts | Get contract by ID                                   |
| `contracts:getDetail`           | contractIpc.ts | Get contract with property/tenant info               |
| `contracts:terminate`           | contractIpc.ts | Terminate an active contract, set property to vacant |
| `contracts:renew`               | contractIpc.ts | Renew an active/expired contract                     |
| `contracts:setEscalation`       | contractIpc.ts | Set rent escalation schedule (simple or multi-year)  |
| `contracts:updateDepositStatus` | contractIpc.ts | Update security deposit status                       |

## Payments

| Channel           | File          | Description                                    |
| ----------------- | ------------- | ---------------------------------------------- |
| `payments:create` | paymentIpc.ts | Record a payment (rent, deposit, other income) |
| `payments:void`   | paymentIpc.ts | Void a payment with reason                     |
| `payments:list`   | paymentIpc.ts | List payments with filters                     |
| `payments:get`    | paymentIpc.ts | Get payment by ID                              |

## Expenses

| Channel                    | File          | Description                   |
| -------------------------- | ------------- | ----------------------------- |
| `expenses:create`          | expenseIpc.ts | Record an expense             |
| `expenses:void`            | expenseIpc.ts | Void an expense               |
| `expenses:list`            | expenseIpc.ts | List expenses with filters    |
| `expenses:get`             | expenseIpc.ts | Get expense by ID             |
| `expenseCategories:create` | expenseIpc.ts | Create a new expense category |
| `expenseCategories:update` | expenseIpc.ts | Update expense category       |
| `expenseCategories:delete` | expenseIpc.ts | Delete expense category       |
| `expenseCategories:list`   | expenseIpc.ts | List all expense categories   |

## Recurring Expenses

| Channel                             | File                   | Description                             |
| ----------------------------------- | ---------------------- | --------------------------------------- |
| `recurringExpenses:create`          | recurringExpenseIpc.ts | Create a recurring expense template     |
| `recurringExpenses:update`          | recurringExpenseIpc.ts | Update a recurring template             |
| `recurringExpenses:delete`          | recurringExpenseIpc.ts | Delete a recurring template             |
| `recurringExpenses:get`             | recurringExpenseIpc.ts | Get template by ID                      |
| `recurringExpenses:list`            | recurringExpenseIpc.ts | List all recurring templates            |
| `recurringExpenses:activate`        | recurringExpenseIpc.ts | Activate a template                     |
| `recurringExpenses:deactivate`      | recurringExpenseIpc.ts | Deactivate a template                   |
| `recurringExpenses:toggleActive`    | recurringExpenseIpc.ts | Toggle active/inactive state            |
| `recurringExpenses:evaluate`        | recurringExpenseIpc.ts | Evaluate all templates for due expenses |
| `recurringExpenses:confirm`         | recurringExpenseIpc.ts | Confirm all pending instances           |
| `recurringExpenses:confirmInstance` | recurringExpenseIpc.ts | Confirm a single pending instance       |
| `recurringExpenses:skip`            | recurringExpenseIpc.ts | Skip all pending instances              |
| `recurringExpenses:skipInstance`    | recurringExpenseIpc.ts | Skip a single pending instance          |
| `recurringExpenses:pendingDue`      | recurringExpenseIpc.ts | List pending due instances              |
| `recurringExpenses:log`             | recurringExpenseIpc.ts | Add a log entry                         |
| `recurringExpenses:logList`         | recurringExpenseIpc.ts | List log entries for a template         |

## Financial Ledger

| Channel                      | File         | Description                              |
| ---------------------------- | ------------ | ---------------------------------------- |
| `ledger:list`                | ledgerIpc.ts | List ledger entries with filters         |
| `ledger:summary`             | ledgerIpc.ts | Compute summary (debit/credit/net)       |
| `ledger:reconstructBalance`  | ledgerIpc.ts | Reconstruct running balance as of a date |
| `ledger:addManualAdjustment` | ledgerIpc.ts | Add a manual adjustment entry            |

## Exchange Rates

| Channel                     | File               | Description                                 |
| --------------------------- | ------------------ | ------------------------------------------- |
| `exchangeRates:list`        | exchangeRateIpc.ts | List rates, optionally filtered by pair     |
| `exchangeRates:latest`      | exchangeRateIpc.ts | Get latest rate for a currency pair         |
| `exchangeRates:add`         | exchangeRateIpc.ts | Add/update an exchange rate (upsert)        |
| `exchangeRates:fetchOnline` | exchangeRateIpc.ts | Fetch rate from public API (user-initiated) |

## Dashboard

| Channel                       | File            | Description                                          |
| ----------------------------- | --------------- | ---------------------------------------------------- |
| `dashboard:summary`           | dashboardIpc.ts | Full dashboard summary (counts, finances, contracts) |
| `dashboard:recentPayments`    | dashboardIpc.ts | 5 most recent non-voided payments                    |
| `dashboard:recentExpenses`    | dashboardIpc.ts | 5 most recent non-voided expenses                    |
| `dashboard:recentActivities`  | dashboardIpc.ts | 5 most recent activities                             |
| `dashboard:upcomingDue`       | dashboardIpc.ts | Upcoming due payments                                |
| `dashboard:overdue`           | dashboardIpc.ts | Overdue payments                                     |
| `dashboard:upcomingRecurring` | dashboardIpc.ts | Upcoming recurring expenses                          |
| `dashboard:expiringDocuments` | dashboardIpc.ts | Expiring documents                                   |
| `dashboard:trends`            | dashboardIpc.ts | Income/expense trends by month                       |

## Reports

| Channel               | File          | Description                 |
| --------------------- | ------------- | --------------------------- |
| `reports:preview`     | reportsIpc.ts | Preview report data (JSON)  |
| `reports:exportExcel` | reportsIpc.ts | Export report as .xlsx file |
| `reports:exportHtml`  | reportsIpc.ts | Export report as HTML file  |

## Backup & Restore

| Channel                     | File         | Description                               |
| --------------------------- | ------------ | ----------------------------------------- |
| `backup:create`             | backupIpc.ts | Create a full backup (DB + documents)     |
| `backup:createDatabaseOnly` | backupIpc.ts | Create a database-only backup             |
| `backup:list`               | backupIpc.ts | List all backups                          |
| `backup:delete`             | backupIpc.ts | Delete a specific backup                  |
| `backup:verify`             | backupIpc.ts | Verify backup integrity (checksum)        |
| `backup:restore`            | backupIpc.ts | Restore from backup (2-step confirmation) |
| `backup:prune`              | backupIpc.ts | Remove old backups beyond retention limit |

## Documents

| Channel             | File           | Description                              |
| ------------------- | -------------- | ---------------------------------------- |
| `documents:upload`  | documentIpc.ts | Upload a document (magic-byte validated) |
| `documents:list`    | documentIpc.ts | List documents for an entity             |
| `documents:get`     | documentIpc.ts | Get document metadata                    |
| `documents:read`    | documentIpc.ts | Read document file content               |
| `documents:replace` | documentIpc.ts | Replace document file                    |
| `documents:delete`  | documentIpc.ts | Soft-delete (archive) a document         |
| `documents:purge`   | documentIpc.ts | Permanently delete archived documents    |

## Notifications

| Channel                     | File               | Description                       |
| --------------------------- | ------------------ | --------------------------------- |
| `notifications:list`        | notificationIpc.ts | List notifications                |
| `notifications:markRead`    | notificationIpc.ts | Mark a notification as read       |
| `notifications:markAllRead` | notificationIpc.ts | Mark all notifications as read    |
| `notifications:clearAll`    | notificationIpc.ts | Clear all notifications           |
| `notifications:evaluate`    | notificationIpc.ts | Re-evaluate notification triggers |
| `templates:list`            | notificationIpc.ts | List notification templates       |
| `templates:update`          | notificationIpc.ts | Update a notification template    |
| `templates:resetDefaults`   | notificationIpc.ts | Reset templates to defaults       |

## Search

| Channel         | File         | Description                                       |
| --------------- | ------------ | ------------------------------------------------- |
| `search:global` | searchIpc.ts | Global search across all entities (max 100 chars) |

## Settings

| Channel           | File           | Description                 |
| ----------------- | -------------- | --------------------------- |
| `settings:get`    | settingsIpc.ts | Get application settings    |
| `settings:update` | settingsIpc.ts | Update application settings |

## Countries

| Channel                        | File          | Description                             |
| ------------------------------ | ------------- | --------------------------------------- |
| `countries:list`               | countryIpc.ts | List countries                          |
| `countries:listAll`            | countryIpc.ts | List all countries (including archived) |
| `countries:listWithProperties` | countryIpc.ts | List countries with property counts     |
| `countries:create`             | countryIpc.ts | Create a new country                    |
| `countries:update`             | countryIpc.ts | Update a country                        |
| `countries:delete`             | countryIpc.ts | Delete a country                        |

## Authentication

| Channel                      | File       | Description                                    |
| ---------------------------- | ---------- | ---------------------------------------------- |
| `auth:hasUsers`              | authIpc.ts | Check if any users exist (first-run detection) |
| `auth:register`              | authIpc.ts | Register a new user (bcrypt hashed)            |
| `auth:login`                 | authIpc.ts | Authenticate a user                            |
| `auth:changePassword`        | authIpc.ts | Change user password                           |
| `auth:saveCredentials`       | authIpc.ts | Save credentials for auto-login                |
| `auth:getSavedCredentials`   | authIpc.ts | Retrieve saved credentials                     |
| `auth:clearSavedCredentials` | authIpc.ts | Clear saved credentials                        |

## Dialogs

| Channel                 | File         | Description                                     |
| ----------------------- | ------------ | ----------------------------------------------- |
| `dialog:pickFolder`     | dialogIpc.ts | Open native folder picker                       |
| `dialog:pickImage`      | dialogIpc.ts | Open native image picker (magic-byte validated) |
| `dialog:pickBackupFile` | dialogIpc.ts | Open native file picker for backup restore      |

## Data Management

| Channel        | File       | Description                                               |
| -------------- | ---------- | --------------------------------------------------------- |
| `data:wipeAll` | dataIpc.ts | Wipe all user data (requires "DELETE" confirmation token) |

## App

| Channel        | File | Description                      |
| -------------- | ---- | -------------------------------- |
| `app:relaunch` | —    | Restart the Electron application |
