import { state } from './state.js';

export const POSSESSIVE_PRONOUNS_DATA = [
  {
    person: "1. P. Sg. (ich)",
    de: "mein / meine",
    forms: {
      ms: "il mio",   // Männlich Singular
      fs: "la mia",   // Weiblich Singular
      mp: "i miei",   // Männlich Plural
      fp: "le mie"    // Weiblich Plural
    }
  },
  {
    person: "2. P. Sg. (du)",
    de: "dein / deine",
    forms: {
      ms: "il tuo",
      fs: "la tua",
      mp: "i tuoi",
      fp: "le tue"
    }
  },
  {
    person: "3. P. Sg. (er / es)",
    de: "sein / seine",
    forms: {
      ms: "il suo",
      fs: "la sua",
      mp: "i suoi",
      fp: "le sue"
    }
  },
  {
    person: "3. P. Sg. (sie, Sg.)",
    de: "ihr / ihre",
    forms: {
      ms: "il suo",
      fs: "la sua",
      mp: "i suoi",
      fp: "le sue"
    }
  },
  {
    person: "1. P. Pl. (wir)",
    de: "unser / unsere",
    forms: {
      ms: "il nostro",
      fs: "la nostra",
      mp: "i nostri",
      fp: "le nostre"
    }
  },
  {
    person: "2. P. Pl. (ihr)",
    de: "euer / eure",
    forms: {
      ms: "il vostro",
      fs: "la vostra",
      mp: "i vostri",
      fp: "le vostre"
    }
  },
  {
    person: "3. P. Pl. (sie, Pl.)",
    de: "ihr / ihre",
    forms: {
      ms: "il loro",
      fs: "la loro",
      mp: "i loro",
      fp: "le loro"
    }
  },
  {
    person: "Höflichkeitsform (Sie)",
    de: "Ihr / Ihre",
    forms: {
      ms: "il Suo",
      fs: "la Sua",
      mp: "i Suoi",
      fp: "le Sue"
    }
  }
];

export function renderPossessivesDashboard() {
  const container = document.getElementById("possessives-dashboard-list");
  if (!container) return;

  container.innerHTML = "";
  const searchInput = document.getElementById("possessives-search-input");
  const query = (searchInput?.value || "").toLowerCase().trim();

  const labels = {
    ms: "Männlich Sg.",
    fs: "Weiblich Sg.",
    mp: "Männlich Pl.",
    fp: "Weiblich Pl."
  };

  POSSESSIVE_PRONOUNS_DATA.forEach((item, idx) => {
    // Filter matching
    if (query) {
      const matchPerson = item.person.toLowerCase().includes(query);
      const matchDe = item.de.toLowerCase().includes(query);
      const matchForms = Object.values(item.forms).some(f => f.toLowerCase().includes(query));
      if (!matchPerson && !matchDe && !matchForms) {
        return;
      }
    }

    const card = document.createElement("div");
    card.className = "possessive-dash-card";
    card.style.cssText = `
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: all 0.2s ease;
      cursor: pointer;
    `;

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <h3 style="margin: 0; font-size: 1.1rem; color: var(--accent-color); font-weight: 700;">${item.person}</h3>
            <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; background: rgba(76, 201, 240, 0.15); color: var(--accent-color); font-weight: 600;">${item.de}</span>
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-sm" style="margin: 0; padding: 6px 10px; min-height: 32px; font-size: 0.75rem;" id="btn-audio-possessive-${idx}" title="Pronounce 4 forms">
            🔊 Play
          </button>
        </div>
      </div>

      <div class="possessive-details-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">
        <div class="possessive-chip" data-form="${item.forms.ms}" style="background: rgba(76, 201, 240, 0.05); border: 1px solid rgba(76, 201, 240, 0.15); padding: 8px 12px; border-radius: 10px; display: flex; flex-direction: column; cursor: pointer;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase;">${labels.ms}</span>
          <span style="font-size: 0.95rem; font-weight: 700; color: #fff;">${item.forms.ms}</span>
        </div>
        <div class="possessive-chip" data-form="${item.forms.fs}" style="background: rgba(247, 37, 133, 0.05); border: 1px solid rgba(247, 37, 133, 0.15); padding: 8px 12px; border-radius: 10px; display: flex; flex-direction: column; cursor: pointer;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase;">${labels.fs}</span>
          <span style="font-size: 0.95rem; font-weight: 700; color: #fff;">${item.forms.fs}</span>
        </div>
        <div class="possessive-chip" data-form="${item.forms.mp}" style="background: rgba(76, 201, 240, 0.05); border: 1px solid rgba(76, 201, 240, 0.15); padding: 8px 12px; border-radius: 10px; display: flex; flex-direction: column; cursor: pointer;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase;">${labels.mp}</span>
          <span style="font-size: 0.95rem; font-weight: 700; color: #fff;">${item.forms.mp}</span>
        </div>
        <div class="possessive-chip" data-form="${item.forms.fp}" style="background: rgba(247, 37, 133, 0.05); border: 1px solid rgba(247, 37, 133, 0.15); padding: 8px 12px; border-radius: 10px; display: flex; flex-direction: column; cursor: pointer;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase;">${labels.fp}</span>
          <span style="font-size: 0.95rem; font-weight: 700; color: #fff;">${item.forms.fp}</span>
        </div>
      </div>
    `;

    // Audio click handler for 🔊 Play button
    const btnAudio = card.querySelector(`#btn-audio-possessive-${idx}`);
    if (btnAudio) {
      btnAudio.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const speechQueue = Object.values(item.forms).map(form => ({
          text: form,
          lang: "it"
        }));
        if (window.playSpeechQueue) {
          window.playSpeechQueue(speechQueue);
        }
      };
    }

    // Individual chip click to pronounce single form
    card.querySelectorAll(".possessive-chip").forEach(chip => {
      chip.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const formText = chip.dataset.form;
        if (formText && window.playSpeechQueue) {
          window.playSpeechQueue([{ text: formText, lang: "it" }]);
        }
      };
    });

    container.appendChild(card);
  });
}

// Window global registration
if (typeof window !== 'undefined') {
  window.renderPossessivesDashboard = renderPossessivesDashboard;
}
