'use client'

import { useEffect, useRef, useState } from 'react'
import { Canvas, IText, FabricImage } from 'fabric'
import { supabase } from '@/lib/supabase'

interface DesignEditorProps {
  imageUrl: string
  onSave: (newImageUrl: string) => void
  onClose: () => void
}

const MAX_CANVAS_SIDE = 720

const ASPECT_PRESETS: { label: string; ratio: number | null }[] = [
  { label: 'Originale', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
]

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
      if (active instanceof IText) {
        setSelectedText(active)
      } else {
        setSelectedText(null)
      }
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

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  const applyAspectPreset = (ratio: number | null) => {
    const canvas = fabricRef.current
    const img = baseImageRef.current
    const orig = originalDimsRef.current
    if (!canvas || !img || !orig) return

    const { w: natW, h: natH } = orig

    let cropW: number, cropH: number, cropX: number, cropY: number
    if (ratio === null) {
      cropW = natW
      cropH = natH
      cropX = 0
      cropY = 0
    } else {
      const natRatio = natW / natH
      if (natRatio > ratio) {
        cropH = natH
        cropW = Math.round(natH * ratio)
        cropX = Math.round((natW - cropW) / 2)
        cropY = 0
      } else {
        cropW = natW
        cropH = Math.round(natW / ratio)
        cropX = 0
        cropY = Math.round((natH - cropH) / 2)
      }
    }

    const newScale = Math.min(MAX_CANVAS_SIDE / cropW, MAX_CANVAS_SIDE / cropH, 1)
    const newCanvasW = Math.round(cropW * newScale)
    const newCanvasH = Math.round(cropH * newScale)

    canvas.setDimensions({ width: newCanvasW, height: newCanvasH })
    img.set({
      cropX,
      cropY,
      width: cropW,
      height: cropH,
      scaleX: newScale,
      scaleY: newScale,
      left: newCanvasW / 2,
      top: newCanvasH / 2,
    })
    img.setCoords()
    canvas.requestRenderAll()
    setHasUnsavedChanges(true)
  }

  const handleAddText = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const text = new IText('Testo', {
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      fontSize: 40,
      fill: '#ffffff',
      fontFamily: 'sans-serif',
      textAlign: 'center',
    })
    canvas.add(text)
    canvas.setActiveObject(text)
    canvas.requestRenderAll()
  }

  const handleAddLogo = () => {
    logoInputRef.current?.click()
  }

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
      logo.set({
        left: canvasW / 2,
        top: canvasH / 2,
        scaleX: scale,
        scaleY: scale,
      })
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

  const handleTextFontSize = (value: number) => {
    const canvas = fabricRef.current
    if (!canvas || !selectedText) return
    selectedText.set({ fontSize: value })
    canvas.requestRenderAll()
    setHasUnsavedChanges(true)
    setSelectionNonce((n) => n + 1)
  }

  const handleTextColor = (value: string) => {
    const canvas = fabricRef.current
    if (!canvas || !selectedText) return
    selectedText.set({ fill: value })
    canvas.requestRenderAll()
    setHasUnsavedChanges(true)
    setSelectionNonce((n) => n + 1)
  }

  const handleDeleteSelected = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const active = canvas.getActiveObject()
    if (!active) return
    if ((active as unknown as { excludeFromUnsaved?: boolean }).excludeFromUnsaved) return
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
      const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 })
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/social/composite-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ imageBase64: dataUrl }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Salvataggio non riuscito. Riprova.')
        return
      }
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
    if (hasUnsavedChanges) {
      const ok = window.confirm('Ci sono modifiche non salvate. Chiudere comunque?')
      if (!ok) return
    }
    onClose()
  }

  const currentFontSize = selectedText ? Math.round((selectedText.fontSize as number) ?? 40) : 40
  const currentFill = selectedText ? ((selectedText.fill as string) ?? '#ffffff') : '#ffffff'
  void selectionNonce

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-[#1e2340] bg-[#0a0c1a] px-6 py-3">
        <h2 className="text-white font-semibold">Modifica design</h2>
        <button
          onClick={handleClose}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ✕ Chiudi
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[#1e2340] bg-[#0a0c1a] px-6 py-3">
        <button
          onClick={handleAddText}
          disabled={loading}
          className="bg-[#1e2340] border border-[#534AB7] text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[#2a3060] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Testo
        </button>
        <button
          onClick={handleAddLogo}
          disabled={loading}
          className="bg-[#1e2340] border border-[#534AB7] text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[#2a3060] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Logo
        </button>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          onChange={handleLogoFile}
          className="hidden"
        />

        <span className="w-px h-6 bg-[#1e2340] mx-1" />
        <span className="text-xs text-gray-400 mr-1">Formato:</span>
        {ASPECT_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyAspectPreset(p.ratio)}
            disabled={loading}
            className="bg-[#0f1229] border border-[#1e2340] text-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:border-[#534AB7] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {p.label}
          </button>
        ))}

        {selectedText && (
          <>
            <span className="w-px h-6 bg-[#1e2340] mx-1" />
            <label className="text-xs text-gray-400 flex items-center gap-1.5">
              Dim.
              <input
                type="number"
                min={8}
                max={200}
                value={currentFontSize}
                onChange={(e) => handleTextFontSize(Number(e.target.value) || 40)}
                className="w-16 bg-[#0f1229] border border-[#1e2340] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#3B5BDB]"
              />
            </label>
            <label className="text-xs text-gray-400 flex items-center gap-1.5">
              Colore
              <input
                type="color"
                value={currentFill}
                onChange={(e) => handleTextColor(e.target.value)}
                className="w-8 h-7 bg-transparent border border-[#1e2340] rounded cursor-pointer"
              />
            </label>
            <button
              onClick={handleDeleteSelected}
              className="text-xs text-red-400 hover:text-red-300 transition-colors ml-1"
            >
              Elimina
            </button>
          </>
        )}

        <div className="flex-1" />

        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="bg-[#3B5BDB] text-white rounded-lg px-4 py-1.5 text-sm font-semibold hover:bg-[#5C7CFA] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-950/40 border-b border-red-900 px-6 py-2 text-sm text-red-300">
          {errorMsg}
        </div>
      )}

      <div className="flex-1 overflow-auto flex items-center justify-center p-6 relative">
        {loading && (
          <p className="absolute text-gray-400 text-sm">Caricamento immagine…</p>
        )}
        <canvas ref={canvasElRef} className="shadow-2xl rounded" />
      </div>
    </div>
  )
}
