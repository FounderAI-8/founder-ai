// Template pre-composti per l'Editor Design.
// Ogni template è un array di oggetti Fabric.js SERIALIZZATI (formato canvas.toObject().objects).
// Coordinate normalizzate su base 720×720. Al momento dell'applicazione, DesignEditor scala
// tutte le proprietà lineari (left, top, width, height, fontSize, strokeWidth, radius) per
// Math.min(baseSize().w / 720, baseSize().h / 720) e centra rispetto al canvas reale.
//
// Note IMPORTANTI per la scrittura a mano dei JSON:
//   • Fabric v7: il campo `type` è CAPITALIZZATO ("Rect", "Textbox", "Circle", "Line"),
//     NON minuscolo come nelle versioni precedenti. Errore silenzioso se sbagliato.
//   • Fabric v7 default: originX/originY = 'center'. Quindi left/top puntano al CENTRO
//     dell'oggetto, non al top-left. Le coordinate qui sotto ragionano di centri.
//   • enlivenObjects (via util.enlivenObjects) risolve il tipo tramite classRegistry.

export type EditorTemplate = {
  id: string
  label: string
  description: string
  objects: object[]
}

export const EDITOR_TEMPLATES: EditorTemplate[] = [
  {
    id: 'annuncio',
    label: 'Annuncio / Novità',
    description: 'Banner semi-trasparente in basso con titolo grande e occhiello sopra',
    objects: [
      // Banner semi-trasparente sul terzo inferiore
      {
        type: 'Rect',
        left: 360,
        top: 616,
        width: 720,
        height: 208,
        fill: '#0a0c1a',
        stroke: '',
        strokeWidth: 0,
        opacity: 0.85,
      },
      // Titolo principale
      {
        type: 'Textbox',
        text: 'Nuovo lancio!',
        left: 360,
        top: 580,
        width: 660,
        fontSize: 54,
        fontFamily: 'Montserrat',
        fontWeight: 'bold',
        textAlign: 'center',
        fill: '#ffffff',
      },
      // Occhiello / call to action sotto il titolo
      {
        type: 'Textbox',
        text: 'Scopri di più →',
        left: 360,
        top: 664,
        width: 660,
        fontSize: 24,
        fontFamily: 'Inter',
        fontWeight: 'normal',
        textAlign: 'center',
        fill: '#5C7CFA',
      },
    ],
  },
  {
    id: 'citazione',
    label: 'Citazione',
    description: 'Testo elegante centrato su overlay scuro, con virgolette decorative',
    objects: [
      // Overlay scuro sull'intera immagine per aumentare il contrasto del testo
      {
        type: 'Rect',
        left: 360,
        top: 360,
        width: 720,
        height: 720,
        fill: '#000000',
        stroke: '',
        strokeWidth: 0,
        opacity: 0.45,
      },
      // Virgolette decorative in alto
      {
        type: 'Textbox',
        text: '“',
        left: 360,
        top: 180,
        width: 200,
        fontSize: 180,
        fontFamily: 'Playfair Display',
        fontWeight: 'bold',
        textAlign: 'center',
        fill: '#ffffff',
      },
      // Testo della citazione
      {
        type: 'Textbox',
        text: 'La creatività è intelligenza che si diverte.',
        left: 360,
        top: 380,
        width: 580,
        fontSize: 40,
        fontFamily: 'Playfair Display',
        fontStyle: 'italic',
        textAlign: 'center',
        fill: '#ffffff',
      },
      // Attribuzione autore
      {
        type: 'Textbox',
        text: '— Autore',
        left: 360,
        top: 540,
        width: 580,
        fontSize: 22,
        fontFamily: 'Inter',
        fontWeight: 'normal',
        textAlign: 'center',
        fill: '#e5e7eb',
      },
    ],
  },
  {
    id: 'promozione',
    label: 'Promozione con prezzo',
    description: 'Titolo grande in alto e badge accentato con il prezzo (spazio libero per il logo)',
    objects: [
      // Titolo promo grande in alto
      {
        type: 'Textbox',
        text: 'SUPER OFFERTA',
        left: 360,
        top: 170,
        width: 680,
        fontSize: 66,
        fontFamily: 'Montserrat',
        fontWeight: 'bold',
        textAlign: 'center',
        fill: '#ffffff',
      },
      // Sottotitolo / descrizione
      {
        type: 'Textbox',
        text: 'Solo per questa settimana',
        left: 360,
        top: 260,
        width: 680,
        fontSize: 28,
        fontFamily: 'Inter',
        fontWeight: 'normal',
        textAlign: 'center',
        fill: '#ffffff',
      },
      // Badge accent per il prezzo
      {
        type: 'Rect',
        left: 360,
        top: 470,
        width: 380,
        height: 180,
        fill: '#3B5BDB',
        stroke: '#ffffff',
        strokeWidth: 4,
        rx: 12,
        ry: 12,
      },
      // Prezzo
      {
        type: 'Textbox',
        text: '€ 49',
        left: 360,
        top: 470,
        width: 340,
        fontSize: 90,
        fontFamily: 'Montserrat',
        fontWeight: 'bold',
        textAlign: 'center',
        fill: '#ffffff',
      },
    ],
  },
]
