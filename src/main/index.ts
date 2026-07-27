import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { app, shell, BrowserWindow, session } from 'electron'
import icon from '../../resources/icon.png?asset'
import { db, dbPath, initDatabase } from './db/database'
import { registerAuthIpcHandlers } from './ipc/authIpc'
import { registerBackupIpcHandlers } from './ipc/backupIpc'
import { registerContractIpcHandlers } from './ipc/contractIpc'
import { registerDashboardIpcHandlers } from './ipc/dashboardIpc'
import { registerDataIpcHandlers } from './ipc/dataIpc'
import { registerDialogIpcHandlers } from './ipc/dialogIpc'
import { registerDocumentIpcHandlers } from './ipc/documentIpc'
import { registerExchangeRateIpcHandlers } from './ipc/exchangeRateIpc'
import { registerExpenseIpcHandlers } from './ipc/expenseIpc'
import { registerLedgerIpcHandlers } from './ipc/ledgerIpc'
import { registerNotificationIpcHandlers, evaluateNotifications } from './ipc/notificationIpc'
import { registerPaymentIpcHandlers } from './ipc/paymentIpc'
import { registerPropertyIpcHandlers } from './ipc/propertyIpc'
import {
  registerRecurringExpenseIpcHandlers,
  evaluateRecurringExpenses
} from './ipc/recurringExpenseIpc'
import { registerReportsIpcHandlers } from './ipc/reportsIpc'
import { registerSearchIpcHandlers } from './ipc/searchIpc'
import { registerTenantIpcHandlers } from './ipc/tenantIpc'
import { registerUpdateIpcHandlers, startAutoUpdateChecks } from './ipc/updateIpc'
import { startBackupScheduler, stopBackupScheduler } from './services/backupScheduler'
import { createBackup, pruneOldBackups } from './services/backupService'
import { applyDueEscalations } from './services/escalationService'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'مدير العقار | PropManager',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Initialize SQLite database and run pending migrations
  initDatabase()

  // Register Electron IPC handlers for properties, tenants, contracts, and settings
  registerPropertyIpcHandlers()
  registerTenantIpcHandlers()
  registerContractIpcHandlers()
  // Phase 4: financial core (payments, expenses, ledger) — BR-20/21/22 invariants enforced here.
  registerPaymentIpcHandlers()
  registerExpenseIpcHandlers()
  registerLedgerIpcHandlers()
  registerAuthIpcHandlers()
  registerDashboardIpcHandlers()
  registerDialogIpcHandlers()
  registerExchangeRateIpcHandlers()
  registerRecurringExpenseIpcHandlers()
  registerDocumentIpcHandlers()
  registerNotificationIpcHandlers()
  registerSearchIpcHandlers()
  // Reports & Export (SRS §5.7/§5.8): 5 core reports → Excel + interactive HTML.
  registerReportsIpcHandlers()

  // Backup & Restore (SRS Module 11): manual + automatic backup, restore, verify
  registerBackupIpcHandlers()

  // Data management: wipe all user data (destructive, token-protected)
  registerDataIpcHandlers()

  // Auto-update (ADR-003 §4 amendment): version metadata + GitHub Releases update checks.
  registerUpdateIpcHandlers()
  startAutoUpdateChecks()

  // Evaluate notifications on startup - check for rent due, contract expiry, etc.
  evaluateNotifications()

  // FR-CON-11: Apply any overdue rent escalation steps before the window opens.
  // CONSTRAINT: runs after DB init but before the window shows so contracts.rent_amount
  //             is always current when the renderer first loads dashboard data.
  applyDueEscalations(db)

  // Evaluate recurring expense templates - generates expenses for any due dates since last run
  evaluateRecurringExpenses()

  // FR-BAK-02: Start the scheduled backup interval (checks every 60s if a backup is due)
  startBackupScheduler(db)

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.antigravity.propmanager')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // FR-BAK-02 / BR-12: prune old backups on startup using the stored retention limit.
  try {
    const settings = db
      .prepare('SELECT max_backup_count, backup_path FROM settings WHERE id = 1')
      .get() as { max_backup_count: number; backup_path: string | null } | undefined
    if (settings) {
      pruneOldBackups(db, settings.max_backup_count ?? 10)
    }
  } catch {
    /* best-effort */
  }

  // FR-BAK-02: auto-backup on quit — database-only for speed (documents protected by latest full backup).
  app.on('before-quit', () => {
    stopBackupScheduler()
    try {
      const settings = db.prepare('SELECT backup_path FROM settings WHERE id = 1').get() as
        { backup_path: string | null } | undefined
      const backupDir = settings?.backup_path?.trim()
        ? settings.backup_path.trim()
        : join(app.getPath('documents'), 'PropManager', 'Backups')
      createBackup(db, backupDir, 'automatic', dbPath, undefined, 'database-only')
    } catch {
      /* best-effort — don't block quit */
    }
  })

  // NFR-SEC-03: Security headers — CSP for the renderer process.
  // CONSTRAINT: offline-only app; no external scripts, styles, or connections allowed.
  // DECISION: 'unsafe-inline' on script-src mirrors the <meta> CSP already in index.html and is
  //           required for two intentional inline scripts: (1) the first-paint dir-flicker guard
  //           that sets <html dir> before React mounts, and (2) @vitejs/plugin-react's HMR
  //           preamble in dev mode. All OTHER directives stay locked to 'self' — no remote
  //           script/style/img/font/connect/frame/object/origin is ever permitted. External
  //           (remote) scripts remain fully blocked because default-src is 'self' and there is
  //           no 'unsafe-inline' escape on any directive that loads cross-origin resources.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'"
        ],
        'X-Frame-Options': ['DENY'],
        'X-Content-Type-Options': ['nosniff'],
        'Referrer-Policy': ['no-referrer']
      }
    })
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
