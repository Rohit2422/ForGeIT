# ForGeIT — Chrome Extension Documentation

## Overview
ForGeIT is a powerful Chrome extension that provides tools for:
- Cleaning and converting HTML
- Fixing RTL text and punctuation
- Handling tables, lists, and numbering
- Converting XML and PDFs to structured HTML
- Performing OCR on images and PDFs

---

## Installation
1. Open Chrome and go to chrome://extensions/
2. Enable Developer Mode (top right)
3. Click “Load unpacked”
4. Select the extension folder
5. The extension will appear in your toolbar

---

## Features

### Generate TOC
- Scans h1–h15 headings
- Builds a floating, interactive TOC
- Supports search, insert, copy, and export

### HTML Lossless Cleaner
- Removes empty <p>, <div>, and headings
- Normalizes whitespace
- Preserves table and footnote content

### XML → HTML Converter
- Converts structured XML into clean HTML
- Fixes footnotes, URLs, and headings

### OCR Tool
- Extracts text from images and PDFs
- Supports cropping and multi-page PDFs
- Converts output into clean HTML paragraphs

### PDF → HTML Converter
- Uses PDF.js + AI pipeline
- Detects tables and structure
- Outputs semantic HTML

### RTL Auto Fix
- ALT + ← sets dir="rtl"
- ALT + → removes dir

### RTL Table Fix
- ALT + ← sets table RTL
- CTRL + ALT + → aligns table right

### RTL Line-Break Fix
- Enter splits paragraphs
- Backspace merges paragraphs

### Multilingual List Fixer
- Supports ~58 languages
- Converts numbering to native scripts

### AI RTL Punctuation Fixer
- Detects RTL text
- Processes in chunks
- Fixes punctuation safely using AI

---

## Keyboard Shortcuts
| Feature | Shortcut | Action |
|--------|---------|--------|
| RTL Auto Fix | ALT + ← | Set RTL |
| RTL Auto Fix | ALT + → | Remove RTL |
| RTL Table Fix | CTRL + ALT + → | Align Right |
| RTL Line-Break Fix | Enter | Split Paragraph |

---

## API Key Management
- Multiple Gemini keys supported
- Each key has a 400-line limit
- The system auto-switches keys when needed

---

## Troubleshooting
| Issue | Fix |
|------|-----|
| TOC not showing | Ensure headings exist |
| OCR fails | Check internet |
| API key exhausted | Add new key |

---
