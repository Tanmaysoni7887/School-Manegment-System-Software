# MD Convent School Management System (SMS)
### Offline Desktop Application for Windows (Electron + JavaScript)

[![Release](https://img.shields.io/badge/Release-v2.0.0-blue.svg)](https://github.com/Tanmaysoni7887/School-Manegment-System-Software/releases/tag/v2.0.0)
[![Download Installer](https://img.shields.io/badge/Download-Windows%20Setup%20(505%20MB)-green.svg)](https://github.com/Tanmaysoni7887/School-Manegment-System-Software/releases/download/v2.0.0/MD_Convent_SMS_Setup_v2.0.exe)

> 📥 **[Download Latest Windows Installer (`MD_Convent_SMS_Setup_v2.0.exe`)](https://github.com/Tanmaysoni7887/School-Manegment-System-Software/releases/download/v2.0.0/MD_Convent_SMS_Setup_v2.0.exe)**  
> **Direct Release Page**: [https://github.com/Tanmaysoni7887/School-Manegment-System-Software/releases/tag/v2.0.0](https://github.com/Tanmaysoni7887/School-Manegment-System-Software/releases/tag/v2.0.0)

This repository contains the complete offline school management system developed for **MD Convent Public School, Amanpur (Kasganj)**.

---

## Workspace Directory Structure

```
MDConvent_FINAL/
├── HANDOVER/                               # Client Distribution & Handover Package
│   ├── Installer/
│   │   └── MD_Convent_SMS_Setup_v2.0.exe   # Standalone Windows x64 Installer (Inno Setup)
│   ├── README.txt                          # System overview, requirements & quick start
│   ├── SETUP_GUIDE.txt                     # First-run setup lifecycle & walkthrough
│   ├── DATA_BACKUP_GUIDE.txt               # Machine migration & safety backup recovery
│   ├── RELEASE_MANIFEST.txt                # Package file manifest & verification details
│   └── checksums.sha256                    # Cryptographic verification checksums
│
├── MDConvent_App/                          # Main Electron Application (Source Code)
│   ├── src/
│   │   ├── app.js                          # UI controllers, fee logic & transport routing
│   │   ├── index.html                      # Single-page application markup & styling
│   │   ├── logo.png                        # School logo brand asset
│   │   └── preload.js                      # Context-isolated secure IPC bridge
│   ├── dist/                               # Packaged application binaries for Inno Setup
│   ├── dist-installer/                     # Master compiled installer executable
│   ├── node_modules/                       # Build dependencies & electron runtime
│   ├── main.js                             # Electron main process & atomic persistence
│   ├── package.json                        # Node.js manifest & packaging configuration
│   ├── package-lock.json                   # Dependency lockfile
│   ├── installer.iss                       # Inno Setup compilation script
│   ├── icon.ico                            # Application icon
│   └── *.bat / *.vbs                       # Standalone local run and launcher scripts
│
├── .gitignore                              # Git exclusion rules (zero binaries, node_modules, or private data)
└── README.md                               # Repository overview & developer documentation
```

---

## Running the Application (Development)

From the `MDConvent_App` folder:
```powershell
cd MDConvent_App
npm start
```

## Production Deployment

To install the application on a school computer:
1. Navigate to `HANDOVER/Installer/`
2. Run `MD_Convent_SMS_Setup_v2.0.exe`
3. Follow the instructions in `HANDOVER/SETUP_GUIDE.txt`
