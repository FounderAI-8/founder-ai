'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Textarea e Label sono definiti fuori da Onboarding: se fossero interni al
// render, verrebbero ricreati ad ogni keystroke e React rimonterebbe
// l'elemento <textarea>, causando la perdita di focus dopo ogni carattere.
const Label = ({ text, sub }: any) => (
  <div style={{ marginBottom: 16, marginTop: 24 }}>
    <div style={{ fontWeight: 600, fontSize: 15 }}>{text}</div>
    {sub && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{sub}</div>}
  </div>
)

const Textarea = ({ value, onChange, placeholder }: any) => (
  <textarea
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    rows={3}
    style={{ width: '100%', background: '#0f1229', border: '1px solid #1e2340', borderRadius: 8, color: 'white', padding: '12px', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginTop: 8 }}
  />
)

export default function Onboarding() {
  const router = useRouter()
  const [section, setSection] = useState(1)
  const [form, setForm] = useState<any>({
    track: '',
    what_building: '', customer: '', stage: '', problem: '',
    country: '', target_market: [] as string[], sector: '', business_model: '', product_type: '',
    budget: '', time_available: '', team_size: '', audience_size: '', investor_access: '',
    background: '', first_business: '', failed_before: '', biggest_mistake: '',
    end_goal: '', biggest_fear: '', revenue_timeline: ''
  })

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/auth/login'); return }
      const { data: profile } = await supabase.from('founder_profiles').select('user_id').eq('user_id', data.user.id).single()
      if (profile) router.push('/mentor')
    })
  }, [])

  const setPill = (field: string, value: string, multi = false) => {
    if (multi) {
      setForm((f: any) => ({
        ...f,
        [field]: f[field].includes(value) ? f[field].filter((v: string) => v !== value) : [...f[field], value]
      }))
    } else {
      setForm((f: any) => ({ ...f, [field]: value }))
    }
  }

  const pillStyle = (field: string, value: string, multi = false) => {
    const active = multi ? form[field].includes(value) : form[field] === value
    return {
      padding: '8px 16px', borderRadius: 8, border: '1px solid',
      borderColor: active ? '#534AB7' : '#1e2340',
      background: active ? '#534AB7' : 'transparent',
      color: 'white', cursor: 'pointer', fontSize: 13, margin: '4px', display: 'inline-block'
    }
  }

  const Pill = ({ field, value, multi = false }: any) => (
    <button onClick={() => setPill(field, value, multi)} style={pillStyle(field, value, multi)}>{value}</button>
  )

  const setField = (field: string, value: string) => setForm((f: any) => ({ ...f, [field]: value }))

  // Mappa i campi del form (nomi verbosi, comodi in UI) alle colonne reali
  // della tabella `founder_profiles` su Supabase, che usano nomi più corti
  // (es. what_building -> idea, business_model -> model, team_size -> team).
  // Un mismatch qui faceva fallire silenziosamente l'upsert (nessun controllo
  // errore) e l'utente si ritrovava a rifare l'onboarding a ogni login.
  const handleSubmit = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      user_id: user.id,
      track: form.track || null,
      idea: form.what_building,
      customer: form.customer,
      stage: form.stage,
      problem: form.problem,
      country: form.country,
      target_market: form.target_market,
      sector: form.sector,
      model: form.business_model,
      product_type: form.product_type,
      budget: form.budget,
      time_available: form.time_available,
      team: form.team_size,
      audience: form.audience_size,
      investors: form.investor_access,
      expertise: form.background,
      first_time: form.first_business,
      failure: form.failed_before,
      biggest_mistake: form.biggest_mistake,
      goal: form.end_goal,
      fear: form.biggest_fear,
      timeline: form.revenue_timeline,
    }
    const { error } = await supabase.from('founder_profiles').upsert(payload, { onConflict: 'user_id' })
    if (error) {
      console.error('Errore salvataggio profilo:', error.message)
      alert('Non sono riuscito a salvare il profilo. Riprova.')
      return
    }
    router.push('/dashboard')
  }

  const sections = ['Il tuo progetto', 'Il tuo mercato', 'Le tue risorse', 'Il tuo background', 'Obiettivi e mindset']

  return (
    <div style={{ minHeight: '100vh', background: '#0a0c1a', color: 'white', fontFamily: 'system-ui', padding: '40px 20px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Progresso */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 13, color: '#7F77DD', marginBottom: 8 }}>{section} / 5 — {sections[section - 1]}</div>
          <div style={{ height: 3, background: '#1e2340', borderRadius: 2 }}>
            <div style={{ height: '100%', background: '#534AB7', borderRadius: 2, width: `${(section / 5) * 100}%`, transition: 'width 0.3s' }} />
          </div>
        </div>

        {/* SEZIONE 1 — Il tuo progetto */}
        {section === 1 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Il tuo progetto</h2>
            <span style={{ fontSize: 12, background: '#1e2340', color: '#7F77DD', padding: '2px 10px', borderRadius: 20 }}>Obbligatorio</span>

            <Label text="Che percorso stai seguendo?" />
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setField('track', 'startup')} style={pillStyle('track', 'startup')}>Startup / scale-up</button>
              <button onClick={() => setField('track', 'smb')} style={pillStyle('track', 'smb')}>PMI / attività tradizionale</button>
            </div>

            <Label text="Cosa stai costruendo?" sub="Una o due frasi. Non fare il pitch — spiega e basta." />
            <Textarea value={form.what_building} onChange={(e: any) => setField('what_building', e.target.value)} placeholder="Aiutiamo X a fare Y grazie a Z..." />

            <Label text="Chi è il tuo cliente?" sub="Sii specifico. Non 'le piccole imprese' — chi esattamente?" />
            <Textarea value={form.customer} onChange={(e: any) => setField('customer', e.target.value)} placeholder="Founder alle prime armi che..." />

            <Label text="Dove sei adesso?" sub="Sii onesto. Cambia tutto." />
            <div style={{ marginTop: 8 }}>
              {['Solo un\'idea', 'Sto costruendo l\'MVP', 'Lanciato, pre-revenue', 'Prime entrate ($1–$5k MRR)', 'In crescita ($5k+ MRR)'].map(v => (
                <Pill key={v} field="stage" value={v} />
              ))}
            </div>

            <Label text="Problema più urgente in questo momento?" sub="Cosa ti impedisce di dormire la notte." />
            <Textarea value={form.problem} onChange={(e: any) => setField('problem', e.target.value)} placeholder="La cosa che mi blocca di più adesso è..." />
          </div>
        )}

        {/* SEZIONE 2 — Il tuo mercato */}
        {section === 2 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Il tuo mercato</h2>
            <span style={{ fontSize: 12, background: '#1e2340', color: '#6b7280', padding: '2px 10px', borderRadius: 20 }}>Facoltativo — salta pure se preferisci</span>

            <Label text="Dove sei basato?" sub="Influenza normative, accesso ai finanziamenti e dinamiche di mercato." />
            <select
              value={form.country}
              onChange={e => setForm((f: any) => ({ ...f, country: e.target.value }))}
              style={{ width: '100%', background: '#0f1229', border: '1px solid #1e2340', borderRadius: 8, color: 'white', padding: '12px', fontSize: 14, outline: 'none', marginTop: 8 }}
            >
              <option value="">Seleziona il tuo paese...</option>
              {['Afghanistan','Albania','Algeria','Argentina','Australia','Austria','Belgio','Bolivia','Brasile','Canada','Cile','Cina','Colombia','Croazia','Repubblica Ceca','Danimarca','Ecuador','Egitto','Estonia','Finlandia','Francia','Germania','Ghana','Grecia','Ungheria','India','Indonesia','Iran','Irlanda','Israele','Italia','Giappone','Giordania','Kenya','Lettonia','Lituania','Malesia','Messico','Marocco','Paesi Bassi','Nuova Zelanda','Nigeria','Norvegia','Pakistan','Perù','Filippine','Polonia','Portogallo','Romania','Russia','Arabia Saudita','Singapore','Sudafrica','Corea del Sud','Spagna','Svezia','Svizzera','Taiwan','Tailandia','Turchia','Ucraina','Emirati Arabi Uniti','Regno Unito','Stati Uniti','Uruguay','Venezuela','Vietnam','Altro'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <Label text="Mercato target?" sub="Dove vendi. Puoi selezionarne più di uno." />
            <div style={{ marginTop: 8 }}>
              {['Locale / Nazionale', 'Europa', 'Nord America', 'America Latina', 'Asia Pacifico', 'Globale', 'Nessun focus geografico'].map(v => (
                <Pill key={v} field="target_market" value={v} multi={true} />
              ))}
            </div>

            <Label text="In quale settore operi?" />
            <div style={{ marginTop: 8 }}>
              {['SaaS / Software', 'E-commerce / DTC', 'Marketplace', 'Creator Economy', 'Servizi / Agenzia', 'Fintech', 'Healthtech', 'Edtech', 'Hardware / Fisico', 'Altro'].map(v => (
                <Pill key={v} field="sector" value={v} />
              ))}
            </div>

            <Label text="B2B o B2C?" />
            <div style={{ marginTop: 8 }}>
              {['B2B', 'B2C', 'B2B2C', 'Entrambi', 'Marketplace'].map(v => (
                <Pill key={v} field="business_model" value={v} />
              ))}
            </div>

            <Label text="Tipo di prodotto?" />
            <div style={{ marginTop: 8 }}>
              {['Digitale', 'Fisico', 'Servizio', 'Ibrido'].map(v => (
                <Pill key={v} field="product_type" value={v} />
              ))}
            </div>
          </div>
        )}

        {/* SEZIONE 3 — Le tue risorse */}
        {section === 3 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Le tue risorse</h2>
            <span style={{ fontSize: 12, background: '#1e2340', color: '#6b7280', padding: '2px 10px', borderRadius: 20 }}>Facoltativo — salta pure se preferisci</span>

            <Label text="Budget disponibile?" sub="Capitale totale che puoi investire adesso." />
            <div style={{ marginTop: 8 }}>
              {['Bootstrap / €0', 'Meno di €5k', '€5k – €20k', '€20k – €100k', 'Più di €100k', 'Già finanziato'].map(v => (
                <Pill key={v} field="budget" value={v} />
              ))}
            </div>

            <Label text="Tempo disponibile?" />
            <div style={{ marginTop: 8 }}>
              {['Side project', 'Part-time (~20h/settimana)', 'Full-time', 'All in (80h+)'].map(v => (
                <Pill key={v} field="time_available" value={v} />
              ))}
            </div>

            <Label text="Solo o in squadra?" />
            <div style={{ marginTop: 8 }}>
              {['Founder solo', 'Co-founder', 'Team piccolo (3–5)', 'Team (6+)'].map(v => (
                <Pill key={v} field="team_size" value={v} />
              ))}
            </div>

            <Label text="Hai già un pubblico?" sub="Social, newsletter, community — qualsiasi distribuzione." />
            <div style={{ marginTop: 8 }}>
              {['Nessun pubblico', 'Piccolo (meno di 1k)', 'Medio (1k–10k)', 'Grande (10k+)'].map(v => (
                <Pill key={v} field="audience_size" value={v} />
              ))}
            </div>

            <Label text="Accesso a investitori / network?" />
            <div style={{ marginTop: 8 }}>
              {['Nessun network', 'Qualche contatto', 'Network solido', 'Già finanziato'].map(v => (
                <Pill key={v} field="investor_access" value={v} />
              ))}
            </div>
          </div>
        )}

        {/* SEZIONE 4 — Il tuo background */}
        {section === 4 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Il tuo background</h2>
            <span style={{ fontSize: 12, background: '#1e2340', color: '#6b7280', padding: '2px 10px', borderRadius: 20 }}>Facoltativo — salta pure se preferisci</span>

            <Label text="Qual è il tuo background principale?" />
            <div style={{ marginTop: 8 }}>
              {['Tecnico', 'Business', 'Creativo', 'Esperto di settore', 'Generalista'].map(v => (
                <Pill key={v} field="background" value={v} />
              ))}
            </div>

            <Label text="Prima impresa?" />
            <div style={{ marginTop: 8 }}>
              {['Sì, prima volta', 'Ci ho già provato', 'Serial founder', 'Operatore diventato founder'].map(v => (
                <Pill key={v} field="first_business" value={v} />
              ))}
            </div>

            <Label text="Hai già fallito un progetto?" />
            <div style={{ marginTop: 8 }}>
              {['No', 'Sì, piccolo fallimento', 'Sì, fallimento importante', 'Più volte'].map(v => (
                <Pill key={v} field="failed_before" value={v} />
              ))}
            </div>

            <Label text="Errore più grande finora?" sub="Salta se non ne hai ancora fatti." />
            <Textarea value={form.biggest_mistake} onChange={(e: any) => setField('biggest_mistake', e.target.value)} placeholder="L'errore che mi ha insegnato di più è stato..." />
          </div>
        )}

        {/* SEZIONE 5 — Obiettivi e mindset */}
        {section === 5 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Obiettivi e mindset</h2>
            <span style={{ fontSize: 12, background: '#1e2340', color: '#6b7280', padding: '2px 10px', borderRadius: 20 }}>Facoltativo — salta pure se preferisci</span>

            <Label text="Obiettivo finale?" sub="Non esiste la risposta giusta — ma cambia tutto." />
            <div style={{ marginTop: 8 }}>
              {['Business lifestyle', 'Crescere e scalare', 'Exit / acquisizione', 'Startup VC-backed', 'Impatto / missione', 'Non lo so ancora'].map(v => (
                <Pill key={v} field="end_goal" value={v} />
              ))}
            </div>

            <Label text="Paura più grande in questo momento?" />
            <div style={{ marginTop: 8 }}>
              {['Fallire pubblicamente', 'Rimanere senza soldi', 'Costruire la cosa sbagliata', 'Essere schiacciato dalla concorrenza', 'Farlo da solo', 'Muovermi troppo lentamente'].map(v => (
                <Pill key={v} field="biggest_fear" value={v} />
              ))}
            </div>

            <Label text="Entro quando vuoi il primo ricavo?" />
            <div style={{ marginTop: 8 }}>
              {['Già fattura', 'Entro 1 mese', '1–3 mesi', '3–6 mesi', '6–12 mesi', 'Non lo so'].map(v => (
                <Pill key={v} field="revenue_timeline" value={v} />
              ))}
            </div>
          </div>
        )}

        {/* Navigazione */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
          {section > 1 ? (
            <button onClick={() => setSection(s => s - 1)} style={{ background: 'transparent', border: '1px solid #1e2340', color: 'white', padding: '12px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
              ← Indietro
            </button>
          ) : <span />}

          {section < 5 ? (
            <button onClick={() => setSection(s => s + 1)} style={{ background: '#534AB7', border: 'none', color: 'white', padding: '12px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
              Avanti →
            </button>
          ) : (
            <button onClick={handleSubmit} style={{ background: '#534AB7', border: 'none', color: 'white', padding: '12px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              Inizia con il tuo mentor →
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
