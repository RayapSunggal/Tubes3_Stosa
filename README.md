# Stosa - Judol Detector

<div align="center">


**A Chromium Browser Extension for Detecting Online Gambling Content Using Multiple Pattern Matching Algorithms**

Final Project for **IF2211 Algorithm Strategies**  
School of Electrical Engineering and Informatics (STEI)  
Institut Teknologi Bandung

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Algorithms](#algorithms)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Running the Project](#running-the-project)
- [Team Members](#team-members)

---

# Overview

**Stosa** is a Chromium-based browser extension designed to automatically detect indicators of online gambling content on web pages.

The extension utilizes multiple pattern matching and string matching algorithms to identify:

- Gambling-related keywords
- Obfuscated or modified keyword variations
- Suspicious text patterns
- Gambling-related content embedded in images through OCR (Optical Character Recognition)

In addition to detection, Stosa provides:

- Real-time content highlighting
- Interactive tooltips
- Blur/censorship functionality
- OCR-based image analysis
- Detection statistics dashboard

The project was developed as part of the **IF2211 Algorithm Strategies Final Project** and demonstrates the practical application of several classical string matching algorithms in a real-world browser extension.

---

# Features

## Exact String Matching

- Knuth-Morris-Pratt (KMP)
- Boyer-Moore
- Rabin-Karp
- Aho-Corasick

## Pattern Matching

- Regular Expressions (Regex)

## Approximate Matching

- Weighted Levenshtein Distance (Fuzzy Matching)

## Content Detection

- Real-time webpage scanning
- DOM text extraction
- Keyword highlighting
- Tooltip information display
- Blur/censorship mode
- OCR image scanning

## Analytics Dashboard

- Total detected keywords
- Match count by algorithm
- Execution time statistics
- Keyword occurrence comparison

## User Controls

- Enable/disable OCR scanning
- Enable/disable blur mode
- Automatic rescanning

---

# Algorithms

## Knuth-Morris-Pratt (KMP)

The Knuth-Morris-Pratt algorithm uses a Longest Prefix Suffix (LPS) table to avoid redundant comparisons during pattern matching.

### Complexity

| Metric | Complexity |
|----------|----------|
| Time | O(n + m) |
| Space | O(m) |

---

## Boyer-Moore

Boyer-Moore performs matching from right to left and uses the Last Occurrence heuristic to efficiently skip portions of the text.

### Complexity

| Metric | Complexity |
|----------|----------|
| Worst-case Time | O(nm) |
| Space | O(m) |

---

## Regular Expressions (Regex)

Regex is used to detect text patterns rather than exact keywords.

Example:

```text
SLOT99
MAXWIN88
MADU308
```

### Complexity

| Metric | Complexity |
|----------|----------|
| Time | O(n) |
| Space | O(r) |

---

## Aho-Corasick

Aho-Corasick uses a Trie and Failure Links to search for multiple keywords simultaneously in a single pass.

### Complexity

| Metric | Complexity |
|----------|----------|
| Time | O(L + n + r) |
| Space | O(L + r) |

Where:

- L = total length of all keywords
- n = text length
- r = number of matches

---

## Rabin-Karp

Rabin-Karp uses hashing and rolling hashes to efficiently compare patterns against text windows.

### Complexity

| Metric | Complexity |
|----------|----------|
| Average Time | O(n + m) |
| Worst-case Time | O(nm) |
| Space | O(1) |

---

## Weighted Levenshtein Distance

Weighted Levenshtein Distance enables fuzzy matching by assigning lower substitution costs to visually similar characters.

Examples:

```text
GACOR  → G4COR
MAXWIN → M4XWIN
HOKI   → H0KI
SLOT   → SL0T
```

### Complexity

| Metric | Complexity |
|----------|----------|
| Time | O(k × c × p × q) |
| Space | O(c + k + q + r) |

Where:

- k = number of keywords
- c = number of candidate tokens
- p = candidate length
- q = keyword length

---

# Technology Stack

### Frontend

- React 19
- React DOM 19
- TypeScript
- Vite

### Browser Extension

- Chrome Extension Manifest V3
- Content Scripts
- Background Service Workers

### OCR

- Tesseract.js

### Development Tools

- Node.js
- npm

---

# Installation

Clone the repository:

```bash
git clone https://github.com/RayapSunggal/Tubes3_Stosa.git
cd Tubes3_Stosa
```

Install dependencies:

```bash
npm install
```

---

# Running the Project

### Development Mode

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

The build output will be generated inside:

```text
dist/
```

---

# Loading the Extension in Chrome

1. Open Google Chrome.
2. Navigate to:

```text
chrome://extensions/
```

3. Enable **Developer Mode**.
4. Click **Load unpacked**.
5. Select the generated:

```text
dist/
```


6. The extension is now ready to use.

---

# Team Members

| Student ID | Name |
|------------|------|
| 13524010 | Audric Yusuf Maynard Simatupang |
| 13524052 | Raynard Fausta |
| 13524117 | Rainaldi Pratama F. Sembiring |

---
