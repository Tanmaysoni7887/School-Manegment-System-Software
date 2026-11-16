; Inno Setup Script for Shiksha School Management Software
; Generates standalone Windows .exe installer with Desktop and Start Menu shortcuts
; Safe for updates (preserves %USERPROFILE%\Documents\MDConvent_SMS)

[Setup]
AppId={{5E97D4B6-61D3-4702-8DF6-1A25B4C723D4}
AppName=Shiksha School Management Software
AppVersion=2.2.0
AppPublisher=Tanmay Soni
AppPublisherURL=tel:9528371785
DefaultDirName={autopf}\Shiksha
DefaultGroupName=Shiksha
UsePreviousAppDir=no
UsePreviousGroup=no
AllowNoIcons=yes
OutputDir=dist-installer
OutputBaseFilename=Shiksha_School_Management_Setup
SetupIconFile=icon.ico
UninstallIconFile=icon.ico
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
Type: files; Name: "{autodesktop}\SHIKSHA - School Management Software.lnk"
Type: files; Name: "{autodesktop}\Shiksha - School Management Software.lnk"
Type: files; Name: "{autodesktop}\SHIKSHA.lnk"
Type: files; Name: "{commondesktop}\MD Convent SMS.lnk"
Type: files; Name: "{commondesktop}\SHIKSHA - School Management Software.lnk"
Type: files; Name: "{commondesktop}\Shiksha - School Management Software.lnk"
Type: files; Name: "{commondesktop}\SHIKSHA.lnk"
Type: files; Name: "{group}\MD Convent SMS.lnk"
Type: filesandordirs; Name: "{userprograms}\MD Convent SMS"
Type: filesandordirs; Name: "{commonprograms}\MD Convent SMS"

[Icons]
Name: "{group}\Shiksha"; Filename: "{app}\SHIKSHA.exe"; IconFilename: "{app}\icon.ico"
Name: "{group}\{cm:UninstallProgram,Shiksha}"; Filename: "{uninstallexe}"; IconFilename: "{app}\icon.ico"
Name: "{autodesktop}\Shiksha"; Filename: "{app}\SHIKSHA.exe"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\SHIKSHA.exe"; Description: "{cm:LaunchProgram,Shiksha}"; Flags: nowait postinstall skipifsilent
