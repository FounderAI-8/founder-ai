'use client'

import { useEffect, useRef, useState } from 'react'
import { Canvas, IText, Textbox, FabricImage, Rect, Circle, Line, util, type FabricObject } from 'fabric'
import { supabase } from '@/lib/supabase'
import { EDITOR_TEMPLATES, type EditorTemplate } from '@/lib/editor-templates'

type ShapeObject = Rect | Circle | Line

type UnsplashPhoto = {
  id: string
  urlRegular: string
  urlSmall: string
  photographerName: string
  photographerUrl: string
  downloadLocation: string
}

const SNAP_THRESHOLD = 6 // pixel schermo entro cui scatta l'allineamento durante il drag
const ZOOM_MIN = 0.25
const ZOOM_MAX = 3
const ZOOM_STEP = 0.25

// Parametri UTM richiesti dalle linee guida ufficiali Unsplash per l'attribuzione.
const UNSPLASH_UTM = '?utm_source=founderai&utm_medium=referral'

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Playfair+Display:wght@400;700&family=Inter:wght@400;700&family=Pacifico&family=Raleway:wght@400;700&display=block'

const EDITOR_FONTS: { label: string; value: string }[] = [
  { label: 'Sans-serif', value: 'sans-serif' },
  { label: 'Montserrat', value: 'Montserrat' },
  { label: 'Playfair Display', value: 'Playfair Display' },
  { label: 'Inter', value: 'Inter' },
  { label: 'Pacifico', value: 'Pacifico' },
  { label: 'Raleway', value: 'Raleway' },
]

const MAX_CANVAS_SIDE = 720

const ASPECT_PRESETS: { label: string; ratio: number | null }[] = [
  { label: 'Originale', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
]

interface DesignEditorProps {
  imageUrl: string
  onSave: (newImageUrl: string) => void
  onClose: () => void
}

export default function DesignEditor({ imageUrl, onSave, onClose }: DesignEditorProps) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const fabricRef = useRef<Canvas | null>(null)
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const baseImageRef = useRef<FabricImage | null>(null)
  const originalDimsRef = useRef<{ w: number; h: number } | null>(null)
  // Dimensioni canvas a zoom=1 (base). Servono per zoom (canvas DOM = base * zoom) e
  // per posizionare correttamente nuovi oggetti al centro world anche a zoom != 1.
  const baseSizeRef = useRef<{ w: number; h: number } | null>(null)
  // Guide di allineamento correnti (in coordinate viewport = pixel DOM canvas).
  // Ref invece che state per non re-renderare React su ogni frame di drag.
  const guidesRef = useRef<{ x: number[]; y: number[] }>({ x: [], y: [] })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [selectedText, setSelectedText] = useState<IText | null>(null)
  const [selectedShape, setSelectedShape] = useState<ShapeObject | null>(null)
  const [selectionNonce, setSelectionNonce] = useState(0)
  const [zoom, setZoom] = useState(1)

  // --- Unsplash stock photos ---
  const [unsplashOpen, setUnsplashOpen] = useState(false)
  const [unsplashQuery, setUnsplashQuery] = useState('')
  const [unsplashResults, setUnsplashResults] = useState<UnsplashPhoto[]>([])
  const [unsplashLoading, setUnsplashLoading] = useState(false)
  const [unsplashError, setUnsplashError] = useState<string | null>(null)
  // Credit accumulati per la sessione. Dedup per photographerUrl.
  const [unsplashCredits, setUnsplashCredits] = useState<{ photographerName: string; photographerUrl: string }[]>([])

  // --- Template pronti ---
  const [templatesOpen, setTemplatesOpen] = useState(false)

  // Inject Google Fonts so they're available both for display and canvas rasterization
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = GOOGLE_FONTS_URL
    document.head.appendChild(link)
    return () => {
      if (document.head.contains(link)) document.head.removeChild(link)
    }
  }, [])

  // Canvas setup
  useEffect(() => {
    if (!canvasElRef.current) return
    let cancelled = false
    const canvas = new Canvas(canvasElRef.current, {
      backgroundColor: '#0a0c1a',
      preserveObjectStacking: true,
    })
    fabricRef.current = canvas

    canvas.on('object:added', (e) => {
      if (e.target && (e.target as unknown as { excludeFromUnsaved?: boolean }).excludeFromUnsaved) return
      setHasUnsavedChanges(true)
    })
    canvas.on('object:modified', () => {
      setHasUnsavedChanges(true)
      setSelectionNonce((n) => n + 1)
    })

    const syncSelection = () => {
      const active = canvas.getActiveObject()
      setSelectedText(active instanceof IText ? active : null)
      setSelectedShape(
        active instanceof Rect || active instanceof Circle || active instanceof Line
          ? (active as ShapeObject)
          : null,
      )
      setSelectionNonce((n) => n + 1)
    }
    canvas.on('selection:created', syncSelection)
    canvas.on('selection:updated', syncSelection)
    canvas.on('selection:cleared', syncSelection)

    // --- Snapping: guide di allineamento durante il drag ---
    canvas.on('object:moving', (e) => {
      const obj = e.target
      if (!obj) return
      const z = canvas.getZoom()
      const cw = canvas.getWidth()
      const ch = canvas.getHeight()
      const r = obj.getBoundingRect()
      const objXs = [r.left, r.left + r.width / 2, r.left + r.width]
      const objYs = [r.top, r.top + r.height / 2, r.top + r.height]

      const xTargets: number[] = [0, cw / 2, cw]
      const yTargets: number[] = [0, ch / 2, ch]
      canvas.getObjects().forEach((o) => {
        if (o === obj) return
        if ((o as unknown as { excludeFromUnsaved?: boolean }).excludeFromUnsaved) return
        const or = o.getBoundingRect()
        xTargets.push(or.left, or.left + or.width / 2, or.left + or.width)
        yTargets.push(or.top, or.top + or.height / 2, or.top + or.height)
      })

      let bestDx = 0
      let snappedX: number | null = null
      for (const x of objXs) {
        for (const t of xTargets) {
          const d = t - x
          if (Math.abs(d) < SNAP_THRESHOLD && (snappedX === null || Math.abs(d) < Math.abs(bestDx))) {
            bestDx = d
            snappedX = t
          }
        }
      }
      let bestDy = 0
      let snappedY: number | null = null
      for (const y of objYs) {
        for (const t of yTargets) {
          const d = t - y
          if (Math.abs(d) < SNAP_THRESHOLD && (snappedY === null || Math.abs(d) < Math.abs(bestDy))) {
            bestDy = d
            snappedY = t
          }
        }
      }

      // delta è in coord viewport (pixel schermo); obj.left è in world → dividi per zoom
      if (bestDx !== 0) obj.set({ left: (obj.left ?? 0) + bestDx / z })
      if (bestDy !== 0) obj.set({ top: (obj.top ?? 0) + bestDy / z })
      obj.setCoords()

      guidesRef.current = {
        x: snappedX !== null ? [snappedX] : [],
        y: snappedY !== null ? [snappedY] : [],
      }
    })

    canvas.on('mouse:up', () => {
      if (guidesRef.current.x.length || guidesRef.current.y.length) {
        guidesRef.current = { x: [], y: [] }
        canvas.requestRenderAll()
      }
    })

    // Disegna le guide su contextContainer dopo ogni render. In save() le guide sono
    // già state ripulite (mouse:up) quindi toDataURL non le include.
    canvas.on('after:render', () => {
      const { x, y } = guidesRef.current
      if (x.length === 0 && y.length === 0) return
      const ctx = canvas.contextContainer
      const w = canvas.getWidth()
      const h = canvas.getHeight()
      ctx.save()
      ctx.strokeStyle = '#3B5BDB'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      x.forEach((xi) => {
        ctx.beginPath()
        ctx.moveTo(xi + 0.5, 0)
        ctx.lineTo(xi + 0.5, h)
        ctx.stroke()
      })
      y.forEach((yi) => {
        ctx.beginPath()
        ctx.moveTo(0, yi + 0.5)
        ctx.lineTo(w, yi + 0.5)
        ctx.stroke()
      })
      ctx.restore()
    })

    ;(async () => {
      try {
        // Cache-buster: la stessa URL è già stata scaricata dal preview <img> senza
        // crossorigin, quindi la risposta cachata potrebbe non avere l'header CORS —
        // riusarla qui tainterebbe il canvas.
        const cacheBustedUrl = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}_cb=${Date.now()}`
        const img = await FabricImage.fromURL(cacheBustedUrl, { crossOrigin: 'anonymous' })
        if (cancelled) return

        const natW = img.width || MAX_CANVAS_SIDE
        const natH = img.height || MAX_CANVAS_SIDE
        originalDimsRef.current = { w: natW, h: natH }

        const scale = Math.min(MAX_CANVAS_SIDE / natW, MAX_CANVAS_SIDE / natH, 1)
        const canvasW = Math.round(natW * scale)
        const canvasH = Math.round(natH * scale)

        canvas.setDimensions({ width: canvasW, height: canvasH })
        baseSizeRef.current = { w: canvasW, h: canvasH }
        img.set({
          left: canvasW / 2,
          top: canvasH / 2,
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          evented: false,
          hoverCursor: 'default',
        })
        ;(img as unknown as { excludeFromUnsaved?: boolean }).excludeFromUnsaved = true
        baseImageRef.current = img
        canvas.add(img)
        canvas.sendObjectToBack(img)
        canvas.requestRenderAll()
        setLoading(false)
      } catch (err) {
        console.error('[DesignEditor] load image failed:', err)
        if (!cancelled) {
          setErrorMsg("Impossibile caricare l'immagine di base.")
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      canvas.dispose()
      fabricRef.current = null
      baseImageRef.current = null
      originalDimsRef.current = null
      baseSizeRef.current = null
      guidesRef.current = { x: [], y: [] }
    }
  }, [imageUrl])

  // beforeunload guard
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  // --- Derived values from selected text (declared before handlers that reference them) ---
  const currentFontSize = Math.round((selectedText?.fontSize as number) ?? 40)
  const currentFill    = (selectedText?.fill as string)       ?? '#ffffff'
  const currentFont    = (selectedText?.fontFamily as string) ?? 'Montserrat'
  const currentAlign   = (selectedText?.textAlign as string)  ?? 'center'
  const isBold       = ['bold', '700'].includes((selectedText?.fontWeight as string) ?? '')
  const isItalic     = (selectedText?.fontStyle as string) === 'italic'
  const isUnderline  = (selectedText?.underline as boolean) ?? false
  const hasTextBg    = !!((selectedText?.backgroundColor as string) ?? '')

  // Derived from selected shape
  const isLine           = selectedShape instanceof Line
  const shapeFill        = (selectedShape?.fill as string)   ?? '#534AB7'
  const shapeStroke      = (selectedShape?.stroke as string) ?? '#ffffff'
  const shapeStrokeWidth = Math.round((selectedShape?.strokeWidth as number) ?? 2)
  void selectionNonce

  // --- Handlers ---

  const applyAspectPreset = (ratio: number | null) => {
    const canvas = fabricRef.current
    const img = baseImageRef.current
    const orig = originalDimsRef.current
    if (!canvas || !img || !orig) return

    const { w: natW, h: natH } = orig
    let cropW: number, cropH: number, cropX: number, cropY: number
    if (ratio === null) {
      cropW = natW; cropH = natH; cropX = 0; cropY = 0
    } else {
      const natRatio = natW / natH
      if (natRatio > ratio) {
        cropH = natH; cropW = Math.round(natH * ratio)
        cropX = Math.round((natW - cropW) / 2); cropY = 0
      } else {
        cropW = natW; cropH = Math.round(natW / ratio)
        cropX = 0; cropY = Math.round((natH - cropH) / 2)
      }
    }

    const newScale = Math.min(MAX_CANVAS_SIDE / cropW, MAX_CANVAS_SIDE / cropH, 1)
    const newCanvasW = Math.round(cropW * newScale)
    const newCanvasH = Math.round(cropH * newScale)

    // Cambio di formato resetta lo zoom: le nuove dimensioni sono la nuova base.
    canvas.setZoom(1)
    setZoom(1)
    canvas.setDimensions({ width: newCanvasW, height: newCanvasH })
    baseSizeRef.current = { w: newCanvasW, h: newCanvasH }
    img.set({ cropX, cropY, width: cropW, height: cropH, scaleX: newScale, scaleY: newScale, left: newCanvasW / 2, top: newCanvasH / 2 })
    img.setCoords()
    canvas.requestRenderAll()
    setHasUnsavedChanges(true)
  }

  // Zoom: canvas DOM dimensionato a base * zoom, viewport transform (setZoom) applica
  // la stessa scala al world → gli oggetti restano "attaccati" allo stesso punto world
  // ma visualmente crescono/decrescono. Il container overflow-auto gestisce lo scroll.
  const applyZoom = (nextZoom: number) => {
    const canvas = fabricRef.current
    const base = baseSizeRef.current
    if (!canvas || !base) return
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextZoom))
    canvas.setZoom(z)
    canvas.setDimensions({ width: Math.round(base.w * z), height: Math.round(base.h * z) })
    canvas.requestRenderAll()
    setZoom(z)
  }

  // Le posizioni degli oggetti sono in world coords: usiamo baseSize (dimensioni a zoom=1)
  // per il centering, così un oggetto aggiunto mentre lo zoom è != 1 nasce comunque al centro.
  const baseSize = () => baseSizeRef.current ?? { w: fabricRef.current!.getWidth(), h: fabricRef.current!.getHeight() }

  const handleAddText = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const { w, h } = baseSize()
    // Textbox (non IText) con larghezza fissa: senza una width prestabilita la scatola
    // si adatta al contenuto e textAlign non produce un effetto visibile su singola riga.
    // L'utente può poi ridimensionare la larghezza dalle maniglie laterali.
    const text = new Textbox('Testo', {
      left: w / 2,
      top: h / 2,
      width: Math.round(w * 0.6),
      fontSize: 40,
      fill: '#ffffff',
      fontFamily: 'Montserrat',
      fontWeight: 'bold',
      textAlign: 'center',
    })
    canvas.add(text)
    canvas.setActiveObject(text)
    canvas.requestRenderAll()
  }

  const handleAddLogo = () => logoInputRef.current?.click()

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const canvas = fabricRef.current
    if (!canvas) return
    const objectUrl = URL.createObjectURL(file)
    try {
      const logo = await FabricImage.fromURL(objectUrl)
      const { w: canvasW, h: canvasH } = baseSize()
      const targetSide = Math.min(canvasW, canvasH) * 0.3
      const natW = logo.width || targetSide
      const natH = logo.height || targetSide
      const scale = Math.min(targetSide / natW, targetSide / natH)
      logo.set({ left: canvasW / 2, top: canvasH / 2, scaleX: scale, scaleY: scale })
      canvas.add(logo)
      canvas.setActiveObject(logo)
      canvas.requestRenderAll()
    } catch (err) {
      console.error('[DesignEditor] logo load failed:', err)
      setErrorMsg('Impossibile caricare il logo.')
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  // Generic text mutator — calls fn on the selected IText, re-renders, marks dirty
  const mutateText = (fn: (t: IText) => void) => {
    if (!fabricRef.current || !selectedText) return
    fn(selectedText)
    fabricRef.current.requestRenderAll()
    setHasUnsavedChanges(true)
    setSelectionNonce((n) => n + 1)
  }

  const handleTextFontSize  = (v: number)  => mutateText(t => t.set({ fontSize: v || 40 }))
  const handleTextColor     = (v: string)  => mutateText(t => t.set({ fill: v }))
  const handleTextFont      = (v: string)  => mutateText(t => t.set({ fontFamily: v }))
  const handleTextAlign     = (v: string)  => mutateText(t => t.set({ textAlign: v }))
  const handleTextBold      = ()           => mutateText(t => t.set({ fontWeight: isBold    ? 'normal' : 'bold' }))
  const handleTextItalic    = ()           => mutateText(t => t.set({ fontStyle:  isItalic  ? 'normal' : 'italic' }))
  const handleTextUnderline = ()           => mutateText(t => t.set({ underline:  !isUnderline }))
  const handleTextBackground = ()          => mutateText(t => t.set({ backgroundColor: hasTextBg ? '' : 'rgba(0,0,0,0.55)' }))

  // --- Shape creation ---

  const handleAddRect = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const { w, h } = baseSize()
    const rect = new Rect({
      left: w / 2,
      top: h / 2,
      width: 200,
      height: 120,
      fill: '#534AB7',
      stroke: '#ffffff',
      strokeWidth: 2,
    })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    canvas.requestRenderAll()
  }

  const handleAddCircle = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const { w, h } = baseSize()
    const circle = new Circle({
      left: w / 2,
      top: h / 2,
      radius: 60,
      fill: '#534AB7',
      stroke: '#ffffff',
      strokeWidth: 2,
    })
    canvas.add(circle)
    canvas.setActiveObject(circle)
    canvas.requestRenderAll()
  }

  const handleAddLine = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const { w, h } = baseSize()
    const cx = w / 2
    const cy = h / 2
    const line = new Line([cx - 100, cy, cx + 100, cy], {
      stroke: '#ffffff',
      strokeWidth: 4,
    })
    canvas.add(line)
    canvas.setActiveObject(line)
    canvas.requestRenderAll()
  }

  // --- Unsplash search + add ---

  const handleUnsplashSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = unsplashQuery.trim()
    if (!q) return
    setUnsplashLoading(true)
    setUnsplashError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/social/unsplash?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const data = await res.json()
      if (!res.ok) {
        setUnsplashError(data.error ?? 'Ricerca non riuscita')
        setUnsplashResults([])
        return
      }
      setUnsplashResults(Array.isArray(data.photos) ? data.photos : [])
    } catch (err) {
      console.error('[DesignEditor] unsplash search failed:', err)
      setUnsplashError('Ricerca non riuscita')
    } finally {
      setUnsplashLoading(false)
    }
  }

  const handleAddUnsplashPhoto = async (photo: UnsplashPhoto) => {
    const canvas = fabricRef.current
    if (!canvas) return
    try {
      const img = await FabricImage.fromURL(photo.urlRegular, { crossOrigin: 'anonymous' })
      const { w: canvasW, h: canvasH } = baseSize()
      const targetSide = Math.min(canvasW, canvasH) * 0.5
      const natW = img.width || targetSide
      const natH = img.height || targetSide
      const scale = Math.min(targetSide / natW, targetSide / natH)
      img.set({ left: canvasW / 2, top: canvasH / 2, scaleX: scale, scaleY: scale })
      canvas.add(img)
      canvas.setActiveObject(img)
      canvas.requestRenderAll()

      // Accumula credit (dedup per URL fotografo)
      setUnsplashCredits((prev) =>
        prev.some((c) => c.photographerUrl === photo.photographerUrl)
          ? prev
          : [...prev, { photographerName: photo.photographerName, photographerUrl: photo.photographerUrl }],
      )

      // TOS Unsplash: trigger download tracking (fire-and-forget)
      const { data: { session } } = await supabase.auth.getSession()
      fetch('/api/social/unsplash/track-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ downloadLocation: photo.downloadLocation }),
      }).catch((err) => console.error('[DesignEditor] track-download failed:', err))

      setUnsplashOpen(false)
    } catch (err) {
      console.error('[DesignEditor] unsplash photo load failed:', err)
      setUnsplashError('Impossibile caricare la foto.')
    }
  }

  // --- Template application ---

  const applyTemplate = async (tpl: EditorTemplate) => {
    const canvas = fabricRef.current
    if (!canvas) return

    // Se ci sono già layer custom (oltre alla base image), chiedi conferma:
    // il template viene ADDIZIONATO sopra, non sostituisce.
    const customLayers = canvas.getObjects().filter(
      (o) => !(o as unknown as { excludeFromUnsaved?: boolean }).excludeFromUnsaved,
    )
    if (customLayers.length > 0) {
      if (!window.confirm(
        'Il canvas contiene già altri elementi. Il template verrà aggiunto sopra: continuare?',
      )) return
    }

    // Scala uniforme sull'asse minore (per non deformare); center-offset per canvas non quadrati.
    const { w, h } = baseSize()
    const scale = Math.min(w / 720, h / 720)
    const offsetX = (w - 720 * scale) / 2
    const offsetY = (h - 720 * scale) / 2

    // Proprietà da scalare senza offset (dimensioni lineari)
    const SCALE_ONLY = ['width', 'height', 'fontSize', 'strokeWidth', 'radius', 'rx', 'ry']

    const scaled = tpl.objects.map((o) => {
      const src = o as Record<string, unknown>
      const dst: Record<string, unknown> = { ...src }
      if (typeof dst.left === 'number') dst.left = (dst.left as number) * scale + offsetX
      if (typeof dst.top === 'number')  dst.top  = (dst.top  as number) * scale + offsetY
      for (const p of SCALE_ONLY) {
        if (typeof dst[p] === 'number') dst[p] = (dst[p] as number) * scale
      }
      // Coordinate Line (x1/y1/x2/y2): stessa trasformazione di left/top per asse rispettivo
      for (const p of ['x1', 'x2'] as const) {
        if (typeof dst[p] === 'number') dst[p] = (dst[p] as number) * scale + offsetX
      }
      for (const p of ['y1', 'y2'] as const) {
        if (typeof dst[p] === 'number') dst[p] = (dst[p] as number) * scale + offsetY
      }
      return dst
    })

    try {
      const enlived = await util.enlivenObjects<FabricObject>(scaled)
      enlived.forEach((o) => canvas.add(o))
      canvas.requestRenderAll()
      setHasUnsavedChanges(true)
      setTemplatesOpen(false)
    } catch (err) {
      console.error('[DesignEditor] template apply failed:', err)
      setErrorMsg('Impossibile applicare il template.')
    }
  }

  // Generic shape mutator — same pattern as mutateText
  const mutateShape = (fn: (s: ShapeObject) => void) => {
    if (!fabricRef.current || !selectedShape) return
    fn(selectedShape)
    fabricRef.current.requestRenderAll()
    setHasUnsavedChanges(true)
    setSelectionNonce((n) => n + 1)
  }

  const handleShapeFill        = (v: string) => mutateShape(s => s.set({ fill: v }))
  const handleShapeStroke      = (v: string) => mutateShape(s => s.set({ stroke: v }))
  const handleShapeStrokeWidth = (v: number) => mutateShape(s => s.set({ strokeWidth: Math.max(0, v || 0) }))

  const handleDeleteSelected = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const active = canvas.getActiveObject()
    if (!active || (active as unknown as { excludeFromUnsaved?: boolean }).excludeFromUnsaved) return
    canvas.remove(active)
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    setHasUnsavedChanges(true)
  }

  const handleSave = async () => {
    const canvas = fabricRef.current
    if (!canvas) return
    setSaving(true)
    setErrorMsg(null)

    // toDataURL cattura il canvas DOM così com'è: se lo zoom è != 1, il PNG risulta
    // scalato. Resetta temporaneamente a zoom=1 per l'export, poi ripristina.
    const savedZoom = canvas.getZoom()
    const base = baseSizeRef.current
    if (base && savedZoom !== 1) {
      canvas.setZoom(1)
      canvas.setDimensions({ width: base.w, height: base.h })
    }

    try {
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      // Ensure all Google Fonts are downloaded before rasterizing, otherwise the canvas
      // silently falls back to the system font in the exported PNG.
      await Promise.allSettled(
        EDITOR_FONTS.filter(f => f.value !== 'sans-serif').flatMap(f => [
          document.fonts.load(`400 40px "${f.value}"`),
          document.fonts.load(`700 40px "${f.value}"`),
        ])
      )
      const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 })
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/social/composite-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ imageBase64: dataUrl }),
      })
      const data = await res.json()
      if (!res.ok) { setErrorMsg(data.error ?? 'Salvataggio non riuscito. Riprova.'); return }
      setHasUnsavedChanges(false)
      onSave(data.imageUrl)
    } catch (err) {
      console.error('[DesignEditor] save failed:', err)
      setErrorMsg('Salvataggio non riuscito. Riprova.')
    } finally {
      if (base && savedZoom !== 1) {
        canvas.setZoom(savedZoom)
        canvas.setDimensions({ width: Math.round(base.w * savedZoom), height: Math.round(base.h * savedZoom) })
        canvas.requestRenderAll()
      }
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (hasUnsavedChanges && !window.confirm('Ci sono modifiche non salvate. Chiudere comunque?')) return
    onClose()
  }

  // --- Render ---
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1e2340] bg-[#0a0c1a] px-6 py-3">
        <h2 className="text-white font-semibold">Modifica design</h2>
        <button onClick={handleClose} className="text-sm text-gray-400 hover:text-white transition-colors">
          ✕ Chiudi
        </button>
      </div>

      {/* Main toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#1e2340] bg-[#0a0c1a] px-6 py-3">
        <button onClick={handleAddText} disabled={loading}
          className="bg-[#1e2340] border border-[#534AB7] text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[#2a3060] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          + Testo
        </button>
        <button onClick={handleAddLogo} disabled={loading}
          className="bg-[#1e2340] border border-[#534AB7] text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[#2a3060] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          + Logo
        </button>
        <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />

        <span className="w-px h-6 bg-[#1e2340] mx-1" />
        <button onClick={handleAddRect} disabled={loading}
          className="bg-[#1e2340] border border-[#534AB7] text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[#2a3060] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          + Rettangolo
        </button>
        <button onClick={handleAddCircle} disabled={loading}
          className="bg-[#1e2340] border border-[#534AB7] text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[#2a3060] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          + Cerchio
        </button>
        <button onClick={handleAddLine} disabled={loading}
          className="bg-[#1e2340] border border-[#534AB7] text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[#2a3060] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          + Linea
        </button>

        <span className="w-px h-6 bg-[#1e2340] mx-1" />
        <button onClick={() => setUnsplashOpen(true)} disabled={loading}
          className="bg-[#1e2340] border border-[#534AB7] text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[#2a3060] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          + Foto stock
        </button>

        <span className="w-px h-6 bg-[#1e2340] mx-1" />
        <button onClick={() => setTemplatesOpen(true)} disabled={loading}
          className="bg-[#1e2340] border border-[#534AB7] text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[#2a3060] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          Usa un template
        </button>

        <span className="w-px h-6 bg-[#1e2340] mx-1" />
        <span className="text-xs text-gray-400">Formato:</span>
        {ASPECT_PRESETS.map((p) => (
          <button key={p.label} onClick={() => applyAspectPreset(p.ratio)} disabled={loading}
            className="bg-[#0f1229] border border-[#1e2340] text-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:border-[#534AB7] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {p.label}
          </button>
        ))}

        <div className="flex-1" />
        <button onClick={handleSave} disabled={saving || loading}
          className="bg-[#3B5BDB] text-white rounded-lg px-4 py-1.5 text-sm font-semibold hover:bg-[#5C7CFA] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>

      {/* Text formatting toolbar — appears as a second bar when a text object is selected */}
      {selectedText && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1e2340] bg-[#0f1229] px-6 py-2.5">
          {/* Font family */}
          <select value={currentFont} onChange={e => handleTextFont(e.target.value)}
            className="bg-[#0a0c1a] border border-[#1e2340] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#3B5BDB] max-w-[160px]">
            {EDITOR_FONTS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>

          {/* Font size */}
          <label className="text-xs text-gray-400 flex items-center gap-1">
            Dim.
            <input type="number" min={8} max={200} value={currentFontSize}
              onChange={e => handleTextFontSize(Number(e.target.value))}
              className="w-14 bg-[#0a0c1a] border border-[#1e2340] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#3B5BDB]" />
          </label>

          <span className="w-px h-5 bg-[#1e2340]" />

          {/* Bold / Italic / Underline */}
          {[
            { label: 'G', title: 'Grassetto',    active: isBold,      onClick: handleTextBold,      cls: 'font-bold' },
            { label: 'C', title: 'Corsivo',       active: isItalic,    onClick: handleTextItalic,    cls: 'italic' },
            { label: 'S', title: 'Sottolineato',  active: isUnderline, onClick: handleTextUnderline, cls: 'underline' },
          ].map(({ label, title, active, onClick, cls }) => (
            <button key={label} onClick={onClick} title={title}
              className={`w-7 h-7 rounded text-sm flex items-center justify-center transition-colors ${cls} ${
                active
                  ? 'bg-[#3B5BDB] text-white'
                  : 'bg-[#0a0c1a] border border-[#1e2340] text-gray-300 hover:border-[#534AB7]'
              }`}>
              {label}
            </button>
          ))}

          <span className="w-px h-5 bg-[#1e2340]" />

          {/* Text alignment */}
          {(['left', 'center', 'right'] as const).map(align => (
            <button key={align} onClick={() => handleTextAlign(align)}
              title={align === 'left' ? 'Sinistra' : align === 'center' ? 'Centro' : 'Destra'}
              className={`w-7 h-7 rounded text-xs flex items-center justify-center transition-colors ${
                currentAlign === align
                  ? 'bg-[#3B5BDB] text-white'
                  : 'bg-[#0a0c1a] border border-[#1e2340] text-gray-300 hover:border-[#534AB7]'
              }`}>
              {align === 'left' ? 'L' : align === 'center' ? 'C' : 'D'}
            </button>
          ))}

          <span className="w-px h-5 bg-[#1e2340]" />

          {/* Fill color */}
          <label className="text-xs text-gray-400 flex items-center gap-1">
            Colore
            <input type="color" value={currentFill} onChange={e => handleTextColor(e.target.value)}
              className="w-8 h-7 bg-transparent border border-[#1e2340] rounded cursor-pointer" />
          </label>

          {/* Semi-transparent background behind text */}
          <button onClick={handleTextBackground} title="Sfondo semi-trasparente"
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              hasTextBg
                ? 'bg-[#3B5BDB] text-white'
                : 'bg-[#0a0c1a] border border-[#1e2340] text-gray-300 hover:border-[#534AB7]'
            }`}>
            Sfondo
          </button>

          <div className="flex-1" />

          <button onClick={handleDeleteSelected} className="text-xs text-red-400 hover:text-red-300 transition-colors">
            Elimina
          </button>
        </div>
      )}

      {/* Shape formatting toolbar — appears when a Rect/Circle/Line is selected */}
      {selectedShape && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1e2340] bg-[#0f1229] px-6 py-2.5">
          {/* Fill color (nascosto per Line — non ha riempimento significativo) */}
          {!isLine && (
            <label className="text-xs text-gray-400 flex items-center gap-1">
              Riempimento
              <input type="color" value={shapeFill} onChange={e => handleShapeFill(e.target.value)}
                className="w-8 h-7 bg-transparent border border-[#1e2340] rounded cursor-pointer" />
            </label>
          )}

          {/* Stroke color */}
          <label className="text-xs text-gray-400 flex items-center gap-1">
            Bordo
            <input type="color" value={shapeStroke} onChange={e => handleShapeStroke(e.target.value)}
              className="w-8 h-7 bg-transparent border border-[#1e2340] rounded cursor-pointer" />
          </label>

          {/* Stroke width */}
          <label className="text-xs text-gray-400 flex items-center gap-1">
            Spessore
            <input type="number" min={0} max={40} value={shapeStrokeWidth}
              onChange={e => handleShapeStrokeWidth(Number(e.target.value))}
              className="w-14 bg-[#0a0c1a] border border-[#1e2340] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#3B5BDB]" />
          </label>

          <div className="flex-1" />

          <button onClick={handleDeleteSelected} className="text-xs text-red-400 hover:text-red-300 transition-colors">
            Elimina
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-950/40 border-b border-red-900 px-6 py-2 text-sm text-red-300">
          {errorMsg}
        </div>
      )}

      <div className="flex-1 relative overflow-hidden">
        {/* Scroll container: quando lo zoom fa crescere il canvas oltre il viewport,
            l'utente può panare con le scroll bar. */}
        <div className="absolute inset-0 overflow-auto flex items-center justify-center p-6">
          {loading && <p className="absolute text-gray-400 text-sm">Caricamento immagine…</p>}
          <canvas ref={canvasElRef} className="shadow-2xl rounded" />
        </div>

        {/* Attribuzione Unsplash (obbligatoria per TOS). Non finisce nell'export toDataURL:
            è solo overlay HTML durante l'editing. */}
        {unsplashCredits.length > 0 && (
          <div className="absolute bottom-6 left-6 max-w-md bg-black/70 text-white text-[11px] px-2.5 py-1.5 rounded shadow-lg z-10">
            {unsplashCredits.map((c, i) => (
              <span key={c.photographerUrl}>
                Photo by{' '}
                <a href={`${c.photographerUrl}${UNSPLASH_UTM}`} target="_blank" rel="noopener noreferrer"
                  className="underline hover:text-[#5C7CFA]">{c.photographerName}</a>
                {i < unsplashCredits.length - 1 ? ', ' : ' '}
              </span>
            ))}
            on <a href={`https://unsplash.com/${UNSPLASH_UTM}`} target="_blank" rel="noopener noreferrer"
              className="underline hover:text-[#5C7CFA]">Unsplash</a>
          </div>
        )}

        {/* Zoom controls flottanti — restano visibili anche quando l'utente scrolla il canvas */}
        {!loading && (
          <div className="absolute bottom-6 right-6 flex items-center gap-1 bg-[#0a0c1a] border border-[#1e2340] rounded-lg px-2 py-1 shadow-lg z-10">
            <button
              onClick={() => applyZoom(zoom - ZOOM_STEP)}
              disabled={zoom <= ZOOM_MIN}
              title="Riduci zoom"
              className="w-7 h-7 rounded text-white text-sm hover:bg-[#1e2340] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              −
            </button>
            <button
              onClick={() => applyZoom(1)}
              title="Zoom 100%"
              className="min-w-[3.5rem] px-2 h-7 rounded text-white text-xs hover:bg-[#1e2340] transition-colors">
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => applyZoom(zoom + ZOOM_STEP)}
              disabled={zoom >= ZOOM_MAX}
              title="Aumenta zoom"
              className="w-7 h-7 rounded text-white text-sm hover:bg-[#1e2340] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              +
            </button>
          </div>
        )}
      </div>

      {/* --- Modal ricerca foto stock Unsplash --- */}
      {unsplashOpen && (
        <div className="absolute inset-0 bg-black/80 z-40 flex items-center justify-center p-6"
          onClick={(e) => { if (e.target === e.currentTarget) setUnsplashOpen(false) }}>
          <div className="bg-[#0a0c1a] border border-[#1e2340] rounded-lg w-full max-w-4xl flex flex-col" style={{ maxHeight: '90%' }}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1e2340] px-4 py-3">
              <h3 className="text-white font-semibold text-sm">Foto stock (Unsplash)</h3>
              <button onClick={() => setUnsplashOpen(false)} className="text-sm text-gray-400 hover:text-white transition-colors">
                ✕ Chiudi
              </button>
            </div>

            {/* Search form */}
            <form onSubmit={handleUnsplashSearch} className="flex items-center gap-2 border-b border-[#1e2340] px-4 py-3">
              <input
                type="text"
                autoFocus
                value={unsplashQuery}
                onChange={(e) => setUnsplashQuery(e.target.value)}
                placeholder="Cerca (es. sunset, office, nature)…"
                className="flex-1 bg-[#0f1229] border border-[#1e2340] rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#3B5BDB]"
              />
              <button
                type="submit"
                disabled={unsplashLoading || !unsplashQuery.trim()}
                className="bg-[#3B5BDB] text-white rounded-lg px-4 py-1.5 text-sm font-semibold hover:bg-[#5C7CFA] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {unsplashLoading ? 'Ricerca…' : 'Cerca'}
              </button>
            </form>

            {unsplashError && (
              <div className="bg-red-950/40 border-b border-red-900 px-4 py-2 text-xs text-red-300">
                {unsplashError}
              </div>
            )}

            {/* Grid */}
            <div className="flex-1 overflow-auto p-4">
              {unsplashLoading && <p className="text-center text-gray-400 text-sm">Ricerca in corso…</p>}
              {!unsplashLoading && unsplashResults.length === 0 && !unsplashError && (
                <p className="text-center text-gray-500 text-sm">Cerca una parola chiave per vedere le foto.</p>
              )}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {unsplashResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleAddUnsplashPhoto(p)}
                    title={`Aggiungi foto di ${p.photographerName}`}
                    className="group relative aspect-square overflow-hidden rounded border border-transparent hover:border-[#534AB7] transition-colors">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.urlSmall} alt="" className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 text-[9px] text-white truncate">
                      {p.photographerName}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Footer: legal note */}
            <div className="border-t border-[#1e2340] px-4 py-2 text-[10px] text-gray-500">
              Foto fornite da Unsplash. L'attribuzione al fotografo verrà mostrata nell'editor.
            </div>
          </div>
        </div>
      )}

      {/* --- Modal template pronti --- */}
      {templatesOpen && (
        <div className="absolute inset-0 bg-black/80 z-40 flex items-center justify-center p-6"
          onClick={(e) => { if (e.target === e.currentTarget) setTemplatesOpen(false) }}>
          <div className="bg-[#0a0c1a] border border-[#1e2340] rounded-lg w-full max-w-3xl flex flex-col" style={{ maxHeight: '90%' }}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1e2340] px-4 py-3">
              <h3 className="text-white font-semibold text-sm">Scegli un template</h3>
              <button onClick={() => setTemplatesOpen(false)} className="text-sm text-gray-400 hover:text-white transition-colors">
                ✕ Chiudi
              </button>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-auto p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {EDITOR_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl)}
                    className="bg-[#0f1229] border border-[#1e2340] rounded-lg p-4 text-left hover:border-[#534AB7] transition-colors">
                    <h4 className="text-white font-medium text-sm mb-1">{tpl.label}</h4>
                    <p className="text-gray-400 text-xs">{tpl.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Footer note */}
            <div className="border-t border-[#1e2340] px-4 py-2 text-[10px] text-gray-500">
              Il template viene aggiunto sopra il canvas corrente. Tutti gli elementi restano modificabili.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
