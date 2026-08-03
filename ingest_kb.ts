/**
 * FounderAI — Ingestion della Knowledge Base in Supabase pgvector
 * Percorso suggerito nel repo: scripts/ingest_kb.ts
 *
 * Uso:   npx tsx scripts/ingest_kb.ts ./kb
 *        (./kb contiene i file sloan_kb_section_*.md)
 *
 * Idempotente: per ogni sezione, svuota le righe esistenti e re-inserisce.
 * Rilancialo a ogni aggiornamento della KB.
 *
 * ENV richieste:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   VOYAGE_API_KEY            (oppure adatta embed() a OpenAI)
 *   VOYAGE_MODEL=voyage-3-large   VOYAGE_DIM=1024
 */

import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---------- Config ----------
const SUPABASE_URL = required("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");
const VOYAGE_API_KEY = required("VOYAGE_API_KEY");
const VOYAGE_MODEL = process.env.VOYAGE_MODEL ?? "voyage-3-large";
const MAX_CHUNK_TOKENS = 550; // sopra questa soglia il blocco viene sub-splittato
const TARGET_SUB_TOKENS = 450;
const EMBED_BATCH = 96; // input per chiamata embedding

const SECTION_TRACK_MAP: Record<string, string> = {
  "01": "universal",
  "02": "universal",
  "03": "universal",
  "04": "universal",
  "05": "startup",
  "06": "universal",
  "07": "startup",
  "08": "universal",
  "09": "startup",
  "10": "startup",
  "11": "startup",
  "12": "smb",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------- Tipi ----------
type Chunk = {
  section: string;
  section_title: string | null;
  category: string | null;
  block_id: string | null;
  block_title: string | null;
  content: string;
  token_count: number;
  track: string | null;
};

// ---------- Util ----------
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`ENV mancante: ${name}`);
  return v;
}
const estTokens = (s: string) => Math.ceil(s.length / 4);

// ---------- Parsing di un file .md ----------
function parseSection(filename: string, raw: string): Chunk[] {
  const sectionMatch = filename.match(/section[_-]?(\d+)/i);
  const section = sectionMatch ? sectionMatch[1].padStart(2, "0") : "00";

  const lines = raw.split("\n");

  // Titolo sezione: prima riga "# ..." che NON contiene "SLOAN KNOWLEDGE BASE"
  let sectionTitle: string | null = null;
  for (const l of lines) {
    if (/^#\s+/.test(l) && !/SLOAN KNOWLEDGE BASE/i.test(l)) {
      const t = l.replace(/^#\s+/, "").trim();
      sectionTitle = t.split(" — ")[0].trim(); // titolo breve prima dell'em-dash
      break;
    }
  }

  const chunks: Chunk[] = [];
  let currentCategory: string | null = null;
  let blockId: string | null = null;
  let blockTitle: string | null = null;
  let buffer: string[] = [];
  let started = false; // true dopo il primo "## " (saltiamo il preambolo)

  const flush = () => {
    if (!started || (blockId === null && blockTitle === null)) {
      buffer = [];
      return;
    }
    const body = buffer
      .filter((l) => l.trim() !== "---") // rimuovi le linee orizzontali
      .filter((l) => !/^\*Fine Sezione/i.test(l.trim())) // rimuovi footer
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    buffer = [];
    if (!body) return;

    // Prefisso di contesto: aiuta sia il retrieval sia l'iniezione in Sloan
    const label =
      `[Sez. ${section} — ${sectionTitle ?? ""}` +
      (blockId ? ` · ${blockId} ${blockTitle ?? ""}` : ` · ${blockTitle ?? ""}`) +
      (currentCategory ? ` · ${currentCategory}` : "") +
      `]`;

    const meta = { section, section_title: sectionTitle, category: currentCategory, block_id: blockId, block_title: blockTitle, track: SECTION_TRACK_MAP[section] ?? null };

    for (const piece of splitLongBody(body)) {
      const content = `${label}\n${piece}`;
      chunks.push({ ...meta, content, token_count: estTokens(content) });
    }
  };

  for (const line of lines) {
    if (/^#\s+/.test(line)) {
      // Header di livello 1: titolo sezione (skip) oppure categoria/blocco
      const text = line.replace(/^#\s+/, "").trim();
      if (/SLOAN KNOWLEDGE BASE/i.test(text)) continue;
      if (!started) continue; // riga del titolo sezione, già gestita
      flush();
      currentCategory = text;
      blockId = null;
      blockTitle = null; // una categoria da sola non è un blocco: aspetta il prossimo "##"
      continue;
    }
    if (/^##\s+/.test(line)) {
      flush();
      started = true;
      const header = line.replace(/^##\s+/, "").trim();
      const m = header.match(/^(\d+\.\d+)\s+(.*)$/);
      if (m) {
        blockId = m[1];
        blockTitle = m[2].trim();
      } else {
        blockId = null;
        blockTitle = header; // es. "NOTE D'USO PER SLOAN ..."
      }
      buffer = [];
      continue;
    }
    if (started && (blockId !== null || blockTitle !== null)) {
      buffer.push(line);
    }
  }
  flush();
  return chunks;
}

/** Sub-split di un body lungo su confini di paragrafo, senza spezzare le tabelle. */
function splitLongBody(body: string): string[] {
  if (estTokens(body) <= MAX_CHUNK_TOKENS) return [body];
  const paras = body.split(/\n{2,}/);
  const out: string[] = [];
  let acc: string[] = [];
  let accTok = 0;
  for (const p of paras) {
    const pt = estTokens(p);
    if (accTok > 0 && accTok + pt > TARGET_SUB_TOKENS) {
      out.push(acc.join("\n\n"));
      acc = [];
      accTok = 0;
    }
    acc.push(p);
    accTok += pt;
  }
  if (acc.length) out.push(acc.join("\n\n"));
  return out;
}

// ---------- Embedding (Voyage) ----------
async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: inputType }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  return json.data
    .sort((a: any, b: any) => a.index - b.index)
    .map((d: any) => d.embedding as number[]);
}

// ---------- Upsert per sezione ----------
async function upsertSection(section: string, chunks: Chunk[]) {
  // 1) embed in batch
  const embeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH).map((c) => c.content);
    const vecs = await embed(batch, "document");
    embeddings.push(...vecs);
  }
  // 2) svuota la sezione (idempotenza)
  const del = await supabase.from("sloan_kb_chunks").delete().eq("section", section);
  if (del.error) throw del.error;
  // 3) inserisci
  const rows = chunks.map((c, i) => {
    const { track, ...rest } = c;
    return { ...rest, metadata: { track }, embedding: embeddings[i] };
  });
  for (let i = 0; i < rows.length; i += 100) {
    const ins = await supabase.from("sloan_kb_chunks").insert(rows.slice(i, i + 100));
    if (ins.error) throw ins.error;
  }
}

// ---------- Main ----------
async function main() {
  const dir = process.argv[2] ?? "./kb";
  const onlySection = process.argv[3]; // es. "12" per processare solo quella sezione
  const files = readdirSync(dir)
    .filter((f) => /sloan_kb_section_\d+.*\.md$/i.test(f))
    .filter((f) => !onlySection || f.includes(`section_${onlySection}`) || f.includes(`section-${onlySection}`))
    .sort();
  if (!files.length) throw new Error(`Nessun file KB trovato in ${dir}`);

  let total = 0;
  for (const f of files) {
    const raw = readFileSync(join(dir, f), "utf8");
    const chunks = parseSection(f, raw);
    const section = chunks[0]?.section ?? "??";
    if (!chunks.length) {
      console.log(`⚠️  ${f}: 0 chunk (controlla il formato)`);
      continue;
    }
    await upsertSection(section, chunks);
    total += chunks.length;
    console.log(`✓ Sez. ${section} — ${f}: ${chunks.length} chunk`);
  }
  console.log(`\n✅ Ingestion completata: ${total} chunk su ${files.length} file.`);
}

main().catch((e) => {
  console.error("❌ Ingestion fallita:", e);
  process.exit(1);
});
