# FounderAI — Task Queue per Cowork

## CONTESTO DEL PROGETTO

**Stack:** Next.js + Supabase + Vercel + Anthropic API  
**Repo attivo:** `FounderAI-8/founder-ai` (NON `founderai-app` — repo legacy)  
**Vercel project attivo:** `founder-ai-iota` (NON `founderai-app` — progetto legacy)  
**Local path:** `C:\Users\Celi Edoardo\Desktop\founder-ai`  
**Live app:** `founder-ai-iota.vercel.app`  
**Modello chat:** `claude-sonnet-4-6`

**Regole critiche (RISPETTARE SEMPRE):**
- ❌ Mai concatenare comandi PowerShell con `&&` — eseguire uno alla volta
- ❌ Mai hardcodare API key nel codice sorgente — sempre da env var
- ❌ Mai modificare file via browser — usare Claude Code nel terminale
- ✅ Dopo ogni push verificare che il deploy su `founder-ai-iota` sia andato a buon fine
- ✅ Variabili d'ambiente su Vercel richiedono redeploy per avere effetto
- ✅ Supabase usa chiavi formato `sb_publishable_` (anon) e `sb_secret_` (service role) — le chiavi JWT legacy `eyJ...` sono disabilitate

**File chiave:**
- Chat route: `app/api/chat/route.ts`
- History route: `app/api/history/route.ts`
- Retrieval RAG: `lib/sloan-retrieval.ts`
- Tabelle Supabase: `chats`, `projects`, `messages`, `sloan_kb_chunks`

---

## 🔴 PRIORITÀ ALTA

### Task 0 — Fix: onboarding perde focus sull'input ad ogni carattere
- [x] **Problema:** `Textarea` (e `Label`) erano definiti come componenti interni al render di `Onboarding` in `app/onboarding/page.tsx` — React li ricreava a ogni render e rimontava il `<textarea>`, causando perdita di focus dopo ogni carattere digitato.
- [x] **Fix:** `Textarea`/`Label` spostati a module scope; `Textarea` ora riceve `value`/`onChange` via props invece di chiudere su `form`/`setForm`.
- [x] **Commit:** `284e173` — `fix: onboarding textarea loses focus on every keystroke`
- [x] **Push:** su `origin/main`
- [x] **Deploy:** verificato che `founder-ai-iota.vercel.app/onboarding` risponde correttamente post-push (nessun errore di build). Verifica limitata: nessun accesso a token/CLI Vercel in questa sessione per controllare i log di build.

---

### Task 1 — Fix: invio messaggi rotto nella sidebar multi-chat
- [x] **Problema:** `currentChatId` è `null` perché la chiamata a `/api/chats` fallisce al caricamento. Il messaggio non viene inviato.
- [x] **File da esaminare:** `app/api/chats/route.ts`, il componente sidebar, il componente chat principale
- [x] **Cosa fare:**
  1. Leggere `app/api/chats/route.ts` e verificare che la GET restituisca correttamente le chat dell'utente autenticato
  2. Verificare che il componente sidebar faccia la chiamata a `/api/chats` e setti `currentChatId` al primo risultato (o ne crei una nuova se la lista è vuota)
  3. Verificare che la POST a `/api/chats` (creazione nuova chat) funzioni e restituisca un `id` valido
  4. Assicurarsi che `currentChatId` venga passato correttamente alla funzione di invio messaggio
  5. Testare il flusso: caricare app → sidebar mostra chat → selezionare chat → inviare messaggio
- [x] **Dopo il fix:** fare commit con messaggio `fix: currentChatId null on sidebar load`
- [x] **Ri-verificato in sessione successiva:** codice di `app/mentor/page.tsx`/`app/api/chats/route.ts` (fallback + creazione chat) era corretto MA il bug persisteva ancora in produzione — causa reale trovata solo osservando la rete nel browser: `POST /api/chats` rispondeva 401 (`42501: new row violates row-level security policy for table "chats"`). Le route server-side (`app/api/chats/route.ts`, `app/api/history/route.ts`, `app/api/chat/route.ts`) usavano la anon/publishable key invece della service role key, quindi la RLS su `auth.uid()` rifiutava ogni insert/select. Passate a `SUPABASE_SERVICE_ROLE_KEY` (stesso pattern già usato in `lib/sloan-retrieval.ts`).
- [x] **Commit:** `f92696c` — `fix: use service role key in server-side Supabase routes to fix RLS 401`
- [x] **Push:** su `origin/main`
- [x] **Verifica end-to-end su `founder-ai-iota.vercel.app/mentor`:** bottone "Invia" attivo, messaggio inviato, Sloan ha risposto correttamente ("Funziona. Dimmi: su cosa stai lavorando?"). Confermato visivamente nel browser, non solo a livello di codice.

---

### Task 2 — Integrazione logo nella navbar
- [x] **Asset:** `public/Founder_AI_logo_transparent.png` (verificare che il file sia in `public/`)
- [x] **Cosa fare:**
  1. Trovare il componente navbar/header dell'app
  2. Sostituire il testo "FounderAI" o il placeholder con `<Image>` Next.js che punta a `/Founder_AI_logo_transparent.png`
  3. Dimensioni suggerite: altezza 32-40px, larghezza auto, preservare aspect ratio
  4. Verificare che appaia correttamente su mobile e desktop
- [x] **Dopo il fix:** fare commit con messaggio `feat: add logo to navbar`
- ⚠️ **NOTA:** `public/Founder_AI_logo_transparent.png` NON esiste nel repo. Il codice è pronto ma il file logo va aggiunto manualmente a `public/` prima del deploy.

---

## 🟡 PRIORITÀ MEDIA

### Task 3 — Dashboard redesign
- [x] **Obiettivo:** rendere la dashboard più chiara e orientata all'azione per il founder
- [x] **Cosa fare:**
  1. Leggere il componente dashboard attuale
  2. Aggiungere una sezione "Bentornato [nome founder]" con il nome dal profilo utente
  3. Mostrare le ultime 3 chat recenti con link diretto
  4. Aggiungere un pulsante "Nuova conversazione con Sloan" ben visibile
  5. Layout pulito, mobile-first
- [x] **Dopo il fix:** fare commit con messaggio `feat: dashboard redesign`

### Task 4 — Traduzione italiana UI
- [x] **Obiettivo:** tutte le stringhe visibili all'utente devono essere in italiano
- [x] **Cosa fare:**
  1. Fare una ricerca di tutte le stringhe in inglese visibili nell'UI (pulsanti, placeholder, label, messaggi di errore)
  2. Tradurle in italiano
  3. Esempi: "Send" → "Invia", "New Chat" → "Nuova chat", "Sign in" → "Accedi", "Loading..." → "Caricamento..."
  4. Il system prompt di Sloan rimane invariato (è già calibrato)
- [x] **Dopo il fix:** fare commit con messaggio `feat: italian UI translation`

---

## 🟢 BACKLOG (non fare ora)

### Task 5 — Deactivate vecchio progetto Vercel `founderai-app`
- [ ] Andare su Vercel dashboard → progetto `founderai-app` → Settings → Advanced → Delete project
- [ ] ⚠️ Prima verificare che nessun dominio attivo punti ancora a quel progetto
- [ ] **NOTA:** questo task richiede accesso manuale alla dashboard Vercel — non automatizzabile

### Task 6 — Sloan avatar nella chat
- [ ] Aggiungere un'icona/avatar accanto ai messaggi di Sloan nel thread chat
- [ ] Usare le iniziali "S" o un'icona placeholder in attesa del design definitivo

### Task 7 — User interviews beta
- [ ] Creare un form semplice di feedback in-app (3 domande max)
- [ ] Mostrarlo dopo la 5a conversazione con Sloan

---

## ISTRUZIONI PER COWORK

Lavora sui task in ordine dalla priorità alta alla media. Per ogni task:
1. Leggi i file rilevanti prima di modificare qualsiasi cosa
2. Fai le modifiche necessarie
3. Esegui i comandi git separatamente (non con `&&`)
4. Segna il task come `[x]` quando completato
5. Passa al task successivo senza aspettare conferma, a meno che non incontri un errore bloccante

Se trovi un errore che richiede una decisione (es. struttura del database non chiara, env var mancante), fermati, descrivi il problema e aspetta istruzioni.
