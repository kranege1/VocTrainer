// VocTrainer - State & Storage Module

export let state = {
  xp: 0,
  streak: 0,
  hearts: 5,
  level: 1,
  baseLang: "en",
  selectedLang: "en", 
  customVocab: [], 
  mistakes: [], 
  openaiKey: "",
  grokKey: "",
  geminiKey: "",
  anthropicKey: "",
  audioEngine: "browser", // browser or openai
  allowSynonyms: true, // Allow similar words/synonyms
  questionTimer: 0, // Per-question timer limit (0, 5, 10, 15)
  history: [], // Completed tests history
  deletedStarters: [], // Deleted starter vocab terms
  deletedCustomVocab: [], // Deleted custom vocab terms: [{ category, en, lastUpdated }]
  editedStarters: {}, // Edited starter vocab terms overrides
  customFolders: [], // Custom folder objects: [{ id, name, parentId }]
  expandedFolders: {}, // Toggle expand/collapse states for custom directories: { [id]: boolean }
  selectedBrowseFolderId: null, // Selected folder id to view
  editingWordKey: null, // Holds key of word currently being edited
  isEditingCustom: null, // Tracks if currently edited word is custom
  wordStats: {}, // Spaced Repetition / Leitner stats: { wordEn: { attempts, errors, box, lastReview } }
  testDirection: "forward", // forward (base -> target) or reverse (target -> base)
  customVoices: {}, // Selected free local system voices for each language key: { en: "Voice Name", ... }
  activeICloudLists: {}, // Sync status of files in directory: { "filename.json": boolean }
  dictionaryCache: {}, // Central dictionary cache mapping English base word to details: synonyms, conjugations, sentences, etc.
  cloudSyncId: "", // Code used for easy multi-device Cloud Sync (JsonBlob / ExtendsClass ID)
  syncProvider: "easy", // "easy" (ExtendsClass) or "github" (GitHub Gist)
  githubToken: "", // Personal Access Token for Gist Sync
  githubGistId: "", // Gist ID for Gist Sync
  lastSelectedCategory: "none",
  lastSelectedCustomCategory: "none",

  // Current active test state
  currentTest: {
    words: [],
    index: 0,
    wrongAnswers: [],
    isRepeatRound: false,
    correctCount: 0,
    totalOriginalCount: 0,
    selectedMode: "typing" 
  }
};

// Save state to LocalStorage
export function saveState() {
  localStorage.setItem("voctrainer_state", JSON.stringify({
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
    activeICloudLists: state.activeICloudLists,
    dictionaryCache: state.dictionaryCache,
    cloudSyncId: state.cloudSyncId,
    syncProvider: state.syncProvider,
    githubToken: state.githubToken,
    githubGistId: state.githubGistId,
    lastSelectedCategory: state.lastSelectedCategory,
    lastSelectedCustomCategory: state.lastSelectedCustomCategory
  }));
  if (window.updateHeaderUI) window.updateHeaderUI();
  updateCategoryCounts();
}

// Helper to synchronize custom folders with categories used in customVocab
export function syncCustomFolders() {
  if (!state.customVocab) return;
  const vocabCategories = [...new Set(state.customVocab.map(v => v.category).filter(Boolean))];
  const staticFolders = ["verbs", "nouns", "technology", "biology", "phrases"];
  
  vocabCategories.forEach(cat => {
    if (!staticFolders.includes(cat)) {
      const exists = state.customFolders.some(f => f.id === cat || f.name === cat);
      if (!exists) {
        state.customFolders.push({
          id: cat,
          name: cat,
          parentId: null
        });
      }
    }
  });
}

// Load state from LocalStorage
export function loadState() {
  const data = localStorage.getItem("voctrainer_state");
  if (data) {
    const parsed = JSON.parse(data);
    state.xp = parsed.xp || 0;
    state.streak = parsed.streak || 0;
    state.hearts = parsed.hearts !== undefined ? parsed.hearts : 5;
    state.level = parsed.level || 1;
    state.customVocab = parsed.customVocab || [];
    state.mistakes = parsed.mistakes || [];
    state.openaiKey = parsed.openaiKey || "";
    state.grokKey = parsed.grokKey || "";
    state.geminiKey = parsed.geminiKey || "";
    state.anthropicKey = parsed.anthropicKey || "";
    state.audioEngine = parsed.audioEngine || "browser";
    state.allowSynonyms = parsed.allowSynonyms !== undefined ? parsed.allowSynonyms : true;
    state.questionTimer = parsed.questionTimer || 0;
    state.baseLang = parsed.baseLang || "en";
    state.selectedLang = parsed.selectedLang || "de";
    state.history = parsed.history || [];
    state.deletedStarters = parsed.deletedStarters || [];
    state.deletedCustomVocab = parsed.deletedCustomVocab || [];
    state.editedStarters = parsed.editedStarters || {};
    state.customFolders = (parsed.customFolders || []).map(f => {
      if (typeof f === "string") {
        return { id: f, name: f, parentId: null };
      }
      return f;
    });
    
    // Auto-recreate missing custom folders from vocab categories
    syncCustomFolders();

    state.expandedFolders = parsed.expandedFolders || {};
    state.selectedBrowseFolderId = parsed.selectedBrowseFolderId || null;
    state.wordStats = parsed.wordStats || {};
    state.testDirection = parsed.testDirection || "forward";
    state.customVoices = parsed.customVoices || {};
    state.activeICloudLists = parsed.activeICloudLists || {};
    state.dictionaryCache = parsed.dictionaryCache || {};
    state.cloudSyncId = parsed.cloudSyncId || "";
    state.syncProvider = parsed.syncProvider || "easy";
    state.githubToken = parsed.githubToken || "";
    state.githubGistId = parsed.githubGistId || "";
    state.lastSelectedCategory = parsed.lastSelectedCategory || "none";
    state.lastSelectedCustomCategory = parsed.lastSelectedCustomCategory || "none";

    // Permanently remove obsolete base64 audio data from custom vocab to clear storage
    if (state.customVocab && Array.isArray(state.customVocab)) {
      let cleaned = false;
      state.customVocab.forEach(item => {
        if (item.audio) {
          delete item.audio;
          cleaned = true;
        }
      });
      if (cleaned) {
        saveState();
        console.log("Cleanup: Obsolete base64 audio recordings permanently cleared from local storage.");
      }
    }

    // Prefill Setup fields
    const openAiKeyEl = document.getElementById("setup-openai-key");
    if (openAiKeyEl) openAiKeyEl.value = state.openaiKey;
    const grokKeyEl = document.getElementById("setup-grok-key");
    if (grokKeyEl) grokKeyEl.value = state.grokKey;
    const qTimerEl = document.getElementById("setup-question-timer");
    if (qTimerEl) qTimerEl.value = state.questionTimer;
    const geminiKeyEl = document.getElementById("setup-gemini-key");
    if (geminiKeyEl) geminiKeyEl.value = state.geminiKey;
    const anthropicKeyEl = document.getElementById("setup-anthropic-key");
    if (anthropicKeyEl) anthropicKeyEl.value = state.anthropicKey;
    const audioEngineEl = document.getElementById("select-audio-engine");
    if (audioEngineEl) audioEngineEl.value = state.audioEngine;
    const allowSynonymsEl = document.getElementById("setup-allow-synonyms");
    if (allowSynonymsEl) allowSynonymsEl.checked = state.allowSynonyms;
    const baseLangEl = document.getElementById("setup-base-lang");
    if (baseLangEl) baseLangEl.value = state.baseLang;

    if (state.openaiKey && window.testApiKey) window.testApiKey("openai", state.openaiKey, "setup-openai-status");
    if (state.grokKey && window.testApiKey) window.testApiKey("grok", state.grokKey, "setup-grok-status");
    if (state.geminiKey && window.testApiKey) window.testApiKey("gemini", state.geminiKey, "setup-gemini-status");
    if (state.anthropicKey && window.testApiKey) window.testApiKey("anthropic", state.anthropicKey, "setup-anthropic-status");

    document.querySelectorAll(".lang-btn").forEach(b => {
      b.classList.remove("active");
      if (b.dataset.lang === state.selectedLang) b.classList.add("active");
    });

    document.querySelectorAll("#test-direction-selector .seg-btn").forEach(btn => {
      btn.classList.remove("active");
      if (btn.dataset.direction === state.testDirection) btn.classList.add("active");
    });
    if (window.updateDirectionButtonsUI) window.updateDirectionButtonsUI();
    if (window.loadOnDeviceVoices) window.loadOnDeviceVoices();
  }
  if (window.updateHeaderUI) window.updateHeaderUI();
  if (window.renderImportedList) window.renderImportedList();
  if (window.renderMistakesList) window.renderMistakesList();
  if (window.renderHistoryList) window.renderHistoryList();
  updateCategoryCounts();
  if (window.updateCloudSyncUI) window.updateCloudSyncUI();
}

export function getFolderFullPath(folderId) {
  const folder = state.customFolders.find(f => f.id === folderId);
  if (!folder) return folderId;
  if (folder.parentId) {
    return getFolderFullPath(folder.parentId) + " › " + folder.name;
  }
  return folder.name;
}

export function updateCategoryCounts() {
  const selectCategory = document.getElementById("select-category");
  const selectCustomCategory = document.getElementById("select-custom-category");
  if (!selectCategory) return;

  const language = state.selectedLang || "it";
  const base = state.baseLang || "en";
  const starterVocabRaw = window.STARTER_VOCAB_RAW || [];

  // Calculate full vocabulary pool
  const starters = starterVocabRaw.map(item => {
    const origEn = item[base];
    const origTarget = item[language];
    if (state.deletedStarters.includes(origEn)) return null;
    
    let finalEn = origEn;
    let finalTarget = origTarget;
    if (state.editedStarters[origEn]) {
      finalEn = state.editedStarters[origEn].en || origEn;
      finalTarget = state.editedStarters[origEn].target || origTarget;
    }
    
    return {
      en: finalEn,
      target: finalTarget,
      category: item.category
    };
  }).filter(Boolean);

  const customs = (state.customVocab || [])
    .filter(item => item[base] && item[language] && item[base].toLowerCase().trim() !== item[language].toLowerCase().trim())
    .map(item => ({
      en: item[base],
      target: item[language],
      category: item.category
    }));

  let pool = [...starters, ...customs];
  pool = pool.filter(w => w.en && w.target && w.en.toLowerCase().trim() !== w.target.toLowerCase().trim());

  // Count by standard category
  const counts = { all: pool.length, verbs: 0, nouns: 0, adjectives: 0, travel: 0, food: 0, technology: 0, biology: 0, phrases: 0 };
  pool.forEach(w => {
    const cat = (w.category || "").toLowerCase();
    if (counts[cat] !== undefined) {
      counts[cat]++;
    }
  });

  // Update Standard Category selector options text
  const optionLabels = {
    all: `📚 All Categories (${counts.all})`,
    verbs: `🏃 Verbs (${counts.verbs})`,
    nouns: `🍎 Nouns (${counts.nouns})`,
    adjectives: `🎨 Adjectives (${counts.adjectives})`,
    travel: `✈️ Travel (${counts.travel})`,
    food: `🍕 Food (${counts.food})`,
    technology: `💻 Technology (${counts.technology})`,
    biology: `🌿 Biology (${counts.biology})`,
    phrases: `💬 Phrases (${counts.phrases})`
  };

  Array.from(selectCategory.options).forEach(opt => {
    if (optionLabels[opt.value]) {
      opt.textContent = optionLabels[opt.value];
    }
  });

  // Update Custom Category dropdown options with counts
  if (selectCustomCategory) {
    selectCustomCategory.innerHTML = '<option value="none">✨ -- Select Custom Set --</option>';
    const sorted = (state.customFolders || []).map(f => {
      const folderWords = (state.customVocab || []).filter(v => v.category === f.id && v[base] && v[language] && v[base].toLowerCase().trim() !== v[language].toLowerCase().trim());
      return {
        id: f.id,
        path: getFolderFullPath(f.id),
        count: folderWords.length
      };
    }).sort((a, b) => a.path.localeCompare(b.path));

    sorted.forEach(folder => {
      const opt = document.createElement("option");
      opt.value = folder.id;
      opt.textContent = `📁 ${folder.path} (${folder.count})`;
      selectCustomCategory.appendChild(opt);
    });
  }

  // Update Cloud Upload Category dropdown
  const selectCloudUploadCategory = document.getElementById("select-cloud-upload-category");
  if (selectCloudUploadCategory) {
    selectCloudUploadCategory.innerHTML = '<option value="all">📚 Entire Custom Vocabulary</option>';
    const sortedCloud = (state.customFolders || []).map(f => ({
      id: f.id,
      path: getFolderFullPath(f.id)
    })).sort((a, b) => a.path.localeCompare(b.path));

    sortedCloud.forEach(folder => {
      const opt = document.createElement("option");
      opt.value = folder.id;
      opt.textContent = `📁 ${folder.path}`;
      selectCloudUploadCategory.appendChild(opt);
    });
  }

  // Restore last selected category values
  if (state.lastSelectedCategory !== undefined && selectCategory) {
    selectCategory.value = state.lastSelectedCategory;
  }
  if (state.lastSelectedCustomCategory !== undefined && selectCustomCategory) {
    selectCustomCategory.value = state.lastSelectedCustomCategory;
  }
}

export function getFlagHtml(lang) {
  const map = { en: "gb", de: "de", it: "it", es: "es", fr: "fr" };
  const code = map[lang] || "gb";
  return `<img src="https://flagcdn.com/16x12/${code}.png" width="16" height="12" alt="${lang}" data-lang="${lang}" class="flag-icon-tts" style="vertical-align: middle; margin-right: 4px; box-shadow: 0 0 2px rgba(0,0,0,0.5); cursor: pointer;" title="Click to listen">`;
}
