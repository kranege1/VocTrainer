import { state, saveState } from './state.js';
import { callLLM } from './modals.js';
import { renderQuestion } from './test-runner.js';

// Sound utility fallback
function playSound(name) {
  if (window.playSound) {
    window.playSound(name);
  }
}

// Strip articles utility fallback
function stripArticles(text, lang) {
  if (window.stripArticles) {
    return window.stripArticles(text, lang);
  }
  return text;
}

export const PRONOUNS = {
  de: ["ich", "du", "er/sie/es", "wir", "ihr", "sie/Sie"],
  it: ["io", "tu", "lui/lei", "noi", "voi", "loro"],
  es: ["yo", "tú", "él/ella", "nosotros", "vosotros", "ellos/ellas"],
  fr: ["je", "tu", "il/elle", "nous", "vous", "ils/elles"],
  en: ["I", "you", "he/she/it", "we", "you", "they"]
};

export const IMPORTANT_VERBS = {
  de: [
    { target: "sein", en: "to be" },
    { target: "haben", en: "to have" },
    { target: "werden", en: "to become" },
    { target: "können", en: "to be able to" },
    { target: "müssen", en: "to must / to have to" },
    { target: "wollen", en: "to want" },
    { target: "sollen", en: "to should" },
    { target: "dürfen", en: "to be allowed to" },
    { target: "wissen", en: "to know" },
    { target: "geben", en: "to give" },
    { target: "tun", en: "to do" },
    { target: "sagen", en: "to say" },
    { target: "gehen", en: "to go" },
    { target: "sehen", en: "to see" },
    { target: "kommen", en: "to come" },
    { target: "denken", en: "to think" },
    { target: "machen", en: "to make / to do" },
    { target: "stehen", en: "to stand" },
    { target: "finden", en: "to find" },
    { target: "bleiben", en: "to stay" },
    { target: "nehmen", en: "to take" },
    { target: "lassen", en: "to let / to leave" },
    { target: "zeigen", en: "to show" },
    { target: "bringen", en: "to bring" },
    { target: "leben", en: "to live" },
    { target: "fahren", en: "to drive / to ride" },
    { target: "sprechen", en: "to speak" },
    { target: "schreiben", en: "to write" },
    { target: "lesen", en: "to read" },
    { target: "arbeiten", en: "to work" }
  ],
  it: [
    { target: "essere", en: "to be" },
    { target: "avere", en: "to have" },
    { target: "fare", en: "to do / to make" },
    { target: "dire", en: "to say / to tell" },
    { target: "potere", en: "to be able to" },
    { target: "volere", en: "to want" },
    { target: "dovere", en: "to must / to have to" },
    { target: "andare", en: "to go" },
    { target: "sapere", en: "to know" },
    { target: "venire", en: "to come" },
    { target: "stare", en: "to stay / to be" },
    { target: "prendere", en: "to take" },
    { target: "parlare", en: "to speak" },
    { target: "trovare", en: "to find" },
    { target: "sentire", en: "to feel / to hear" },
    { target: "lasciare", en: "to leave" },
    { target: "vedere", en: "to see" },
    { target: "mettere", en: "to put" },
    { target: "pensare", en: "to think" },
    { target: "capire", en: "to understand" },
    { target: "finire", en: "to finish" },
    { target: "aprire", en: "to open" },
    { target: "chiudere", en: "to close" },
    { target: "leggere", en: "to read" },
    { target: "scrivere", en: "to write" },
    { target: "ascoltare", en: "to listen" },
    { target: "mangiare", en: "to eat" },
    { target: "bere", en: "to drink" },
    { target: "uscire", en: "to go out" },
    { target: "dare", en: "to give" }
  ],
  es: [
    { target: "ser", en: "to be (permanent)" },
    { target: "estar", en: "to be (temporary)" },
    { target: "haber", en: "to have (auxiliary)" },
    { target: "tener", en: "to have" },
    { target: "hacer", en: "to do / to make" },
    { target: "poder", en: "to be able to" },
    { target: "decir", en: "to say / to tell" },
    { target: "ir", en: "to go" },
    { target: "ver", en: "to see" },
    { target: "dar", en: "to give" },
    { target: "saber", en: "to know (information)" },
    { target: "querer", en: "to want / to love" },
    { target: "llegar", en: "to arrive" },
    { target: "pasar", en: "to pass / to happen" },
    { target: "deber", en: "to must / to owe" },
    { target: "poner", en: "to put" },
    { target: "parecer", en: "to seem" },
    { target: "hablar", en: "to speak" },
    { target: "quedar", en: "to stay / to remain" },
    { target: "creer", en: "to believe" },
    { target: "llevar", en: "to carry / to wear" },
    { target: "tomar", en: "to take / to drink" },
    { target: "encontrar", en: "to find" },
    { target: "entender", en: "to understand" },
    { target: "sentir", en: "to feel / to regret" },
    { target: "pensar", en: "to think" },
    { target: "escribir", en: "to write" },
    { target: "leer", en: "to read" },
    { target: "comer", en: "to eat" },
    { target: "vivir", en: "to live" }
  ],
  fr: [
    { target: "être", en: "to be" },
    { target: "avoir", en: "to have" },
    { target: "faire", en: "to do / to make" },
    { target: "dire", en: "to say / to tell" },
    { target: "aller", en: "to go" },
    { target: "voir", en: "to see" },
    { target: "savoir", en: "to know" },
    { target: "pouvoir", en: "to be able to" },
    { target: "vouloir", en: "to want" },
    { target: "devoir", en: "to must / to owe" },
    { target: "prendre", en: "to take" },
    { target: "venir", en: "to come" },
    { target: "mettre", en: "to put" },
    { target: "parler", en: "to speak" },
    { target: "trouver", en: "to find" },
    { target: "donner", en: "to give" },
    { target: "falloir", en: "to be necessary" },
    { target: "passer", en: "to pass / to spend" },
    { target: "comprendre", en: "to understand" },
    { target: "aimer", en: "to love / to like" },
    { target: "croire", en: "to believe" },
    { target: "demander", en: "to ask" },
    { target: "penser", en: "to think" },
    { target: "écrire", en: "to write" },
    { target: "lire", en: "to read" },
    { target: "finir", en: "to finish" },
    { target: "partir", en: "to leave" },
    { target: "sortir", en: "to go out" },
    { target: "manger", en: "to eat" },
    { target: "boire", en: "to drink" }
  ],
  en: [
    { target: "be", en: "be" },
    { target: "have", en: "have" },
    { target: "do", en: "do" },
    { target: "say", en: "say" },
    { target: "go", en: "go" },
    { target: "get", en: "get" },
    { target: "make", en: "make" },
    { target: "know", en: "know" },
    { target: "think", en: "think" },
    { target: "take", en: "take" },
    { target: "see", en: "see" },
    { target: "come", en: "come" },
    { target: "want", en: "want" },
    { target: "use", en: "use" },
    { target: "find", en: "find" },
    { target: "give", en: "give" },
    { target: "tell", en: "tell" },
    { target: "work", en: "work" },
    { target: "call", en: "call" },
    { target: "try", en: "try" },
    { target: "ask", en: "ask" },
    { target: "need", en: "need" },
    { target: "feel", en: "feel" },
    { target: "become", en: "become" },
    { target: "leave", en: "leave" },
    { target: "put", en: "put" },
    { target: "mean", en: "mean" },
    { target: "keep", en: "keep" },
    { target: "let", en: "let" },
    { target: "begin", en: "begin" }
  ]
};

export const IRREGULAR_VERBS = {
  de: {
    "sein": ["bin", "bist", "ist", "sind", "seid", "sind"],
    "haben": ["habe", "hast", "hat", "haben", "habt", "haben"],
    "werden": ["werde", "wirst", "wird", "werden", "werdet", "werden"],
    "können": ["kann", "kannst", "kann", "können", "könnt", "können"],
    "müssen": ["muss", "musst", "muss", "müssen", "müsst", "müssen"],
    "wollen": ["will", "willst", "will", "wollen", "wollt", "wollen"],
    "sollen": ["soll", "sollst", "soll", "sollen", "sollt", "sollen"],
    "dürfen": ["darf", "darfst", "darf", "dürfen", "dürft", "dürfen"],
    "wissen": ["weiß", "weißt", "weiß", "wissen", "wisst", "wissen"]
  },
  it: {
    "essere": ["sono", "sei", "è", "siamo", "siete", "sono"],
    "avere": ["ho", "hai", "ha", "abbiamo", "avete", "hanno"],
    "fare": ["faccio", "fai", "fa", "facciamo", "fate", "fanno"],
    "andare": ["vado", "vai", "va", "andiamo", "andate", "vanno"],
    "potere": ["posso", "puoi", "può", "possiamo", "potete", "possono"],
    "dovere": ["devo", "devi", "deve", "dobbiamo", "dovete", "devono"],
    "volere": ["voglio", "vuoi", "vuole", "vogliamo", "volete", "vogliono"],
    "sapere": ["so", "sai", "sa", "sappiamo", "sapete", "sanno"],
    "venire": ["vengo", "vieni", "viene", "veniamo", "venite", "vengono"],
    "dire": ["dico", "dici", "dice", "diciamo", "dite", "dicono"],
    "uscire": ["esco", "esci", "esce", "usciamo", "uscite", "escono"],
    "sedere": ["siedo", "siedi", "siede", "sediamo", "sedete", "siedono"]
  },
  es: {
    "ser": ["soy", "eres", "es", "somos", "sois", "son"],
    "estar": ["estoy", "estás", "está", "estamos", "estáis", "están"],
    "haber": ["he", "has", "ha", "hemos", "habéis", "han"],
    "tener": ["tengo", "tienes", "tiene", "tenemos", "tenéis", "tienen"],
    "ir": ["voy", "vas", "va", "vamos", "vais", "van"],
    "hacer": ["hago", "haces", "hace", "hacemos", "hacéis", "hacen"],
    "poder": ["puedo", "puedes", "puede", "podemos", "podéis", "pueden"],
    "querer": ["quiero", "quieres", "quiere", "queremos", "queréis", "quieren"],
    "decir": ["digo", "dices", "dice", "decimos", "decís", "dicen"],
    "venir": ["vengo", "vienes", "viene", "venimos", "venís", "vienen"],
    "saber": ["sé", "sabes", "sabe", "sabemos", "sabéis", "saben"]
  },
  fr: {
    "être": ["suis", "es", "est", "sommes", "êtes", "sont"],
    "avoir": ["ai", "as", "a", "avons", "avez", "ont"],
    "aller": ["vais", "vas", "va", "allons", "allez", "vont"],
    "faire": ["fais", "fais", "fait", "faisons", "faites", "font"],
    "pouvoir": ["peux", "peux", "peut", "pouvons", "pouvez", "peuvent"],
    "vouloir": ["veux", "veux", "veut", "voulons", "voulez", "veulent"],
    "devoir": ["dois", "dois", "doit", "devons", "devez", "doivent"],
    "savoir": ["sais", "sais", "sait", "savons", "savez", "savent"],
    "venir": ["viens", "viens", "vient", "venons", "venez", "viennent"],
    "prendre": ["prends", "prends", "prend", "prenons", "prenez", "prennent"]
  }
};

export function getRegularConjugation(infinitive, lang) {
  const clean = infinitive.toLowerCase().trim();
  if (lang === "de") {
    if (clean.endsWith("en")) {
      const base = clean.slice(0, -2);
      const e = (base.endsWith("t") || base.endsWith("d") || (base.endsWith("n") && !base.endsWith("rn") && !base.endsWith("ln"))) ? "e" : "";
      return [
        base + "e",
        base + e + "st",
        base + e + "t",
        base + "en",
        base + e + "t",
        base + "en"
      ];
    }
  }
  if (lang === "it") {
    if (clean.endsWith("are")) {
      const base = clean.slice(0, -3);
      return [base + "o", base + "i", base + "a", base + "iamo", base + "ate", base + "ano"];
    }
    if (clean.endsWith("ere")) {
      const base = clean.slice(0, -3);
      return [base + "o", base + "i", base + "e", base + "iamo", base + "ete", base + "ono"];
    }
    if (clean.endsWith("ire")) {
      const base = clean.slice(0, -3);
      return [base + "o", base + "i", base + "e", base + "iamo", base + "ite", base + "ono"];
    }
  }
  if (lang === "es") {
    if (clean.endsWith("ar")) {
      const base = clean.slice(0, -2);
      return [base + "o", base + "as", base + "a", base + "amos", base + "áis", base + "an"];
    }
    if (clean.endsWith("er")) {
      const base = clean.slice(0, -2);
      return [base + "o", base + "es", base + "e", base + "emos", base + "éis", base + "en"];
    }
    if (clean.endsWith("ir")) {
      const base = clean.slice(0, -2);
      return [base + "o", base + "es", base + "e", base + "imos", base + "ís", base + "en"];
    }
  }
  if (lang === "fr") {
    if (clean.endsWith("er")) {
      const base = clean.slice(0, -2);
      return [base + "e", base + "es", base + "e", base + "ons", base + "ez", base + "ent"];
    }
    if (clean.endsWith("ir")) {
      const base = clean.slice(0, -2);
      return [base + "is", base + "is", base + "it", base + "issons", base + "issez", base + "issent"];
    }
    if (clean.endsWith("re")) {
      const base = clean.slice(0, -2);
      return [base + "s", base + "s", base + "", base + "ons", base + "ez", base + "ent"];
    }
  }
  return [clean, clean, clean, clean, clean, clean];
}

export async function fetchConjugationsWithAI(verb, lang, wordKey) {
  const langNames = { en: "English", de: "German", it: "Italian", es: "Spanish", fr: "French" };
  const targetName = langNames[lang] || "German";
  
  const prompt = `Conjugate the verb "${verb}" in present tense for the language "${targetName}".
  Return ONLY a clean parseable JSON array of exactly 6 strings in order:
  [1st person singular, 2nd person singular, 3rd person singular, 1st person plural, 2nd person plural, 3rd person plural].
  Do not wrap in markdown code blocks. Do not write extra commentary.
  Example for German "haben": ["habe", "hast", "hat", "haben", "habt", "haben"]`;

  try {
    const resText = await callLLM(prompt, "You are a precise grammar assistant.");
    const cleanJson = resText.replace(/```json/g, "").replace(/```/g, "").trim();
    const arr = JSON.parse(cleanJson);
    if (Array.isArray(arr) && arr.length === 6) {
      if (!state.dictionaryCache) state.dictionaryCache = {};
      if (!state.dictionaryCache[wordKey]) state.dictionaryCache[wordKey] = {};
      if (!state.dictionaryCache[wordKey].conjugations) state.dictionaryCache[wordKey].conjugations = {};
      state.dictionaryCache[wordKey].conjugations[lang] = arr;

      const idx = state.customVocab.findIndex(v => v.en === wordKey || v.origEn === wordKey);
      if (idx !== -1) {
        if (!state.customVocab[idx].details) state.customVocab[idx].details = {};
        if (!state.customVocab[idx].details.conjugations) state.customVocab[idx].details.conjugations = {};
        state.customVocab[idx].details.conjugations[lang] = arr;
      } else {
        if (!state.editedStarters[wordKey]) {
          state.editedStarters[wordKey] = { details: { conjugations: {} } };
        }
        if (!state.editedStarters[wordKey].details) state.editedStarters[wordKey].details = {};
        if (!state.editedStarters[wordKey].details.conjugations) state.editedStarters[wordKey].details.conjugations = {};
        state.editedStarters[wordKey].details.conjugations[lang] = arr;
      }
      saveState();
      return arr;
    }
  } catch (e) {
    console.error("AI conjugation fetch failed for: " + verb, e);
  }
  return null;
}

export function getConjugationsForVerb(wordObj, lang) {
  const wordKey = wordObj.origEn || wordObj.en;
  const cleanInfinitive = stripArticles(wordObj.target, lang);

  if (wordObj.details && wordObj.details.conjugations && wordObj.details.conjugations[lang]) {
    return wordObj.details.conjugations[lang];
  }

  const irrs = IRREGULAR_VERBS[lang] || {};
  if (irrs[cleanInfinitive]) {
    return irrs[cleanInfinitive];
  }

  const regs = getRegularConjugation(cleanInfinitive, lang);

  const hasKey = state.openaiKey || state.grokKey || state.geminiKey || state.anthropicKey;
  if (hasKey) {
    fetchConjugationsWithAI(cleanInfinitive, lang, wordKey).then(aiArr => {
      if (aiArr && state.currentTest && state.currentTest.selectedMode === "conjugation" && state.currentTest.words) {
        const currentWord = state.currentTest.words[state.currentTest.index];
        if (currentWord && (currentWord.origEn || currentWord.en) === wordKey) {
          // If we are currently matches-based conjugation test, refresh it!
          if (window.buildConjugationMode) {
            window.buildConjugationMode();
          }
        }
      }
    });
  }

  return regs;
}

export function renderConjugationDashboard() {
  const lang = state.selectedLang || "it";
  const verbs = IMPORTANT_VERBS[lang] || IMPORTANT_VERBS.it;
  
  const langNames = { en: "English", de: "German", it: "Italian", es: "Spanish", fr: "French" };
  const targetName = langNames[lang] || lang.toUpperCase();
  document.getElementById("conjugation-dash-title").textContent = `Conjugations (${targetName})`;

  const container = document.getElementById("conjugation-dashboard-verbs-list");
  container.innerHTML = "";
  
  const query = (document.getElementById("conjugation-search-input")?.value || "").toLowerCase().trim();
  
  verbs.forEach((verb, idx) => {
    if (query) {
      const matchTarget = verb.target.toLowerCase();
      const matchEn = verb.en.toLowerCase();
      if (!matchTarget.includes(query) && !matchEn.includes(query)) {
        return; // Filter out search mismatches
      }
    }

    const fakeWordObj = { target: verb.target, en: verb.en, category: "verbs" };
    const conjugations = getConjugationsForVerb(fakeWordObj, lang);
    const pronouns = PRONOUNS[lang] || PRONOUNS.en;

    const card = document.createElement("div");
    card.className = "verb-dash-card";
    card.style.cssText = "background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 8px; transition: all 0.2s ease; cursor: pointer;";
    
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h3 style="margin: 0; font-size: 1.15rem; color: var(--accent-color); font-weight: 700;">${verb.target}</h3>
          <span style="font-size: 0.85rem; color: var(--text-secondary);">${verb.en}</span>
        </div>
        <div style="display: flex; gap: 8px;" onclick="event.stopPropagation();">
          <button class="btn btn-secondary btn-sm" style="margin: 0; padding: 6px 12px; min-height: 32px; font-size: 0.75rem;" id="btn-melody-${idx}">🔊 Melody</button>
          <button class="btn btn-primary btn-sm" style="margin: 0; padding: 6px 12px; min-height: 32px; font-size: 0.75rem;" id="btn-practice-${idx}">🎯 Match</button>
        </div>
      </div>
      <div class="verb-details-panel" id="verb-details-${idx}" style="display: none; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.85rem;">
        ${pronouns.map((pr, i) => `
          <div style="display: flex; justify-content: space-between; padding: 4px 8px; background: rgba(255,255,255,0.01); border-radius: 6px;">
            <span style="color: var(--text-secondary); font-weight: 600;">${pr}</span>
            <strong style="color: #fff;">${conjugations[i] || ""}</strong>
          </div>
        `).join("")}
      </div>
    `;
    
    card.onclick = () => {
      const details = document.getElementById(`verb-details-${idx}`);
      if (details.style.display === "none") {
        details.style.display = "grid";
        card.style.background = "rgba(255,255,255,0.04)";
      } else {
        details.style.display = "none";
        card.style.background = "rgba(255,255,255,0.02)";
      }
    };

    card.querySelector(`#btn-melody-${idx}`).onclick = (e) => {
      e.stopPropagation();
      const speechQueue = pronouns.map((pr, i) => ({
        text: `${pr} ${conjugations[i]}`,
        lang: lang
      }));
      if (window.playSpeechQueue) {
        window.playSpeechQueue(speechQueue);
      }
    };

    card.querySelector(`#btn-practice-${idx}`).onclick = (e) => {
      e.stopPropagation();
      startSingleVerbConjugationTest(verb.target, verb.en);
    };

    container.appendChild(card);
  });
}

export function startSingleVerbConjugationTest(verbTarget, verbEn) {
  const word = {
    target: verbTarget,
    en: verbEn,
    category: "verbs",
    lang: state.selectedLang,
    questionLang: state.baseLang || "en",
    answerLang: state.selectedLang
  };
  
  state.currentTest = {
    words: [word],
    index: 0,
    points: 0,
    correctCount: 0,
    wrongAnswers: [],
    selectedMode: "conjugation",
    lastAnswerCorrect: null
  };

  if (window.showView) window.showView("view-test");
  renderQuestion();
}

export function startAllVerbsConjugationTest() {
  const lang = state.selectedLang || "it";
  const verbs = IMPORTANT_VERBS[lang] || IMPORTANT_VERBS.it;
  
  const words = verbs.map(v => ({
    target: v.target,
    en: v.en,
    category: "verbs",
    lang: lang,
    questionLang: state.baseLang || "en",
    answerLang: lang
  })).sort(() => 0.5 - Math.random());

  state.currentTest = {
    words: words,
    index: 0,
    points: 0,
    correctCount: 0,
    wrongAnswers: [],
    selectedMode: "conjugation",
    lastAnswerCorrect: null
  };

  if (window.showView) window.showView("view-test");
  renderQuestion();
}

window.renderConjugationDashboard = renderConjugationDashboard;
window.startAllVerbsConjugationTest = startAllVerbsConjugationTest;
window.getConjugationsForVerb = getConjugationsForVerb;
