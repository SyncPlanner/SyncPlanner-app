const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'SYNC.PLANNER — Composer Manager',
    backgroundColor: '#0F0E1A',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
    titleBarStyle: 'default',
    vibrancy: process.platform === 'darwin' ? 'dark' : undefined,
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if(url.startsWith('mailto:') && process.platform === 'darwin') {
      exec(`open -a Mail "${url.replace(/"/g,'\\"')}"`, (err) => {
        if(err) shell.openExternal(url);
      });
    } else {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // IPC pour ouvrir un dossier via dialog natif
  ipcMain.handle('open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'multiSelections'],
      title: 'Sélectionner un dossier album'
    });
    if(result.canceled) return null;
    
    // Lire le contenu des dossiers sélectionnés
    const albums = {};
    for(const folderPath of result.filePaths) {
      const albumName = path.basename(folderPath);
      albums[albumName] = [];
      try {
        const entries = fs.readdirSync(folderPath);
        entries.forEach(entry => {
          const entryPath = path.join(folderPath, entry);
          const stat = fs.statSync(entryPath);
          albums[albumName].push({
            name: entry,
            isFolder: stat.isDirectory()
          });
        });
      } catch(e) {}
    }
    return albums;
  });

  if (process.platform !== 'darwin') {
    win.setMenuBarVisibility(false);
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
