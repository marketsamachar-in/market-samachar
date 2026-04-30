# Quiz Master — Question Bank

This folder is the source of truth for **all** Quiz Master questions.
Drop new question files here and run `npm run quiz-import` to load them
into the live SQLite bank.

## File format

Every file is a JSON array of question objects. One file can hold any
number of questions. Pick whatever filename helps you stay organised —
the importer reads every `*.json` in this folder.

```json
[
  {
    "external_id": "basics-001",
    "category": "Market Basics",
    "difficulty": 1,
    "question": "What does NSE stand for?",
    "options": [
      "National Stock Exchange",
      "New Stock Enterprise",
      "Nifty Stock Exchange",
      "National Securities Exchange"
    ],
    "correct": "A",
    "explanation": "NSE = National Stock Exchange of India, founded in 1992.",
    "source": "NSE India",
    "tags": ["nse", "basics"]
  }
]
```

## Field rules

| Field         | Required | Notes                                                         |
|---------------|----------|---------------------------------------------------------------|
| `external_id` | optional | If supplied, re-importing updates the same question in place. |
| `category`    | required | Must match one of the 18 categories in `quizMasterService.ts`.|
| `difficulty`  | required | Integer 1 – 5 (1 = beginner, 5 = expert).                     |
| `question`    | required | The prompt shown to the user.                                 |
| `options`     | required | Exactly 4 strings — A, B, C, D in this order.                 |
| `correct`     | required | One of `"A" "B" "C" "D"` — must match the `options` index.    |
| `explanation` | optional | Shown after the answer — use it to teach.                     |
| `source`      | optional | Citation: book, SEBI/RBI doc, news article, etc.              |
| `tags`        | optional | Free-form list of strings for future filtering.               |

## Categories (canonical list)

```
Market Basics            · Technical Analysis      · Fundamental Analysis
Options & Futures        · Indian Markets          · Global Markets
IPOs                     · Mutual Funds & SIPs     · Personal Finance
Tax & Capital Gains      · Banking                 · RBI & Monetary Policy
SEBI & Regulations       · Crypto                  · Famous Investors
Market History           · Economy & Macro         · Current Market Affairs
```

## Import command

```bash
npm run quiz-import
```

Re-running is idempotent because the importer matches on `external_id`.
Without `external_id`, the same JSON loaded twice creates duplicates —
so always set `external_id` for production batches.

## Naming convention (recommended)

```
01-market-basics.json
02-technical-analysis.json
03-fundamental-analysis.json
…
99-news-2026-04.json     ← rotating monthly news-derived batches
```
