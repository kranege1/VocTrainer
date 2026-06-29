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
  - If at least 1 question is completed, the partial session is saved in the user's history and metrics (XP, session count, accuracy) are immediately updated.
- **Word Blocks (Bubbles) Mode:**
  - **Single Words:** Automatically splits words of length >= 3 into at least 3 separate selectable block pieces. Short words (< 3 characters) are split into letters and padded with prefix/suffix distractor blocks to ensure a minimum of 3 blocks are always displayed.
  - **Phrases:** Splits multi-word phrases word-by-word (one block per word). If a phrase contains fewer than 3 words, it is padded with decoy word blocks to maintain a minimum of 3 option options.
  - **Flexible Drag Reordering:** Selected blocks can be dynamically reordered inside the selection zone. Users can drag and drop (desktop mouse) or touch-drag (iOS/iPad finger touch) block elements between words or to any position in the sentence to modify the word order before submitting.

### 2.2 Translation Pipeline (All-Languages Backfill)
- **Unified 5-Language Schema:** Every word registered in the system must hold translations across all 5 supported languages: **English (EN), German (DE), Italian (IT), Spanish (ES), and French (FR)**.
- **Autodetect & Import:** When importing single words, the pipeline automatically detects the source language and uses the Google Translate GTX Web API to translate the word into all 4 other languages.
- **Automated Text Sanitizer:**
  - **Punctuation Stripping:** Automatically removes trailing periods (`.`) or trailing commas (`,`) from vocabulary words/translations.
  - **German Capitalization:** Capitalizes single German words/nouns by default, excluding common verbs, adjectives, prepositions, and articles.
  - **Other Languages Casing:** Enforces lowercase for single words in EN, IT, ES, FR unless they represent proper nouns (language names, days of week, months).

### 2.3 Import Workflows
- **Manual Import:** Add single words. Input fields auto-sanitize casing and punctuation.
- **Bulk Text Import:** Paste text blocks delimited by tab, comma, semicolon, colon, or hyphens. Interactive preview lets users verify, edit, and select/deselect rows before import.
- **URL Scraper Scans:**
  - **Table Check:** Scan HTML page for `<table>` grids, parsing key column translation pairs.
  - **List Check:** Parses hyphens/delimiters in lists.
  - **Page Word Tokenizer (Fallback):** Scrapes all raw words on a page of length 4–15, shows the top 50 unique items, and displays them in a preview table.
- **File Upload Scraper:**
  - Allows drag-and-drop or browsing of text files (`.txt`, `.csv`) or PDF documents (`.pdf`).
  - Uses client-side **PDF.js** to extract page text, parses delimiter pairs, or tokenizes words, presenting them in an editable preview grid.

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
  - Includes a **🔄 Fix Translations** button allowing users to re-run selected rows through the translation pipeline (via LLM if key is set, or Google Translate GTX fallback) to automatically backfill empty or broken translations in the database.

### 3.2 Display Maximization (iOS & iPad)
- **Detection:** Auto-detects iPhone, iPad, or iPod devices on startup.
- **Canvas Override:** Expands the container to maximum screen boundaries (`100vw`/`100vh`) to utilize touch space.
- **Background & Card Style Override:** Disables floating window panels (no borders, border-radius, or box-shadows) and hides floating decorative blobs on iOS device targets.
