/**
 * symbolExtractor — find NSE stock symbols mentioned in a news headline.
 * Pure regex + static company-name lookup. NO AI / NO LLM calls.
 *
 * Strategy:
 *   1. Search the title for known company-name aliases (case-insensitive).
 *      Aliases are hand-curated for the Nifty 50 + Nifty Next 50 plus a few
 *      well-known mid-caps that frequently appear in headlines.
 *   2. Fallback: detect ALL-CAPS tokens that match an actual NSE symbol.
 *
 * Returns the FIRST match (highest-confidence) or null.
 */

import { ALL_NSE_SYMBOLS } from "../data/nse-symbols.ts";

// ─── Curated alias map ───────────────────────────────────────────────────────
// Keys are LOWERCASED phrases that may appear in news headlines.
// Order matters: longer / more-specific aliases first so they win the match.
const COMPANY_ALIASES: ReadonlyArray<readonly [string, string]> = [
  // Banks
  ["hdfc bank",          "HDFCBANK"],
  ["icici bank",         "ICICIBANK"],
  ["axis bank",          "AXISBANK"],
  ["kotak mahindra",     "KOTAKBANK"],
  ["kotak bank",         "KOTAKBANK"],
  ["state bank of india","SBIN"],
  ["sbi card",           "SBICARD"],
  ["sbi life",           "SBILIFE"],
  ["sbi ",               "SBIN"],   // trailing space avoids matching "sbin"
  ["indusind bank",      "INDUSINDBK"],
  ["bank of baroda",     "BANKBARODA"],
  ["canara bank",        "CANBK"],
  ["punjab national",    "PNB"],
  ["idfc first",         "IDFCFIRSTB"],
  ["yes bank",           "YESBANK"],
  ["federal bank",       "FEDERALBNK"],

  // IT
  ["tata consultancy",   "TCS"],
  ["infosys",            "INFY"],
  ["wipro",              "WIPRO"],
  ["hcl tech",           "HCLTECH"],
  ["tech mahindra",      "TECHM"],
  ["ltimindtree",        "LTIM"],
  ["lti mindtree",       "LTIM"],
  ["mphasis",            "MPHASIS"],
  ["persistent system",  "PERSISTENT"],
  ["coforge",            "COFORGE"],
  ["oracle financial",   "OFSS"],

  // Reliance & telecom
  ["reliance industries","RELIANCE"],
  ["reliance retail",    "RELIANCE"],
  ["reliance jio",       "RELIANCE"],
  ["bharti airtel",      "BHARTIARTL"],
  ["airtel",             "BHARTIARTL"],
  ["vodafone idea",      "IDEA"],

  // Auto
  ["tata motors",        "TATAMOTORS"],
  ["maruti suzuki",      "MARUTI"],
  ["mahindra & mahindra","M&M"],
  ["mahindra and mahindra","M&M"],
  ["bajaj auto",         "BAJAJ-AUTO"],
  ["hero motocorp",      "HEROMOTOCO"],
  ["eicher motor",       "EICHERMOT"],
  ["ashok leyland",      "ASHOKLEY"],
  ["tvs motor",          "TVSMOTOR"],

  // FMCG / consumer
  ["hindustan unilever", "HINDUNILVR"],
  ["nestle india",       "NESTLEIND"],
  ["britannia",          "BRITANNIA"],
  ["dabur",              "DABUR"],
  ["godrej consumer",    "GODREJCP"],
  ["marico",             "MARICO"],
  ["tata consumer",      "TATACONSUM"],
  ["colgate",            "COLPAL"],
  ["page industries",    "PAGEIND"],
  ["asian paints",       "ASIANPAINT"],
  ["berger paint",       "BERGEPAINT"],
  ["pidilite",           "PIDILITIND"],
  ["titan",              "TITAN"],
  ["trent",              "TRENT"],
  ["dmart",              "DMART"],
  ["avenue supermarts",  "DMART"],

  // Pharma
  ["sun pharma",         "SUNPHARMA"],
  ["dr reddy",           "DRREDDY"],
  ["dr. reddy",          "DRREDDY"],
  ["divis lab",          "DIVISLAB"],
  ["divi's lab",         "DIVISLAB"],
  ["cipla",              "CIPLA"],
  ["lupin",              "LUPIN"],
  ["torrent pharma",     "TORNTPHARM"],
  ["aurobindo pharma",   "AUROPHARMA"],
  ["biocon",             "BIOCON"],
  ["zydus",              "ZYDUSLIFE"],
  ["apollo hospital",    "APOLLOHOSP"],
  ["max healthcare",     "MAXHEALTH"],
  ["fortis healthcare",  "FORTIS"],

  // Metals
  ["jsw steel",          "JSWSTEEL"],
  ["tata steel",         "TATASTEEL"],
  ["hindalco",           "HINDALCO"],
  ["jindal steel",       "JINDALSTEL"],
  ["sail",               "SAIL"],
  ["vedanta",            "VEDL"],
  ["nmdc",               "NMDC"],
  ["coal india",         "COALINDIA"],

  // Energy
  ["ongc",               "ONGC"],
  ["oil and natural gas","ONGC"],
  ["ntpc",               "NTPC"],
  ["powergrid",          "POWERGRID"],
  ["power grid",         "POWERGRID"],
  ["bpcl",               "BPCL"],
  ["bharat petroleum",   "BPCL"],
  ["hindustan petroleum","HINDPETRO"],
  ["indian oil",         "IOC"],
  ["adani green",        "ADANIGREEN"],
  ["adani power",        "ADANIPOWER"],
  ["adani transmission", "ADANIENSOL"],
  ["adani enterprise",   "ADANIENT"],
  ["adani port",         "ADANIPORTS"],
  ["adani total gas",    "ATGL"],

  // Cement
  ["ultratech",          "ULTRACEMCO"],
  ["ambuja cement",      "AMBUJACEM"],
  ["acc ltd",            "ACC"],
  ["shree cement",       "SHREECEM"],

  // Capital goods / infra
  ["larsen & toubro",    "LT"],
  ["larsen and toubro",  "LT"],
  ["l&t ",               "LT"],
  ["bhel",               "BHEL"],
  ["siemens",            "SIEMENS"],
  ["abb india",          "ABB"],
  ["bharat electronics", "BEL"],
  ["bharat dynamics",    "BDL"],
  ["hindustan aeronautics","HAL"],
  ["mazagon dock",       "MAZDOCK"],
  ["cochin shipyard",    "COCHINSHIP"],
  ["irfc",               "IRFC"],
  ["irctc",              "IRCTC"],

  // NBFC / finance
  ["bajaj finance",      "BAJFINANCE"],
  ["bajaj finserv",      "BAJAJFINSV"],
  ["cholamandalam",      "CHOLAFIN"],
  ["shriram finance",    "SHRIRAMFIN"],
  ["lic ",               "LICI"],
  ["life insurance corp","LICI"],
  ["hdfc life",          "HDFCLIFE"],
  ["jio financial",      "JIOFIN"],
  ["paytm",              "PAYTM"],
  ["zomato",             "ZOMATO"],
  ["nykaa",              "NYKAA"],
  ["fsn e-commerce",     "NYKAA"],
  ["pb fintech",         "POLICYBZR"],

  // Realty
  ["dlf ltd",            "DLF"],
  ["godrej properties",  "GODREJPROP"],
  ["oberoi realty",      "OBEROIRLTY"],
  ["prestige estate",    "PRESTIGE"],
  ["macrotech",          "LODHA"],
  ["lodha",              "LODHA"],

  // Misc large names
  ["itc ",               "ITC"],
  ["grasim",             "GRASIM"],
  ["dabur india",        "DABUR"],
  ["havells",            "HAVELLS"],
  ["bosch",              "BOSCHLTD"],
];

// ─── Symbol set (uppercase, for quick lookup) ────────────────────────────────
const SYMBOL_SET = new Set<string>(ALL_NSE_SYMBOLS);

// Symbols that are common English words / abbreviations and would generate
// false positives if matched bare in headlines (e.g. "ACC announced").
const AMBIGUOUS_SYMBOLS = new Set<string>([
  "ACC", "DLF", "HAL", "BSE", "NSE", "PNB", "IDEA", "MAP", "GIVE", "WAVE",
  "BIRD", "MAN", "BLUE", "REGAL", "STAR", "OK", "GO", "YES", "TODAY", "ONE",
  "EASY", "SHIP", "GAIL", "PFC", "CDSL", "BDL", "REC", "CIN", "NCL",
]);

/**
 * Extract a single NSE stock symbol from a news headline.
 * Returns null if no high-confidence match found.
 */
export function extractSymbolFromTitle(title: string): string | null {
  if (!title) return null;
  const lower = title.toLowerCase();

  // Pass 1: company-name alias match (highest confidence)
  for (const [alias, symbol] of COMPANY_ALIASES) {
    if (lower.includes(alias)) return symbol;
  }

  // Pass 2: token match — find an ALL-CAPS or symbol-like token.
  // Tokens are uppercase letters + digits, length 3-15.
  const tokens = title.match(/\b[A-Z][A-Z0-9&-]{2,14}\b/g);
  if (tokens) {
    for (const tok of tokens) {
      if (AMBIGUOUS_SYMBOLS.has(tok)) continue;
      if (SYMBOL_SET.has(tok)) return tok;
    }
  }

  return null;
}
