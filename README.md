# SHIKSHA – School Management Software
### Offline Desktop Application for Windows (Electron + JavaScript)

[![Release](https://img.shields.io/badge/Release-v2.3.2-blue.svg)](https://github.com/Tanmaysoni7887/School-Manegment-System-Software/releases/tag/v2.3.2)
[![Download Installer](https://img.shields.io/badge/Download-Windows%20Setup-green.svg)](https://github.com/Tanmaysoni7887/School-Manegment-System-Software/releases/download/v2.3.2/SHIKSHA-School-Management-Software-Setup-2.3.2.exe)

> 📥 **[Download Latest Windows Installer (`SHIKSHA-School-Management-Software-Setup-2.3.2.exe`)](https://github.com/Tanmaysoni7887/School-Manegment-System-Software/releases/download/v2.3.2/SHIKSHA-School-Management-Software-Setup-2.3.2.exe)**  
> **Direct Release Page**: [https://github.com/Tanmaysoni7887/School-Manegment-System-Software/releases/tag/v2.3.2](https://github.com/Tanmaysoni7887/School-Manegment-System-Software/releases/tag/v2.3.2)

**SHIKSHA** is a comprehensive, production-grade, 100% offline School Management System built for Windows desktop environments. Engineered with Electron and local atomic JSON persistence, SHIKSHA delivers instant, zero-latency administration for student admissions, class fee ledgers, transport routing, multi-session academic promotions, marks entry, and printable bilingual financial receipts.

---

## Workspace Directory Structure

```
Shiksha/
├── HANDOVER/                               # Distribution & Client Handover Package
│   ├── Installer/
│   │   └── Shiksha_School_Management_Setup.exe # Official Standalone Windows Installer
│   ├── README.txt                          # System overview, requirements & quick start
│   ├── SETUP_GUIDE.txt                     # First-run setup lifecycle & walkthrough
│   ├── DATA_BACKUP_GUIDE.txt               # Machine migration & safety backup recovery
│   ├── RELEASE_MANIFEST.txt                # Package file manifest & verification details
│   └── checksums.sha256                    # Cryptographic verification checksums
│
├── Shiksha_App/                            # Main Electron Application (Source Code)
│   ├── src/
│   │   ├── app.js                          # UI controllers, fee logic & transport routing
│   │   ├── index.html                      # Single-page application markup & styling
│   │   ├── logo.png                        # Application branding logo asset
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

From the `Shiksha_App` folder:
```powershell
cd Shiksha_App
npm start
```

## Production Deployment

To install the application on a school computer:
1. Navigate to `HANDOVER/Installer/`
2. Run `SHIKSHA_School_Management_Setup.exe`
3. Follow the instructions in `HANDOVER/SETUP_GUIDE.txt`
