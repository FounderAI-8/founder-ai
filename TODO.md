# FounderAI — TODO.md

> Questo file è il punto di ingresso per ogni sessione di Claude Code / Fable 5.
> L'agente deve leggerlo per intero PRIMA di scrivere codice, e aggiornarlo alla fine di ogni sessione.

---

## 1. Contesto progetto

- **Cos'è**: piattaforma AI mentor per founder al primo progetto imprenditoriale.
- **Stack**: Next.js, Supabase (auth + DB), Claude API per l'interfaccia di mentoring conversazionale.
- **Deploy**: Vercel — founder-ai-iota.vercel.app
- **Repo**: <inserisci path/URL repo — se non è ancora su GitHub, è il primo task da fare, vedi backlog>
- **Branch principale**: main (protetto — vedi regole sotto)

## 2. Convenzioni tecniche

- Linguaggio: TypeScript (Next.js, App Router)
- Styling: Tailwind CSS
- Struttura cartelle:
  - `app/page.tsx` — landing page (monta un HTML statico da `public/` via iframe)
  - `app/api/chat/route.ts` — endpoint del mentor AI (chiamata a Claude API)
  - `app/mentor/page.tsx` — interfaccia chat del mentor
  - `app/dashboard` — area protetta post-login
- Modello Claude usato dal mentor: **`claude-sonnet-5`** (aggiornato da `claude-sonnet-4-20250514`, deciso per Fase 1) — miglior rapporto ragionamento/costo per lavoro RAG-based, non Fable (tarato su coding agentico lungo, classificatori troppo aggressivi per chat con contenuti personali) né Opus 4.8 (2-2.5x più caro, da valutare come upgrade solo se il beta mostra limiti reali di Sonnet 5)
- Variabili d'ambiente richieste: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY` — verifica i nomi esatti in `.env.local`
- Comando dev locale: `npm run dev`
- Comando build/test: `npm run build` / `npm run test`
- Come deployare: push → deploy automatico su Vercel (founder-ai-iota.vercel.app)

## 3. Regole per l'agente (Claude Code / Fable 5)

1. Leggi questo file e lo stato del branch corrente prima di iniziare.
2. Lavora **un task alla volta**, in un branch dedicato (`feature/<nome-task>`), mai direttamente su main.
3. Per ogni feature: scrivi anche i test prima di segnare il task come fatto. Un task senza test verificabili non è "done".
4. Se una scelta di prodotto non è esplicita in questo file (es. logica di business, copy, prezzi), **fermati** e aggiungi la domanda in "Decisioni da prendere" invece di improvvisare.
5. Non pushare su main senza revisione umana. Fine sessione = branch pronto per PR, non merge automatico.
6. A fine sessione, aggiorna questo file: sposta i task completati in "Fatto" (Sez. 8), aggiungi eventuali nuovi task emersi, annota blocchi in "Decisioni da prendere" (Sez. 7).
7. Se il task è grande (>1 giorno di lavoro stimato), spezzalo in sotto-task verificabili singolarmente prima di iniziare.

## 4. Stato attuale (riassunto)

- [x] Setup ambiente e progetto (Node.js, Next.js, Tailwind)
- [x] Supabase: progetto creato, autenticazione (login/signup)
- [x] Dashboard protetta (richiede login)
- [x] Chat mentor AI funzionante (Claude API)
- [x] Landing page (HTML statico in iframe)
- [x] Form waitlist collegato a Supabase, con redirect a Typeform dopo invio
- [x] Deploy pubblico su Vercel (founder-ai-iota.vercel.app)

## 5. Backlog

> ⚠️ Proposta basata su quanto già costruito. Prima di lanciare l'agente, conferma o modifica — sono ipotesi mie, non decisioni prese.

### 🔴 Alta priorità
- [ ] Aggiornare il modello Claude usato dal mentor da `claude-sonnet-4-20250514` a `claude-sonnet-5`. Criterio: chat mentor funzionante col nuovo modello, nessuna regressione nelle risposte, testato su almeno un caso per ciascun track (startup/smb)
- [ ] Salvare lo storico delle conversazioni per utente su Supabase (oggi probabilmente si perde a fine sessione). Criterio: un utente che rientra rivede le chat precedenti

### 🟡 Media priorità
- [ ] Rate limiting / controllo costi sulle chiamate all'API Claude (per non avere sorprese in bolletta con più utenti)
- [ ] Onboarding: raccogliere settore/fase del progetto del founder per personalizzare i consigli del mentor
- [ ] Sostituire il flusso waitlist → Typeform con signup diretto in app (se l'obiettivo ora è farla usare, non solo raccogliere interesse)

### 🟢 Bassa priorità / nice to have
- [ ] Dashboard con metriche/progressi del founder nel tempo
- [ ] Email di follow-up automatiche dopo inattività

---

### 🧭 Sloan — Estensione mentor (nuovo, da questa sessione)

> Nota: il reticolo di modelli mentali (Munger) e il Lean Canvas sono GIÀ nella KB — non sono task da costruire, solo da verificare in uso.

- [ ] Onboarding: aggiungere domanda esplicita sul tipo di percorso dell'utente (startup venture-backed / PMI o attività tradizionale / libero professionista alle prime armi) per instradare il mentor sul playbook giusto
- [ ] Scrivere contenuti KB dedicati a imprenditori piccoli/medi non-startup (gestione cassa attività tradizionale, assunzioni PMI, marketing locale) — oggi la KB è tarata su founder tech/venture
- [ ] Aggiungere campo `track` (`universal` / `startup` / `smb`) ai metadati dei chunk KB — usa la colonna `metadata jsonb` già esistente in `sloan_kb_chunks`, non serve migrare lo schema
- [ ] Classificare le sezioni/blocchi esistenti per track: universal (Sez. 1 mental models, Sez. 4 libri, Sez. 6 psicologia, gran parte Sez. 3 framework generali) vs startup (Sez. 7 stage playbook, Sez. 9 benchmark VC, Sez. 11 fundraising)
- [ ] Scrivere nuova Sez. 12 KB dedicata a SMB/imprenditori tradizionali (cassa/liquidità, assunzioni team piccoli, marketing locale, gestione fornitori), poi ingerire con `ingest_kb.ts` esistente
- [ ] Estendere la funzione RPC `match_sloan_kb` con `filter_track` opzionale, sullo stesso pattern di `filter_section` già presente
- [ ] Aggiornare `sloan-retrieval.ts` per passare il track del founder (da onboarding) come filtro in retrieval: sempre `universal` + track dell'utente, mai l'altro track
- [ ] Priorità paesi confermata per ora: Italia / Europa (mercati piccoli) / USA — già in KB. Non espandere a "globale" ora: contenuti fiscali/legali/culturali validi per singolo paese sono lavoro di scrittura reale, si allarga per domanda reale, non per completezza speculativa
- [ ] Definire comportamento del mentor per paesi NON coperti esplicitamente: deve ragionare su fondamentali generali di business, non essere silente o genericamente inutile

### 📊 Dashboard adattiva (nuovo — vedi fasizzazione, non è un blocco unico)

> **Decisione presa**: si costruisce verso il pacchetto completo (Fase 1→3), MA il primo test con utenti reali parte appena la Fase 1 è pronta, senza aspettare Fase 2/3. Il feedback deve arrivare in tempo per correggere le fasi successive, non dopo.

**Fase 1 — MVP testabile (target: primi utenti reali qui)**
- [ ] Dashboard che si personalizza in base alle risposte onboarding (tipo business, paese, stage): risorse e prossimi passi curati, statici
- [ ] Collegamento dashboard ↔ mentor esistente per suggerimenti contestuali (sfrutta il RAG già costruito)
- [ ] **Gate di rilascio**: appena questa fase è stabile, si apre a un primo gruppo di utenti reali — non si aspetta il resto

**Fase 2 — in sviluppo parallelo, dopo il primo feedback**
- [ ] Primo connettore (proposta: Google Calendar — API mature, dati meno sensibili di finanze/social) per validare il pattern
- [ ] Framework generico per aggiungere altri connettori (OAuth, storage token, refresh)

**Fase 3 — proattività reale (richiede infrastruttura seria)**
- [ ] Scegliere quale fonte dati monitorare per prima tra social media ed entrate/uscite — sono due progetti distinti, non uno
- [ ] Sistema di job schedulati per leggere insight periodicamente
- [ ] Sistema di notifiche/alert proattivi (dove appaiono: email, dashboard, chat mentor?)
- [ ] Validare con gli utenti Fase 1 se la proattività su questi dati è davvero quello che vogliono, prima di costruirla

## 6. Fase 1 — Criteri di accettazione (gate di rilascio a utenti reali)

> Un task di questa lista non è "fatto" finché non sono vere TUTTE le condizioni sotto di esso. L'agente verifica ogni punto prima di segnare il task come completato in Sezione 5.

**1. Onboarding con profilazione**
- Chiede: tipo di percorso (startup venture-backed / PMI-attività tradizionale / libero professionista alle prime armi), settore/business, paese, stage (testo libero se non rientra nelle opzioni)
- Risposte salvate sul profilo utente in Supabase, leggibili da dashboard e da mentor
- Verifica: un utente completa l'onboarding, chiude il browser, rientra — le risposte ci sono ancora, non vengono richieste di nuovo
- Esiste una UI per modificare le risposte dopo (se non c'è già)

**2. Dashboard personalizzata (statica, no connettori)**
- In base a track+settore+paese+stage mostra risorse/prossimi passi curati
- Esiste almeno un set di contenuti distinto per ciascun track (startup / smb / libero professionista) — non lo stesso contenuto travestito
- Verifica: due utenti con onboarding diverso (track "startup" vs track "smb", stesso paese) vedono dashboard visibilmente diverse
- Nessuna combinazione di risposte produce pagina vuota o rotta — fallback sensato se manca un set dedicato

**3. Collegamento dashboard ↔ mentor**
- Da un suggerimento in dashboard si apre una chat col mentor con contesto già caricato
- Verifica: cliccando un suggerimento, la prima risposta del mentor fa riferimento esplicito a quel contesto

**4. Storico conversazioni persistito**
- Conversazioni salvate su Supabase per utente
- Verifica: chiudi il browser a metà conversazione, riapri — cronologia intatta, il mentor mantiene il contesto se riprendi a scrivere

**5. Sistema track KB (universal/startup/smb)**
- Campo `track` popolato nei metadata di tutti i chunk esistenti
- Nuova Sez. 12 (SMB) scritta e ingerita
- `filter_track` funzionante nella RPC `match_sloan_kb`
- Verifica: la stessa domanda posta da un profilo "startup" e da un profilo "smb" produce risposte del mentor visibilmente diverse nel taglio (no framework da round di finanziamento a un negozio di quartiere)

**6. Rate limiting**
- Limite: **40 messaggi al giorno per utente**, reset a mezzanotte
- Warning morbido in UI all'80% del limite (32/40)
- Utente che supera il limite vede un messaggio chiaro ("hai raggiunto il limite giornaliero, si resetta a mezzanotte"), non un errore criptico o chat rotta

**Non bloccano il rilascio Fase 1** (possono restare come sono per ora): Fase 2/3 dashboard, connettori.

## 7. Decisioni da prendere (bloccano l'agente — servono tue risposte)

Nessuna decisione bloccante al momento — tutte risolte in questa sessione (rate limit: 40 msg/giorno; modello mentor: claude-sonnet-5). Se emergono nuovi blocchi durante il lavoro, l'agente li aggiunge qui.

## 8. Fatto (archivio)

- [x] Setup iniziale ambiente
- [x] Autenticazione Supabase
- [x] Interfaccia chat AI
- [x] Deploy Vercel

## 9. Note tecniche / gotcha

- Non creare `app/api/mentor/route.ts` insieme a `app/mentor/page.tsx` — conflitto di routing già capitato, risolto rinominando l'endpoint in `app/api/chat/route.ts`.
- Su Supabase, la colonna `id` deve essere `GENERATED ALWAYS AS IDENTITY`, non `NOT NULL` senza auto-increment — altrimenti errore 400 in inserimento.
- Se lo schema Supabase non si aggiorna dopo modifiche via SQL: `NOTIFY pgrst, 'reload schema';`
- La landing page è un HTML statico in `public/`, montato via iframe in `app/page.tsx`. Se modifichi il form lì dentro, verifica che ogni `<script>` sia chiuso correttamente (bug già capitato che rompeva `handleSubmit`).

## Sicurezza — da fare prima di un lancio più ampio della beta chiusa

- [ ] `/api/social/connect` si fida di `userId` passato nel body della richiesta senza 
      verificarlo contro la sessione autenticata lato server. Un client malevolo potrebbe 
      passare lo `userId` di un altro founder, creando un profilo Zernio o collegando account 
      social a suo nome (impatto: costi Zernio non previsti, o account collegati alla persona 
      sbagliata). Fix: leggere l'utente dalla sessione autenticata (es. supabase.auth.getUser() 
      lato server) invece che dal body.
- [ ] `/api/chats` (PATCH) si fida di `chatId` passato dal client senza verificare che 
      appartenga all'utente che fa la richiesta. Rischio pratico basso (UUID casuali difficili 
      da indovinare), ma va sistemato prima di aprire il prodotto oltre un gruppo ristretto di 
      beta tester fidati.
- [ ] Controllo generale RLS su tutte le tabelle Supabase: `social_connections` è stata creata 
      con RLS abilitata ma senza nessuna policy, causando letture silenziosamente vuote dal 
      browser per giorni prima di essere scoperto (fix applicato: policy SELECT su 
      auth.uid() = user_id). Verificare se lo stesso problema esiste su altre tabelle create 
      di recente — eseguire per ogni tabella:
      `select tablename, rowsecurity from pg_tables where tablename = '<nome_tabella>';`
      `select policyname, cmd from pg_policies where tablename = '<nome_tabella>';`
      e assicurarsi che ogni tabella con RLS attiva abbia almeno le policy SELECT/INSERT/UPDATE 
      necessarie per il funzionamento previsto, altrimenti disabilitare RLS se l'accesso è 
      gestito solo lato server con service role key.

## Backlog raccolto — sessione di revisione note (da prioritizzare)

### Gruppo 1 — Quick win (poche ore ciascuno)
- [ ] Rimuovere l'alert "l'AI non è affidabile nello scrivere testo" nel composer — con GPT 
      Image 2 il problema è molto ridotto rispetto a gpt-image-1-mini, l'avviso è ora fuorviante
- [ ] Indicatore di progresso (barra/spinner) durante la generazione immagine nel composer — 
      oggi c'è solo il testo "Generazione…" sul bottone
- [ ] Sloan consiglia i connettori disponibili in base al tipo/settore dell'azienda del founder — 
      estensione naturale di quanto già fa nella dashboard

### Gruppo 2 — Ben definiti, impegno medio
- [ ] Feature standard da chatbot in Sloan: interrompere la generazione di un messaggio, 
      modificare un messaggio già inviato, allegare file alla chat
- [ ] Risposte a scelta multipla per Sloan quando serve chiarire qualcosa prima di rispondere 
      (pattern "bottoni cliccabili" invece di solo testo libero)
- [ ] Generatore copertine per YouTube (verificare se estendibile a cover TikTok/Instagram) — 
      probabilmente un preset dedicato nel composer esistente, non una funzione da zero
- [ ] Sloan più proattivo: suggerimenti di contenuto, analisi insight/performance, analisi e 
      consigli sulla gestione ads (se il founder le usa), oltre a quanto già fa (ricerca trend 
      virali). Si appoggia ai connettori/analytics già disponibili via Zernio.
- [ ] Sloan più "pratico": oltre alla knowledge base strategica, deve saper consigliare quali 
      strumenti/software usare per compiti operativi specifici (es. "quale POS per un bar"), 
      dare guide pratiche passo-passo (es. "come configuro Google Business Profile"), e aiutare 
      a risolvere problemi tecnici specifici che il founder segnala. Target primario: founder 
      con poca esperienza tecnica (soprattutto PMI/primo business), ma utile per tutti. 
      Probabilmente richiede web_search abilitato anche nella chat normale con Sloan (oggi 
      attivo solo per Calendario & Trend), non solo la KB statica.

### Gruppo 3 — Da chiarire/investigare prima di implementare
- [ ] Editor Design: migliorare lo snapping — oggi "trabalza" invece di agganciarsi con 
      decisione quando ci si avvicina a una linea di allineamento (probabile causa: il punto di 
      snap compete tra più linee candidate vicine tra loro e salta dall'una all'altra invece di 
      scegliere la più forte e restarci agganciato). Fix probabile: aumentare la soglia di 
      cattura e aggiungere isteresi (una volta agganciato, serve un movimento più ampio per 
      staccarsi) invece del semplice confronto di soglia attuale.
- [ ] Editor Design: valutare miglioramenti agli strumenti di modifica forme — specificare 
      cosa manca esattamente prima di implementare (rotazione? ridimensionamento più preciso? 
      ombre?)
- [ ] Fare una ricognizione di cosa offre Claude Design (prodotto Anthropic) per capire quali 
      funzionalità aggiuntive avrebbe senso valutare per il nostro editor — usare come fonte di 
      ispirazione, non come obiettivo di replica totale (stesso principio già applicato quando 
      abbiamo scartato la parità completa con Canva)

### Gruppo 4 — Grandi, da trattare come progetti a sé (documento di specifica dedicato prima di implementare)
- [ ] Editor video nel composer — salto di complessità enorme rispetto all'editor immagine 
      attuale (timeline, taglio, transizioni). Da NON trattare come "aggiunta" ma come progetto 
      indipendente con la sua sessione di pianificazione.
- [ ] Pubblicazione autonoma di Sloan (senza revisione del founder prima di pubblicare) — 
      CONFERMATO: deve essere un'opzione esplicita che il founder attiva consapevolmente nelle 
      impostazioni ("Sloan pubblica in autonomia"), MAI il comportamento di default. Rischio 
      reputazionale reale se un post generato male viene pubblicato senza controllo umano.
- [ ] Integrazione con uno strumento di gestione contabile/finanziaria (entrate, uscite, 
      investimenti, magazzino) che Lumina sta sviluppando separatamente — IN PAUSA fino a 
      quando quel progetto avrà una forma più definita da poter integrare. Nota di cautela: 
      consulenza finanziaria/fiscale specifica è un'area regolamentata in molti paesi — quando 
      si riprende questo punto, va chiarito se Sloan si limita a richiamare/integrare quello 
      strumento (rischio di compliance sullo strumento stesso, gestito separatamente) oppure 
      dà consigli finanziari lui stesso nella chat (rischio diretto da evitare).
- [ ] Scaricare file/video dei post generati — chiarire lo scope esatto: scaricare il post 
      generato sul proprio dispositivo, o importare/gestire video propri da modificare? Sono 
      due funzionalità diverse.

### Verifica separata (non implementazione)
- [ ] Testare Sloan con conversazioni mirate per verificare che sia ben bilanciato tra il track 
      "startup" e il track "smb/PMI" nella pratica, non solo nella progettazione della KB
