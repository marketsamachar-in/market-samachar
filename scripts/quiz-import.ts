/**
 * scripts/quiz-import.ts — load every *.json in data/quiz-bank/ into the DB.
 *
 *   npm run quiz-import         — import everything
 *   npm run quiz-import file.json — import only one file
 *
 * Idempotent: re-running with the same `external_id` updates in place.
 */

import fs from "fs";
import path from "path";
import { importQuestions, type ImportRow } from "../backend/src/services/quizMasterService.ts";

const BANK_DIR = path.join(process.cwd(), "data", "quiz-bank");

function pickFiles(arg?: string): string[] {
  if (!fs.existsSync(BANK_DIR)) {
    console.error(`[quiz-import] folder not found: ${BANK_DIR}`);
    process.exit(1);
  }
  if (arg) {
    const f = path.isAbsolute(arg) ? arg : path.join(BANK_DIR, arg);
    if (!fs.existsSync(f)) {
      console.error(`[quiz-import] file not found: ${f}`);
      process.exit(1);
    }
    return [f];
  }
  return fs.readdirSync(BANK_DIR)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .map((f) => path.join(BANK_DIR, f));
}

function loadFile(file: string): ImportRow[] {
  const raw = fs.readFileSync(file, "utf-8");
  let data: any;
  try { data = JSON.parse(raw); }
  catch (e) {
    console.error(`[quiz-import] invalid JSON in ${file}:`, (e as Error).message);
    return [];
  }
  if (!Array.isArray(data)) {
    console.error(`[quiz-import] ${file} must contain a JSON array`);
    return [];
  }
  return data as ImportRow[];
}

function main(): void {
  const files = pickFiles(process.argv[2]);
  if (files.length === 0) {
    console.log("[quiz-import] no JSON files found in", BANK_DIR);
    return;
  }

  let totalIns = 0, totalUpd = 0, totalSkip = 0;
  const allErrors: Array<{ file: string; index: number; reason: string }> = [];

  for (const file of files) {
    const rows = loadFile(file);
    if (rows.length === 0) continue;
    const result = importQuestions(rows);
    totalIns  += result.inserted;
    totalUpd  += result.updated;
    totalSkip += result.skipped;
    for (const e of result.errors) {
      allErrors.push({ file: path.basename(file), index: e.index, reason: e.reason });
    }
    console.log(
      `[quiz-import] ${path.basename(file).padEnd(28)} ` +
      `+${result.inserted} new · ${result.updated} updated · ${result.skipped} skipped`,
    );
  }

  console.log("");
  console.log(`[quiz-import] DONE — inserted ${totalIns}, updated ${totalUpd}, skipped ${totalSkip}`);
  if (allErrors.length > 0) {
    console.log(`[quiz-import] ${allErrors.length} validation error(s):`);
    for (const e of allErrors.slice(0, 20)) {
      console.log(`  · ${e.file} #${e.index}: ${e.reason}`);
    }
  }
}

main();
