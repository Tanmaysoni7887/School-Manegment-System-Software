; Inno Setup Script for SHIKSHA – School Management Software
; Generates standalone Windows .exe installer with Desktop and Start Menu shortcuts
; Safe for updates (preserves %USERPROFILE%\Documents\MDConvent_SMS)

[Setup]
AppId={{5E97D4B6-61D3-4702-8DF6-1A25B4C723D4}
AppName=SHIKSHA – School Management Software
AppVersion=2.2.0
AppPublisher=Tanmay Soni
AppPublisherURL=tel:9528371785
DefaultDirName={autopf}\SHIKSHA
DefaultGroupName=SHIKSHA
AllowNoIcons=yes
OutputDir=dist-installer
OutputBaseFilename=SHIKSHA_School_Management_Setup
SetupIconFile=icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
DisableWelcomePage=no
DisableDirPage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "dist\SHIKSHA-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
Type: files; Name: "{autodesktop}\MD Convent SMS.lnk"
Type: files; Name: "{group}\MD Convent SMS.lnk"

[Icons]
Name: "{group}\SHIKSHA"; Filename: "{app}\SHIKSHA.exe"; IconFilename: "{app}\icon.ico"
Name: "{group}\{cm:UninstallProgram,SHIKSHA}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\SHIKSHA"; Filename: "{app}\SHIKSHA.exe"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\SHIKSHA.exe"; Description: "{cm:LaunchProgram,SHIKSHA}"; Flags: nowait postinstall skipifsilent
