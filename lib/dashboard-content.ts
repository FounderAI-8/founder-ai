export const CHECKLIST_BY_TRACK: Record<string, { title: string; items: string[] }> = {
  startup: {
    title: "Cosa monitorare questa settimana",
    items: [
      "MRR e crescita mese su mese",
      "Burn rate e mesi di runway rimasti",
      "Retention/churn dei primi clienti",
      "CAC vs LTV, anche solo approssimati",
      "Prossima milestone verso un eventuale round",
    ],
  },
  smb: {
    title: "Cosa monitorare questa settimana",
    items: [
      "Forecast di cassa aggiornato a 8-13 settimane",
      "Margine lordo per prodotto/servizio principale",
      "Concentrazione clienti (% fatturato dal cliente più grande)",
      "Cuscinetto di cassa per la stagionalità",
      "Cosa succederebbe se sparissi per una settimana",
    ],
  },
};

export const NEXT_STEPS_BY_TRACK_STAGE: Record<string, Record<string, string[]>> = {
  startup: {
    "Solo un'idea": [
      "Valida il problema con 10-15 interviste reali prima di costruire qualsiasi cosa",
      "Definisci chi è esattamente il cliente, non una categoria generica",
      "Scrivi l'unica metrica-guida per i prossimi 30 giorni",
    ],
    "Sto costruendo l'MVP": [
      "Taglia l'MVP al minimo che risolve il problema principale",
      "Pianifica già ora le prime 10 conversazioni di vendita/onboarding",
      "Decidi la metrica che userai per giudicare il lancio",
    ],
    "Lanciato, pre-revenue": [
      "Concentrati su un solo canale di acquisizione ripetibile",
      "Parla con ogni utente che abbandona, capisci davvero perché",
      "Fissa un obiettivo chiaro di conversazioni a pagamento per validare il pricing",
    ],
    "Prime entrate ($1–$5k MRR)": [
      "Capisci quale canale ha portato i clienti che pagano di più e restano di più",
      "Inizia a tracciare il churn, anche a mano su un foglio",
      "Verifica se hai un prodotto ripetibile o solo i primi clienti \"di favore\"",
    ],
    "In crescita ($5k+ MRR)": [
      "Inizia a monitorare CAC e LTV, anche approssimati",
      "Valuta se ti serve un round o se puoi continuare a bootstrap",
      "Identifica il vincolo principale alla crescita: prodotto, distribuzione o team",
    ],
  },
  smb: {
    "Solo un'idea": [
      "Valida che qualcuno sia davvero disposto a pagare, non solo interessato",
      "Stima realisticamente i costi di avvio e il capitale di sicurezza necessario",
      "Capisci quale canale locale useresti per i primi clienti",
    ],
    "Sto costruendo l'MVP": [
      "Prepara un forecast di cassa basico per i primi 3-6 mesi",
      "Documenta i processi chiave così non sei l'unico collo di bottiglia",
      "Testa la disponibilità a pagare reale, non copiare i concorrenti",
    ],
    "Lanciato, pre-revenue": [
      "Sistema scheda Google Business e referral prima di campagne costose",
      "Monitora il ciclo di cassa: quanto tempo passa tra spesa e incasso",
      "Fissa un obiettivo chiaro di primi clienti paganti nei prossimi 30 giorni",
    ],
    "Prime entrate ($1–$5k MRR)": [
      "Calcola il margine lordo reale per prodotto/servizio, non solo il fatturato",
      "Inizia a costruire un cuscinetto di cassa per i mesi bassi",
      "Verifica il livello di concentrazione clienti",
    ],
    "In crescita ($5k+ MRR)": [
      "Valuta se conviene sistematizzare/delegare prima di crescere ancora",
      "Se serve capitale, valuta debito/prestito prima di equity",
      "Decidi se punti a scalare o a stabilizzarti — entrambe scelte legittime",
    ],
  },
};

// Fallback se track non è impostato (profili vecchi senza track)
export const DEFAULT_CHECKLIST = CHECKLIST_BY_TRACK.startup;
export const DEFAULT_NEXT_STEPS = ["Completa il tuo profilo per ricevere consigli su misura."];
