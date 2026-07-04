# User Requirements Specification (URS): VocTrainer

This document outlines the User Requirements Specification (URS) for the VocTrainer web application, detailing the core functional specifications, system properties, and layouts.

---

## 1. System Overview
VocTrainer is an interactive, multi-language vocabulary learning system. It runs entirely client-side in the browser and leverages external translation and language model APIs to automate vocabulary expansion, categorization, and training.

---

## 2. Core Functional Requirements

### 2.1 Study & Test Engine
- **Vocabulary Pool:** Combines starter vocabularies (loaded dynamically from `vocab/vocab.json`) and custom user-imported vocabulary lists.
- **Bi-Directional Testing:** 
  - **Forward:** Base language to target language.
  - **Reverse:** Target language to base language.
- **Leitner Spaced Repetition System:**
  - Tracks individual word mastery statistics (attempts, errors, box levels 1–5, and last review timestamp).
  - Promotes correct words to higher boxes and resets incorrect words to Box 1.
  - Links statistics under a stable base English key (`origEn`) so that testing in both forward and reverse directions syncs to the same card record.
- **Partial Session Logging:**
  - If a study session is quit early (either via clicking **Quit Test** or navigating away through the sidebar menu), the session is not lost.
  - If at least 1 question is completed, the partial session is saved in the user's history and metrics (points earned, session count, accuracy) are immediately updated.
- **Word Blocks (Bubbles) Mode:**
  - **Single Words:** Automatically splits words of length >= 3 into at least 3 separate selectable block pieces. Short words (< 3 characters) are split into letters and padded with prefix/suffix distractor blocks to ensure a minimum of 3 blocks are always displayed.
  - **Phrases:** Splits multi-word phrases word-by-word (one block per word). If a phrase contains fewer than 3 words, it is padded with decoy word blocks to maintain a minimum of 3 option options.
  - **Flexible Drag Reordering:** Selected blocks can be dynamically reordered inside the selection zone. Users can drag and drop (desktop mouse) or touch-drag (iOS/iPad finger touch) block elements between words or to any position in the sentence to modify the word order before submitting.
- **Word Compare Mode:**
  - A matching play-mode that lists a batch of up to 5 words side-by-side.
  - Displays source words on the left column, and shuffled target translations on the right.
  - Users click a word first on one side and its corresponding match on the other. 
  - Correct matches gray out the buttons, mark them disabled (`.matched` class), play a success tone, and award points.
  - Incorrect matches highlight in red and reset selection.
- **Verb Conjugation Mode:**
  - A grammar-focused exercise available exclusively for verbs. 
  - Lists the 6 target subject pronouns (e.g. *ich, du, er/sie/es, wir, ihr, sie/Sie*) next to interactive empty slots, with the 6 shuffled present tense conjugations of the verb listed below.
  - Users place conjugations into their correct pronoun slots using **either tap-to-select or HTML5 drag-and-drop**.
  - Supports dragging cards from the pool into slots, dragging between slots to swap/reassign, or dragging back to the pool to reset.
  - **Live Evaluation**: Every placement instantly checks correctness for that slot, playing the success/incorrect audio cue and coloring the slot green or red in real-time.
  - On completing all correct placements, the session automatically submits and proceeds.
  - Resolves verb forms instantly using local irregular dictionaries and regular suffixes, while caching verified high-fidelity forms via background LLM requests.
- **Per-Question Timer Limit:**
  - Allows the user to configure a countdown timer of 5, 10, or 15 seconds per question (or Deactivated).
  - Automatically submits an empty/incorrect answer if the timer expires (hits 0 seconds).
- **Points Scoring System:**
  - Awarded for correct answers: base score of `100` points per correct answer.
  - **Mode Multipliers:** `typing` mode (x1), `speech` mode (x1), `bubbles` mode (x0.5), `compare` mode (x0.5), `conjugation` mode (x1).
  - **Speed Bonus:** If the timer is used, adds a **+20% bonus** for each remaining second left on the clock.
  - **Timer difficulty multipliers:** `5s` limit (x3), `10s` limit (x2), `15s` limit (x1.5).
- **Incorrect Answer Blocking:**
  - If the user submits an incorrect answer, pressing the **Enter** key will **not** bypass or proceed past the correction screen. This forces the user to see the correct answer, requiring them to manually click the **Next** button.
- **Focused Test Selection & Difficulty Weights:**
  - When starting a test session, the app divides the word pool into **Group A (Always Correct)** and **Group B (Difficult or Untested)**.
  - Targets exactly **15%** of the session's word count from Group A, and **85%** from Group B, prioritizing learning difficult or new terms.
  - Integrates the user's difficulty rating into the selection algorithm: **Hard** words receive a **3x selection weight** (prioritized for testing), and **Easy** words receive a **0.2x selection weight** (tested less frequently).
- **Word Difficulty Voting:**
  - Provides difficulty voting buttons (**🟢 Easy**, **🟡 Medium**, **🔴 Hard**) in the feedback panel for each word tested, allowing users to rate how difficult a word was and adjust its test selection frequency weight.

### 2.2 Translation Pipeline (All-Languages Backfill)
- **Unified 5-Language Schema:** Every word registered in the system must hold translations across all 5 supported languages: **English (EN), German (DE), Italian (IT), Spanish (ES), and French (FR)**.
- **Autodetect & Import:** When importing single words, the pipeline automatically detects the source language and uses the Google Translate GTX Web API to translate the word into all 4 other languages.
- **Automated Text Sanitizer:**
  - **Punctuation Stripping:** Automatically removes trailing periods (`.`) or trailing commas (`,`) from vocabulary words/translations.
  - **German Capitalization:** Capitalizes single German words/nouns by default, excluding common verbs, adjectives, prepositions, and articles.
  - **Other Languages Casing:** Enforces lowercase for single words in EN, IT, ES, FR unless they represent proper nouns (language names, days of week, months).
- **Wordlist-Scoped Duplicate Checks:** Duplicate checks are confined strictly within the target wordlist/category. Starter vocabularies and other folders are ignored during checks.

### 2.3 Import Workflows
- **Manual Import:** Add single words. Input fields auto-sanitize casing and punctuation.
- **Bulk Text Import:** Paste text blocks delimited by tab, comma, semicolon, colon, or hyphens. Interactive preview lets users verify, edit, and select/deselect rows before import.
- **Semicolon CSV Import:**
  - Allows pasting a direct 5-language semicolon CSV format (`EN;DE;IT;ES;FR`) to import pre-translated lists instantly without AI/pipeline translations.
- **File Upload Scraper:**
  - Allows drag-and-drop or browsing of text files (`.txt`, `.csv`) or PDF documents (`.pdf`).
  - Uses client-side **PDF.js** to extract page text, parses delimiter pairs, or tokenizes words, presenting them in an editable preview grid.

### 2.4 iCloud / Local Folder Sync
- **Local Sync Folder:** Replaces remote server cloud shares with a local sync folder (e.g., on your iCloud Drive) using the HTML5 File System Access API.
- **Auto-Saving:** Automatically writes wordlists to individual `[Wordlist_Name].json` files in the selected folder with a debounced saver.
- **Active List Toggling:** Allows users to check or uncheck individual JSON wordlists in the sync folder in Preferences, loading only selected files.
- **Sync Now & Deletion Sync:**
  - Includes a manual **Sync Now** button in Preferences to force-reload and merge active lists from the sync folder.
  - Deleting a folder inside the app automatically unchecks its sync status and deletes the JSON file from the sync folder.
- **IndexedDB Persistence:** Stores folder directory handles in IndexedDB, verifying directory read-write permissions across page reloads.

---

## 3. UI/UX & Layout Requirements

### 3.1 Directory Trees (Browse Vocabulary)
- Displays custom wordlists nested in a folder directory tree.
- Internal starter vocabularies are hidden from directory trees since they are read-only.
- **Visual Design:** Actions for folders/categories use clean, minimal icons (`✏️`, `❌`) instead of plain text buttons.
- Sequence of translation columns in tables must always show: **EN, DE, IT, ES, FR**.
- **Translation Fix (Selection Tool):**
  - Includes a checkbox selector column to select multiple words (with a Select All toggle in the header).
  - Highlights empty translations in red `(empty)`.
  - Includes a **🔄 Fix Translations** button allowing users to re-run selected rows through the translation pipeline to automatically backfill empty or broken translations.

### 3.2 Display Maximization (iOS & iPad)
- **Detection:** Auto-detects iPhone, iPad, or iPod devices on startup.
- **Canvas Override:** Expands the container to maximum screen boundaries (`100vw`/`100vh`) to utilize touch space.
- **Background & Card Style Override:** Disables floating window panels (no borders, border-radius, or box-shadows) and hides floating decorative blobs on iOS device targets.

### 3.3 Study Details Panel & Markdown Rendering
- **Reverso Context Lookup:**
  - Performs an automated scrape of Reverso Context via the `AllOrigins` CORS proxy fallback.
  - Automatically extracts key translations in context and sample sentence translation pairs for the target language.
- **Rich Details Layout (Markdown to HTML):**
  - Uses a client-side parser to render markdown syntax returned by AI models or dictionary fallbacks into styled HTML.
  - Automatically structures lists (`-` or `*`), headings (`###` or `####`), bold markers (`**`), and tables (`|`) into borderless dark glass cards, themed lists, and responsive tables.
  - **Explanation Language:** The AI model is strictly instructed via system guidelines to write all explanation commentaries, descriptions, and notes in the user's active **Base Language** (e.g. German descriptions when the base study language is DE).

### 3.4 Statistics Views
- **Global Progress:** Renders total sessions, average accuracy, and current streak.
- **Folder Performance:** Visualizes Leitner box mastery distribution (Box 1–5) and hardest words.
- **Word-by-Word Statistics Table:** Shows the exact attempts (correct, false), difficulty rating badge (Easy/Medium/Hard), and overall success ratio percentage for every single word in the selected wordlist.
