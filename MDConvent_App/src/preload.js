const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadData:              ()                  => ipcRenderer.invoke('load-data'),
  saveData:              (data)              => ipcRenderer.invoke('save-data', data),
  backupData:            (data)              => ipcRenderer.invoke('backup-data', data),
  restoreData:           ()                  => ipcRenderer.invoke('restore-data'),
  listBackups:           ()                  => ipcRenderer.invoke('list-backups'),
  restoreSpecificBackup: (filename)          => ipcRenderer.invoke('restore-specific-backup', filename),
  createSafetyBackup:    ()                  => ipcRenderer.invoke('create-safety-backup'),
  createAutomaticBackup: (opts)              => ipcRenderer.invoke('create-automatic-backup', opts),
  selectLogo:            ()                  => ipcRenderer.invoke('select-logo'),
  exportCSV:             (filename, content) => ipcRenderer.invoke('export-csv', { filename, content }),
  printContent:          (html)              => ipcRenderer.invoke('print-content', html),
  getDataPath:           ()                  => ipcRenderer.invoke('get-data-path'),
  selectStudentPhoto:    ()                  => ipcRenderer.invoke('select-student-photo'),
  saveStudentPhoto:      (opts)              => ipcRenderer.invoke('save-student-photo', opts),
  deleteStudentPhoto:    (filename)          => ipcRenderer.invoke('delete-student-photo', filename),
  getStudentPhotoData:   (filename)          => ipcRenderer.invoke('get-student-photo-data', filename),
  getStudentPhotosPath:  ()                  => ipcRenderer.invoke('get-student-photos-path'),
});
