// VocTrainer - Event Listeners & Initialization Module
import { state, saveState, loadState, getFolderFullPath, updateCategoryCounts, getFlagHtml } from './state.js';
import { startTestSession, renderQuestion, selectOption, submitTypingAnswer, submitConjugationAnswer, nextQuestion, finishTestSession, quitTestSession, speakCurrentTestWord, repeatMistakes, submitAnswer, toggleListening } from './test-runner.js';
import { executeCSVImport } from './sync.js';

// Window proxy shims — init.js is a module and cannot access app.js scope directly.
// These shims forward calls to the functions assigned to window by app.js.
const playSound                 = (...args) => window.playSound?.(...args);
const playCustomAudio           = (...args) => window.playCustomAudio?.(...args);
const showView                  = (...args) => window.showView?.(...args);
const showCustomAlert           = (...args) => window.showCustomAlert?.(...args);
const showCustomConfirm         = (...args) => window.showCustomConfirm?.(...args);
const loadStarterVocab          = (...args) => window.loadStarterVocab?.(...args);
const loadFrequencyLists        = (...args) => window.loadFrequencyLists?.(...args);
const initICloudSync            = (...args) => window.initICloudSync?.(...args);
const initBackupFile            = (...args) => window.initBackupFile?.(...args);
const renderMistakesList        = (...args) => window.renderMistakesList?.(...args);
// const renderHistoryList         = (...args) => window.renderHistoryList?.(...args);
const renderImportedList        = (...args) => window.renderImportedList?.(...args);
const stopQuickTranslateSpeech  = (...args) => window.stopQuickTranslateSpeech?.(...args);
const runQuickTranslate         = (...args) => window.runQuickTranslate?.(...args);
const normalizeWordCasing       = (...args) => window.normalizeWordCasing?.(...args);
const sanitizeWordTranslation   = (...args) => window.sanitizeWordTranslation?.(...args);
const addCustomWord             = (...args) => window.addCustomWord?.(...args);
const detectLanguage            = (...args) => window.detectLanguage?.(...args);
const translateAndDetectWithAI  = (...args) => window.translateAndDetectWithAI?.(...args);
const fillMissingTranslations   = (...args) => window.fillMissingTranslations?.(...args);
const handleFileSelect          = (...args) => window.handleFileSelect?.(...args);
const callLLM                   = (...args) => window.callLLM?.(...args);
const testApiKey                = (...args) => window.testApiKey?.(...args);
const updateDirectionButtonsUI  = (...args) => window.updateDirectionButtonsUI?.(...args);
const speakWord                 = (...args) => window.speakWord?.(...args);
const startQuickTranslateSpeech  = (...args) => window.startQuickTranslateSpeech?.(...args);
const toggleQuickTranslateSpeech = (...args) => window.toggleQuickTranslateSpeech?.(...args);
const saveQuickTranslateWord     = (...args) => window.saveQuickTranslateWord?.(...args);
const getWordDetails             = (...args) => window.getWordDetails?.(...args);
const buildTreeHTML             = (...args) => window.buildTreeHTML?.(...args);
const getLangColor              = (...args) => window.getLangColor?.(...args);
const isCommonWord              = (...args) => window.isCommonWord?.(...args);

// ==========================================
// 8. Event Listeners & Initialization
// ==========================================
export async function initApp() {
  // Add iOS class to body if running on iPhone/iPad/iPod
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    document.body.classList.add('device-ios');
  }

  await loadStarterVocab();
  await loadFrequencyLists();
  loadState();
  await initICloudSync();
  await initBackupFile();

  // Close speech overlay when clicking the background
  const speechOverlay = document.getElementById("conjugation-speech-overlay");
  if (speechOverlay) {
    speechOverlay.onclick = (e) => {
      if (e.target === speechOverlay) {
        window.stopSpeechQueue();
      }
    };
  }

  // Quick Translate Button Click Handlers
  const quickMicBtn = document.getElementById("btn-quick-translate-mic");
  if (quickMicBtn) {
    quickMicBtn.onclick = toggleQuickTranslateSpeech;
  }
  const quickBackBtn = document.getElementById("btn-quick-translate-back");
  if (quickBackBtn) {
    quickBackBtn.onclick = () => showView("view-dashboard");
  }
  const quickLangSelect = document.getElementById("quick-translate-lang");
  if (quickLangSelect) {
    quickLangSelect.onchange = () => {
      stopQuickTranslateSpeech();
      
      // Save last selected language
      state.quickTranslateLastLang = quickLangSelect.value;
      saveState();
      
      const display = document.getElementById("quick-translate-input-display");
      if (display) display.textContent = "...";
      const grid = document.getElementById("quick-translate-results");
      if (grid) grid.innerHTML = "";
      // Restart speech engine with new language after brief delay
      setTimeout(startQuickTranslateSpeech, 300);
    };
  }
  
  const quickSaveBtn = document.getElementById("btn-quick-translate-save");
  if (quickSaveBtn) {
    quickSaveBtn.onclick = saveQuickTranslateWord;
  }
  
  const quickSaveFolderSelect = document.getElementById("quick-translate-save-folder");
  if (quickSaveFolderSelect) {
    quickSaveFolderSelect.onchange = () => {
      state.quickTranslateLastFolder = quickSaveFolderSelect.value;
      saveState();
    };
  }

  const handleManualTranslate = () => {
    const inputEl = document.getElementById("quick-translate-text-input");
    if (!inputEl) return;
    const val = inputEl.value.trim();
    if (!val) return;
    
    stopQuickTranslateSpeech();
    
    const display = document.getElementById("quick-translate-input-display");
    if (display) {
      const folderId = document.getElementById("quick-translate-save-folder")?.value || "nouns";
      const speakLang = document.getElementById("quick-translate-lang")?.value || "en";
      display.textContent = normalizeWordCasing(val, speakLang, folderId) || "...";
    }
    
    runQuickTranslate(val);
    inputEl.value = "";
  };

  const quickSubmitBtn = document.getElementById("btn-quick-translate-submit");
  if (quickSubmitBtn) {
    quickSubmitBtn.onclick = handleManualTranslate;
  }
  const quickTextInput = document.getElementById("quick-translate-text-input");
  if (quickTextInput) {
    quickTextInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        handleManualTranslate();
      }
    };
  }

  const quickCopyBtn = document.getElementById("btn-quick-translate-copy");
  if (quickCopyBtn) {
    quickCopyBtn.onclick = () => {
      const display = document.getElementById("quick-translate-input-display");
      if (display) {
        const text = display.textContent.trim();
        if (text && text !== "...") {
          navigator.clipboard.writeText(text).then(() => {
            showCustomAlert("📋 Copied to clipboard!");
          }).catch(err => {
            console.error("Failed to copy text:", err);
          });
        }
      }
    };
  }

  // Navigation Links
  const goQuickBtn = document.getElementById("btn-go-quick-translate");
  if (goQuickBtn) {
    goQuickBtn.onclick = () => showView("view-quick-translate");
  }
  document.getElementById("btn-go-import").onclick = () => showView("view-import");
  document.getElementById("btn-go-mistakes").onclick = () => showView("view-mistakes");
  document.getElementById("btn-go-setup").onclick = () => showView("view-setup");
  document.getElementById("btn-go-api").onclick = () => showView("view-api");
  document.getElementById("btn-go-statistics").onclick = () => showView("view-statistics");
  if (document.getElementById("btn-go-grammar")) {
    document.getElementById("btn-go-grammar").onclick = () => showView("view-grammar");
  }
  
  document.getElementById("btn-import-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-mistakes-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-setup-back").onclick = () => showView("view-dashboard");
  document.getElementById("btn-api-back").onclick = () => showView("view-setup");
  document.getElementById("btn-statistics-back").onclick = () => showView("view-dashboard");
  if (document.getElementById("btn-grammar-back")) {
    document.getElementById("btn-grammar-back").onclick = () => showView("view-setup");
  }
  document.getElementById("btn-report-home").onclick = () => showView("view-dashboard");

  // Grammar Search listeners
  const searchInput = document.getElementById("grammar-search");
  const clearBtn = document.getElementById("btn-clear-grammar-search");
  if (searchInput) {
    searchInput.oninput = (e) => {
      if (grammarGuideData) {
        renderGrammarGuide(grammarGuideData, e.target.value);
      }
    };
  }
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (searchInput) {
        searchInput.value = "";
        if (grammarGuideData) {
          renderGrammarGuide(grammarGuideData);
        }
      }
    };
  }

  // Global Flag Icon Click -> Speak TTS
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (target && target.tagName === "IMG" && target.src && target.src.includes("flagcdn.com")) {
      const lang = target.dataset.lang || target.getAttribute("alt");
      if (!lang) return;

      let text = "";

      // 1. Check if there's a strong/span/em/text next sibling
      let sibling = target.nextElementSibling || target.nextSibling;
      if (sibling) {
        const sibText = sibling.textContent.trim();
        if (sibText) {
          text = sibText;
        }
      }

      // 2. If sibling text is empty, check parent text content (and clean it)
      if (!text) {
        const parent = target.parentElement;
        if (parent) {
          if (parent.classList.contains("sidebar-brand") || parent.classList.contains("user-badge")) {
            return;
          }
          const clone = parent.cloneNode(true);
          // Remove images, badges, icons, buttons, voice helpers
          clone.querySelectorAll("img, .badge, .icon, button, .btn-close, .voice-btn-inline").forEach(el => el.remove());
          text = clone.textContent.trim();
        }
      }

      if (text) {
        // Clean up formatting
        text = text.replace(/^[→\s\-\u2192]+/, ""); // Remove arrow indicators
        text = text.split("(")[0].split("[")[0].split("/")[0].trim(); // Remove translations/alternatives
        text = text.replace(/[“”"']/g, "").trim(); // Remove quotes

        const skipWords = ["en", "de", "it", "es", "fr", "gb", "english", "german", "italiano", "italian", "spanish", "french"];
        if (skipWords.includes(text.toLowerCase())) {
          return;
        }

        if (text) {
          speakWord(text, lang, 1.0);
        }
      }
    }
  });

  function quitAndSaveTestSession() {
    if (window.questionTimerInterval) {
      clearInterval(window.questionTimerInterval);
      window.questionTimerInterval = null;
    }
    const tState = state.currentTest;
    if (tState && tState.index > 0 && !tState.isRepeatRound) {
      const completedCount = tState.index;
      const accuracy = Math.round((tState.correctCount / completedCount) * 100);
      const selCatEl = document.getElementById("select-category");
      const category = selCatEl ? selCatEl.value : "custom";
      
      state.history.push({
        date: new Date().toLocaleDateString(),
        lang: state.selectedLang.toUpperCase(),
        category: category,
        total: completedCount,
        correct: tState.correctCount,
        accuracy: accuracy,
        points: tState.points || 0,
        isPartial: true
      });
      
      saveState();
      renderHistoryList();
    }
  }

  // Sidebar Nav Tab Event Listeners (Prompt to quit test session if active)
  document.querySelectorAll(".sidebar-nav .nav-item").forEach(btn => {
    btn.onclick = async (e) => {
      e.preventDefault();
      const targetView = btn.dataset.view;
      
      const testView = document.getElementById("view-test");
      if (testView && testView.classList.contains("active")) {
        const quitConfirmed = await showCustomConfirm("Are you sure you want to quit this training session?");
        if (!quitConfirmed) {
          return;
        }
        quitAndSaveTestSession();
      }
      
      showView(targetView);
      
      if (targetView === "view-browse") {
        renderBrowseList();
      } else if (targetView === "view-mistakes") {
        renderMistakesList();
      } else if (targetView === "view-import") {
        state.editingWordKey = null;
        state.isEditingCustom = null;
        const submitBtn = document.getElementById("btn-manual-submit");
        if (submitBtn) submitBtn.textContent = "💾 Save Custom Word";
        const header = document.querySelector("#tab-manual h3");
        if (header) header.textContent = "✏️ Add Custom (Manual)";
        renderImportedList();
      }
    };
  });
  
  document.getElementById("btn-quit-test").onclick = async () => {
    const quitConfirmed = await showCustomConfirm("Are you sure you want to quit this training session?");
    if (quitConfirmed) {
      quitAndSaveTestSession();
      showView("view-dashboard");
    }
  };

  // Language selectors (Target)
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".lang-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.selectedLang = btn.dataset.lang;
      updateDirectionButtonsUI();
      updateCategoryCounts();
      saveState();
    };
  });

  // Test direction selector binding
  document.querySelectorAll("#test-direction-selector .seg-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("#test-direction-selector .seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.testDirection = btn.dataset.direction;
      saveState();
    };
  });

  // Segmented control selectors (Word count)
  document.querySelectorAll(".segmented-control:not(#test-direction-selector) .seg-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".segmented-control:not(#test-direction-selector) .seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    };
  });

  // Start learning session button
  document.getElementById("btn-start-session").onclick = () => {
    if (state.baseLang === state.selectedLang) {
      alert("Please select a target language to learn that is different from your base language.");
      return;
    }

    if (state.testDirection === "conjugation") {
      showView("view-conjugation-dashboard");
      return;
    }

    const activeSeg = document.querySelector(".segmented-control:not(#test-direction-selector) .seg-btn.active");
    const count = activeSeg ? parseInt(activeSeg.dataset.count) : 10;
    const category = document.getElementById("select-category").value;
    const customCategory = document.getElementById("select-custom-category").value;
    
    if (category === "none" && customCategory === "none") {
      alert("Please select either a Category (Pocket) or a User-Specific Word Set to start testing.");
      return;
    }
    
    startTestSession(state.selectedLang, category, count, false, customCategory, state.testDirection);
  };

  // Conjugation Dashboard actions
  const btnQuitConjugationDash = document.getElementById("btn-quit-conjugation-dash");
  if (btnQuitConjugationDash) {
    btnQuitConjugationDash.onclick = () => {
      showView("view-dashboard");
    };
  }

  const btnPlayAllConjugations = document.getElementById("btn-play-all-conjugations");
  if (btnPlayAllConjugations) {
    btnPlayAllConjugations.onclick = () => {
      startAllVerbsConjugationTest();
    };
  }

  const conjSearchInput = document.getElementById("conjugation-search-input");
  if (conjSearchInput) {
    conjSearchInput.oninput = () => {
      const val = conjSearchInput.value.toLowerCase().trim();
      const cards = document.querySelectorAll(".verb-dash-card");
      cards.forEach(card => {
        const targetText = card.querySelector("h3")?.textContent.toLowerCase() || "";
        const transText = card.querySelector("span")?.textContent.toLowerCase() || "";
        if (targetText.includes(val) || transText.includes(val)) {
          card.style.display = "flex";
        } else {
          card.style.display = "none";
        }
      });
    };
  }

  const btnClearConjSearch = document.getElementById("btn-clear-conjugation-search");
  if (btnClearConjSearch) {
    btnClearConjSearch.onclick = () => {
      if (conjSearchInput) {
        conjSearchInput.value = "";
        conjSearchInput.dispatchEvent(new Event("input"));
        conjSearchInput.focus();
      }
    };
  }

  // Sync category dropdowns: choosing custom clears standard, choosing standard clears custom
  const selectCategory = document.getElementById("select-category");
  const selectCustomCategory = document.getElementById("select-custom-category");
  if (selectCategory && selectCustomCategory) {
    selectCategory.onchange = () => {
      if (selectCategory.value !== "none") {
        selectCustomCategory.value = "none";
      }
      state.lastSelectedCategory = selectCategory.value;
      state.lastSelectedCustomCategory = selectCustomCategory.value;
      saveState();
    };
    selectCustomCategory.onchange = () => {
      if (selectCustomCategory.value !== "none") {
        selectCategory.value = "none";
      }
      state.lastSelectedCategory = selectCategory.value;
      state.lastSelectedCustomCategory = selectCustomCategory.value;
      saveState();
    };
  }

  // Test mode switcher toggles
  document.querySelectorAll(".mode-toggle-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".mode-toggle-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.currentTest.selectedMode = btn.dataset.mode;
      
      document.querySelectorAll(".test-mode-section").forEach(s => s.classList.remove("active"));
      document.getElementById(`test-mode-${btn.dataset.mode}`).classList.add("active");
      
      renderQuestion();
    };
  });

  // Audio Recording Toggle
  const recordBtn = document.getElementById("btn-record-word");
  recordBtn.onclick = () => {
    if (recordBtn.textContent.includes("Record")) {
      startAudioRecording();
    } else {
      stopAudioRecording();
    }
  };

  // Play current temporal recording
  document.getElementById("btn-record-play").onclick = () => {
    if (currentRecordingBase64) {
      playCustomAudio(currentRecordingBase64);
    }
  };

  // Setup Actions (App Preferences)
  document.getElementById("btn-save-setup").onclick = () => {
    state.audioEngine = document.getElementById("select-audio-engine").value;
    state.allowSynonyms = document.getElementById("setup-allow-synonyms").checked;
    state.questionTimer = parseInt(document.getElementById("setup-question-timer").value) || 0;
    state.baseLang = document.getElementById("setup-base-lang").value;
    
    // Save chosen custom free voices
    state.customVoices = {
      en: document.getElementById("voice-select-en").value,
      de: document.getElementById("voice-select-de").value,
      it: document.getElementById("voice-select-it").value,
      es: document.getElementById("voice-select-es").value,
      fr: document.getElementById("voice-select-fr").value
    };

    saveState();
    updateDirectionButtonsUI();
    alert("Application preferences saved!");
    showView("view-dashboard");
  };

  const btnGenCode = document.getElementById("btn-cloud-generate-code");
  if (btnGenCode) btnGenCode.onclick = generateCloudSyncCode;

  const btnUpload = document.getElementById("btn-cloud-upload");
  if (btnUpload) btnUpload.onclick = pushToCloud;

  const btnDownload = document.getElementById("btn-cloud-download");
  if (btnDownload) btnDownload.onclick = pullFromCloud;

  const btnUnlink = document.getElementById("btn-cloud-unlink");
  if (btnUnlink) btnUnlink.onclick = unlinkCloudSyncDevice;

  const btnLink = document.getElementById("btn-cloud-link-code");
  if (btnLink) {
    btnLink.onclick = () => {
      const codeInput = document.getElementById("input-cloud-sync-code");
      const code = codeInput ? codeInput.value.trim() : "";
      linkCloudSyncDevice(code);
    };
  }

  // Provider tabs switcher
  const btnModeEasy = document.getElementById("btn-sync-mode-easy");
  const btnModeGithub = document.getElementById("btn-sync-mode-github");
  const setupZoneEasy = document.getElementById("cloud-sync-setup-zone-easy");
  const setupZoneGithub = document.getElementById("cloud-sync-setup-zone-github");

  if (btnModeEasy && btnModeGithub && setupZoneEasy && setupZoneGithub) {
    btnModeEasy.onclick = () => {
      btnModeEasy.classList.add("active");
      btnModeGithub.classList.remove("active");
      setupZoneEasy.style.display = "flex";
      setupZoneGithub.style.display = "none";
    };
    btnModeGithub.onclick = () => {
      btnModeGithub.classList.add("active");
      btnModeEasy.classList.remove("active");
      setupZoneEasy.style.display = "none";
      setupZoneGithub.style.display = "flex";
    };
  }

  // GitHub Gist Sync connect button
  const btnGithubConnect = document.getElementById("btn-github-connect");
  if (btnGithubConnect) {
    btnGithubConnect.onclick = connectGitHubGist;
  }

  // API Key Actions
  document.getElementById("btn-save-api-keys").onclick = async () => {
    state.openaiKey = document.getElementById("setup-openai-key").value.trim();
    state.grokKey = document.getElementById("setup-grok-key").value.trim();
    state.geminiKey = document.getElementById("setup-gemini-key").value.trim();
    state.anthropicKey = document.getElementById("setup-anthropic-key").value.trim();
    
    saveState();

    // Run verification directly
    await Promise.all([
      testApiKey("openai", state.openaiKey, "setup-openai-status"),
      testApiKey("grok", state.grokKey, "setup-grok-status"),
      testApiKey("gemini", state.geminiKey, "setup-gemini-status"),
      testApiKey("anthropic", state.anthropicKey, "setup-anthropic-status")
    ]);

    alert("API configurations updated!");
    showView("view-dashboard");
  };

  // Live key input verification triggers
  const setupOpenAiInput = document.getElementById("setup-openai-key");
  const setupGrokInput = document.getElementById("setup-grok-key");
  const setupGeminiInput = document.getElementById("setup-gemini-key");
  const setupAnthropicInput = document.getElementById("setup-anthropic-key");

  if (setupOpenAiInput) {
    setupOpenAiInput.onchange = () => testApiKey("openai", setupOpenAiInput.value.trim(), "setup-openai-status");
  }
  if (setupGrokInput) {
    setupGrokInput.onchange = () => testApiKey("grok", setupGrokInput.value.trim(), "setup-grok-status");
  }
  if (setupGeminiInput) {
    setupGeminiInput.onchange = () => testApiKey("gemini", setupGeminiInput.value.trim(), "setup-gemini-status");
  }
  if (setupAnthropicInput) {
    setupAnthropicInput.onchange = () => testApiKey("anthropic", setupAnthropicInput.value.trim(), "setup-anthropic-status");
  }

  // Export Backups
  window.exportBackupData = async () => {
    // If a persistent backup file is set, attempt to write directly to it
    if (state.backupFileHandle) {
      try {
        const perm = await state.backupFileHandle.queryPermission({ mode: "readwrite" });
        let granted = perm === "granted";
        if (!granted) {
          const req = await state.backupFileHandle.requestPermission({ mode: "readwrite" });
          granted = req === "granted";
        }
        if (granted) {
          const writable = await state.backupFileHandle.createWritable();
          await writable.write(JSON.stringify(state));
          await writable.close();
          onBackupFileAccessGranted();
          showCustomAlert("🎉 Backup successfully exported and updated in your fixed file!");
          return;
        }
      } catch (err) {
        console.error("Failed to write to persistent backup file, falling back to download:", err);
      }
    }

    // Fallback: standard browser download anchor using safe Blob URL
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", "voctrainer_backup.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  };

  const btnSelectICloud = document.getElementById("btn-select-icloud-folder");
  if (btnSelectICloud) {
    btnSelectICloud.onclick = selectICloudFolder;
  }

  const btnSyncFolder = document.getElementById("btn-sync-folder-now");
  if (btnSyncFolder) {
    btnSyncFolder.onclick = async () => {
      await syncICloudFolder();
      alert("🔄 Synchronization complete! Wordlists updated from your sync folder.");
    };
  }

  // Import Backup from File
  document.getElementById("import-backup-file").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let content = event.target.result.trim();
        if (content.startsWith("%7B") || content.startsWith("%7b")) {
          content = decodeURIComponent(content);
        }
        const importedState = JSON.parse(content);
        state = { ...state, ...importedState };
        saveState();
        loadState();
        alert("Backup imported successfully!");
      } catch (err) {
        alert("Failed to parse the backup JSON file.");
      }
    };
    reader.readAsText(file);
  };

  // Submit Answer Action
  document.getElementById("btn-submit-answer").onclick = submitAnswer;

  // Continue to next question
  document.getElementById("btn-next-question").onclick = nextQuestion;

  // Add Alternative Meaning Event Handlers
  const btnAltMeaning = document.getElementById("btn-add-alternative-meaning");
  const wrapAltMeaning = document.getElementById("add-meaning-input-wrap");
  const inputNewMeaningVal = document.getElementById("input-new-meaning");
  const btnSaveMeaningVal = document.getElementById("btn-save-new-meaning");
  const btnCancelMeaningVal = document.getElementById("btn-cancel-new-meaning");

  if (btnAltMeaning && wrapAltMeaning && inputNewMeaningVal && btnSaveMeaningVal && btnCancelMeaningVal) {
    btnAltMeaning.onclick = () => {
      btnAltMeaning.style.display = "none";
      wrapAltMeaning.style.display = "flex";
      
      // Look up existing synonyms in database or cache for prefilling
      let prefill = "";
      const tState = state.currentTest;
      const currentWord = tState ? tState.words[tState.index] : null;
      if (currentWord) {
        const ansLang = currentWord.answerLang || state.selectedLang;
        const details = getWordDetails(currentWord);
        const syns = (details && details.synonyms && details.synonyms[ansLang]) ? details.synonyms[ansLang] : [];
        if (syns.length > 0) {
          prefill = syns.join(", ");
        }
      }
      
      inputNewMeaningVal.value = prefill;
      inputNewMeaningVal.focus();
    };

    btnCancelMeaningVal.onclick = () => {
      wrapAltMeaning.style.display = "none";
      btnAltMeaning.style.display = "inline-flex";
    };

    btnSaveMeaningVal.onclick = () => {
      const val = inputNewMeaningVal.value.trim();
      if (!val) return;

      const newMeanings = val.split(',').map(s => s.trim()).filter(Boolean);
      if (newMeanings.length === 0) return;

      const tState = state.currentTest;
      if (!tState) return;
      const currentWord = tState.words[tState.index];
      const wordKey = currentWord.origEn || currentWord.en;
      const ansLang = currentWord.answerLang || state.selectedLang;

      const addSynsToCache = (key) => {
        if (!state.dictionaryCache) state.dictionaryCache = {};
        if (!state.dictionaryCache[key]) state.dictionaryCache[key] = {};
        if (!state.dictionaryCache[key].synonyms) state.dictionaryCache[key].synonyms = {};
        if (!state.dictionaryCache[key].synonyms[ansLang]) state.dictionaryCache[key].synonyms[ansLang] = [];
        newMeanings.forEach(m => {
          if (!state.dictionaryCache[key].synonyms[ansLang].includes(m)) {
            state.dictionaryCache[key].synonyms[ansLang].push(m);
          }
        });
      };

      const addSynsToWord = (word) => {
        if (!word.details) word.details = {};
        if (!word.details.synonyms) word.details.synonyms = {};
        if (!word.details.synonyms[ansLang]) word.details.synonyms[ansLang] = [];
        newMeanings.forEach(m => {
          if (!word.details.synonyms[ansLang].includes(m)) {
            word.details.synonyms[ansLang].push(m);
          }
        });
      };

      const idx = state.customVocab.findIndex(v => v.en === wordKey || v.origEn === wordKey);
      if (idx !== -1) {
        addSynsToWord(state.customVocab[idx]);
      } else {
        if (!state.editedStarters[wordKey]) {
          state.editedStarters[wordKey] = { details: { synonyms: {} } };
        }
        addSynsToWord(state.editedStarters[wordKey]);
      }

      addSynsToCache(wordKey);
      addSynsToWord(currentWord);
      saveState();

      const detailSyns = document.getElementById("detail-synonyms");
      if (detailSyns) {
        const detailsObj = getWordDetails(currentWord);
        const currentSyns = (detailsObj && detailsObj.synonyms && detailsObj.synonyms[ansLang])
          ? detailsObj.synonyms[ansLang]
          : [];
        const qLang = currentWord.questionLang || state.baseLang || "en";
        const qSyns = (detailsObj && detailsObj.synonyms && detailsObj.synonyms[qLang])
          ? detailsObj.synonyms[qLang]
          : [];
        if (currentSyns.length > 0) {
          detailSyns.innerHTML = currentSyns.map((syn, idx) => {
            const qTrans = qSyns[idx] ? ` (${qSyns[idx]})` : "";
            return `<code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-family: monospace;">${syn}${qTrans}</code>`;
          }).join(", ");
        } else {
          detailSyns.innerHTML = `<span style="color: var(--text-secondary); font-style: italic; font-size: 0.8rem;">None registered</span>`;
        }
      }

      wrapAltMeaning.style.display = "none";
      btnAltMeaning.style.display = "inline-flex";

      showCustomAlert(`Alternative meaning "${val}" added successfully!`);
    };
  }

  // Typing Input Key Listener (Enter key to submit answer)
  document.getElementById("input-typing-answer").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const feedback = document.getElementById("feedback-overlay");
      const customModal = document.getElementById("custom-modal-overlay");
      
      // If modal or feedback overlay are NOT active, submit the answer
      if ((!feedback || !feedback.classList.contains("active")) && (!customModal || !customModal.classList.contains("active"))) {
        e.preventDefault();
        e.stopPropagation();
        submitAnswer();
      }
    }
  });

  // Global Key Listener (Enter key to proceed or dismiss dialogs)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const feedback = document.getElementById("feedback-overlay");
      const customModal = document.getElementById("custom-modal-overlay");
      
      // 1. If custom modal is active, dismiss it (simulate clicking the primary action button, e.g., OK or Confirm)
      if (customModal && customModal.classList.contains("active")) {
        e.preventDefault();
        const primaryBtn = customModal.querySelector(".modal-actions .btn-primary");
        if (primaryBtn) {
          primaryBtn.click();
        }
        return;
      }
      
      // 2. If feedback overlay is active, proceed to the next question
      if (feedback && feedback.classList.contains("active")) {
        e.preventDefault();
        
        // If last answer was incorrect, block the Enter key from proceeding
        // so that the user is forced to see the right answer and click 'Next' manually.
        if (state.currentTest && state.currentTest.lastAnswerCorrect === false) {
          return;
        }
        
        const nextBtn = document.getElementById("btn-next-question");
        if (nextBtn) {
          nextBtn.click();
        } else {
          nextQuestion();
        }
      } else if (state.currentTest && state.currentTest.selectedMode === "conjugation" && (!customModal || !customModal.classList.contains("active"))) {
        e.preventDefault();
        checkConjugationAnswer();
      }
    }
  });

  // Repeat wrong answers trigger
  document.getElementById("btn-start-repeat").onclick = repeatMistakes;

  // Cleanse Mistakes trigger
  document.getElementById("btn-cleanse-mistakes").onclick = () => {
    startTestSession(state.selectedLang, "all", 10, true);
  };

  // Speak prompt actions in test view
  const btnSpeakPrompt = document.getElementById("btn-speak-prompt");
  if (btnSpeakPrompt) {
    btnSpeakPrompt.onclick = () => speakCurrentTestWord(1.0);
  }
  const btnSpeakPromptSlow = document.getElementById("btn-speak-prompt-slow");
  if (btnSpeakPromptSlow) {
    btnSpeakPromptSlow.onclick = () => speakCurrentTestWord(0.5);
  }
  const btnPlayCustomRecording = document.getElementById("btn-play-custom-recording");
  if (btnPlayCustomRecording) {
    btnPlayCustomRecording.onclick = () => {
      const test = state.currentTest;
      if (test) {
        const wordObj = test.words[test.index];
        if (wordObj && wordObj.audio) {
          playCustomAudio(wordObj.audio);
        }
      }
    };
  }

  // Mic Speaking Action
  document.getElementById("btn-mic").onclick = toggleListening;

  // Import tabs toggle
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      
      btn.classList.add("active");
      const targetTab = btn.dataset.tab;
      document.getElementById(targetTab).classList.add("active");
      
      if (targetTab === "tab-cloud") {
        loadCloudWordSets();
      }
    };
  });

  // Cloud Share Event Listeners
  const uploadCloudBtn = document.getElementById("btn-cloud-upload");
  if (uploadCloudBtn) {
    uploadCloudBtn.onclick = uploadActiveVocabToCloud;
  }
  const refreshCloudBtn = document.getElementById("btn-refresh-cloud");
  if (refreshCloudBtn) {
    refreshCloudBtn.onclick = loadCloudWordSets;
  }

  // Auto-fill filename when selecting a custom folder to upload
  const selectCloudUploadCategory = document.getElementById("select-cloud-upload-category");
  const cloudUploadName = document.getElementById("cloud-upload-name");
  if (selectCloudUploadCategory && cloudUploadName) {
    selectCloudUploadCategory.onchange = () => {
      const val = selectCloudUploadCategory.value;
      if (val === "all") {
        cloudUploadName.value = "";
      } else {
        const folder = state.customFolders.find(f => f.id === val);
        if (folder) {
          cloudUploadName.value = folder.name.replace(/[^a-zA-Z0-9_\-\s]/g, "");
        }
      }
    };
  }

  const btnCsvImportSubmit = document.getElementById("btn-csv-import-submit");
  if (btnCsvImportSubmit) {
    btnCsvImportSubmit.onclick = executeCSVImport;
  }

  // Helper to load synonym data into editor inputs
  window.loadSynonymIntoEditor = function(en, de, it, es, fr, category) {
    document.getElementById("manual-lang-en").value = en;
    document.getElementById("manual-lang-de").value = de;
    document.getElementById("manual-lang-it").value = it;
    document.getElementById("manual-lang-es").value = es;
    document.getElementById("manual-lang-fr").value = fr;
    document.getElementById("manual-category").value = category;
    document.getElementById("manual-image-url").value = en;
    playSound("sound-click");
  };

  // Helper to save synonym directly
  window.addSynonymDirectly = function(en, de, it, es, fr, category) {
    const base = state.baseLang || "en";
    const cleanWord = (base === "en" ? en : base === "de" ? de : base === "it" ? it : base === "es" ? es : fr).trim().toLowerCase();

    const existsInCustom = (state.customVocab || []).some(v => {
      const vBase = (v[base] || v.en || "").trim().toLowerCase();
      return vBase === cleanWord;
    });

    const existsInStarter = STARTER_VOCAB_RAW.some(v => {
      const vBase = (v[base] || v.en || "").trim().toLowerCase();
      return vBase === cleanWord;
    });

    if (existsInCustom || existsInStarter) {
      alert(`Word is already present in your wordlist.`);
      return;
    }

    const cleanEn = sanitizeWordTranslation(en, "en");
    const cleanDe = sanitizeWordTranslation(de, "de");
    const cleanIt = sanitizeWordTranslation(it, "it");
    const cleanEs = sanitizeWordTranslation(es, "es");
    const cleanFr = sanitizeWordTranslation(fr, "fr");

    const newWord = {
      en: cleanEn,
      de: cleanDe,
      it: cleanIt,
      es: cleanEs,
      fr: cleanFr,
      category: category || "imported",
      image: cleanEn,
      audio: "",
      details: {
        articles: {},
        sentences: {},
        variations: {},
        synonyms: { en: [], de: [], it: [], es: [], fr: [] }
      }
    };
    
    newWord.lang = state.selectedLang;
    newWord.target = newWord[state.selectedLang];

    state.customVocab.push(newWord);
    sessionImportedList.push(newWord);
    saveState();
    renderImportedList();
    alert(`Word "${en}" added directly to your custom set!`);
  };

  // AI translate, classify & suggest synonyms
  document.getElementById("btn-manual-ai-process").onclick = async () => {
    const word = document.getElementById("manual-input-word").value.trim();
    const btn = document.getElementById("btn-manual-ai-process");

    if (!word) {
      alert("Please enter a word or phrase.");
      return;
    }

    const origText = btn.textContent;
    btn.textContent = "⏳ Translating with Google Translate...";
    btn.disabled = true;

    try {
      const detectedBase = await detectLanguage(word) || "en";
      const targetLangs = ["en", "de", "it", "es", "fr"];
      
      const translationPromises = targetLangs.map(async (lang) => {
        if (lang === detectedBase) {
          return { lang, text: word };
        }
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${detectedBase}&tl=${lang}&dt=t&q=${encodeURIComponent(word)}`;
        try {
          const res = await fetch(url);
          const data = await res.json();
          if (data && data[0] && data[0][0] && data[0][0][0]) {
            return { lang, text: data[0][0][0].trim() };
          }
        } catch (e) {
          console.error(`Google translation failed for ${lang}`, e);
        }
        return { lang, text: "" };
      });
      
      const results = await Promise.all(translationPromises);
      const translations = {};
      results.forEach(r => {
        translations[r.lang] = r.text;
      });

      // Populate translations
      document.getElementById("manual-lang-en").value = translations.en || "";
      document.getElementById("manual-lang-de").value = translations.de || "";
      document.getElementById("manual-lang-it").value = translations.it || "";
      document.getElementById("manual-lang-es").value = translations.es || "";
      document.getElementById("manual-lang-fr").value = translations.fr || "";

      // Guess category
      let category = "nouns";
      const enText = (translations.en || "").toLowerCase();
      if (word.split(/\s+/).length > 2) {
        category = "phrases";
      } else if (enText.startsWith("to ")) {
        category = "verbs";
      }
      document.getElementById("manual-category").value = category;
      document.getElementById("manual-image-url").value = translations.en || word;

      // Reset advanced details
      document.getElementById("manual-art-de").value = "";
      document.getElementById("manual-art-it").value = "";
      document.getElementById("manual-art-es").value = "";
      document.getElementById("manual-art-fr").value = "";
      document.getElementById("manual-gen-de-m").value = "";
      document.getElementById("manual-gen-de-f").value = "";
      document.getElementById("manual-gen-it-m").value = "";
      document.getElementById("manual-gen-it-f").value = "";
      
      const synContainer = document.getElementById("manual-synonyms-container");
      synContainer.innerHTML = `<li style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; padding: 12px;">Translations loaded. No AI key configured for advanced grammar.</li>`;

      // Check if AI is available to fetch advanced features
      const hasKey = state.openaiKey || state.grokKey || state.geminiKey || state.anthropicKey;
      if (hasKey) {
        btn.textContent = "⏳ Enhancing with AI (Synonyms, Grammar)...";
        
        const prompt = `Classify and translate the vocabulary word/phrase "${word}" written in source language key "${detectedBase}".
        Output your response ONLY as a clean, parseable JSON object with the exact keys described below. Do not wrap in markdown code blocks. Do not write extra commentary.
        
        JSON schema:
        {
          "translations": {
            "en": "English translation",
            "de": "German translation",
            "it": "Italian translation",
            "es": "Spanish translation",
            "fr": "French translation"
          },
          "category": "nouns, verbs, adjectives, or phrases",
          "articles": {
            "de": "der, die, or das if applicable",
            "it": "il, la, lo, etc. if applicable",
            "es": "el or la if applicable",
            "fr": "le or la if applicable"
          },
          "genderForms": {
            "de": { "m": "masculine form if applicable", "f": "feminine form if applicable" },
            "it": { "m": "masculine form if applicable", "f": "feminine form if applicable" }
          },
          "synonyms": [
            {
              "word": "Synonym word 1 in English",
              "category": "nouns, verbs, etc.",
              "translations": {
                "en": "English",
                "de": "German",
                "it": "Italian",
                "es": "Spanish",
                "fr": "French"
              }
            }
          ]
        }`;

        const resText = await callLLM(prompt);
        let parsed;
        try {
          const cleanJson = resText.replace(/```json/g, "").replace(/```/g, "").trim();
          parsed = JSON.parse(cleanJson);
        } catch (e) {
          throw new Error("AI returned a non-JSON response. Please try again.");
        }

        if (parsed.articles) {
          document.getElementById("manual-art-de").value = parsed.articles.de || "";
          document.getElementById("manual-art-it").value = parsed.articles.it || "";
          document.getElementById("manual-art-es").value = parsed.articles.es || "";
          document.getElementById("manual-art-fr").value = parsed.articles.fr || "";
        }
        if (parsed.genderForms) {
          document.getElementById("manual-gen-de-m").value = parsed.genderForms.de?.m || "";
          document.getElementById("manual-gen-de-f").value = parsed.genderForms.de?.f || "";
          document.getElementById("manual-gen-it-m").value = parsed.genderForms.it?.m || "";
          document.getElementById("manual-gen-it-f").value = parsed.genderForms.it?.f || "";
        }

        synContainer.innerHTML = "";
        if (parsed.synonyms && parsed.synonyms.length > 0) {
          parsed.synonyms.forEach(syn => {
            const t = syn.translations || {};
            const li = document.createElement("li");
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";
            li.style.padding = "10px 12px";
            li.style.background = "rgba(255,255,255,0.02)";
            li.style.border = "1px solid var(--border-color)";
            li.style.borderRadius = "10px";

            li.innerHTML = `
              <div style="text-align: left; flex: 1; padding-right: 8px;">
                <strong style="color: #fff;">${syn.word}</strong>
                <span class="category-tag" style="margin-left: 6px; font-size: 0.65rem; padding: 1px 4px;">${syn.category}</span>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
                  🇩🇪 ${t.de || '-'} | 🇮🇹 ${t.it || '-'} | 🇪🇸 ${t.es || '-'}
                </div>
              </div>
              <div style="display: flex; gap: 6px; flex-shrink: 0;">
                <button class="btn btn-secondary btn-sm" style="padding: 4px 8px; font-size: 0.75rem; width: auto; min-height: 28px;" onclick="window.loadSynonymIntoEditor('${(t.en || syn.word).replace(/'/g, "\\'")}', '${(t.de || '').replace(/'/g, "\\'")}', '${(t.it || '').replace(/'/g, "\\'")}', '${(t.es || '').replace(/'/g, "\\'")}', '${(t.fr || '').replace(/'/g, "\\'")}', '${(syn.category || 'nouns').replace(/'/g, "\\'")}')">📥 Load</button>
                <button class="btn btn-primary btn-sm" style="padding: 4px 8px; font-size: 0.75rem; width: auto; min-height: 28px;" onclick="window.addSynonymDirectly('${(t.en || syn.word).replace(/'/g, "\\'")}', '${(t.de || '').replace(/'/g, "\\'")}', '${(t.it || '').replace(/'/g, "\\'")}', '${(t.es || '').replace(/'/g, "\\'")}', '${(t.fr || '').replace(/'/g, "\\'")}', '${(syn.category || 'nouns').replace(/'/g, "\\'")}')">➕ Add</button>
              </div>
            `;
            synContainer.appendChild(li);
          });
        } else {
          synContainer.innerHTML = `<li style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; padding: 12px;">No synonyms returned by AI.</li>`;
        }
      }
    } catch (err) {
      alert("Error processing word: " + err.message);
    } finally {
      btn.textContent = origText;
      btn.disabled = false;
    }
  };

  // Advanced Grammar Details Accordion Toggle
  const btnToggleGrammar = document.getElementById("btn-toggle-grammar-details");
  const grammarPanel = document.getElementById("grammar-details-panel");
  const grammarIcon = document.getElementById("grammar-toggle-icon");
  if (btnToggleGrammar && grammarPanel) {
    btnToggleGrammar.onclick = () => {
      if (grammarPanel.style.display === "none") {
        grammarPanel.style.display = "block";
        grammarIcon.textContent = "▲";
      } else {
        grammarPanel.style.display = "none";
        grammarIcon.textContent = "▼";
      }
    };
  }

  const resetGrammarFields = () => {
    document.getElementById("manual-art-de").value = "";
    document.getElementById("manual-art-it").value = "";
    document.getElementById("manual-art-es").value = "";
    document.getElementById("manual-art-fr").value = "";
    document.getElementById("manual-gen-de-m").value = "";
    document.getElementById("manual-gen-de-f").value = "";
    document.getElementById("manual-gen-it-m").value = "";
    document.getElementById("manual-gen-it-f").value = "";
    document.getElementById("manual-sentence-en").value = "";
    document.getElementById("manual-sentence-de").value = "";
    document.getElementById("manual-sentence-it").value = "";
    document.getElementById("manual-sentence-es").value = "";
    document.getElementById("manual-sentence-fr").value = "";
  };

  // Manual import submit action
  document.getElementById("btn-manual-submit").onclick = () => {
    const en = document.getElementById("manual-lang-en").value.trim();
    const de = document.getElementById("manual-lang-de").value.trim();
    const it = document.getElementById("manual-lang-it").value.trim();
    const es = document.getElementById("manual-lang-es").value.trim();
    const fr = document.getElementById("manual-lang-fr").value.trim();
    const category = document.getElementById("manual-category").value.trim() || "nouns";
    const imageUrl = document.getElementById("manual-image-url").value.trim();

    // Advanced Grammar details
    const artDe = document.getElementById("manual-art-de").value.trim();
    const artIt = document.getElementById("manual-art-it").value.trim();
    const artEs = document.getElementById("manual-art-es").value.trim();
    const artFr = document.getElementById("manual-art-fr").value.trim();
    const genDeM = document.getElementById("manual-gen-de-m").value.trim();
    const genDeF = document.getElementById("manual-gen-de-f").value.trim();
    const genItM = document.getElementById("manual-gen-it-m").value.trim();
    const genItF = document.getElementById("manual-gen-it-f").value.trim();
    const sentEn = document.getElementById("manual-sentence-en").value.trim();
    const sentDe = document.getElementById("manual-sentence-de").value.trim();
    const sentIt = document.getElementById("manual-sentence-it").value.trim();
    const sentEs = document.getElementById("manual-sentence-es").value.trim();
    const sentFr = document.getElementById("manual-sentence-fr").value.trim();

    if (!en || !de || !it || !es || !fr) {
      alert("Please ensure all translation fields are filled before saving.");
      return;
    }

    const isEditMode = !!state.editingWordKey;
    if (isEditMode) {
      const originalKey = state.editingWordKey;
      const isCustom = state.isEditingCustom;
      
      const cleanEn = sanitizeWordTranslation(en, "en");
      const cleanDe = sanitizeWordTranslation(de, "de");
      const cleanIt = sanitizeWordTranslation(it, "it");
      const cleanEs = sanitizeWordTranslation(es, "es");
      const cleanFr = sanitizeWordTranslation(fr, "fr");
      
      if (isCustom) {
        const idx = state.customVocab.findIndex(v => v.en === originalKey || v.origEn === originalKey);
        if (idx !== -1) {
          state.customVocab[idx].en = cleanEn;
          state.customVocab[idx].de = cleanDe;
          state.customVocab[idx].it = cleanIt;
          state.customVocab[idx].es = cleanEs;
          state.customVocab[idx].fr = cleanFr;
          state.customVocab[idx].category = category;
          state.customVocab[idx].image = imageUrl || cleanEn;
          state.customVocab[idx].lastUpdated = Date.now();
          state.customVocab[idx].details = {
            ...state.customVocab[idx].details,
            articles: { de: artDe, it: artIt, es: artEs, fr: artFr },
            genderForms: {
              de: { m: genDeM, f: genDeF },
              it: { m: genItM, f: genItF }
            },
            sentences: { en: sentEn, de: sentDe, it: sentIt, es: sentEs, fr: sentFr }
          };
        }
      } else {
        const override = state.editedStarters[originalKey] || {};
        state.editedStarters[originalKey] = {
          en: cleanEn,
          de: cleanDe,
          it: cleanIt,
          es: cleanEs,
          fr: cleanFr,
          category,
          image: imageUrl || cleanEn,
          details: {
            ...override.details,
            articles: { de: artDe, it: artIt, es: artEs, fr: artFr },
            genderForms: {
              de: { m: genDeM, f: genDeF },
              it: { m: genItM, f: genItF }
            },
            sentences: { en: sentEn, de: sentDe, it: sentIt, es: sentEs, fr: sentFr }
          }
        };
      }
      
      saveState();
      
      state.editingWordKey = null;
      state.isEditingCustom = null;
      document.getElementById("btn-manual-submit").textContent = "🚀 Save Word";
      const header = document.querySelector("#tab-manual h3");
      if (header) header.textContent = "✏️ Add Custom (Manual)";
      
      // Reset input fields
      document.getElementById("manual-lang-en").value = "";
      document.getElementById("manual-lang-de").value = "";
      document.getElementById("manual-lang-it").value = "";
      document.getElementById("manual-lang-es").value = "";
      document.getElementById("manual-lang-fr").value = "";
      document.getElementById("manual-image-url").value = "";
      resetGrammarFields();
      
      alert("Word updated successfully!");
      showView("view-browse");
      if (state.selectedBrowseFolderId) {
        renderBrowseWordsList(state.selectedBrowseFolderId);
      }
      return;
    }

    const base = state.baseLang || "en";
    const cleanWord = (base === "en" ? en : base === "de" ? de : base === "it" ? it : base === "es" ? es : fr).trim().toLowerCase();

    const existsInCustom = (state.customVocab || []).some(v => {
      const vBase = (v[base] || v.en || "").trim().toLowerCase();
      return vBase === cleanWord;
    });

    const existsInStarter = STARTER_VOCAB_RAW.some(v => {
      const vBase = (v[base] || v.en || "").trim().toLowerCase();
      return vBase === cleanWord;
    });

    if (existsInCustom || existsInStarter) {
      (async () => {
        const overwrite = await showCustomConfirm(`"${cleanWord}" already exists. Do you want to overwrite it with these new translations?`);
        if (overwrite) {
          const cleanEn = sanitizeWordTranslation(en, "en");
          const cleanDe = sanitizeWordTranslation(de, "de");
          const cleanIt = sanitizeWordTranslation(it, "it");
          const cleanEs = sanitizeWordTranslation(es, "es");
          const cleanFr = sanitizeWordTranslation(fr, "fr");

          if (existsInCustom) {
            const idx = state.customVocab.findIndex(v => (v[base] || v.en || "").trim().toLowerCase() === cleanWord);
            if (idx !== -1) {
              state.customVocab[idx].en = cleanEn;
              state.customVocab[idx].de = cleanDe;
              state.customVocab[idx].it = cleanIt;
              state.customVocab[idx].es = cleanEs;
              state.customVocab[idx].fr = cleanFr;
              state.customVocab[idx].category = category;
              state.customVocab[idx].image = imageUrl || cleanEn;
              state.customVocab[idx].lastUpdated = Date.now();
              state.customVocab[idx].details = {
                ...state.customVocab[idx].details,
                articles: { de: artDe, it: artIt, es: artEs, fr: artFr },
                genderForms: {
                  de: { m: genDeM, f: genDeF },
                  it: { m: genItM, f: genItF }
                }
              };
            }
          } else {
            const starter = STARTER_VOCAB_RAW.find(v => (v[base] || v.en || "").trim().toLowerCase() === cleanWord);
            const starterKey = starter ? (starter[base] || starter.en) : cleanWord;
            const override = state.editedStarters[starterKey] || {};
            state.editedStarters[starterKey] = {
              en: cleanEn,
              de: cleanDe,
              it: cleanIt,
              es: cleanEs,
              fr: cleanFr,
              category,
              image: imageUrl || cleanEn,
              details: {
                ...override.details,
                articles: { de: artDe, it: artIt, es: artEs, fr: artFr },
                genderForms: {
                  de: { m: genDeM, f: genDeF },
                  it: { m: genItM, f: genItF }
                }
              }
            };
          }
          
          saveState();
          
          // Reset fields
          document.getElementById("manual-input-word").value = "";
          document.getElementById("manual-lang-en").value = "";
          document.getElementById("manual-lang-de").value = "";
          document.getElementById("manual-lang-it").value = "";
          document.getElementById("manual-lang-es").value = "";
          document.getElementById("manual-lang-fr").value = "";
          document.getElementById("manual-image-url").value = "";
          resetGrammarFields();
          
          alert("Word overwritten successfully!");
        }
      })();
      return;
    }

    const cleanEn = sanitizeWordTranslation(en, "en");
    const cleanDe = sanitizeWordTranslation(de, "de");
    const cleanIt = sanitizeWordTranslation(it, "it");
    const cleanEs = sanitizeWordTranslation(es, "es");
    const cleanFr = sanitizeWordTranslation(fr, "fr");

    const newWord = {
      en: cleanEn,
      de: cleanDe,
      it: cleanIt,
      es: cleanEs,
      fr: cleanFr,
      category,
      image: imageUrl || cleanEn,
      audio: currentRecordingBase64,
      details: {
        articles: { de: artDe, it: artIt, es: artEs, fr: artFr },
        genderForms: {
          de: { m: genDeM, f: genDeF },
          it: { m: genItM, f: genItF }
        },
        sentences: { en: sentEn, de: sentDe, it: sentIt, es: sentEs, fr: sentFr },
        variations: {},
        synonyms: { en: [], de: [], it: [], es: [], fr: [] }
      },
      lastUpdated: Date.now()
    };

    newWord.lang = state.selectedLang;
    newWord.target = newWord[state.selectedLang];

    state.customVocab.push(newWord);
    sessionImportedList.push(newWord);
    saveState();
    renderImportedList();

    // Reset inputs
    document.getElementById("manual-input-word").value = "";
    document.getElementById("manual-lang-en").value = "";
    document.getElementById("manual-lang-de").value = "";
    document.getElementById("manual-lang-it").value = "";
    document.getElementById("manual-lang-es").value = "";
    document.getElementById("manual-lang-fr").value = "";
    populateManualCategoryDropdown();
    document.getElementById("manual-image-url").value = "";
    document.getElementById("manual-synonyms-container").innerHTML = `<li style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; padding: 12px;">Enter a word above and run AI Translate to suggest synonyms.</li>`;
    currentRecordingBase64 = "";
    document.getElementById("btn-record-play").disabled = true;
    document.getElementById("record-status-text").textContent = "No audio recorded";

    alert("Word added successfully!");
  };

  // URL import logic removed

  // File Upload Drag & Drop & Upload controls
  const fileDropZone = document.getElementById("file-drop-zone");
  const fileInput = document.getElementById("file-import-input");
  const btnFileConfirm = document.getElementById("btn-file-confirm");
  const btnFileConfirmTop = document.getElementById("btn-file-confirm-top");

  if (fileDropZone && fileInput) {
    fileDropZone.ondragover = (e) => {
      e.preventDefault();
      fileDropZone.classList.add("dragover");
    };

    fileDropZone.ondragleave = () => {
      fileDropZone.classList.remove("dragover");
    };

    fileDropZone.ondrop = (e) => {
      e.preventDefault();
      fileDropZone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    };

    fileInput.onchange = () => {
      if (fileInput.files && fileInput.files[0]) {
        handleFileSelect(fileInput.files[0]);
      }
    };
  }

  if (btnFileConfirm) btnFileConfirm.onclick = executeFileImport;
  if (btnFileConfirmTop) btnFileConfirmTop.onclick = executeFileImport;

  // Bulk Import Logic
  let parsedRows = [];

  const btnBulkPreview = document.getElementById("btn-bulk-preview");
  const btnBulkSwap = document.getElementById("btn-bulk-swap");
  const btnBulkConfirm = document.getElementById("btn-bulk-confirm");
  const bulkPreviewArea = document.getElementById("bulk-preview-area");
  const bulkTableBody = document.getElementById("bulk-preview-table-body");

  function parseBulkInput() {
    const text = document.getElementById("bulk-import-text").value;
    const sep = document.getElementById("bulk-separator").value;
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    
    parsedRows = lines.map(line => {
      let word = line;
      let trans = "";
      
      let actualSep = null;
      if (sep === "auto") {
        const candidates = [",", ";", "\t", " - ", " – ", " — ", ":", "="];
        for (const c of candidates) {
          if (line.includes(c)) {
            actualSep = c;
            break;
          }
        }
      } else if (sep === "comma") actualSep = ",";
      else if (sep === "semicolon") actualSep = ";";
      else if (sep === "tab") actualSep = "\t";
      else if (sep === "hyphen") {
        if (line.includes(" - ")) actualSep = " - ";
        else if (line.includes(" – ")) actualSep = " – ";
        else if (line.includes(" — ")) actualSep = " — ";
        else if (line.includes("-")) actualSep = "-";
      }
      else if (sep === "colon") actualSep = ":";
      else if (sep === "equal") actualSep = "=";
      
      if (actualSep && sep !== "none") {
        const parts = line.split(actualSep);
        word = parts[0].trim();
        trans = parts.slice(1).join(actualSep).trim();
      }
      
      return { word, trans, active: true };
    });
    
    renderPreviewTable();
  }

  function renderPreviewTable() {
    bulkTableBody.innerHTML = "";
    
    if (parsedRows.length === 0) {
      bulkPreviewArea.style.display = "none";
      btnBulkSwap.style.display = "none";
      return;
    }
    
    bulkPreviewArea.style.display = "block";
    btnBulkSwap.style.display = "inline-flex";
    
    parsedRows.forEach((row, idx) => {
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid var(--border-color)";
      
      const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
      
      tr.innerHTML = `
        <td style="padding: 8px;">
          <input type="text" value="${esc(row.word)}" class="custom-select" style="min-height:36px; padding:6px; font-size:0.85rem;" data-idx="${idx}" data-field="word">
        </td>
        <td style="padding: 8px;">
          <input type="text" value="${esc(row.trans)}" class="custom-select" placeholder="Type translation..." style="min-height:36px; padding:6px; font-size:0.85rem;" data-idx="${idx}" data-field="trans">
        </td>
        <td style="padding: 8px; text-align: center;">
          <input type="checkbox" ${row.active ? "checked" : ""} class="preview-chk" data-idx="${idx}" style="width:18px; height:18px; cursor:pointer;">
        </td>
      `;
      bulkTableBody.appendChild(tr);
    });

    bulkTableBody.querySelectorAll("input[type='text']").forEach(inp => {
      inp.oninput = (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const field = e.target.dataset.field;
        if (parsedRows[idx]) {
          parsedRows[idx][field] = e.target.value;
        }
      };
    });

    bulkTableBody.querySelectorAll(".preview-chk").forEach(chk => {
      chk.onchange = (e) => {
        const idx = parseInt(e.target.dataset.idx);
        if (parsedRows[idx]) {
          parsedRows[idx].active = e.target.checked;
        }
      };
    });
  }

  if (btnBulkPreview) {
    btnBulkPreview.onclick = parseBulkInput;
  }

  if (btnBulkSwap) {
    btnBulkSwap.onclick = () => {
      parsedRows = parsedRows.map(r => ({
        word: r.trans,
        trans: r.word,
        active: r.active
      }));
      renderPreviewTable();
    };
  }

  function executeBulkImport() {
    const lang = state.selectedLang || "en";
    const cat = document.getElementById("bulk-category").value.trim() || "imported";
    let count = 0;
    
    const btnConfirm = document.getElementById("btn-bulk-confirm");
    const btnConfirmTop = document.getElementById("btn-bulk-confirm-top");
    const originalText = btnConfirm ? btnConfirm.textContent : "Confirm Import";
    
    const progressContainer = document.getElementById("bulk-import-progress-container");
    const progressBar = document.getElementById("bulk-import-progress-bar");
    const progressStatus = document.getElementById("bulk-import-progress-status");
    const progressPercent = document.getElementById("bulk-import-progress-percent");

    const activeRows = parsedRows.filter(r => r.active && r.word.trim());
    const total = activeRows.length;
    
    if (total > 0 && progressContainer) {
      progressContainer.style.display = "block";
      progressBar.style.width = "0%";
      progressPercent.textContent = "0%";
      progressStatus.textContent = "Starting translation & import...";
    }

    if (btnConfirm) { btnConfirm.textContent = "⏳ Translating & Importing..."; btnConfirm.disabled = true; }
    if (btnConfirmTop) { btnConfirmTop.textContent = "⏳ Importing..."; btnConfirmTop.disabled = true; }

    (async () => {
      try {
        for (const row of parsedRows) {
          if (row.active && row.word.trim()) {
            await addCustomWord(row.word.trim(), row.trans.trim(), lang, cat);
            count++;
            if (progressContainer) {
              const pct = Math.round((count / total) * 100);
              progressBar.style.width = `${pct}%`;
              progressPercent.textContent = `${pct}%`;
              progressStatus.textContent = `Translating & importing ${count} of ${total}...`;
            }
          }
        }
        
        if (count > 0) {
          saveState();
          renderImportedList();
          if (state.icloudHandle) {
            saveWordlistToICloud(cat);
          }
          alert(`Successfully imported and fully translated ${count} custom words!`);
          document.getElementById("bulk-import-text").value = "";
          bulkPreviewArea.style.display = "none";
          btnBulkSwap.style.display = "none";
          parsedRows = [];
        } else {
          alert("No words selected to import.");
        }
      } catch (err) {
        console.error("Bulk import failed:", err);
        alert("Bulk import failed during translation process: " + err.message);
      } finally {
        if (btnConfirm) { btnConfirm.textContent = originalText; btnConfirm.disabled = false; }
        if (btnConfirmTop) { btnConfirmTop.textContent = "Confirm Import"; btnConfirmTop.disabled = false; }
        if (progressContainer) progressContainer.style.display = "none";
      }
    })();
  }

  if (btnBulkConfirm) {
    btnBulkConfirm.onclick = executeBulkImport;
  }
  const btnBulkConfirmTop = document.getElementById("btn-bulk-confirm-top");
  if (btnBulkConfirmTop) {
    btnBulkConfirmTop.onclick = executeBulkImport;
  }

  // Browse & History Navigation & Listeners
  document.getElementById("btn-go-browse").onclick = () => {
    showView("view-browse");
    renderBrowseList();
  };

  document.getElementById("btn-browse-back").onclick = () => showView("view-dashboard");

  const btnExpandTree = document.getElementById("btn-expand-folders-tree");
  if (btnExpandTree) {
    btnExpandTree.onclick = () => {
      state.selectedBrowseFolderId = null;
      saveState();
      renderBrowseList();
    };
  }

  // Browse selection change filters
  document.querySelectorAll("#browse-lang-selector .lang-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("#browse-lang-selector .lang-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderBrowseList();
    };
  });

  const selectBrowseCategory = document.getElementById("select-browse-category");
  const selectBrowseCustomCategory = document.getElementById("select-browse-custom-category");

  if (selectBrowseCategory && selectBrowseCustomCategory) {
    selectBrowseCategory.onchange = () => {
      selectBrowseCustomCategory.value = "none";
      renderBrowseList();
    };
    selectBrowseCustomCategory.onchange = () => {
      if (selectBrowseCustomCategory.value !== "none") {
        selectBrowseCategory.value = "all";
      }
      renderBrowseList();
    };
  }

  // Create folder listener
  const btnCreateFolder = document.getElementById("btn-create-folder");
  if (btnCreateFolder) {
    btnCreateFolder.onclick = () => {
      const overlay = document.getElementById("custom-modal-overlay");
      const icon = document.getElementById("modal-icon");
      const title = document.getElementById("modal-title");
      const msgEl = document.getElementById("modal-message");
      const actions = document.getElementById("modal-actions");

      playSound("sound-popup");

      icon.textContent = "📁";
      title.textContent = "Create New Folder";
      msgEl.innerHTML = `
        <div class="form-group" style="text-align: left; margin-top: 10px; width: 100%;">
          <label style="font-weight: 600; display: block; margin-bottom: 6px; font-size: 0.85rem; color: var(--text-secondary);">Folder Name</label>
          <input type="text" id="create-folder-input" placeholder="e.g. Travel Words" class="custom-select" style="width: 100%; min-height: 40px; padding: 8px 12px; background: rgba(255,255,255,0.03); color: #fff; border: 1px solid var(--border-color); border-radius: 10px;">
        </div>
      `;

      actions.innerHTML = "";
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-secondary";
      cancelBtn.textContent = "Cancel";
      cancelBtn.onclick = () => overlay.classList.remove("active");

      const createBtn = document.createElement("button");
      createBtn.className = "btn btn-primary";
      createBtn.textContent = "Create";
      createBtn.onclick = () => {
        const name = document.getElementById("create-folder-input").value.trim();
        if (!name) {
          alert("Folder name cannot be empty.");
          return;
        }
        
        const folderId = "folder_" + Date.now();
        const parentId = state.selectedBrowseFolderId && !["verbs", "nouns", "technology", "biology", "phrases"].includes(state.selectedBrowseFolderId) 
          ? state.selectedBrowseFolderId 
          : null;
        
        state.customFolders.push({ id: folderId, name: name, parentId: parentId });
        saveState();
        renderBrowseList();
        overlay.classList.remove("active");
      };

      actions.appendChild(cancelBtn);
      actions.appendChild(createBtn);
      overlay.classList.add("active");
    };
  }
}



// Render the completed sessions in history list
export function renderHistoryList() {
  const container = document.getElementById("history-sessions-list");
  container.innerHTML = "";
  
  if (!state.history || state.history.length === 0) {
    container.innerHTML = `<li class="empty-state">No completed tests yet. Start learning to record history!</li>`;
    return;
  }

  state.history.slice().reverse().forEach(session => {
    const li = document.createElement("li");
    li.style.flexDirection = "column";
    li.style.alignItems = "stretch";
    li.style.gap = "4px";
    li.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-weight:700;">
        <span>📅 ${session.date} (${session.lang})</span>
        <span style="color:var(--accent-color);">+${session.points || session.xp || 0} pts</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--text-secondary);">
        <span>Pocket: ${session.category}</span>
        <span>Accuracy: ${session.accuracy}% (${session.correct}/${session.total})</span>
      </div>
    `;
    container.appendChild(li);
  });
}

// Render the vocabulary list browser
export function renderBrowseList() {
  const fullHeader = document.getElementById("folders-header-full");
  const compactHeader = document.getElementById("folders-header-compact");
  const treeContainer = document.getElementById("browse-directory-tree");
  const activeFolderName = document.getElementById("browse-active-folder-name");
  const wordsCard = document.getElementById("browse-words-card");

  // Render Directory Tree
  renderDirectoryTree();
  
  if (state.selectedBrowseFolderId) {
    if (fullHeader) fullHeader.style.display = "none";
    if (treeContainer) treeContainer.style.display = "none";
    if (compactHeader) compactHeader.style.display = "flex";
    
    const allFolders = [
      { id: "verbs", name: "Verbs" },
      { id: "nouns", name: "Nouns" },
      { id: "technology", name: "Technology" },
      { id: "biology", name: "Biology" },
      { id: "phrases", name: "Phrases" },
      ...state.customFolders
    ];
    const folder = allFolders.find(f => f.id === state.selectedBrowseFolderId);
    if (activeFolderName) activeFolderName.textContent = folder ? folder.name : state.selectedBrowseFolderId;

    if (wordsCard) wordsCard.style.display = "block";
    renderBrowseWordsList(state.selectedBrowseFolderId);
  } else {
    if (fullHeader) fullHeader.style.display = "flex";
    if (treeContainer) treeContainer.style.display = "block";
    if (compactHeader) compactHeader.style.display = "none";
    if (wordsCard) wordsCard.style.display = "none";
  }
}

function renderDirectoryTree() {
  const treeContainer = document.getElementById("browse-directory-tree");
  if (!treeContainer) return;
  
  treeContainer.innerHTML = "";
  
  // Add Drop target for root level
  const rootDrop = document.createElement("div");
  rootDrop.className = "tree-node";
  rootDrop.style.border = "1.5px dashed rgba(76, 201, 240, 0.3)";
  rootDrop.style.background = "rgba(76, 201, 240, 0.03)";
  rootDrop.style.justifyContent = "center";
  rootDrop.style.fontStyle = "italic";
  rootDrop.style.fontSize = "0.85rem";
  rootDrop.style.color = "var(--accent-color)";
  rootDrop.style.marginBottom = "8px";
  rootDrop.innerHTML = "📂 Drop folder here to move to Root";
  rootDrop.setAttribute("ondragover", "window.onTreeDragOver(event)");
  rootDrop.setAttribute("ondragleave", "window.onTreeDragLeave(event)");
  rootDrop.setAttribute("ondrop", "window.onTreeDrop(event, 'root')");
  treeContainer.appendChild(rootDrop);

  const allFolders = state.customFolders || [];
  
  const html = buildTreeHTML(allFolders, null, 0);
  
  const treeWrapper = document.createElement("div");
  treeWrapper.innerHTML = html || `<p class="empty-state" style="padding: 16px; margin: 0;">No custom folders created yet. Click "New Folder" to start!</p>`;
  treeContainer.appendChild(treeWrapper);
  
  // Setup standard list button action inside directory tree context if needed
  const btnAddWord = document.getElementById("btn-add-word-to-folder");
  if (btnAddWord) {
    btnAddWord.onclick = () => {
      // Clear editing state so we are adding, not editing
      state.editingWordKey = null;
      state.isEditingCustom = null;
      
      const submitBtn = document.getElementById("btn-manual-submit");
      if (submitBtn) submitBtn.textContent = "💾 Save Custom Word";
      
      const header = document.querySelector("#tab-manual h3");
      if (header) header.textContent = "✏️ Add Custom (Manual)";

      // Clear input fields
      document.getElementById("manual-input-word").value = "";
      document.getElementById("manual-lang-en").value = "";
      document.getElementById("manual-lang-de").value = "";
      document.getElementById("manual-lang-it").value = "";
      document.getElementById("manual-lang-es").value = "";
      document.getElementById("manual-lang-fr").value = "";
      document.getElementById("manual-image-url").value = "";
      
      // Clear advanced grammar fields
      document.getElementById("manual-art-de").value = "";
      document.getElementById("manual-art-it").value = "";
      document.getElementById("manual-art-es").value = "";
      document.getElementById("manual-art-fr").value = "";
      document.getElementById("manual-gen-de-m").value = "";
      document.getElementById("manual-gen-de-f").value = "";
      document.getElementById("manual-gen-it-m").value = "";
      document.getElementById("manual-gen-it-f").value = "";
      document.getElementById("manual-sentence-en").value = "";
      document.getElementById("manual-sentence-de").value = "";
      document.getElementById("manual-sentence-it").value = "";
      document.getElementById("manual-sentence-es").value = "";
      document.getElementById("manual-sentence-fr").value = "";
      
      // Clear synonyms list
      const synContainer = document.getElementById("manual-synonyms-container");
      if (synContainer) {
        synContainer.innerHTML = `<li style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; padding: 12px;">Enter a word above and run AI Translate to suggest synonyms.</li>`;
      }
      
      // Reset custom recording variables
      if (window.currentRecordingBase64 !== undefined) window.currentRecordingBase64 = "";
      const recordBtnPlay = document.getElementById("btn-record-play");
      if (recordBtnPlay) recordBtnPlay.disabled = true;
      const recordStatus = document.getElementById("record-status-text");
      if (recordStatus) recordStatus.textContent = "No audio recorded";

      showView("view-import");
      const importTabBtn = document.querySelector('[data-tab="tab-manual"]');
      if (importTabBtn) importTabBtn.click();
      
      const manualCatInput = document.getElementById("manual-category");
      if (manualCatInput && state.selectedBrowseFolderId) {
        manualCatInput.value = state.selectedBrowseFolderId;
      }
    };
  }
}

function renderBrowseWordsList(folderId) {
  const wordsCard = document.getElementById("browse-words-card");
  const wordsTableBody = document.getElementById("browse-words-table-body");
  const titleEl = document.getElementById("browse-list-title");
  if (!wordsCard || !wordsTableBody) return;
  
  wordsCard.style.display = "block";
  wordsTableBody.innerHTML = "";
  
  const allFolders = [
    { id: "verbs", name: "Verbs" },
    { id: "nouns", name: "Nouns" },
    { id: "technology", name: "Technology" },
    { id: "biology", name: "Biology" },
    { id: "phrases", name: "Phrases" },
    ...state.customFolders
  ];
  const folder = allFolders.find(f => f.id === folderId);
  const folderName = folder ? folder.name : folderId;
  
  const base = state.baseLang || "en";
  
  // Set default browse study language if not set or matches base language
  const languages = ["en", "de", "it", "es", "fr"];
  if (!state.browseTargetLang) {
    state.browseTargetLang = state.selectedLang || "de";
  }
  if (state.browseTargetLang === base) {
    state.browseTargetLang = languages.find(l => l !== base) || "de";
  }

  // Populate dynamic flag picker
  const flagRow = document.getElementById("browse-lang-selectors-row");
  if (flagRow) {
    flagRow.innerHTML = `<span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase;">Study Language:</span>`;
    languages.forEach(lang => {
      if (lang === base) return; // skip base language flag
      const btn = document.createElement("button");
      btn.className = `lang-btn ${state.browseTargetLang === lang ? 'active' : ''}`;
      btn.style.padding = "6px 12px";
      btn.style.fontSize = "0.8rem";
      btn.style.minHeight = "32px";
      btn.style.borderRadius = "8px";
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.gap = "4px";
      btn.style.margin = "0";
      btn.style.width = "auto";
      btn.style.flexDirection = "row";
      
      const labelNames = { en: "English", de: "German", it: "Italiano", es: "Spanish", fr: "French" };
      btn.innerHTML = `${getFlagHtml(lang)} ${labelNames[lang] || lang}`;
      
      btn.onclick = () => {
        state.browseTargetLang = lang;
        saveState();
        renderBrowseWordsList(folderId);
      };
      flagRow.appendChild(btn);
    });
  }

  // Populate table headers with flags and names
  const hdrBase = document.getElementById("browse-hdr-base");
  const hdrTarget = document.getElementById("browse-hdr-target");
  const langNames = { en: "English", de: "German", it: "Italiano", es: "Spanish", fr: "French" };
  if (hdrBase) {
    hdrBase.innerHTML = `${getFlagHtml(base)} ${langNames[base] || base.toUpperCase()}`;
    hdrBase.style.color = getLangColor(base);
  }
  if (hdrTarget) {
    const target = state.browseTargetLang;
    hdrTarget.innerHTML = `${getFlagHtml(target)} ${langNames[target] || target.toUpperCase()}`;
    hdrTarget.style.color = getLangColor(target);
  }

  let pool = [];
  const isStandard = ["verbs", "nouns", "technology", "biology", "phrases"].includes(folderId);
  
  if (isStandard) {
    pool = STARTER_VOCAB_RAW.filter(v => v.category === folderId && !state.deletedStarters.includes(v[base])).map(item => {
      const override = state.editedStarters[item[base]] || {};
      return {
        en: override.en || item.en || item[base] || "",
        de: override.de || item.de || "",
        it: override.it || item.it || "",
        es: override.es || item.es || "",
        fr: override.fr || item.fr || "",
        category: item.category,
        image: item.image,
        details: item.details || {},
        isStarter: true,
        origEn: item[base]
      };
    });
  } else {
    pool = state.customVocab.filter(v => v.category === folderId).map(item => ({
      en: item.en || "",
      de: item.de || "",
      it: item.it || "",
      es: item.es || "",
      fr: item.fr || "",
      category: item.category,
      image: item.image,
      details: item.details || {},
      isStarter: false
    }));
  }
  
  titleEl.textContent = `Words in Folder: ${folderName} (${pool.length})`;
  
  if (pool.length === 0) {
    wordsTableBody.innerHTML = `<tr><td colspan="6" class="empty-state" style="padding: 16px; text-align: center; color: var(--text-secondary);">No words in this folder yet. Drag and drop words here or manually add.</td></tr>`;
    return;
  }

  // Select All Checkbox logic
  const chkAll = document.getElementById("chk-select-all-browse");
  if (chkAll) {
    chkAll.checked = false;
    chkAll.onclick = (e) => {
      document.querySelectorAll(".chk-select-browse").forEach(chk => {
        chk.checked = e.target.checked;
      });
    };
  }

  // Fix Selected Translations action
  const btnFixTrans = document.getElementById("btn-fix-selected-translations");
  if (btnFixTrans) {
    btnFixTrans.onclick = async () => {
      const selected = document.querySelectorAll(".chk-select-browse:checked");
      if (selected.length === 0) {
        alert("Please select at least one word to translate/fix.");
        return;
      }

      const origText = btnFixTrans.textContent;
      btnFixTrans.disabled = true;
      btnFixTrans.textContent = `⏳ Fixing 0/${selected.length}...`;

      let count = 0;
      for (const chk of selected) {
        const baseKey = chk.dataset.baseKey;
        const targetKey = chk.dataset.targetKey;
        const isCustom = chk.dataset.custom === "true";
        
        let item = null;
        if (isCustom) {
          item = state.customVocab.find(v => 
            v.category === folderId &&
            (v[base] || "").toLowerCase() === baseKey.toLowerCase() &&
            (v[target] || "").toLowerCase() === targetKey.toLowerCase()
          );
        } else {
          const override = state.editedStarters[baseKey] || {};
          const starter = STARTER_VOCAB_RAW.find(v => 
            v.category === folderId &&
            (v[base] || "").toLowerCase() === baseKey.toLowerCase()
          );
          if (starter) {
            item = {
              en: override.en || starter.en || baseKey,
              de: override.de || starter.de || "",
              it: override.it || starter.it || "",
              es: override.es || starter.es || "",
              fr: override.fr || starter.fr || "",
              category: starter.category,
              image: starter.image,
              details: override.details || starter.details || {},
              isStarter: true,
              origEn: baseKey
            };
          }
        }

        if (item) {
          const baseLang = item.en ? "en" : item.de ? "de" : item.it ? "it" : item.es ? "es" : "fr";
          const baseText = item[baseLang];

          const hasKey = state.openaiKey || state.grokKey || state.geminiKey;
          if (hasKey) {
            const aiResult = await translateAndDetectWithAI(baseText);
            if (aiResult) {
              item.en = sanitizeWordTranslation(aiResult.en, "en");
              item.de = sanitizeWordTranslation(aiResult.de, "de");
              item.it = sanitizeWordTranslation(aiResult.it, "it");
              item.es = sanitizeWordTranslation(aiResult.es, "es");
              item.fr = sanitizeWordTranslation(aiResult.fr, "fr");
            }
          } else {
            await fillMissingTranslations(item, baseLang);
          }

          if (isCustom) {
            const idx = state.customVocab.findIndex(v => 
              v.category === folderId &&
              (v[base] || "").toLowerCase() === baseKey.toLowerCase() &&
              (v[target] || "").toLowerCase() === targetKey.toLowerCase()
            );
            if (idx !== -1) {
              state.customVocab[idx] = { ...state.customVocab[idx], ...item };
            }
          } else {
            state.editedStarters[baseKey] = {
              en: item.en,
              de: item.de,
              it: item.it,
              es: item.es,
              fr: item.fr
            };
          }
        }

        count++;
        btnFixTrans.textContent = `⏳ Fixing ${count}/${selected.length}...`;
      }

      saveState();
      renderBrowseWordsList(folderId);
      btnFixTrans.disabled = false;
      btnFixTrans.textContent = origText;
      alert(`Successfully updated translations for ${selected.length} items!`);
    };
  }
  
  const esc = (s) => (s || "").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  pool.forEach(vocab => {
    const isCustom = !vocab.isStarter;
    const key = isCustom ? vocab.en : vocab.origEn;
    
    const stats = state.wordStats[vocab.en] || { attempts: 0, errors: 0, box: 1 };
    const box = stats.box || 1;
    const errors = stats.errors || 0;
    
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid rgba(255,255,255,0.04)";
    
    tr.setAttribute("draggable", "true");
    tr.ondragstart = (e) => {
      e.dataTransfer.setData("text/word-key", key);
      tr.style.opacity = "0.4";
    };
    tr.ondragend = () => {
      tr.style.opacity = "1";
    };

    const checkIsCommon = () => {
      if (vocab.isCommon !== undefined) return vocab.isCommon;
      const checkLangs = ["en", "de", "it", "es", "fr"];
      for (const lang of checkLangs) {
        const val = vocab[lang];
        if (val && isCommonWord(val, lang)) {
          return true;
        }
      }
      return false;
    };
    const isCommon = checkIsCommon();
    
    const inputHtml = (lang, val, isBold = false) => {
      const color = getLangColor(lang);
      const boldStyle = isBold ? "font-weight: 700;" : "";
      const displayVal = val || "";
      return `
        <div style="display: flex; align-items: center; width: 100%; position: relative;">
          <input type="text" class="browse-edit-input" style="${boldStyle} color: ${color};" 
                 value="${esc(displayVal)}" placeholder="(empty)"
                 autocomplete="off" spellcheck="false"
                 onkeydown="if(event.key === 'Enter') this.blur()">
        </div>
      `;
    };

    tr.innerHTML = `
      <td style="padding: 4px 8px; text-align: center;">
        <input type="checkbox" class="chk-select-browse" data-base-key="${esc(vocab[base])}" data-target-key="${esc(vocab[state.browseTargetLang])}" data-custom="${isCustom}" style="cursor: pointer; width: 16px; height: 16px;">
      </td>
      <td style="padding: 4px 8px; text-align: center;">
        <button type="button" class="star-toggle-btn" style="background: none; border: none; cursor: pointer; font-size: 1.1rem; padding: 0; outline: none; transition: transform 0.1s; ${isCommon ? 'color: #f59e0b; opacity: 1;' : 'color: var(--text-secondary); opacity: 0.15;'}" 
                data-word-key="${esc(key)}" data-custom="${isCustom}" title="${isCommon ? 'Common Word (Click to remove)' : 'Not Common Word (Click to mark)'}" 
                onclick="event.preventDefault(); event.stopPropagation(); window.toggleCommonWord(this)"
                onmouseover="this.style.opacity='0.8'; this.style.transform='scale(1.2)'"
                onmouseout="this.style.opacity='${isCommon ? '1' : '0.15'}'; this.style.transform='scale(1)'">
          ${isCommon ? '⭐' : '☆'}
        </button>
      </td>
      <td style="padding: 4px 8px;">${inputHtml(base, vocab[base], true)}</td>
      <td style="padding: 4px 8px;">${inputHtml(state.browseTargetLang, vocab[state.browseTargetLang])}</td>
      <td style="padding: 4px 8px; text-align: center;">
        <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
          <button type="button" class="tree-action-btn" title="Save Changes" data-original-base="${esc(vocab[base])}" data-original-target="${esc(vocab[state.browseTargetLang])}" data-custom="${isCustom}" onclick="event.preventDefault(); event.stopPropagation(); window.saveRowChanges(this)">💾</button>
          <button type="button" class="tree-action-btn" title="Delete" style="color: var(--error-color);" data-original-base="${esc(vocab[base])}" data-original-target="${esc(vocab[state.browseTargetLang])}" data-custom="${isCustom}" onclick="event.preventDefault(); event.stopPropagation(); window.triggerDeleteWord(this)">❌</button>
        </div>
      </td>
    `;
    
    wordsTableBody.appendChild(tr);
  });
}

window.toggleCommonWord = function(buttonEl) {
  const wordKey = buttonEl.dataset.wordKey;
  const isCustom = buttonEl.dataset.custom === "true";
  const base = state.baseLang || "en";
  const target = state.browseTargetLang || "de";
  
  if (isCustom) {
    const idx = state.customVocab.findIndex(v => v.en === wordKey);
    if (idx !== -1) {
      const vocab = state.customVocab[idx];
      const currentVal = vocab.isCommon !== undefined 
        ? vocab.isCommon 
        : (isCommonWord(vocab[base], base) || isCommonWord(vocab[target], target));
      state.customVocab[idx].isCommon = !currentVal;
    }
  } else {
    if (!state.editedStarters[wordKey]) {
      state.editedStarters[wordKey] = {};
    }
    const starterVocabRaw = window.STARTER_VOCAB_RAW || [];
    const starterMatch = starterVocabRaw.find(w => w.en === wordKey || w.origEn === wordKey);
    let currentVal = false;
    if (state.editedStarters[wordKey].isCommon !== undefined) {
      currentVal = state.editedStarters[wordKey].isCommon;
    } else if (starterMatch) {
      currentVal = (isCommonWord(starterMatch[base], base) || isCommonWord(starterMatch[target], target));
    }
    state.editedStarters[wordKey].isCommon = !currentVal;
  }
  
  saveState();
  const folderSelect = document.getElementById("select-folder");
  const folderId = folderSelect ? folderSelect.value : "all";
  renderBrowseWordsList(folderId);
};

window.saveRowChanges = async function(buttonEl, originalBaseKey, originalTargetKey, isCustom) {
  console.log("=== saveRowChanges triggered ===");
  if (originalBaseKey === undefined) {
    originalBaseKey = buttonEl.dataset.originalBase;
    originalTargetKey = buttonEl.dataset.originalTarget;
    isCustom = buttonEl.dataset.custom === "true";
  }
  console.log("originalBaseKey:", originalBaseKey);
  console.log("originalTargetKey:", originalTargetKey);
  console.log("isCustom:", isCustom);
  
  // CRITICAL: Read input values IMMEDIATELY before any await (Edge compatibility)
  const tr = buttonEl.closest("tr");
  if (!tr) {
    console.error("Row element not found");
    return;
  }
  
  const inputs = tr.querySelectorAll("input.browse-edit-input");
  console.log("Inputs count in row:", inputs.length);
  if (inputs.length < 2) {
    console.error("Required inputs not found in row");
    return;
  }
  
  const baseVal = inputs[0].value.trim();
  const targetVal = inputs[1].value.trim();
  console.log("Read input values -> base:", baseVal, "target:", targetVal);
  
  const base = state.baseLang || "en";
  const target = state.browseTargetLang || "de";
  console.log("Active languages -> baseLang:", base, "browseTargetLang:", target);
  
  if (!baseVal || !targetVal) {
    alert("Both translation fields must have a value.");
    return;
  }
  
  const cleanBaseVal = sanitizeWordTranslation(baseVal, base);
  const cleanTargetVal = sanitizeWordTranslation(targetVal, target);
  console.log("Cleaned values -> base:", cleanBaseVal, "target:", cleanTargetVal);

  // Directly query/request directory write permissions within the click event user gesture context
  if (isCustom && state.icloudHandle) {
    console.log("Checking iCloud/local sync folder write permissions...");
    try {
      const perm = await state.icloudHandle.queryPermission({ mode: "readwrite" });
      console.log("Current permission status:", perm);
      if (perm !== "granted") {
        const req = await state.icloudHandle.requestPermission({ mode: "readwrite" });
        console.log("Requested permission outcome:", req);
        if (req !== "granted") {
          alert("Directory write permission denied. Changes cannot be saved to folder files.");
          return;
        }
      }
    } catch (err) {
      console.error("FS Permission check error:", err);
    }
  }
  
  // 1. Migrate stats and cache if base word is edited
  if (originalBaseKey !== cleanBaseVal) {
    console.log("Base word edited. Migrating stats & cache...");
    if (state.wordStats[originalBaseKey]) {
      state.wordStats[cleanBaseVal] = state.wordStats[originalBaseKey];
      delete state.wordStats[originalBaseKey];
    }
    if (state.dictionaryCache && state.dictionaryCache[originalBaseKey]) {
      state.dictionaryCache[cleanBaseVal] = state.dictionaryCache[originalBaseKey];
      delete state.dictionaryCache[originalBaseKey];
    }
  }
  
  if (isCustom) {
    const folderId = state.selectedBrowseFolderId;
    console.log("Searching in customVocab for category:", folderId);
    const idx = state.customVocab.findIndex(v => 
      v.category === folderId &&
      (v[base] || "").toLowerCase() === originalBaseKey.toLowerCase() &&
      (v[target] || "").toLowerCase() === originalTargetKey.toLowerCase()
    );
    console.log("findIndex result index:", idx);
    
    if (idx !== -1) {
      state.customVocab[idx][base] = cleanBaseVal;
      state.customVocab[idx][target] = cleanTargetVal;
      
      // Keep compatibility fields
      if (base === "en") {
        state.customVocab[idx].en = cleanBaseVal;
        if (state.customVocab[idx].origEn) state.customVocab[idx].origEn = cleanBaseVal;
      }
      if (target === "en") {
        state.customVocab[idx].en = cleanTargetVal;
        if (state.customVocab[idx].origEn) state.customVocab[idx].origEn = cleanTargetVal;
      }
      if (base === state.selectedLang) {
        state.customVocab[idx].target = cleanBaseVal;
      }
      if (target === state.selectedLang) {
        state.customVocab[idx].target = cleanTargetVal;
      }
      
      state.customVocab[idx].lastUpdated = Date.now();
      
      // Auto-save to iCloud if enabled
      if (state.icloudHandle) {
        saveWordlistToICloud(state.customVocab[idx].category);
      }
    } else {
      alert(`Error: Word "${originalBaseKey}" could not be found in custom vocabulary database.`);
      return;
    }
  } else {
    // Standard starter vocabulary:
    if (!state.editedStarters[originalBaseKey]) {
      const starter = STARTER_VOCAB_RAW.find(v => 
        v.category === state.selectedBrowseFolderId &&
        (v[base] || "").toLowerCase() === originalBaseKey.toLowerCase()
      );
      if (starter) {
        state.editedStarters[originalBaseKey] = {
          en: starter.en || starter.origEn || (base === "en" ? originalBaseKey : ""),
          de: starter.de || (base === "de" ? originalBaseKey : ""),
          it: starter.it || (base === "it" ? originalBaseKey : ""),
          es: starter.es || (base === "es" ? originalBaseKey : ""),
          fr: starter.fr || (base === "fr" ? originalBaseKey : ""),
          category: starter.category,
          image: starter.image || starter.en
        };
      }
    }
    
    if (state.editedStarters[originalBaseKey]) {
      state.editedStarters[originalBaseKey][base] = cleanBaseVal;
      state.editedStarters[originalBaseKey][target] = cleanTargetVal;
      if (base === "en") {
        state.editedStarters[originalBaseKey].en = cleanBaseVal;
      }
      if (target === "en") {
        state.editedStarters[originalBaseKey].en = cleanTargetVal;
      }
    } else {
      alert(`Error: Starter word "${originalBaseKey}" could not be resolved.`);
      return;
    }
  }
  
  saveState();

  // Update the row IN-PLACE instead of rebuilding the entire DOM.
  // This avoids Edge's aggressive form-value restoration that reverts input values
  // when the DOM is torn down and rebuilt via renderBrowseList().
  const esc = (s) => (s || "").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  
  // Update input default values so they reflect the saved state
  inputs[0].value = cleanBaseVal;
  inputs[0].defaultValue = cleanBaseVal;
  inputs[0].setAttribute("value", cleanBaseVal);
  inputs[1].value = cleanTargetVal;
  inputs[1].defaultValue = cleanTargetVal;
  inputs[1].setAttribute("value", cleanTargetVal);
  
  // Update the save and delete buttons dataset attributes for the next action
  const saveBtn = tr.querySelector('button[title="Save Changes"]');
  if (saveBtn) {
    saveBtn.dataset.originalBase = cleanBaseVal;
    saveBtn.dataset.originalTarget = cleanTargetVal;
  }
  
  const delBtn = tr.querySelector('button[title="Delete"]');
  if (delBtn) {
    delBtn.dataset.originalBase = cleanBaseVal;
    delBtn.dataset.originalTarget = cleanTargetVal;
  }
  
  // Update the checkbox data attributes
  const chk = tr.querySelector(".chk-select-browse");
  if (chk) {
    chk.dataset.baseKey = cleanBaseVal;
    chk.dataset.targetKey = cleanTargetVal;
  }
  
  // Brief visual feedback on the save button
  if (saveBtn) {
    saveBtn.textContent = "✅";
    setTimeout(() => { saveBtn.textContent = "💾"; }, 1200);
  }
  
  updateCategoryCounts();
};



