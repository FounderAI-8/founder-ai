/**
 * FounderAI — Retrieval RAG per Sloan (lato server)
 * Percorso suggerito nel repo: lib/sloan-retrieval.ts
 *
 * ⚠️ Solo server-side: usa la SERVICE_ROLE_KEY. Non importare nel client.
 *
 * ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY, VOYAGE_MODEL
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY!;
const VOYAGE_MODEL = process.env.VOYAGE_MODEL ?? "voyage-3-large";

export type KbChunk = {
  section: string;
  section_title: string | null;
  category: string | null;
  block_id: string | null;
  block_title: string | null;
  content: string;
  similarity: number;
};

/** Embedding della query (input_type="query" → retrieval asimmetrico, qualità migliore). */
async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: [text], model: VOYAGE_MODEL, input_type: "query" }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  return json.data[0].embedding as number[];
}

/** Recupera i top-k chunk dalla KB per similarità coseno. */
export async function retrieveSloanChunks(
  query: string,
  opts?: { matchCount?: number; section?: string | null; track?: string | null }
): Promise<KbChunk[]> {
  if (!query?.trim()) return [];
  try {
    const embedding = await embedQuery(query);
    const { data, error } = await supabase.rpc("match_sloan_kb", {
      query_embedding: embedding,
      match_count: opts?.matchCount ?? 6,
      filter_section: opts?.section ?? null,
      filter_track: opts?.track ?? null,
    });
    if (error) {
      console.error("[sloan-retrieval] match_sloan_kb error:", error.message);
      return [];
    }
    return (data ?? []) as KbChunk[];
  } catch (e) {
    // Fallback robusto: se il retrieval fallisce, Sloan risponde comunque
    // col system prompt base (degrada con grazia, non rompe la chat).
    console.error("[sloan-retrieval] retrieve failed:", e);
    return [];
  }
}

/** I chunk già contengono il prefisso [Sez. ... · block_id title]: basta concatenarli. */
export function formatKbContext(chunks: KbChunk[]): string {
  return chunks.map((c) => c.content).join("\n\n---\n\n");
}

/** Comodità: query → stringa di contesto pronta per il system prompt. */
export async function retrieveSloanContext(
  query: string,
  opts?: { matchCount?: number; section?: string | null; track?: string | null }
): Promise<string> {
  const chunks = await retrieveSloanChunks(query, opts);
  return formatKbContext(chunks);
}

/**
 * (Opzionale, stage-aware) Combina i top-k semantici con qualche chunk
 * dello stage corrente del founder (Sez. 07), de-duplicando per id/blocco.
 */
export async function retrieveSloanContextStageAware(
  query: string,
  opts?: { matchCount?: number; pinStageChunks?: number }
): Promise<string> {
  const [semantic, stage] = await Promise.all([
    retrieveSloanChunks(query, { matchCount: opts?.matchCount ?? 6 }),
    retrieveSloanChunks(query, { matchCount: opts?.pinStageChunks ?? 2, section: "07" }),
  ]);
  const seen = new Set<string>();
  const merged: KbChunk[] = [];
  for (const c of [...stage, ...semantic]) {
    const key = `${c.section}:${c.block_id ?? c.block_title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(c);
  }
  return formatKbContext(merged);
}

/** Costruisce il system prompt di Sloan iniettando la KB recuperata. */
export function buildSloanSystemPrompt(opts: {
  basePrompt: string; // il system prompt arricchito di Sloan (50 errori, frameworks, regole)
  profileContext: string; // contesto profilo founder (memoria contestuale, Livello 2)
  kbContext: string; // output di retrieveSloanContext()
}): string {
  const kbBlock = opts.kbContext
    ? `

<knowledge_base>
Materiale di riferimento autorevole recuperato dalla knowledge base di Sloan
(Sez. 1–11: mental model, framework, libri, fallimenti, psicologia, stage,
domande, metriche, distribuzione, fundraising).
- Usalo come fonte di verità per framework, metriche, casi e benchmark.
- NON copiarlo verbatim: integralo nel tuo ragionamento e parla come Sloan.
- I dati marcati [MERCATO 2025/26] sono una fotografia datata, non una legge.
- Rispetta i confini di escalation (es. legale/term sheet, crisi personali).

${opts.kbContext}
</knowledge_base>`
    : "";

  return `${opts.basePrompt}\n\n${opts.profileContext}${kbBlock}`;
}

/* ============================================================
   ESEMPIO DI INTEGRAZIONE nella route di chat
   (es. app/api/chat/route.ts in Next.js)
   ------------------------------------------------------------

   import Anthropic from "@anthropic-ai/sdk";
   import {
     retrieveSloanContext,            // oppure retrieveSloanContextStageAware
     buildSloanSystemPrompt,
   } from "@/lib/sloan-retrieval";

   const anthropic = new Anthropic(); // legge ANTHROPIC_API_KEY dall'env

   export async function POST(req: Request) {
     const { messages, founderProfile } = await req.json();

     // 1) Ultimo messaggio dell'utente come query di retrieval
     const lastUser =
       [...messages].reverse().find((m: any) => m.role === "user")?.content ?? "";

     // 2) Recupera il contesto KB pertinente
     const kbContext = await retrieveSloanContext(lastUser, { matchCount: 6 });
     // (variante stage-aware:)
     // const kbContext = await retrieveSloanContextStageAware(lastUser, { matchCount: 6, pinStageChunks: 2 });

     // 3) Componi il system prompt di Sloan
     const system = buildSloanSystemPrompt({
       basePrompt: SLOAN_BASE_SYSTEM_PROMPT,            // il tuo prompt arricchito esistente
       profileContext: buildProfileContext(founderProfile), // Livello 2 (memoria contestuale)
       kbContext,                                        // Livello 3 (RAG)
     });

     // 4) Chiamata a Claude (modello di produzione che usi)
     const response = await anthropic.messages.create({
       model: "claude-3-7-sonnet-latest", // <-- sostituisci col modello che usi in prod
       max_tokens: 1500,
       system,
       messages,                          // storia completa della conversazione
     });

     return Response.json({ reply: response.content });
   }
   ============================================================ */
