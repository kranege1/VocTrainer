import { state, saveState, getFlagHtml, getFolderFullPath } from './state.js';

// Language code mappings to Speech Synthesis/Recognition locales
const LANG_LOCALES = {
  en: "en-US",
  de: "de-DE",
  it: "it-IT",
  es: "es-ES",
  fr: "fr-FR"
};

const playSound = (id) => { if (window.playSound) window.playSound(id); };
const renderBrowseList = (...args) => window.renderBrowseList?.(...args);

// ==========================================
// 10. Custom Modal Overlays (Alert & Confirm) & Global Click Sound
// ==========================================

// Global Sound Click Listener
document.addEventListener("click", (e) => {
  const target = e.target.closest("button, .btn, .lang-btn, .seg-btn, .nav-item, .word-bubble, input[type='file'], select");
  if (target) {
    playSound("sound-click");
  }
});

// Override window.alert globally
window.alert = function(message) {
  showCustomAlert(message);
};

export function showCustomAlert(message) {
  const overlay = document.getElementById("custom-modal-overlay");
  const icon = document.getElementById("modal-icon");
  const title = document.getElementById("modal-title");
  const msgEl = document.getElementById("modal-message");
  const actions = document.getElementById("modal-actions");

  // Play popup sound
  playSound("sound-popup");

  icon.textContent = "ℹ️";
  title.textContent = "Notice";
  msgEl.textContent = message;
  
  // Create OK button
  actions.innerHTML = "";
  const okBtn = document.createElement("button");
  okBtn.className = "btn btn-primary";
  okBtn.textContent = "OK";
  okBtn.onclick = () => {
    overlay.classList.remove("active");
  };
  actions.appendChild(okBtn);

  overlay.classList.add("active");
}

export function showCustomConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("custom-modal-overlay");
    const icon = document.getElementById("modal-icon");
    const title = document.getElementById("modal-title");
    const msgEl = document.getElementById("modal-message");
    const actions = document.getElementById("modal-actions");

    // Play popup sound
    playSound("sound-popup");

    icon.textContent = "❓";
    title.textContent = "Confirm Action";
    msgEl.textContent = message;

    actions.innerHTML = "";

    // Cancel Button
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = () => {
      overlay.classList.remove("active");
      resolve(false);
    };

    // Confirm Button
    const confirmBtn = document.createElement("button");
    confirmBtn.className = "btn btn-primary";
    confirmBtn.textContent = "Confirm";
    confirmBtn.onclick = () => {
      overlay.classList.remove("active");
      resolve(true);
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    overlay.classList.add("active");
  });
}

window.triggerEditWord = function(key, isCustom) {
  let currentWord = null;
  if (isCustom) {
    currentWord = state.customVocab.find(v => v.en === key || v.origEn === key);
  } else {
    const base = state.baseLang || "en";
    const item = STARTER_VOCAB_RAW.find(v => v[base] === key);
    if (item) {
      const override = state.editedStarters[key] || {};
      currentWord = {
        en: override.en || item.en || item[base] || "",
        de: override.de || item.de || "",
        it: override.it || item.it || "",
        es: override.es || item.es || "",
        fr: override.fr || item.fr || "",
        category: override.category || item.category || "",
        image: override.image || item.image || "",
        details: override.details || item.details || {}
      };
    }
  }

  if (currentWord) {
    state.editingWordKey = key;
    state.isEditingCustom = isCustom;
    
    // Switch to import view
    showView("view-import");
    
    // Activate manual tab
    const tabBtn = document.querySelector('[data-tab="tab-manual"]');
    if (tabBtn) tabBtn.click();
    
    // Pre-fill fields
    document.getElementById("manual-lang-en").value = currentWord.en || "";
    document.getElementById("manual-lang-de").value = currentWord.de || "";
    document.getElementById("manual-lang-it").value = currentWord.it || "";
    document.getElementById("manual-lang-es").value = currentWord.es || "";
    document.getElementById("manual-lang-fr").value = currentWord.fr || "";
    document.getElementById("manual-category").value = currentWord.category || "";
    document.getElementById("manual-image-url").value = currentWord.image || "";
    
    // Pre-fill Advanced Grammar fields
    const det = currentWord.details || {};
    const arts = det.articles || {};
    const genders = det.genderForms || {};
    
    document.getElementById("manual-art-de").value = arts.de || "";
    document.getElementById("manual-art-it").value = arts.it || "";
    document.getElementById("manual-art-es").value = arts.es || "";
    document.getElementById("manual-art-fr").value = arts.fr || "";
    
    document.getElementById("manual-gen-de-m").value = genders.de?.m || "";
    document.getElementById("manual-gen-de-f").value = genders.de?.f || "";
    document.getElementById("manual-gen-it-m").value = genders.it?.m || "";
    document.getElementById("manual-gen-it-f").value = genders.it?.f || "";

    const sents = det.sentences || {};
    document.getElementById("manual-sentence-en").value = sents.en || "";
    document.getElementById("manual-sentence-de").value = sents.de || "";
    document.getElementById("manual-sentence-it").value = sents.it || "";
    document.getElementById("manual-sentence-es").value = sents.es || "";
    document.getElementById("manual-sentence-fr").value = sents.fr || "";

    // Change button text and title
    document.getElementById("btn-manual-submit").textContent = "💾 Save Changes";
    const header = document.querySelector("#tab-manual h3");
    if (header) header.textContent = "✏️ Edit Word";
  }
};

window.triggerDeleteWord = async function(originalBaseKey, originalTargetKey, isCustom) {
  if (originalBaseKey instanceof HTMLElement || (originalBaseKey && typeof originalBaseKey === 'object' && originalBaseKey.dataset)) {
    const buttonEl = originalBaseKey;
    originalBaseKey = buttonEl.dataset.originalBase;
    originalTargetKey = buttonEl.dataset.originalTarget;
    isCustom = buttonEl.dataset.custom === "true";
  }
  const displayLabel = originalBaseKey || originalTargetKey || "this word";
  const confirmDel = await showCustomConfirm(`Are you sure you want to delete "${displayLabel}"?`);
  if (!confirmDel) return;

  const base = state.baseLang || "en";
  const target = state.browseTargetLang || "de";
  const folderId = state.selectedBrowseFolderId;

  if (isCustom) {
    const matched = state.customVocab.find(v => 
      v.category === folderId &&
      (v[base] || "").toLowerCase() === originalBaseKey.toLowerCase() &&
      (v[target] || "").toLowerCase() === originalTargetKey.toLowerCase()
    );
    if (matched) {
      state.deletedCustomVocab.push({
        category: folderId,
        en: matched.origEn || matched.en,
        lastUpdated: Date.now()
      });
    }
    state.customVocab = state.customVocab.filter(v => 
      !(v.category === folderId &&
        (v[base] || "").toLowerCase() === originalBaseKey.toLowerCase() &&
        (v[target] || "").toLowerCase() === originalTargetKey.toLowerCase())
    );
    
    // Auto-save to iCloud if enabled
    if (state.icloudHandle) {
      saveWordlistToICloud(folderId);
    }
  } else {
    // For standard, originalBaseKey is the lookup key
    if (!state.deletedStarters.includes(originalBaseKey)) {
      state.deletedStarters.push(originalBaseKey);
    }
  }
  saveState();
  renderBrowseList();
};

// API Key Validation Helper
export async function testApiKey(engine, key, statusElId) {
  const statusEl = document.getElementById(statusElId);
  if (!statusEl) return;

  if (!key) {
    statusEl.innerHTML = "";
    return;
  }

  statusEl.innerHTML = `<span style="color: var(--text-secondary);">⏳ Verifying API key...</span>`;

  try {
    let url = "";
    let headers = {};

    if (engine === "openai") {
      url = "https://api.openai.com/v1/models";
      headers = { "Authorization": `Bearer ${key}` };
    } else if (engine === "grok") {
      url = "https://api.x.ai/v1/models";
      headers = { "Authorization": `Bearer ${key}` };
    } else if (engine === "gemini") {
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    } else if (engine === "anthropic") {
      if (!key.startsWith("sk-ant-")) {
        statusEl.innerHTML = `<span style="color: var(--error-color);">❌ Invalid format (must start with sk-ant-)</span>`;
        return;
      }
      statusEl.innerHTML = `<span style="color: #4cc9f0;">⚠️ Cannot verify directly in browser (CORS). Format looks valid!</span>`;
      return;
    }

    const res = await fetch(url, { headers });
    if (res.ok) {
      statusEl.innerHTML = `<span style="color: #4CAF50;">✅ Key is working & valid!</span>`;
    } else {
      let errMsg = "Invalid credentials";
      try {
        const errData = await res.json();
        errMsg = errData.error?.message || errData.error || errMsg;
      } catch (e) {}
      statusEl.innerHTML = `<span style="color: var(--error-color);">❌ Failed: ${errMsg}</span>`;
    }
  } catch (err) {
    statusEl.innerHTML = `<span style="color: var(--error-color);">❌ Network error: ${err.message}</span>`;
  }
}

// Folders Management - Hierarchical Tree Render
export function renderFoldersList() {
  renderDirectoryTree();
}

export function buildTreeHTML(nodes, parentId, depth = 0) {
  const children = nodes.filter(n => n.parentId === parentId);
  if (children.length === 0) return "";
  
  let html = "";
  children.forEach(node => {
    const folderWordCount = getFolderWordCountRecursive(node.id, nodes);
    const isExpanded = state.expandedFolders[node.id] !== false; 
    const isSelected = state.selectedBrowseFolderId === node.id;
    const isStandard = ["verbs", "nouns", "technology", "biology", "phrases"].includes(node.id);
    
    const dragAttr = !isStandard ? `draggable="true" ondragstart="window.onTreeDragStart(event, '${node.id}')"` : "";
    const dropAttr = `ondragover="window.onTreeDragOver(event)" ondragleave="window.onTreeDragLeave(event)" ondrop="window.onTreeDrop(event, '${node.id}')"`;
    
    const subChildren = nodes.filter(n => n.parentId === node.id);
    const hasSub = subChildren.length > 0;
    const arrowClass = isExpanded ? "" : "collapsed";

    html += `
      <div class="tree-node ${isSelected ? 'selected' : ''}" 
           data-id="${node.id}" 
           style="padding-left: ${depth * 20 + 12}px;"
           ${dragAttr}
           ${dropAttr}
           onclick="window.onTreeFolderClick(event, '${node.id}')">
        
        ${hasSub ? `<span class="tree-toggle-arrow ${arrowClass}" onclick="window.onTreeToggleExpand(event, '${node.id}')">▼</span>` : `<span style="width: 18px; display: inline-block;"></span>`}
        
        <span class="tree-icon">${isStandard ? '📚' : '📁'}</span>
        <span class="tree-name">${node.name}</span>
        <span class="tree-count">${folderWordCount}</span>
        
        ${!isStandard ? `
          <div class="tree-actions">
            <button class="tree-action-btn" title="Rename" onclick="window.onTreeRenameFolder(event, '${node.id}')">✏️</button>
            <button class="tree-action-btn" title="Delete" style="color: var(--error-color);" onclick="window.onTreeDeleteFolder(event, '${node.id}')">❌</button>
          </div>
        ` : ""}
      </div>
    `;
    
    if (isExpanded && hasSub) {
      html += buildTreeHTML(nodes, node.id, depth + 1);
    }
  });
  return html;
}

export function getFolderWordCountRecursive(folderId, allFolders) {
  let count = state.customVocab.filter(v => v.category === folderId).length;
  const isStandard = ["verbs", "nouns", "technology", "biology", "phrases"].includes(folderId);
  if (isStandard) {
    const base = state.baseLang || "en";
    count += STARTER_VOCAB_RAW.filter(v => v.category === folderId && !state.deletedStarters.includes(v[base])).length;
  }
  
  const children = allFolders.filter(f => f.parentId === folderId);
  children.forEach(child => {
    count += getFolderWordCountRecursive(child.id, allFolders);
  });
  
  return count;
}

export function getFolderWordsRecursive(folderId) {
  const base = state.baseLang || "en";
  const selectedLang = state.selectedLang || "de";
  const staticFolders = ["verbs", "nouns", "technology", "biology", "phrases"];
  
  let words = [];
  if (staticFolders.includes(folderId)) {
    words = STARTER_VOCAB_RAW.filter(v => v.category === folderId && !state.deletedStarters.includes(v[base])).map(item => {
      let finalEn = item[base];
      let finalTarget = item[selectedLang];
      if (state.editedStarters[item[base]]) {
        finalEn = state.editedStarters[item[base]].en || item[base];
        finalTarget = state.editedStarters[item[base]].target || item[selectedLang];
      }
      return { en: finalEn, target: finalTarget, category: item.category };
    });
  } else {
    words = state.customVocab.filter(v => v.category === folderId).map(item => ({
      en: item[base] || item.en || item.target,
      target: item[selectedLang] || item.target || item.en,
      category: item.category
    }));
    
    const childFolders = state.customFolders.filter(f => f.parentId === folderId);
    childFolders.forEach(child => {
      words = [...words, ...getFolderWordsRecursive(child.id)];
    });
  }
  return words;
}

export function getAllWordsCombined() {
  const base = state.baseLang || "en";
  const selectedLang = state.selectedLang || "de";
  
  const starters = STARTER_VOCAB_RAW.filter(v => !state.deletedStarters.includes(v[base])).map(item => {
    let finalEn = item[base];
    let finalTarget = item[selectedLang];
    if (state.editedStarters[item[base]]) {
      finalEn = state.editedStarters[item[base]].en || item[base];
      finalTarget = state.editedStarters[item[base]].target || item[selectedLang];
    }
    return { en: finalEn, target: finalTarget, category: item.category };
  });
  
  const customs = state.customVocab.map(item => ({
    en: item[base] || item.en || item.target,
    target: item[selectedLang] || item.target || item.en,
    category: item.category
  }));
  
  return [...starters, ...customs];
}

// Drag & Drop Tree handlers
window.onTreeDragOver = function(e) {
  e.preventDefault();
  e.currentTarget.classList.add("drag-over");
};

window.onTreeDragLeave = function(e) {
  e.currentTarget.classList.remove("drag-over");
};

window.onTreeDragStart = function(e, folderId) {
  e.dataTransfer.setData("text/plain", folderId);
};

window.onTreeDrop = function(e, targetId) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  
  const draggedFolderId = e.dataTransfer.getData("text/plain");
  const wordKey = e.dataTransfer.getData("text/word-key");
  
  if (draggedFolderId) {
    if (draggedFolderId === targetId) return;
    if (isDescendantFolder(draggedFolderId, targetId)) {
      alert("Cannot drag a folder into its own subfolder.");
      return;
    }
    
    const folder = state.customFolders.find(f => f.id === draggedFolderId);
    if (folder) {
      folder.parentId = targetId === "root" ? null : targetId;
      saveState();
      renderBrowseList();
    }
  } else if (wordKey) {
    const word = state.customVocab.find(v => v.en === wordKey || v.origEn === wordKey);
    if (word) {
      word.category = targetId;
      saveState();
      renderBrowseList();
    } else {
      const base = state.baseLang || "en";
      const starter = STARTER_VOCAB_RAW.find(v => v[base] === wordKey);
      if (starter) {
        const newWord = JSON.parse(JSON.stringify(starter));
        newWord.category = targetId;
        newWord.isStarter = false;
        state.customVocab.push(newWord);
        state.deletedStarters.push(starter[base]);
        saveState();
        renderBrowseList();
      }
    }
  }
};

window.onTreeToggleExpand = function(e, folderId) {
  e.preventDefault();
  e.stopPropagation();
  if (state.expandedFolders[folderId] === undefined) {
    state.expandedFolders[folderId] = false;
  } else {
    state.expandedFolders[folderId] = !state.expandedFolders[folderId];
  }
  saveState();
  renderDirectoryTree();
};

window.onTreeFolderClick = function(e, folderId) {
  state.selectedBrowseFolderId = folderId;
  saveState();
  renderBrowseList();
};

window.onTreeRenameFolder = function(e, folderId) {
  e.preventDefault();
  e.stopPropagation();
  
  const folder = state.customFolders.find(f => f.id === folderId);
  if (!folder) return;
  
  const overlay = document.getElementById("custom-modal-overlay");
  const icon = document.getElementById("modal-icon");
  const title = document.getElementById("modal-title");
  const msgEl = document.getElementById("modal-message");
  const actions = document.getElementById("modal-actions");

  playSound("sound-popup");

  icon.textContent = "✏️";
  title.textContent = "Rename Folder";
  msgEl.innerHTML = `
    <div class="form-group" style="text-align: left; margin-top: 10px; width: 100%;">
      <label style="font-weight: 600; display: block; margin-bottom: 6px; font-size: 0.85rem; color: var(--text-secondary);">New Folder Name</label>
      <input type="text" id="rename-folder-input" value="${folder.name.replace(/"/g, '&quot;')}" class="custom-select" style="width: 100%; min-height: 40px; padding: 8px 12px; background: rgba(255,255,255,0.03); color: #fff; border: 1px solid var(--border-color); border-radius: 10px;">
    </div>
  `;

  actions.innerHTML = "";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.onclick = () => overlay.classList.remove("active");

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-primary";
  saveBtn.textContent = "Rename";
  saveBtn.onclick = () => {
    const newName = document.getElementById("rename-folder-input").value.trim();
    if (!newName) {
      alert("Folder name cannot be empty.");
      return;
    }
    folder.name = newName;
    saveState();
    renderBrowseList();
    overlay.classList.remove("active");
  };

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  overlay.classList.add("active");
};

window.onTreeDeleteFolder = async function(e, folderId) {
  e.preventDefault();
  e.stopPropagation();
  
  const folder = state.customFolders.find(f => f.id === folderId);
  if (!folder) return;
  
  const confirmDel = await showCustomConfirm(`Are you sure you want to delete the folder "${folder.name}"? All subfolders and words inside it will also be deleted!`);
  if (!confirmDel) return;

  const filename = `${folder.name.replace(/[^a-zA-Z0-9_\-\s]/g, "")}.json`;
  state.activeICloudLists[filename] = false;

  if (state.icloudHandle) {
    try {
      await state.icloudHandle.removeEntry(filename);
    } catch (err) {
      console.warn(`Could not delete file ${filename} from folder:`, err);
    }
  }

  deleteFolderRecursive(folderId);
  
  if (state.selectedBrowseFolderId === folderId) {
    state.selectedBrowseFolderId = null;
    const wordsCard = document.getElementById("browse-words-card");
    if (wordsCard) wordsCard.style.display = "none";
  }

  saveState();
  renderBrowseList();
};

export function deleteFolderRecursive(folderId) {
  state.customVocab = state.customVocab.filter(v => v.category !== folderId);
  const children = state.customFolders.filter(f => f.parentId === folderId);
  children.forEach(child => {
    deleteFolderRecursive(child.id);
  });
  state.customFolders = state.customFolders.filter(f => f.id !== folderId);
}

export function isDescendantFolder(parentFolderId, potentialChildFolderId) {
  let current = state.customFolders.find(f => f.id === potentialChildFolderId);
  while (current && current.parentId) {
    if (current.parentId === parentFolderId) return true;
    current = state.customFolders.find(f => f.id === current.parentId);
  }
  return false;
}

// Statistics View Controller
export function renderStatisticsView() {
  // 1. Render Global Stats
  document.getElementById("stats-total-sessions").textContent = state.history.length;
  
  let globalAccuracy = 0;
  if (state.history.length > 0) {
    const totalScore = state.history.reduce((sum, h) => sum + (h.score || 0), 0);
    const totalTested = state.history.reduce((sum, h) => sum + (h.total || 0), 0);
    if (totalTested > 0) {
      globalAccuracy = Math.round((totalScore / totalTested) * 100);
    }
  }
  document.getElementById("stats-avg-accuracy").textContent = `${globalAccuracy}%`;
  document.getElementById("stats-streak-count").textContent = state.streak;
  document.getElementById("stats-xp-points").textContent = state.xp;

  // 2. Populate folder selection dropdown
  const select = document.getElementById("stats-select-folder");
  if (select) {
    select.innerHTML = '<option value="all">📚 All Words Combined</option>';
    
    // Add standard categories
    const staticFolders = [
      { id: "verbs", name: "🏃 Verbs" },
      { id: "nouns", name: "🍎 Nouns" },
      { id: "technology", name: "💻 Technology" },
      { id: "biology", name: "🌿 Biology" },
      { id: "phrases", name: "💬 Phrases" }
    ];
    staticFolders.forEach(sf => {
      const opt = document.createElement("option");
      opt.value = sf.id;
      opt.textContent = sf.name;
      select.appendChild(opt);
    });

    // Add custom folders sorted by path
    const sorted = (state.customFolders || []).map(f => ({
      id: f.id,
      path: getFolderFullPath(f.id)
    })).sort((a, b) => a.path.localeCompare(b.path));

    sorted.forEach(folder => {
      const opt = document.createElement("option");
      opt.value = folder.id;
      opt.textContent = `📁 ${folder.path}`;
      select.appendChild(opt);
    });
    
    // Bind selection change
    select.onchange = () => {
      renderFolderStatistics();
    };
  }

  // Calculate default selected folder stats
  renderFolderStatistics();
}

export function renderFolderStatistics() {
  const select = document.getElementById("stats-select-folder");
  if (!select) return;
  
  const val = select.value;
  let pool = [];
  if (val === "all") {
    pool = getAllWordsCombined();
  } else {
    pool = getFolderWordsRecursive(val);
  }
  
  const accuracyEl = document.getElementById("stats-folder-accuracy");
  const masteryEl = document.getElementById("stats-folder-mastery");
  const bar = document.getElementById("stats-leitner-bar");
  const hardestList = document.getElementById("stats-hardest-words-list");
  
  if (!accuracyEl || !masteryEl || !bar || !hardestList) return;
  
  let totalAttempts = 0;
  let totalErrors = 0;
  let boxCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let hardest = [];
  
  pool.forEach(word => {
    const stats = state.wordStats[word.en] || { attempts: 0, errors: 0, box: 1 };
    totalAttempts += stats.attempts || 0;
    totalErrors += stats.errors || 0;
    
    const box = stats.box || 1;
    boxCounts[box] = (boxCounts[box] || 0) + 1;
    
    if (stats.errors && stats.errors > 0) {
      hardest.push({ en: word.en, target: word.target, errors: stats.errors });
    }
  });
  
  if (totalAttempts > 0) {
    const accuracy = Math.round(((totalAttempts - totalErrors) / totalAttempts) * 100);
    accuracyEl.textContent = `${accuracy}%`;
    accuracyEl.style.color = accuracy >= 80 ? "#2ecc71" : accuracy >= 50 ? "#ff9f43" : "#ff4b4b";
  } else {
    accuracyEl.textContent = "N/A";
    accuracyEl.style.color = "var(--text-secondary)";
  }
  
  const totalWords = pool.length;
  if (totalWords > 0) {
    const masteredCount = (boxCounts[4] || 0) + (boxCounts[5] || 0);
    const masteryPct = Math.round((masteredCount / totalWords) * 100);
    masteryEl.textContent = `${masteryPct}%`;
  } else {
    masteryEl.textContent = "N/A";
  }
  
  bar.innerHTML = "";
  if (totalWords > 0) {
    const p1 = (boxCounts[1] / totalWords) * 100;
    const p2 = (boxCounts[2] / totalWords) * 100;
    const p3 = (boxCounts[3] / totalWords) * 100;
    const p4 = (boxCounts[4] / totalWords) * 100;
    const p5 = (boxCounts[5] / totalWords) * 100;
    
    bar.innerHTML = `
      <div style="width: ${p1}%; background: #ff4b4b; height: 100%; transition: width 0.3s;" title="Box 1: ${boxCounts[1]} words"></div>
      <div style="width: ${p2}%; background: #ff9f43; height: 100%; transition: width 0.3s;" title="Box 2: ${boxCounts[2]} words"></div>
      <div style="width: ${p3}%; background: #f1c40f; height: 100%; transition: width 0.3s;" title="Box 3: ${boxCounts[3]} words"></div>
      <div style="width: ${p4}%; background: #2ecc71; height: 100%; transition: width 0.3s;" title="Box 4: ${boxCounts[4]} words"></div>
      <div style="width: ${p5}%; background: #00b894; height: 100%; transition: width 0.3s;" title="Box 5: ${boxCounts[5]} words"></div>
    `;
  }
  
  hardestList.innerHTML = "";
  if (hardest.length > 0) {
    hardest.sort((a, b) => b.errors - a.errors);
    const top5 = hardest.slice(0, 5);
    top5.forEach(w => {
      const li = document.createElement("li");
      li.style.marginBottom = "4px";
      li.innerHTML = `<strong>${w.en}</strong> (${w.target}) &mdash; <span style="color:var(--error-color); font-weight:600;">${w.errors} errors</span>`;
      hardestList.appendChild(li);
    });
  } else {
    hardestList.innerHTML = `<li style="list-style:none; margin-left:-18px; color:var(--text-secondary);">No errors recorded yet! Keep it up.</li>`;
  }

  // 3. Render Word-by-Word Statistics Table
  const wordsTbody = document.getElementById("stats-words-table-body");
  if (wordsTbody) {
    wordsTbody.innerHTML = "";
    if (pool.length === 0) {
      wordsTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:15px; color:var(--text-secondary);">No words in this category.</td></tr>`;
    } else {
      pool.forEach(word => {
        const stats = state.wordStats[word.origEn || word.en] || { attempts: 0, errors: 0 };
        const corrects = (stats.attempts || 0) - (stats.errors || 0);
        const falses = stats.errors || 0;
        
        let ratioText = "N/A";
        let ratioColor = "var(--text-secondary)";
        if (stats.attempts > 0) {
          const ratio = Math.round((corrects / stats.attempts) * 100);
          ratioText = `${ratio}%`;
          ratioColor = ratio >= 80 ? "#2ecc71" : ratio >= 50 ? "#ff9f43" : "#ff4b4b";
        }
        
        let difficultyScore = stats.difficulty;
        if (difficultyScore === undefined) {
          difficultyScore = 50;
        } else if (difficultyScore === "easy") {
          difficultyScore = 20;
        } else if (difficultyScore === "medium") {
          difficultyScore = 50;
        } else if (difficultyScore === "hard") {
          difficultyScore = 80;
        }

        let diffColor = "#2ecc71";
        let diffBg = "rgba(46, 204, 113, 0.1)";
        if (difficultyScore > 70) {
          diffColor = "#e74c3c";
          diffBg = "rgba(231, 76, 60, 0.1)";
        } else if (difficultyScore > 30) {
          diffColor = "#f1c40f";
          diffBg = "rgba(241, 196, 15, 0.1)";
        }
        
        const diffBadge = `<span class="badge" style="background: ${diffBg}; color: ${diffColor}; font-size: 0.75rem; border-radius: 6px; padding: 3px 8px; font-weight: 700;">${difficultyScore}%</span>`;
        
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.04)";
        tr.innerHTML = `
          <td style="padding: 10px; font-weight: 600; color: #fff;">${word.en}</td>
          <td style="padding: 10px; color: var(--text-secondary);">${word.target || word[state.selectedLang] || ""}</td>
          <td style="padding: 10px; text-align: center;">${diffBadge}</td>
          <td style="padding: 10px; text-align: center; color: #2ecc71; font-weight: 600;">${corrects}</td>
          <td style="padding: 10px; text-align: center; color: #ff4b4b; font-weight: 600;">${falses}</td>
          <td style="padding: 10px; text-align: center; color: ${ratioColor}; font-weight: 700;">${ratioText}</td>
        `;
        wordsTbody.appendChild(tr);
      });
    }
  }
}


// Unified LLM Requester Helper (Gemini, OpenAI, Grok)
export async function callLLM(prompt, systemInstruction = "You are a helpful language translation assistant.") {
  let key = "";
  let url = "";
  let headers = {};
  let body = {};
  
  if (state.geminiKey) {
    key = state.geminiKey;
    url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
    headers = { "Content-Type": "application/json" };
    body = {
      contents: [{ parts: [{ text: `${systemInstruction}\n\nUser request:\n${prompt}` }] }]
    };
  } else if (state.openaiKey) {
    key = state.openaiKey;
    url = "https://api.openai.com/v1/chat/completions";
    headers = {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    };
    body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ]
    };
  } else if (state.grokKey) {
    key = state.grokKey;
    url = "https://api.x.ai/v1/chat/completions";
    headers = {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    };
    body = {
      model: await getGrokModel(key),
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ]
    };
  } else if (state.anthropicKey) {
    // Fallback or warning if they only have Anthropic (blocked by CORS client-side)
    throw new Error("Anthropic API calls cannot be performed directly from browser client-side due to CORS limitations. Please configure Gemini or OpenAI key.");
  } else {
    throw new Error("No API Key configured. Please go to Setup & API to configure one.");
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || errorData.error || `HTTP error ${res.status}`);
  }

  const data = await res.json();
  if (state.geminiKey) {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    return data.choices?.[0]?.message?.content || "";
  }
}

// Update direction button labels dynamically based on selected base and target languages
export function updateDirectionButtonsUI() {
  const btnForward = document.getElementById("btn-direction-forward");
  const btnReverse = document.getElementById("btn-direction-reverse");
  const btnConjugation = document.getElementById("btn-direction-conjugation");
  if (!btnForward || !btnReverse) return;

  const baseLang = state.baseLang || "en";
  const targetLang = state.selectedLang || "de";

  const flags = {
    en: getFlagHtml("en"),
    de: getFlagHtml("de"),
    it: getFlagHtml("it"),
    es: getFlagHtml("es"),
    fr: getFlagHtml("fr")
  };

  const names = {
    en: "English",
    de: "German",
    it: "Italian",
    es: "Spanish",
    fr: "French"
  };

  const baseFlag = flags[baseLang] || "🌐";
  const baseName = names[baseLang] || baseLang.toUpperCase();
  const targetFlag = flags[targetLang] || "🌐";
  const targetName = names[targetLang] || targetLang.toUpperCase();

  btnForward.innerHTML = `➡️ ${baseFlag} ${baseName} &rarr; ${targetFlag} ${targetName}`;
  btnReverse.innerHTML = `⬅️ ${targetFlag} ${targetName} &rarr; ${baseFlag} ${baseName}`;
  if (btnConjugation) {
    if (targetLang === "en") {
      btnConjugation.style.display = "none";
      if (state.testDirection === "conjugation") {
        state.testDirection = "forward";
        btnForward.classList.add("active");
        btnReverse.classList.remove("active");
        btnConjugation.classList.remove("active");
        saveState();
      }
    } else {
      btnConjugation.style.display = "";
      btnConjugation.innerHTML = `🎯 Conjugate (${targetFlag} ${targetName})`;
    }
  }
}

// Dynamically fetch available models from xAI to prevent model not found errors
export async function getGrokModel(key) {
  try {
    const res = await fetch("https://api.x.ai/v1/models", {
      headers: { "Authorization": `Bearer ${key}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        // Find the first model that contains "grok" (preferring chat/text models)
        const found = data.data.find(m => m.id.toLowerCase().includes("grok") && !m.id.toLowerCase().includes("vision") && !m.id.toLowerCase().includes("imagine"));
        if (found) return found.id;
      }
    }
  } catch (e) {
    console.error("Failed to dynamically resolve grok models:", e);
  }
  return "grok-beta"; // Fallback to grok-beta if listing models fails
}

// Load and populate on-device free voices
export function loadOnDeviceVoices() {
  if (!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  const langs = ["en", "de", "it", "es", "fr"];

  langs.forEach(lang => {
    const select = document.getElementById(`voice-select-${lang}`);
    if (!select) return;

    const previousValue = select.value || state.customVoices?.[lang] || "default";
    select.innerHTML = "";

    // Default option
    const defOpt = document.createElement("option");
    defOpt.value = "default";
    defOpt.textContent = "Automatic / Best Match";
    select.appendChild(defOpt);

    const targetLocale = (LANG_LOCALES[lang] || "en-US").toLowerCase().replace('_', '-');
    
    const matching = voices.filter(v => {
      const vLang = v.lang.toLowerCase().replace('_', '-');
      return vLang === targetLocale || vLang.startsWith(targetLocale.split('-')[0]);
    });

    matching.forEach(voice => {
      const opt = document.createElement("option");
      opt.value = voice.name;
      opt.textContent = `${voice.name} (${voice.lang})`;
      select.appendChild(opt);
    });

    // Re-select active choice
    select.value = previousValue;
  });
}

// Test speech synthesizer voice selection
window.testSelectedVoice = function(lang) {
  if (!('speechSynthesis' in window)) {
    alert("Speech synthesis is not supported on this browser.");
    return;
  }

  const select = document.getElementById(`voice-select-${lang}`);
  if (!select) return;

  const testPhrases = {
    en: "Hello! This is a test of your selected English voice.",
    de: "Hallo! Dies ist ein Test Ihrer ausgewählten deutschen Stimme.",
    it: "Ciao! Questo è un test della tua voce italiana selezionata.",
    es: "¡Hola! Esta es una prueba de tu voz en español seleccionada.",
    fr: "Bonjour! Ceci est un test de votre voix française sélectionnée."
  };

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(testPhrases[lang] || "Test");
  utterance.lang = LANG_LOCALES[lang] || "en-US";

  const selectedVoiceName = select.value;
  if (selectedVoiceName && selectedVoiceName !== "default") {
    const voices = window.speechSynthesis.getVoices();
    const found = voices.find(v => v.name === selectedVoiceName);
    if (found) utterance.voice = found;
  } else {
    const best = getBestVoice(lang);
    if (best) utterance.voice = best;
  }

  window.speechSynthesis.speak(utterance);
};

// Bind speech voices updated events and handle async voice loading in desktop browsers
if ('speechSynthesis' in window) {
  // Pre-trigger to initialize voice retrieval in Chrome/Edge
  window.speechSynthesis.getVoices();
  
  window.speechSynthesis.onvoiceschanged = () => {
    loadOnDeviceVoices();
  };

  // Multiple safety timers to handle lazy loaded voices
  setTimeout(loadOnDeviceVoices, 100);
  setTimeout(loadOnDeviceVoices, 500);
  setTimeout(loadOnDeviceVoices, 1000);
  setTimeout(loadOnDeviceVoices, 2500);
}

import {
  initBackupFile,
  onBackupFileAccessGranted,
  initICloudSync,
  selectICloudFolder,
  onICloudFolderAccessGranted,
  syncICloudFolder,
  saveWordlistToICloud,
  getSyncApiUrl,
  updateCloudSyncUI,
  getSanitizedSyncPayload,
  pushToCloud,
  pullFromCloud,
  generateCloudSyncCode,
  linkCloudSyncDevice,
  unlinkCloudSyncDevice,
  connectGitHubGist,
  pushToGitHubGist,
  pullFromGitHubGist,
  loadCloudWordSets,
  uploadActiveVocabToCloud
} from './sync.js';

window.initBackupFile = initBackupFile;
window.onBackupFileAccessGranted = onBackupFileAccessGranted;
window.initICloudSync = initICloudSync;
window.selectICloudFolder = selectICloudFolder;
window.onICloudFolderAccessGranted = onICloudFolderAccessGranted;
window.syncICloudFolder = syncICloudFolder;
window.saveWordlistToICloud = saveWordlistToICloud;
window.updateCloudSyncUI = updateCloudSyncUI;
window.pushToCloud = pushToCloud;
window.pullFromCloud = pullFromCloud;
window.generateCloudSyncCode = generateCloudSyncCode;
window.linkCloudSyncDevice = linkCloudSyncDevice;
window.unlinkCloudSyncDevice = unlinkCloudSyncDevice;
window.connectGitHubGist = connectGitHubGist;
window.pushToGitHubGist = pushToGitHubGist;
window.pullFromGitHubGist = pullFromGitHubGist;


