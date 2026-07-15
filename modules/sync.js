// VocTrainer - Synchronizations Module
import { state, saveState, loadState, updateCategoryCounts } from './state.js';

// Export everything we declare
// ==========================================
// 11. iCloud / Local Folder Synchronization
// ==========================================
export const idb = {
  dbName: "VocTrainerDB",
  storeName: "handles",
  getDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(this.storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async get(key) {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  },
  async set(key, val) {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        const req = store.put(val, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {}
  }
};

state.icloudHandle = null;
state.backupFileHandle = null;

export async function initBackupFile() {
  if (!window.showSaveFilePicker) {
    const statusSpan = document.getElementById("backup-file-status");
    if (statusSpan) {
      statusSpan.textContent = "⚠️ Not supported in this browser/context";
      statusSpan.style.color = "var(--error-color)";
    }
    return;
  }
  try {
    const handle = await idb.get("backup_file_handle");
    if (handle) {
      state.backupFileHandle = handle;
      const statusSpan = document.getElementById("backup-file-status");
      if (statusSpan) {
        statusSpan.textContent = `📁 ${handle.name} (Access Needed)`;
        statusSpan.style.color = "#FF9800";
      }
      const selectBtn = document.getElementById("btn-select-backup-file");
      if (selectBtn) {
        selectBtn.textContent = "🔑 Grant Access";
        selectBtn.className = "btn btn-secondary";
      }
      const changeBtn = document.getElementById("btn-change-backup-file");
      if (changeBtn) {
        changeBtn.style.display = "inline-block";
      }
    }
  } catch (err) {
    console.error("Failed to load backup file handle:", err);
  }
}

window.handleBackupFileButtonClick = async function() {
  if (!window.showSaveFilePicker) {
    alert("Persistent Backup File Access is not supported in this browser or context.\n\nRequirements:\n1. Use a modern desktop browser (Chrome, Edge, Opera).\n2. Access the app via http://localhost:8080 or https:// (secure context).\n\nIf you are on iOS, Safari, or Firefox, please use the standard Export Backup button.");
    return;
  }

  if (!state.backupFileHandle) {
    await window.changeBackupFile();
  } else {
    await window.writeBackupToFile();
  }
};

window.changeBackupFile = async function() {
  if (!window.showSaveFilePicker) {
    alert("Persistent Backup File Access is not supported in this browser.");
    return;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "voctrainer_backup.json",
      types: [{
        description: "JSON Backup File",
        accept: { "application/json": [".json"] }
      }]
    });
    state.backupFileHandle = handle;
    await idb.set("backup_file_handle", handle);
    onBackupFileAccessGranted();
    
    // Auto-save backup after selecting
    await window.writeBackupToFile();
  } catch (err) {
    if (err.name !== "AbortError") {
      alert("Failed to set backup file: " + err.message);
    }
  }
};

window.writeBackupToFile = async function() {
  if (!state.backupFileHandle) return;
  try {
    const perm = await state.backupFileHandle.queryPermission({ mode: "readwrite" });
    let granted = perm === "granted";
    if (!granted) {
      const req = await state.backupFileHandle.requestPermission({ mode: "readwrite" });
      granted = req === "granted";
    }
    if (granted) {
      const writable = await state.backupFileHandle.createWritable();
      await writable.write(JSON.stringify(state, null, 2));
      await writable.close();
      onBackupFileAccessGranted();
      showCustomAlert("🎉 Backup successfully exported and updated in your fixed file!");
    } else {
      alert("Write permission denied. Could not write backup.");
    }
  } catch (err) {
    alert("Failed to write backup: " + err.message);
  }
};

export function onBackupFileAccessGranted() {
  const statusSpan = document.getElementById("backup-file-status");
  if (statusSpan && state.backupFileHandle) {
    statusSpan.textContent = `📁 ${state.backupFileHandle.name} (Ready)`;
    statusSpan.style.color = "var(--success-color)";
  }
  const selectBtn = document.getElementById("btn-select-backup-file");
  if (selectBtn) {
    selectBtn.textContent = "💾 Save Backup to File";
    selectBtn.className = "btn btn-primary";
  }
  const changeBtn = document.getElementById("btn-change-backup-file");
  if (changeBtn) {
    changeBtn.style.display = "inline-block";
  }
}


export async function initICloudSync() {
  if (!window.showDirectoryPicker) {
    const statusSpan = document.getElementById("icloud-folder-status");
    if (statusSpan) {
      statusSpan.textContent = "❌ Not supported on this browser";
      statusSpan.style.color = "var(--error-color)";
    }
    const selectBtn = document.getElementById("btn-select-icloud-folder");
    if (selectBtn) {
      selectBtn.disabled = true;
      selectBtn.style.opacity = "0.5";
      selectBtn.style.cursor = "not-allowed";
      selectBtn.textContent = "Sync Not Supported";
    }
    return;
  }
  try {
    const handle = await idb.get("icloud_handle");
    if (handle) {
      state.icloudHandle = handle;
      const statusSpan = document.getElementById("icloud-folder-status");
      if (statusSpan) {
        statusSpan.textContent = `📁 ${handle.name} (Access Needed)`;
        statusSpan.style.color = "#FF9800";
      }
      
      const selectBtn = document.getElementById("btn-select-icloud-folder");
      if (selectBtn) {
        selectBtn.textContent = "🔑 Grant Folder Access";
      }

      const syncBtn = document.getElementById("btn-sync-folder-now");
      if (syncBtn) {
        syncBtn.style.display = "inline-flex";
      }
    }
  } catch (err) {
    console.error("Failed to load iCloud handle:", err);
  }
}

export async function selectICloudFolder() {
  if (!window.showDirectoryPicker) {
    alert("Folder Syncing (File System Access API) is not supported in this browser. Please use a desktop Chromium browser (e.g. Chrome, Edge) for live folder synchronization. On iOS, Safari, or Firefox, you can use the manual Import/Export backups below.");
    return;
  }
  try {
    if (state.icloudHandle) {
      const perm = await state.icloudHandle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        const req = await state.icloudHandle.requestPermission({ mode: "readwrite" });
        if (req === "granted") {
          onICloudFolderAccessGranted();
          return;
        }
      }
    }

    const handle = await window.showDirectoryPicker();
    state.icloudHandle = handle;
    await idb.set("icloud_handle", handle);
    onICloudFolderAccessGranted();
  } catch (err) {
    if (err.name !== "AbortError") {
      alert("Failed to access folder: " + err.message);
    }
  }
}

export async function onICloudFolderAccessGranted() {
  const statusSpan = document.getElementById("icloud-folder-status");
  if (statusSpan) {
    statusSpan.textContent = `📁 ${state.icloudHandle.name}`;
    statusSpan.style.color = "#4CAF50";
  }
  const selectBtn = document.getElementById("btn-select-icloud-folder");
  if (selectBtn) {
    selectBtn.textContent = "📂 Change Sync Folder";
  }
  const syncBtn = document.getElementById("btn-sync-folder-now");
  if (syncBtn) {
    syncBtn.style.display = "inline-flex";
  }
  
  await syncICloudFolder();
}

export async function syncICloudFolder() {
  if (!state.icloudHandle) return;

  const container = document.getElementById("icloud-wordlists-container");
  const tbody = document.getElementById("icloud-lists-table-body");
  if (container) container.style.display = "block";

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:var(--text-secondary);">Scanning folder...</td></tr>`;
  }

  try {
    const files = [];
    for await (const entry of state.icloudHandle.values()) {
      if (entry.kind === "file" && entry.name.endsWith(".json")) {
        files.push(entry);
      }
    }

    const fileListDetails = [];
    
    // Clear old synced items to sync fresh from folder
    const syncedFolderIds = [];

    for (const entry of files) {
      const file = await entry.getFile();
      const content = await file.text();
      try {
        const parsed = JSON.parse(content);
        let wordCount = 0;
        let folderMeta = null;

        if (Array.isArray(parsed)) {
          wordCount = parsed.length;
        } else if (parsed && Array.isArray(parsed.vocab)) {
          wordCount = parsed.vocab.length;
          folderMeta = parsed.folder;
        }

        const isActive = state.activeICloudLists[entry.name] !== false;
        
        fileListDetails.push({
          filename: entry.name,
          name: entry.name.replace(".json", ""),
          count: wordCount,
          isActive: isActive,
          folder: folderMeta,
          vocab: Array.isArray(parsed) ? parsed : (parsed.vocab || [])
        });

        if (folderMeta) {
          syncedFolderIds.push(folderMeta.id);
        }
      } catch (e) {}
    }

    // Filter out old synced vocabulary and folders
    state.customVocab = state.customVocab.filter(v => !syncedFolderIds.includes(v.category));
    state.customFolders = state.customFolders.filter(f => !syncedFolderIds.includes(f.id));

    // Merge active sets
    fileListDetails.forEach(set => {
      if (set.isActive) {
        if (set.folder) {
          const folderExists = state.customFolders.some(f => f.id === set.folder.id);
          if (!folderExists) {
            state.customFolders.push(set.folder);
          }
        }
        
        set.vocab.forEach(word => {
          const base = state.baseLang || "en";
          const wordText = (word[base] || "").toLowerCase().trim();
          const exists = state.customVocab.some(v => v.category === word.category && (v[base] || "").toLowerCase().trim() === wordText);
          if (!exists) {
            state.customVocab.push(word);
          }
        });
      }
    });

    saveState();
    renderImportedList();
    updateCategoryCounts();

    // Render table
    if (tbody) {
      if (fileListDetails.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:var(--text-secondary);">No wordlists found in folder.</td></tr>`;
        return;
      }

      tbody.innerHTML = "";
      fileListDetails.forEach(set => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.04)";
        tr.innerHTML = `
          <td style="padding:10px; text-align:center;">
            <input type="checkbox" ${set.isActive ? "checked" : ""} onchange="window.toggleICloudListSync('${set.filename}', this.checked)" style="width:16px; height:16px; accent-color:var(--accent-color); cursor:pointer;">
          </td>
          <td style="padding:10px; font-weight:600; color:#fff;">📁 ${set.name}</td>
          <td style="padding:10px; text-align:center; color:var(--accent-color); font-weight:600;">${set.count}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error("iCloud sync error:", err);
    const isPermissionError = err.name === "NotAllowedError" || err.name === "SecurityError" || err.message.toLowerCase().includes("permission") || err.message.toLowerCase().includes("allow");
    
    if (isPermissionError) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:#FF9800;">⚠️ Access permission required. Click "Grant Folder Access" above.</td></tr>`;
      }
      
      const statusSpan = document.getElementById("icloud-folder-status");
      if (statusSpan) {
        statusSpan.textContent = `📁 ${state.icloudHandle.name} (Access Needed)`;
        statusSpan.style.color = "#FF9800";
      }
      
      const selectBtn = document.getElementById("btn-select-icloud-folder");
      if (selectBtn) {
        selectBtn.textContent = "🔑 Grant Folder Access";
      }
    } else {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:var(--error-color);">❌ Sync failed: ${err.message}</td></tr>`;
      }
    }
  }
}

let icloudSaveTimeout = null;
export function saveWordlistToICloud(folderId) {
  if (!state.icloudHandle) return;
  
  clearTimeout(icloudSaveTimeout);
  icloudSaveTimeout = setTimeout(async () => {
    try {
      const perm = await state.icloudHandle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        const req = await state.icloudHandle.requestPermission({ mode: "readwrite" });
        if (req !== "granted") return;
      }

      const folder = state.customFolders.find(f => f.id === folderId);
      if (!folder) return;

      const filename = `${folder.name.replace(/[^a-zA-Z0-9_\-\s]/g, "")}.json`;
      const folderWords = state.customVocab.filter(v => v.category === folderId);

      const fileHandle = await state.icloudHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();

      const data = {
        vocab: folderWords,
        folder: folder
      };

      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();

      state.activeICloudLists[filename] = true;
      saveState();
      
      if (document.getElementById("view-setup").classList.contains("active")) {
        await syncICloudFolder();
      }
    } catch (err) {
      console.error("Failed to auto-save wordlist to folder:", err);
    }
  }, 500);
}

window.toggleICloudListSync = async function(filename, checked) {
  state.activeICloudLists[filename] = checked;
  saveState();
  await syncICloudFolder();
};

window.downloadAndImportCloudSet = () => {};
window.deleteCloudSet = () => {};

// 12. Direct Semicolon CSV Import
export async function executeCSVImport() {
  const textInput = document.getElementById("csv-import-text");
  const catInput = document.getElementById("csv-category");
  if (!textInput || !catInput) return;

  const text = textInput.value;
  const category = catInput.value.trim() || "csv-import";
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    alert("Please paste some semicolon-separated lines first.");
    return;
  }

  let addedCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  const base = state.baseLang || "en";
  const staticFolders = ["verbs", "nouns", "technology", "biology", "phrases"];

  for (const line of lines) {
    const parts = line.split(";").map(p => p.trim());
    if (parts.length < 5) {
      invalidCount++;
      continue;
    }

    const en = parts[0];
    const de = parts[1];
    const it = parts[2];
    const es = parts[3];
    const fr = parts[4];

    if (!en || !de || !it || !es || !fr) {
      invalidCount++;
      continue;
    }

    // Check if word already exists in target customVocab category
    const cleanBaseWord = (base === "en" ? en : base === "de" ? de : base === "it" ? it : base === "es" ? es : fr).toLowerCase();
    const existsInCustom = (state.customVocab || []).some(v => {
      const vBase = (v[base] || v.en || "").trim().toLowerCase();
      return vBase === cleanBaseWord && v.category === category;
    });

    if (existsInCustom) {
      duplicateCount++;
      continue;
    }

    // Create new word directly
    const newWord = {
      en: sanitizeWordTranslation(en, "en"),
      de: sanitizeWordTranslation(de, "de"),
      it: sanitizeWordTranslation(it, "it"),
      es: sanitizeWordTranslation(es, "es"),
      fr: sanitizeWordTranslation(fr, "fr"),
      category: category,
      image: en,
      details: {
        articles: {},
        sentences: {
          en: `I see the ${en}.`,
          de: `Ich sehe ${de}.`,
          it: `Vedo ${it}.`,
          es: `Veo ${es}.`,
          fr: `Je vois ${fr}.`
        },
        variations: {},
        synonyms: { en: [], de: [], it: [], es: [], fr: [] }
      },
      lastUpdated: Date.now()
    };

    // Ensure custom category folder exists if not standard
    if (!staticFolders.includes(category)) {
      const folderExists = (state.customFolders || []).some(f => f.id === category || f.name === category);
      if (!folderExists) {
        state.customFolders.push({ id: category, name: category, parentId: null });
      }
    }

    state.customVocab.push(newWord);
    sessionImportedList.push(newWord);
    addedCount++;
  }

  if (addedCount > 0) {
    saveState();
    renderImportedList();
    updateCategoryCounts();
    if (state.icloudHandle) {
      saveWordlistToICloud(category);
    }
    alert(`🎉 CSV Import finished!\nSuccessfully imported: ${addedCount} words.\nDuplicates skipped: ${duplicateCount}.\nInvalid lines: ${invalidCount}.`);
    textInput.value = "";
  } else {
    alert(`No words imported.\nDuplicates skipped: ${duplicateCount}.\nInvalid lines (not 5 columns): ${invalidCount}.`);
  }
}

// ==========================================
// 12. Easy Multi-Device Cloud Sync Logic
// ==========================================
export function getSyncApiUrl(suffix = "") {
  if (window.location.hostname.includes("onrender.com") || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `/api/vocabdata${suffix}`;
  } else {
    return `https://voctrainer-app.onrender.com/api/vocabdata${suffix}`;
  }
}

export function updateCloudSyncUI() {
  const activeZone = document.getElementById("cloud-sync-active-zone");
  const setupZoneEasy = document.getElementById("cloud-sync-setup-zone-easy");
  const setupZoneGithub = document.getElementById("cloud-sync-setup-zone-github");
  const codeDisplay = document.getElementById("cloud-sync-code-display");
  const codeLabel = document.getElementById("cloud-sync-code-label");
  const statusMsg = document.getElementById("cloud-sync-status-msg");
  
  if (!activeZone || !setupZoneEasy || !setupZoneGithub || !codeDisplay) return;

  if (window.location.protocol === "file:" && state.syncProvider === "easy") {
    activeZone.style.display = "none";
    setupZoneEasy.style.display = "flex";
    setupZoneGithub.style.display = "none";
    codeDisplay.textContent = "-";
    if (statusMsg) {
      statusMsg.innerHTML = "⚠️ Cloud Sync is blocked when running via <code>file://</code>. Please open the app via <code>http://localhost:8080</code> instead.";
      statusMsg.style.color = "var(--error-color)";
      statusMsg.parentElement.style.display = "block";
    }
    return;
  }

  // Prefill GitHub inputs if present
  const inputToken = document.getElementById("input-github-token");
  const inputGistId = document.getElementById("input-github-gist-id");
  if (inputToken) inputToken.value = state.githubToken || "";
  if (inputGistId) inputGistId.value = state.githubGistId || "";

  if (state.cloudSyncId) {
    activeZone.style.display = "block";
    setupZoneEasy.style.display = "none";
    setupZoneGithub.style.display = "none";
    codeDisplay.textContent = state.cloudSyncId;
    if (codeLabel) {
      codeLabel.textContent = state.syncProvider === "github" ? "GitHub Gist ID / Sync Code:" : "Your Active Sync Code:";
    }
  } else {
    activeZone.style.display = "none";
    const btnModeEasy = document.getElementById("btn-sync-mode-easy");
    const btnModeGithub = document.getElementById("btn-sync-mode-github");
    
    if (state.syncProvider === "github") {
      if (btnModeGithub) btnModeGithub.classList.add("active");
      if (btnModeEasy) btnModeEasy.classList.remove("active");
      setupZoneEasy.style.display = "none";
      setupZoneGithub.style.display = "flex";
    } else {
      if (btnModeEasy) btnModeEasy.classList.add("active");
      if (btnModeGithub) btnModeGithub.classList.remove("active");
      setupZoneEasy.style.display = "flex";
      setupZoneGithub.style.display = "none";
    }
    codeDisplay.textContent = "-";
  }
}

export function getSanitizedSyncPayload() {
  const payload = {
    xp: state.xp,
    streak: state.streak,
    hearts: state.hearts,
    level: state.level,
    customVocab: state.customVocab,
    mistakes: state.mistakes,
    openaiKey: state.openaiKey,
    grokKey: state.grokKey,
    geminiKey: state.geminiKey,
    anthropicKey: state.anthropicKey,
    audioEngine: state.audioEngine,
    allowSynonyms: state.allowSynonyms,
    questionTimer: state.questionTimer,
    baseLang: state.baseLang,
    selectedLang: state.selectedLang,
    history: state.history,
    deletedStarters: state.deletedStarters,
    deletedCustomVocab: state.deletedCustomVocab,
    editedStarters: state.editedStarters,
    customFolders: state.customFolders,
    wordStats: state.wordStats,
    testDirection: state.testDirection,
    customVoices: state.customVoices,
    activeICloudLists: state.activeICloudLists
  };

  // Slice history to the last 100 entries to optimize size
  if (payload.history && payload.history.length > 100) {
    payload.history = payload.history.slice(-100);
  }

  let payloadStr = JSON.stringify(payload);
  
  // If still too large (e.g. > 1.2MB), strip audio properties to ensure successful upload
  if (payloadStr.length > 1200000) {
    console.warn(`Sync payload is very large (${payloadStr.length} bytes). Stripping heavy base64 custom voice recordings...`);
    payload.customVocab = state.customVocab.map(item => {
      const copy = { ...item };
      delete copy.audio;
      return copy;
    });
    payload.audioStripped = true;
  }
  
  return payload;
}

export async function pushToCloud() {
  if (state.syncProvider === "github") {
    await pushToGitHubGist();
    return;
  }
  if (window.location.protocol === "file:") {
    alert("Browser Security Block:\nYou are running the app directly from your hard drive (file://). Browsers block all external cloud database requests in this mode.\n\nPlease start your local server and open 'http://localhost:8080' in your browser to use Cloud Sync!");
    return;
  }
  if (!state.cloudSyncId) return;
  const statusMsg = document.getElementById("cloud-sync-status-msg");
  if (statusMsg) {
    statusMsg.textContent = "⏳ Syncing with cloud...";
    statusMsg.style.color = "var(--text-secondary)";
  }
  
  const payload = getSanitizedSyncPayload();

  try {
    const res = await fetch(getSyncApiUrl(`/${state.cloudSyncId}`), {
      method: "PUT",
      mode: "cors",
      headers: { 
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const isAudioStripped = payload.audioStripped;
      if (statusMsg) {
        statusMsg.textContent = `✅ Synced to cloud ${isAudioStripped ? "(audio skipped)" : ""} at ${new Date().toLocaleTimeString()}`;
        statusMsg.style.color = "var(--success-color)";
      }
      showCustomAlert("🎉 Data successfully pushed to Cloud!" + (isAudioStripped ? "\n\n⚠️ Info: Your custom audio recordings were skipped during sync to stay within the free database storage limits." : ""));
    } else {
      throw new Error(`Server returned code ${res.status}`);
    }
  } catch (err) {
    if (statusMsg) {
      statusMsg.textContent = `❌ Upload failed: ${err.message}`;
      statusMsg.style.color = "var(--error-color)";
    }
    alert("Cloud Sync failed: " + err.message);
  }
}

export async function pullFromCloud() {
  if (state.syncProvider === "github") {
    await pullFromGitHubGist();
    return;
  }
  if (window.location.protocol === "file:") {
    alert("Browser Security Block:\nYou are running the app directly from your hard drive (file://). Browsers block all external cloud database requests in this mode.\n\nPlease start your local server and open 'http://localhost:8080' in your browser to use Cloud Sync!");
    return;
  }
  if (!state.cloudSyncId) return;
  const statusMsg = document.getElementById("cloud-sync-status-msg");
  if (statusMsg) {
    statusMsg.textContent = "⏳ Fetching from cloud...";
    statusMsg.style.color = "var(--text-secondary)";
  }

  try {
    const res = await fetch(getSyncApiUrl(`/${state.cloudSyncId}`), {
      method: "GET",
      mode: "cors"
    });
    if (!res.ok) throw new Error(`Server returned code ${res.status}`);
    const data = await res.json();
    
    if (data && typeof data === "object") {
      // Overwrite/merge properties
      if (data.xp !== undefined) state.xp = data.xp;
      if (data.streak !== undefined) state.streak = data.streak;
      if (data.hearts !== undefined) state.hearts = data.hearts;
      if (data.level !== undefined) state.level = data.level;
      if (data.deletedCustomVocab !== undefined) state.deletedCustomVocab = data.deletedCustomVocab;
      if (data.customVocab !== undefined) {
        mergeCustomVocab(data.customVocab, data.deletedCustomVocab);
      }
      if (data.mistakes !== undefined) state.mistakes = data.mistakes;
      if (data.openaiKey !== undefined) state.openaiKey = data.openaiKey;
      if (data.grokKey !== undefined) state.grokKey = data.grokKey;
      if (data.geminiKey !== undefined) state.geminiKey = data.geminiKey;
      if (data.anthropicKey !== undefined) state.anthropicKey = data.anthropicKey;
      if (data.audioEngine !== undefined) state.audioEngine = data.audioEngine;
      if (data.allowSynonyms !== undefined) state.allowSynonyms = data.allowSynonyms;
      if (data.questionTimer !== undefined) state.questionTimer = data.questionTimer;
      if (data.baseLang !== undefined) state.baseLang = data.baseLang;
      if (data.selectedLang !== undefined) state.selectedLang = data.selectedLang;
      if (data.history !== undefined) state.history = data.history;
      if (data.deletedStarters !== undefined) state.deletedStarters = data.deletedStarters;
      if (data.editedStarters !== undefined) state.editedStarters = data.editedStarters;
      if (data.customFolders !== undefined) state.customFolders = data.customFolders;
      if (data.wordStats !== undefined) state.wordStats = data.wordStats;
      if (data.testDirection !== undefined) state.testDirection = data.testDirection;
      if (data.customVoices !== undefined) state.customVoices = data.customVoices;
      if (data.activeICloudLists !== undefined) state.activeICloudLists = data.activeICloudLists;
      if (data.dictionaryCache !== undefined) state.dictionaryCache = data.dictionaryCache;
      
      saveState();
      
      // Re-initialize views
      renderImportedList();
      renderMistakesList();
      renderHistoryList();
      updateCategoryCounts();
      updateHeaderUI();
      if (statusMsg) {
        statusMsg.textContent = `✅ Synced from cloud at ${new Date().toLocaleTimeString()}`;
        statusMsg.style.color = "var(--success-color)";
      }
      showCustomAlert("🎉 Data successfully pulled from Cloud!");
    } else {
      throw new Error("Invalid sync file format");
    }
  } catch (err) {
    if (statusMsg) {
      statusMsg.textContent = `❌ Download failed: ${err.message}`;
      statusMsg.style.color = "var(--error-color)";
    }
    alert("Cloud download failed: " + err.message);
  }
}

export async function generateCloudSyncCode() {
  if (window.location.protocol === "file:") {
    alert("Browser Security Block:\nYou are running the app directly from your hard drive (file://). Browsers block all external cloud database requests in this mode.\n\nPlease start your local server and open 'http://localhost:8080' in your browser to use Cloud Sync!");
    return;
  }
  const btn = document.getElementById("btn-cloud-generate-code");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Generating Code...";
  }

  const payload = getSanitizedSyncPayload();
 
  try {
    console.log("Attempting to connect to Render sync service...");
    const res = await fetch(getSyncApiUrl(), {
      method: "POST",
      mode: "cors",
      headers: { 
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      if (!data || !data.id) {
        throw new Error("Server succeeded but did not return a bin ID.");
      }
      state.cloudSyncId = data.id;
      saveState();
      updateCloudSyncUI();
      const isAudioStripped = payload.audioStripped;
      showCustomAlert("🎉 Sync Code generated! Save this code to link other devices." + (isAudioStripped ? "\n\n⚠️ Info: Your custom audio recordings were skipped during sync to stay within storage limits." : ""));
    } else {
      throw new Error(`Server returned code ${res.status}`);
    }
  } catch (err) {
    console.error("Cloud Sync connection failed:", err);
    alert("Could not generate Sync Code: " + err.message + "\n\n💡 Tip: Your browser or network AdBlocker/Firewall might be blocking the sync service. Try disabling Brave Shields / AdBlocker.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🆕 Generate New Sync Code";
    }
  }
}

export async function linkCloudSyncDevice(code) {
  if (window.location.protocol === "file:") {
    alert("Browser Security Block:\nYou are running the app directly from your hard drive (file://). Browsers block all external cloud database requests in this mode.\n\nPlease start your local server and open 'http://localhost:8080' in your browser to use Cloud Sync!");
    return;
  }
  if (!code) {
    alert("Please enter a Sync Code.");
    return;
  }
  const btn = document.getElementById("btn-cloud-link-code");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Linking...";
  }

  try {
    const res = await fetch(getSyncApiUrl(`/${code}`), {
      method: "GET",
      mode: "cors"
    });
    if (!res.ok) throw new Error("Sync Code not found or expired.");
    const data = await res.json();
    if (data && typeof data === "object") {
      state.cloudSyncId = code;
      
      // Load data
      if (data.xp !== undefined) state.xp = data.xp;
      if (data.streak !== undefined) state.streak = data.streak;
      if (data.hearts !== undefined) state.hearts = data.hearts;
      if (data.level !== undefined) state.level = data.level;
      if (data.deletedCustomVocab !== undefined) state.deletedCustomVocab = data.deletedCustomVocab;
      if (data.customVocab !== undefined) {
        mergeCustomVocab(data.customVocab, data.deletedCustomVocab);
      }
      if (data.mistakes !== undefined) state.mistakes = data.mistakes;
      if (data.openaiKey !== undefined) state.openaiKey = data.openaiKey;
      if (data.grokKey !== undefined) state.grokKey = data.grokKey;
      if (data.geminiKey !== undefined) state.geminiKey = data.geminiKey;
      if (data.anthropicKey !== undefined) state.anthropicKey = data.anthropicKey;
      if (data.audioEngine !== undefined) state.audioEngine = data.audioEngine;
      if (data.allowSynonyms !== undefined) state.allowSynonyms = data.allowSynonyms;
      if (data.questionTimer !== undefined) state.questionTimer = data.questionTimer;
      if (data.baseLang !== undefined) state.baseLang = data.baseLang;
      if (data.selectedLang !== undefined) state.selectedLang = data.selectedLang;
      if (data.history !== undefined) state.history = data.history;
      if (data.deletedStarters !== undefined) state.deletedStarters = data.deletedStarters;
      if (data.editedStarters !== undefined) state.editedStarters = data.editedStarters;
      if (data.customFolders !== undefined) state.customFolders = data.customFolders;
      if (data.wordStats !== undefined) state.wordStats = data.wordStats;
      if (data.testDirection !== undefined) state.testDirection = data.testDirection;
      if (data.customVoices !== undefined) state.customVoices = data.customVoices;
      if (data.activeICloudLists !== undefined) state.activeICloudLists = data.activeICloudLists;
      if (data.dictionaryCache !== undefined) state.dictionaryCache = data.dictionaryCache;
      
      saveState();
      updateCloudSyncUI();
      
      // Re-initialize views
      renderImportedList();
      renderMistakesList();
      renderHistoryList();
      updateCategoryCounts();
      updateHeaderUI();

      alert("🎉 Device linked successfully! Wordlists and progress synced.");
    }
  } catch (err) {
    alert("Failed to link device: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🔗 Link Device";
    }
  }
}

export function unlinkCloudSyncDevice() {
  if (confirm("Are you sure you want to disable Cloud Sync? Your current local data will NOT be deleted, but this device will stop syncing with the cloud.")) {
    state.cloudSyncId = "";
    state.githubToken = "";
    state.githubGistId = "";
    state.syncProvider = "easy";
    saveState();
    updateCloudSyncUI();
    showCustomAlert("Cloud Sync disabled.");
  }
}

// ==========================================
// 13. GitHub Gist Cloud Sync Implementation
// ==========================================
export async function connectGitHubGist() {
  const token = document.getElementById("input-github-token").value.trim();
  const gistId = document.getElementById("input-github-gist-id").value.trim();
  
  if (!token) {
    alert("Please enter a GitHub Personal Access Token.");
    return;
  }

  const btn = document.getElementById("btn-github-connect");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Connecting...";
  }

  const payload = getSanitizedSyncPayload();

  try {
    if (gistId) {
      // LINKING existing Gist
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: "GET",
        headers: {
          "Authorization": `token ${token}`
        }
      });
      if (!res.ok) throw new Error("Could not find Gist. Check Gist ID or Token validity.");
      const data = await res.json();
      
      // Pull data
      const contentStr = data.files["voctrainer_sync.json"].content;
      const parsedData = JSON.parse(contentStr);
      
      state.syncProvider = "github";
      state.githubToken = token;
      state.githubGistId = gistId;
      state.cloudSyncId = gistId;
      
      // Load properties
      if (parsedData.xp !== undefined) state.xp = parsedData.xp;
      if (parsedData.streak !== undefined) state.streak = parsedData.streak;
      if (parsedData.hearts !== undefined) state.hearts = parsedData.hearts;
      if (parsedData.level !== undefined) state.level = parsedData.level;
      if (parsedData.deletedCustomVocab !== undefined) state.deletedCustomVocab = parsedData.deletedCustomVocab;
      if (parsedData.customVocab !== undefined) {
        mergeCustomVocab(parsedData.customVocab, parsedData.deletedCustomVocab);
      }
      if (parsedData.mistakes !== undefined) state.mistakes = parsedData.mistakes;
      if (parsedData.openaiKey !== undefined) state.openaiKey = parsedData.openaiKey;
      if (parsedData.grokKey !== undefined) state.grokKey = parsedData.grokKey;
      if (parsedData.geminiKey !== undefined) state.geminiKey = parsedData.geminiKey;
      if (parsedData.anthropicKey !== undefined) state.anthropicKey = parsedData.anthropicKey;
      if (parsedData.audioEngine !== undefined) state.audioEngine = parsedData.audioEngine;
      if (parsedData.allowSynonyms !== undefined) state.allowSynonyms = parsedData.allowSynonyms;
      if (parsedData.questionTimer !== undefined) state.questionTimer = parsedData.questionTimer;
      if (parsedData.baseLang !== undefined) state.baseLang = parsedData.baseLang;
      if (parsedData.selectedLang !== undefined) state.selectedLang = parsedData.selectedLang;
      if (parsedData.history !== undefined) state.history = parsedData.history;
      if (parsedData.deletedStarters !== undefined) state.deletedStarters = parsedData.deletedStarters;
      if (parsedData.editedStarters !== undefined) state.editedStarters = parsedData.editedStarters;
      if (parsedData.customFolders !== undefined) state.customFolders = parsedData.customFolders;
      if (parsedData.wordStats !== undefined) state.wordStats = parsedData.wordStats;
      if (parsedData.testDirection !== undefined) state.testDirection = parsedData.testDirection;
      if (parsedData.customVoices !== undefined) state.customVoices = parsedData.customVoices;
      if (parsedData.activeICloudLists !== undefined) state.activeICloudLists = parsedData.activeICloudLists;
      
      saveState();
      updateCloudSyncUI();
      
      // Re-initialize views
      renderImportedList();
      renderMistakesList();
      renderHistoryList();
      updateCategoryCounts();
      updateHeaderUI();
      
      alert("🎉 Linked to GitHub Gist! Wordlists and progress pulled successfully.");
    } else {
      // CREATING new Gist
      const res = await fetch("https://api.github.com/gists", {
        method: "POST",
        headers: {
          "Authorization": `token ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          description: "VocTrainer Sync Data",
          public: false,
          files: {
            "voctrainer_sync.json": {
              content: JSON.stringify(payload)
            }
          }
        })
      });
      if (!res.ok) throw new Error("Could not create Gist. Verify Token scopes.");
      const data = await res.json();
      
      state.syncProvider = "github";
      state.githubToken = token;
      state.githubGistId = data.id;
      state.cloudSyncId = data.id;
      
      saveState();
      updateCloudSyncUI();
      alert("🎉 GitHub Gist Sync connected! Copy your Gist ID to sync other devices.");
    }
  } catch (err) {
    alert("Connection to GitHub Gist failed: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🆕 Connect & Sync Gist";
    }
  }
}

export async function pushToGitHubGist() {
  const statusMsg = document.getElementById("cloud-sync-status-msg");
  if (statusMsg) {
    statusMsg.textContent = "⏳ Syncing with GitHub Gist...";
    statusMsg.style.color = "var(--text-secondary)";
  }
  
  const payload = getSanitizedSyncPayload();

  try {
    const res = await fetch(`https://api.github.com/gists/${state.githubGistId}`, {
      method: "PATCH",
      headers: {
        "Authorization": `token ${state.githubToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: {
          "voctrainer_sync.json": {
            content: JSON.stringify(payload)
          }
        }
      })
    });
    if (res.ok) {
      if (statusMsg) {
        statusMsg.textContent = `✅ Synced to Gist at ${new Date().toLocaleTimeString()}`;
        statusMsg.style.color = "var(--success-color)";
      }
      showCustomAlert("🎉 Data successfully pushed to GitHub Gist!");
    } else {
      throw new Error(`GitHub returned code ${res.status}`);
    }
  } catch (err) {
    if (statusMsg) {
      statusMsg.textContent = `❌ Gist upload failed: ${err.message}`;
      statusMsg.style.color = "var(--error-color)";
    }
    alert("GitHub Gist push failed: " + err.message);
  }
}

export async function pullFromGitHubGist() {
  const statusMsg = document.getElementById("cloud-sync-status-msg");
  if (statusMsg) {
    statusMsg.textContent = "⏳ Fetching from GitHub Gist...";
    statusMsg.style.color = "var(--text-secondary)";
  }

  try {
    const res = await fetch(`https://api.github.com/gists/${state.githubGistId}`, {
      headers: {
        "Authorization": `token ${state.githubToken}`
      }
    });
    if (!res.ok) throw new Error(`GitHub returned code ${res.status}`);
    const data = await res.json();
    const contentStr = data.files["voctrainer_sync.json"].content;
    const parsedData = JSON.parse(contentStr);
    
    if (parsedData && typeof parsedData === "object") {
      // Overwrite/merge properties
      if (parsedData.xp !== undefined) state.xp = parsedData.xp;
      if (parsedData.streak !== undefined) state.streak = parsedData.streak;
      if (parsedData.hearts !== undefined) state.hearts = parsedData.hearts;
      if (parsedData.level !== undefined) state.level = parsedData.level;
      if (parsedData.deletedCustomVocab !== undefined) state.deletedCustomVocab = parsedData.deletedCustomVocab;
      if (parsedData.customVocab !== undefined) {
        mergeCustomVocab(parsedData.customVocab, parsedData.deletedCustomVocab);
      }
      if (parsedData.mistakes !== undefined) state.mistakes = parsedData.mistakes;
      if (parsedData.openaiKey !== undefined) state.openaiKey = parsedData.openaiKey;
      if (parsedData.grokKey !== undefined) state.grokKey = parsedData.grokKey;
      if (parsedData.geminiKey !== undefined) state.geminiKey = parsedData.geminiKey;
      if (parsedData.anthropicKey !== undefined) state.anthropicKey = parsedData.anthropicKey;
      if (parsedData.audioEngine !== undefined) state.audioEngine = parsedData.audioEngine;
      if (parsedData.allowSynonyms !== undefined) state.allowSynonyms = parsedData.allowSynonyms;
      if (parsedData.questionTimer !== undefined) state.questionTimer = parsedData.questionTimer;
      if (parsedData.baseLang !== undefined) state.baseLang = parsedData.baseLang;
      if (parsedData.selectedLang !== undefined) state.selectedLang = parsedData.selectedLang;
      if (parsedData.history !== undefined) state.history = parsedData.history;
      if (parsedData.deletedStarters !== undefined) state.deletedStarters = parsedData.deletedStarters;
      if (parsedData.editedStarters !== undefined) state.editedStarters = parsedData.editedStarters;
      if (parsedData.customFolders !== undefined) state.customFolders = parsedData.customFolders;
      if (parsedData.wordStats !== undefined) state.wordStats = parsedData.wordStats;
      if (parsedData.testDirection !== undefined) state.testDirection = parsedData.testDirection;
      if (parsedData.customVoices !== undefined) state.customVoices = parsedData.customVoices;
      if (parsedData.activeICloudLists !== undefined) state.activeICloudLists = parsedData.activeICloudLists;
      
      saveState();
      
      // Re-initialize views
      renderImportedList();
      renderMistakesList();
      renderHistoryList();
      updateCategoryCounts();
      updateHeaderUI();
      
      if (statusMsg) {
        statusMsg.textContent = `✅ Synced from Gist at ${new Date().toLocaleTimeString()}`;
        statusMsg.style.color = "var(--success-color)";
      }
      showCustomAlert("🎉 Data successfully pulled from GitHub Gist!");
    }
  } catch (err) {
    if (statusMsg) {
      statusMsg.textContent = `❌ Gist download failed: ${err.message}`;
      statusMsg.style.color = "var(--error-color)";
    }
    alert("GitHub Gist pull failed: " + err.message);
  }
}

// Obsolete sync placeholders from previous version to prevent ReferenceErrors
// Obsolete sync placeholders from previous version to prevent ReferenceErrors
export function loadCloudWordSets() {
  console.log("loadCloudWordSets placeholder called.");
}
export function uploadActiveVocabToCloud() {
  console.log("uploadActiveVocabToCloud placeholder called.");
}


