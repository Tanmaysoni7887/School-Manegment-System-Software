; Inno Setup Script for MD Convent SMS
; Generates standalone Windows .exe installer with Desktop and Start Menu shortcuts
; Safe for updates (preserves %USERPROFILE%\Documents\MDConvent_SMS)

[Setup]
AppId={{5E97D4B6-61D3-4702-8DF6-1A25B4C723D4}
AppName=MD Convent SMS
AppVersion=2.0.0
AppPublisher=Tanmay Soni
AppPublisherURL=tel:9528371785
DefaultDirName={autopf}\MD Convent SMS
DefaultGroupName=MD Convent SMS
AllowNoIcons=yes
OutputDir=dist-installer
OutputBaseFilename=MD_Convent_SMS_Setup_v2.0
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
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "dist\MD Convent SMS-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\MD Convent SMS"; Filename: "{app}\MD Convent SMS.exe"; IconFilename: "{app}\icon.ico"
Name: "{group}\{cm:UninstallProgram,MD Convent SMS}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\MD Convent SMS"; Filename: "{app}\MD Convent SMS.exe"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\MD Convent SMS.exe"; Description: "{cm:LaunchProgram,MD Convent SMS}"; Flags: nowait postinstall skipifsilent
