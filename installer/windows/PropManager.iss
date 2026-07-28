; =============================================================================
; PropManager (مدير العقار) — bilingual Windows installer (Inno Setup 6.x)
;
; INTENT: Produce PropManager-{version}-setup.exe from the electron-builder
;         unpacked output (dist\win-unpacked). English + Arabic UI, per-user
;         install by default (no UAC → silent auto-updates work), full
;         upgrade/downgrade/uninstall handling.
; CONSTRAINT: The version is NEVER hardcoded here — it is injected by
;         scripts/build-installer.mjs via /DAppVersion=x.y.z (single source of
;         truth: package.json). The #ifndef guards below only provide dev
;         fallbacks so the script still opens in the Inno Setup IDE.
; CONSTRAINT: AppId GUID must NEVER change — Windows uses it to match
;         upgrades/uninstalls to the existing installation.
; DECISION: PrivilegesRequired=lowest (installs to {localappdata}\Programs) so
;         the in-app updater can run setup.exe silently without elevation.
;         Admins can still choose all-users via the dialog override.
; CAVEAT: No code-signing certificate is available yet. When one is acquired,
;         define SignTool in the IDE or pass /S"signtool=..." to ISCC — see
;         the placeholder near the bottom of [Setup].
; =============================================================================

#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif
#ifndef AppSourceDir
  #define AppSourceDir "..\..\dist\win-unpacked"
#endif

#define MyAppName "PropManager"
#define MyAppNameAr "مدير العقار"
#define MyAppDisplayName MyAppNameAr + " - " + MyAppName
#define MyAppPublisher "Antigravity"
#define MyAppURL "https://github.com/gotoayman4/property-management-app"
#define MyAppExeName "PropManager.exe"
; Electron app.getPath('userData') resolves to %APPDATA%\propmanager
; (package.json "name"). Used only by the optional uninstall data cleanup.
#define MyUserDataDir "propmanager"

[Setup]
; NEVER change this GUID — it is the upgrade/uninstall identity of the app.
AppId={{6E1FA9D3-24B7-4C58-9A0E-D7C3B54F81A2}
AppName={#MyAppDisplayName}
AppVersion={#AppVersion}
AppVerName={#MyAppDisplayName} {#AppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppDisplayName}
DisableProgramGroupPage=yes
; Per-user by default; interactive users may elevate to all-users via dialog.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\output
OutputBaseFilename={#MyAppName}-{#AppVersion}-setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; 64-bit only — Electron 43 ships x64/arm64; this package targets x64.
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Windows 10 1809+ (Electron 43 minimum supported Windows).
MinVersion=10.0.17763
; Detect and close a running PropManager via Restart Manager on upgrade;
; the in-app updater additionally passes /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS.
CloseApplications=yes
RestartApplications=yes
; Write a setup log to %TEMP% for troubleshooting (Setup Log*.txt).
SetupLogging=yes
UninstallDisplayName={#MyAppDisplayName}
UninstallDisplayIcon={app}\{#MyAppExeName}
VersionInfoVersion={#AppVersion}
VersionInfoDescription={#MyAppName} Setup
VersionInfoProductName={#MyAppName}
VersionInfoCompany={#MyAppPublisher}
ShowLanguageDialog=auto
; --- Code signing placeholder -----------------------------------------------
; When a certificate is available, uncomment and configure (or pass via
; ISCC /S"signtool=signtool.exe sign /fd SHA256 /tr <timestamp-url> /td SHA256 $f"):
; SignTool=signtool
; SignedUninstaller=yes
; -----------------------------------------------------------------------------

[Languages]
; OS UI language selects the default automatically (ShowLanguageDialog=auto
; lets the user switch). Arabic.isl renders the wizard fully RTL.
; CAVEAT: Arabic is an official language since Inno Setup 6.5 — older compilers
; will fail here; scripts/build-installer.mjs pre-validates and explains.
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "ar"; MessagesFile: "compiler:Languages\Arabic.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Everything electron-builder emitted (app.asar, runtime DLLs, locales, ...).
Source: "{#AppSourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppDisplayName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppDisplayName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Remove installer/runtime leftovers inside {app} only. User data in
; %APPDATA%\propmanager is intentionally NOT listed here (see [Code]).
Type: filesandordirs; Name: "{app}"

[CustomMessages]
en.DowngradeBlocked=A newer version of %1 (%2) is already installed. Setup cannot downgrade to version %3.%nPlease uninstall the current version first if you really want to install an older release.
ar.DowngradeBlocked=يوجد إصدار أحدث من %1 (%2) مثبت بالفعل. لا يمكن الرجوع إلى الإصدار الأقدم %3.%nإذا كنت تريد فعلاً تثبيت إصدار أقدم، يرجى إزالة الإصدار الحالي أولاً.
en.ReinstallConfirm=%1 version %2 is already installed. Do you want to repair/reinstall it?
ar.ReinstallConfirm=الإصدار %2 من %1 مثبت بالفعل. هل تريد إصلاحه/إعادة تثبيته؟
en.DeleteUserData=Do you also want to delete all application data (database, backups and settings)?%n%nChoose "No" to keep your data for a future installation.
ar.DeleteUserData=هل تريد أيضاً حذف جميع بيانات التطبيق (قاعدة البيانات والنسخ الاحتياطية والإعدادات)؟%n%nاختر "لا" للاحتفاظ ببياناتك لأي تثبيت مستقبلي.

[Code]
{ INTENT: Upgrade/downgrade/reinstall detection against the registry entry
  Inno itself writes under the Uninstall key (per-user HKCU or all-users HKLM).
  CAVEAT: With PrivilegesRequiredOverridesAllowed both hives must be checked. }

const
  UninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{6E1FA9D3-24B7-4C58-9A0E-D7C3B54F81A2}_is1';

function GetInstalledVersion(): String;
var
  V: String;
begin
  Result := '';
  if RegQueryStringValue(HKCU, UninstallKey, 'DisplayVersion', V) then
    Result := V
  else if RegQueryStringValue(HKLM, UninstallKey, 'DisplayVersion', V) then
    Result := V;
end;

{ Numeric dotted-version compare; returns >0 / 0 / <0 like strcmp.
  Mirrors compareVersions() in src/main/services/updateService.ts. }
function CompareVersion(A, B: String): Integer;
var
  PA, PB: Integer;
  NA, NB: Integer;
begin
  Result := 0;
  while (Result = 0) and ((A <> '') or (B <> '')) do
  begin
    PA := Pos('.', A);
    if PA = 0 then PA := Length(A) + 1;
    PB := Pos('.', B);
    if PB = 0 then PB := Length(B) + 1;
    NA := StrToIntDef(Copy(A, 1, PA - 1), 0);
    NB := StrToIntDef(Copy(B, 1, PB - 1), 0);
    if NA > NB then Result := 1
    else if NA < NB then Result := -1;
    A := Copy(A, PA + 1, MaxInt);
    B := Copy(B, PB + 1, MaxInt);
  end;
end;

function InitializeSetup(): Boolean;
var
  Installed: String;
  Cmp: Integer;
  Msg: String;
begin
  Result := True;
  Installed := GetInstalledVersion();
  if Installed = '' then Exit; { first-time install }

  Cmp := CompareVersion(Installed, '{#AppVersion}');
  if Cmp > 0 then
  begin
    { Downgrade — block. /ALLOWDOWNGRADE overrides (support/testing escape hatch).
      CAVEAT: lines must not START with '[' — Inno parses them as section tags
      even inside Code — hence the single-line FmtMessage arg arrays. }
    if ExpandConstant('{param:ALLOWDOWNGRADE|0}') <> '1' then
    begin
      Msg := FmtMessage(CustomMessage('DowngradeBlocked'), ['{#MyAppName}', Installed, '{#AppVersion}']);
      SuppressibleMsgBox(Msg, mbCriticalError, MB_OK, IDOK);
      Result := False;
    end;
  end
  else if (Cmp = 0) and (not WizardSilent()) then
  begin
    { Same version — interactive repair/reinstall confirmation. Silent mode
      (auto-updater or IT scripting) always proceeds. }
    Msg := FmtMessage(CustomMessage('ReinstallConfirm'), ['{#MyAppName}', Installed]);
    Result := SuppressibleMsgBox(Msg, mbConfirmation, MB_YESNO, IDYES) = IDYES;
  end;
  { Cmp < 0 = normal upgrade: proceed silently; UsePreviousAppDir reuses the
    existing folder and [Files] ignoreversion overwrites everything. }
end;

{ INTENT: Preserve user data by default on uninstall; offer interactive opt-in
  deletion. Silent uninstall NEVER deletes data. }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{userappdata}\{#MyUserDataDir}');
    if (not UninstallSilent()) and DirExists(DataDir) then
    begin
      if MsgBox(CustomMessage('DeleteUserData'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
        DelTree(DataDir, True, True, True);
    end;
  end;
end;
