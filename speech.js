// ==========================================
// Web Speech API wrapper & Pronunciation Math
// ==========================================

function getLevenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function getWordSimilarity(word1, word2) {
  const w1 = word1.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
  const w2 = word2.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
  if (!w1 || !w2) return 0;
  if (w1 === w2) return 100;
  const dist = getLevenshteinDistance(w1, w2);
  const maxLen = Math.max(w1.length, w2.length);
  return Math.round(((maxLen - dist) / maxLen) * 100);
}

window.analyzePronunciation = function(targetPhrase, spokenPhrase) {
  const cleanTarget = targetPhrase.trim();
  const cleanSpoken = spokenPhrase.trim();
  
  const targetWords = cleanTarget.split(/\s+/).filter(Boolean);
  const spokenWords = cleanSpoken.split(/\s+/).filter(Boolean);
  
  const wordBreakdown = [];
  let totalScoreSum = 0;
  
  targetWords.forEach((tWord, tIdx) => {
    // Strip punctuation for matching comparison
    const plainTWord = tWord.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
    
    let bestScore = 0;
    let bestSpokenWord = "";
    const start = Math.max(0, tIdx - 2);
    const end = Math.min(spokenWords.length - 1, tIdx + 2);
    
    for (let i = start; i <= end; i++) {
      const plainSWord = spokenWords[i].replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
      const score = getWordSimilarity(plainTWord, plainSWord);
      if (score > bestScore) {
        bestScore = score;
        bestSpokenWord = spokenWords[i];
      }
    }
    
    totalScoreSum += bestScore;
    
    wordBreakdown.push({
      originalWord: tWord,
      score: bestScore,
      spoken: bestSpokenWord || ""
    });
  });
  
  const overallScore = targetWords.length > 0 ? Math.round(totalScoreSum / targetWords.length) : 0;
  
  return {
    overallScore,
    wordBreakdown
  };
};

// Global recognition wrapper
let speechEngineInstance = null;
let isRecordingPronunciation = false;

window.initSpeechRecognition = function(langCode, onStart, onResult, onError, onEnd) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("SpeechRecognition is not supported on this browser.");
    return false;
  }
  
  if (speechEngineInstance) {
    try {
      speechEngineInstance.abort();
    } catch(e){}
  }
  
  speechEngineInstance = new SpeechRecognition();
  speechEngineInstance.continuous = false;
  speechEngineInstance.interimResults = false;
  
  // Map standard languages
  let localLang = "en-US";
  if (langCode === "de") localLang = "de-DE";
  if (langCode === "it") localLang = "it-IT";
  if (langCode === "es") localLang = "es-ES";
  if (langCode === "fr") localLang = "fr-FR";
  
  speechEngineInstance.lang = localLang;
  
  speechEngineInstance.onstart = () => {
    isRecordingPronunciation = true;
    if (onStart) onStart();
  };
  
  speechEngineInstance.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (onResult) onResult(transcript);
  };
  
  speechEngineInstance.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    if (onError) onError(event.error);
  };
  
  speechEngineInstance.onend = () => {
    isRecordingPronunciation = false;
    if (onEnd) onEnd();
  };
  
  return true;
};

window.startListeningPronunciation = function() {
  if (speechEngineInstance && !isRecordingPronunciation) {
    try {
      speechEngineInstance.start();
      return true;
    } catch(e) {
      console.error("Failed to start speech recognition:", e);
    }
  }
  return false;
};

window.stopListeningPronunciation = function() {
  if (speechEngineInstance && isRecordingPronunciation) {
    try {
      speechEngineInstance.stop();
    } catch(e){}
  }
};
