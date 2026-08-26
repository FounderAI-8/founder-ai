'use client'

import { useEffect, useRef, useState } from 'react'
import { Canvas, IText, Textbox, FabricImage } from 'fabric'
import { supabase } from '@/lib/supabase'

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

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [selectedText, setSelectedText] = useState<IText | null>(null)
  const [selectionNonce, setSelectionNonce] = useState(0)

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
      setSelectionNonce((n) => n + 1)
    }
    canvas.on('selection:created', syncSelection)
    canvas.on('selection:updated', syncSelection)
    canvas.on('selection:cleared', syncSelection)

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

    canvas.setDimensions({ width: newCanvasW, height: newCanvasH })
    img.set({ cropX, cropY, width: cropW, height: cropH, scaleX: newScale, scaleY: newScale, left: newCanvasW / 2, top: newCanvasH / 2 })
    img.setCoords()
    canvas.requestRenderAll()
    setHasUnsavedChanges(true)
  }

  const handleAddText = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    // Textbox (non IText) con larghezza fissa: senza una width prestabilita la scatola
    // si adatta al contenuto e textAlign non produce un effetto visibile su singola riga.
    // L'utente può poi ridimensionare la larghezza dalle maniglie laterali.
    const text = new Textbox('Testo', {
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      width: Math.round(canvas.getWidth() * 0.6),
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
      const canvasW = canvas.getWidth()
      const canvasH = canvas.getHeight()
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

      {errorMsg && (
        <div className="bg-red-950/40 border-b border-red-900 px-6 py-2 text-sm text-red-300">
          {errorMsg}
        </div>
      )}

      <div className="flex-1 overflow-auto flex items-center justify-center p-6 relative">
        {loading && <p className="absolute text-gray-400 text-sm">Caricamento immagine…</p>}
        <canvas ref={canvasElRef} className="shadow-2xl rounded" />
      </div>
    </div>
  )
}
