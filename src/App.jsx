
import { useState, useEffect } from "react";
import { BarChart, Bar, Cell, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
const USERS = [
  { id: 'jorge', name: 'Jorge Laso', role: 'Gerente Adm.', color: '#7c6ff7', initials: 'JL' },
  { id: 'luisa', name: 'Luisa', role: 'Enc. Compras', color: '#38bdf8', initials: 'LU' },
  { id: 'hector', name: 'Héctor Vergara', role: 'Bodega', color: '#22c55e', initials: 'HV' },
  { id: 'diego', name: 'Diego Durán', role: 'Salas', color: '#fb923c', initials: 'DD' },
  { id: 'pedro', name: 'Pedro', role: 'Staff', color: '#f43f5e', initials: 'PE' },
];
const ADMIN = { id: 'alan', name: 'Alan Estévez', role: 'Finanzas', color: '#e8b84b', initials: 'AE' };
const CATS = ['Movilidad','Fletes y despachos','Insumo Sala','Insumo Cocina','Reparaciones','Costo','Gastos TK','Gastos ATB','Equipamiento','Gastos de Personal','Otros'];
const CAT_COLORS = ['#e8b84b','#38bdf8','#22c55e','#f43f5e','#a855f7','#fb923c','#06b6d4','#84cc16','#ec4899','#6366f1','#94a3b8'];
const COSTOS = ['Cocina', 'Sala', 'Bar', 'Eventos', 'Administración', 'Bodega'];
const STATUS_LABELS = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' };

const fmt = n => Number(n || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const genId = () => 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);

const SB_URL = 'https://lvzriwmlsyxgydtzyjan.supabase.co';
const SB_KEY = 'sb_publishable_yF4J6NvMzy24zl_9ghszOQ_C6cBZP75';

const sbFetch = (path, opts = {}) => fetch(`${SB_URL}/rest/v1${path}`, {
  ...opts,
  headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...(opts.headers || {}) }
});

const mapToDB = e => ({ id:e.id, user_id:e.userId, user_name:e.userName, proveedor:e.proveedor, rut:e.rut||null, monto:e.monto, fecha:e.fecha, ndoc:e.ndoc||null, items:e.items||null, categoria:e.categoria, centro_costo:e.centroCosto||null, comentario:e.comentario||null, status:e.status, admin_comment:e.adminComment||null, ai_extracted:e.aiExtracted||false, file_name:e.fileName||null, created_at:e.createdAt });
const mapFromDB = r => ({ id:r.id, userId:r.user_id, userName:r.user_name, proveedor:r.proveedor, rut:r.rut, monto:Number(r.monto), fecha:r.fecha, ndoc:r.ndoc, items:r.items, categoria:r.categoria, centroCosto:r.centro_costo, comentario:r.comentario, status:r.status, adminComment:r.admin_comment, aiExtracted:r.ai_extracted, fileName:r.file_name, createdAt:r.created_at });

async function loadAll() {
  try { const r = await sbFetch('/expenses?select=*&order=created_at.desc'); const d = await r.json(); return Array.isArray(d) ? d.map(mapFromDB) : []; } catch(e) { return []; }
}
async function saveExpense(exp) {
  try { await sbFetch('/expenses', { method:'POST', headers:{ 'Prefer':'resolution=merge-duplicates,return=representation' }, body:JSON.stringify(mapToDB(exp)) }); } catch(e) {}
}
async function loadUsers() {
  try { const r = await sbFetch('/user_data?select=*'); const d = await r.json(); if (!Array.isArray(d) || !d.length) return null; const out={}; d.forEach(u=>{ out[u.user_id]={ assigned:Number(u.assigned), spent:Number(u.spent), balance:Number(u.balance) }; }); return out; } catch(e) { return null; }
}
async function saveUsers(data) {
  try { const rows = Object.entries(data).map(([id,d])=>({ user_id:id, assigned:d.assigned||0, spent:d.spent||0, balance:d.balance||0 })); await sbFetch('/user_data', { method:'POST', headers:{ 'Prefer':'resolution=merge-duplicates,return=representation' }, body:JSON.stringify(rows) }); } catch(e) {}
}
async function loadGeminiKey() {
  try { const r = await sbFetch('/config?key=eq.gemini_key&select=value'); const d = await r.json(); return d?.[0]?.value || localStorage.getItem('gemini_api_key') || ''; } catch(e) { return localStorage.getItem('gemini_api_key') || ''; }
}
async function saveGeminiKeyStorage(val) {
  try { await sbFetch('/config', { method:'POST', headers:{ 'Prefer':'resolution=merge-duplicates,return=representation' }, body:JSON.stringify({ key:'gemini_key', value:val }) }); } catch(e) {}
  localStorage.setItem('gemini_api_key', val);
}
function initUsers() { const d = {}; USERS.forEach(u => { d[u.id] = { assigned: 0, spent: 0, balance: 0 }; }); return d; }

async function extractDocumentData(file, apiKey) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64 = e.target.result.split(',')[1];
        const mimeType = file.type || 'image/jpeg';
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: 'Extrae datos de esta boleta/factura chilena. Responde SOLO JSON válido:\n{"proveedor":"nombre","rut":"XX.XXX.XXX-X","monto":numero,"fecha":"YYYY-MM-DD","ndoc":"folio","items":"descripción"}\nSin explicaciones. Solo el JSON.' }
            ]}],
            generationConfig: { maxOutputTokens: 4096, responseMimeType: 'application/json' }
          })
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || `HTTP ${res.status}`); }
        const data = await res.json();
        const candidate = data.candidates?.[0];
        if (!candidate) throw new Error('Sin respuesta de Gemini (candidates vacío)');
        const reason = candidate.finishReason;
        if (reason && reason !== 'STOP') throw new Error(`Gemini no procesó la imagen (${reason})`);
        const text = candidate.content?.parts?.[0]?.text || '{}';
        try { resolve(JSON.parse(text.replace(/```json|```/g, '').trim())); } catch { resolve({}); }
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Error leyendo archivo'));
    reader.readAsDataURL(file);
  });
}

const S = {
  bg0:'#050505',bg1:'#0a0a0a',bg2:'#111111',bg3:'#181818',
  acc:'#e8b84b',acc2:'#f5d070',accD:'#b8881e',
  brd:'#e8b84b',brd2:'#f5d070',
  tx1:'#f0f0f0',tx2:'#999999',tx3:'#555555',
  ok:'#4ade80',warn:'#fbbf24',err:'#f87171',inf:'#38bdf8',
};
const css = {
  wrap: { minHeight:'100vh', background:S.bg0, color:S.tx1, fontFamily:"'Segoe UI',system-ui,sans-serif", fontSize:14 },
  card: { background:S.bg1, border:`1px solid ${S.brd}`, borderRadius:14, padding:'1.1rem' },
  input: { width:'100%', background:S.bg3, border:`1px solid ${S.brd}`, borderRadius:9, padding:'.55rem .8rem', color:S.tx1, fontSize:13, outline:'none' },
  select: { width:'100%', background:S.bg3, border:`1px solid ${S.brd}`, borderRadius:9, padding:'.55rem .8rem', color:S.tx1, fontSize:13, outline:'none' },
  textarea: { width:'100%', background:S.bg3, border:`1px solid ${S.brd}`, borderRadius:9, padding:'.55rem .8rem', color:S.tx1, fontSize:13, outline:'none', resize:'vertical', minHeight:68 },
  btn: (v='primary') => {
    const variants = {
      primary: { background:S.acc, color:'#fff', border:'none' },
      secondary: { background:S.bg2, color:S.tx1, border:`1px solid ${S.brd2}` },
      ok: { background:'#14532d', color:S.ok, border:'1px solid #166534' },
      err: { background:'#450a0a', color:S.err, border:'1px solid #7f1d1d' },
      xs: { background:'none', color:S.tx2, border:`1px solid ${S.brd}` },
    };
    return { ...variants[v], borderRadius:9, padding:'.5rem 1rem', fontSize:13, fontWeight:600, cursor:'pointer' };
  },
  badge: (s) => {
    const m = { pending:{bg:'#2d1f00',color:S.warn,border:'1px solid #92400e'}, approved:{bg:'#052e16',color:S.ok,border:'1px solid #166534'}, rejected:{bg:'#1c0505',color:S.err,border:'1px solid #991b1b'} };
    const d = m[s] || m.pending;
    return { display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, background:d.bg, color:d.color, border:d.border, whiteSpace:'nowrap' };
  },
};

function BoragonLogo({ size = 18 }) {
  return (
    <span style={{ fontFamily:"'Helvetica Neue','Arial','Segoe UI',sans-serif", fontWeight:500, fontSize:size, color:'#ffffff', letterSpacing:'0.28em', textTransform:'uppercase' }}>
      BORAGÓ
    </span>
  );
}

function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, []);
  const colors = { ok:'#166534', err:'#991b1b', inf:'#0e7490' };
  return (
    <div style={{ position:'fixed', bottom:20, right:20, background:S.bg2, border:`1px solid ${colors[type]||S.brd2}`, color:type==='ok'?S.ok:type==='err'?S.err:S.inf, borderRadius:11, padding:'10px 16px', fontSize:13, zIndex:300, boxShadow:'0 8px 32px #00000060', maxWidth:280 }}>
      {msg}
    </div>
  );
}

function StatusBadge({ status }) {
  const dot = { pending:'🟡', approved:'🟢', rejected:'🔴' }[status] || '🟡';
  return <span style={css.badge(status)}>{dot} {STATUS_LABELS[status] || status}</span>;
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position:'fixed', inset:0, background:'#00000090', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ ...css.card, width:'100%', maxWidth:500, maxHeight:'92vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <span style={{ fontWeight:700, fontSize:15 }}>{title}</span>
          <button style={{ ...css.btn('xs'), padding:'3px 8px', fontSize:12, borderRadius:7 }} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Avatar({ u, size = 34 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:u.color+'28', border:`1.5px solid ${u.color}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.28, fontWeight:700, color:u.color, flexShrink:0 }}>
      {u.initials}
    </div>
  );
}

function FLabel({ children }) {
  return <div style={{ fontSize:12, color:S.tx2, marginBottom:4 }}>{children}</div>;
}

function ExpenseForm({ user, onSave, onCancel, toast, geminiKey }) {
  const [file, setFile] = useState(null);
  const [ocr, setOcr] = useState(null);
  const [ocrErr, setOcrErr] = useState('');
  const [aiFields, setAiFields] = useState([]);
  const [form, setForm] = useState({ proveedor:'', rut:'', monto:'', fecha:today(), ndoc:'', items:'', categoria:'Insumos', centroCosto:'Administración', comentario:'' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const ai = k => aiFields.includes(k);
  const aiFilled = { ...css.input, borderColor:S.acc2 + '90', background:'#1a1000' };

  const handleFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast('Archivo muy grande (máx 8MB)', 'err'); return; }
    setFile(f);
    if (!geminiKey) { setOcr(null); toast('Sin API key — completa los campos manualmente', 'inf'); return; }
    setOcr('loading'); setAiFields([]);
    try {
      const data = await extractDocumentData(f, geminiKey);
      const filled = []; const nf = { ...form };
      if (data.proveedor) { nf.proveedor = data.proveedor; filled.push('proveedor'); }
      if (data.rut) { nf.rut = data.rut; filled.push('rut'); }
      if (data.monto) { nf.monto = String(data.monto); filled.push('monto'); }
      if (data.fecha && /\d{4}-\d{2}-\d{2}/.test(data.fecha)) { nf.fecha = data.fecha; filled.push('fecha'); }
      if (data.ndoc) { nf.ndoc = data.ndoc; filled.push('ndoc'); }
      if (data.items) { nf.items = data.items; filled.push('items'); }
      setForm(nf); setAiFields(filled); setOcr('done');
      toast(`✨ Gemini extrajo ${filled.length} campos`, 'inf');
    } catch (err) { const msg = err?.message || 'desconocido'; setOcrErr(msg); setOcr('error'); toast('OCR error: ' + msg, 'err'); }
  };

  const handleSubmit = async () => {
    if (!form.proveedor.trim()) { toast('Ingresa el proveedor', 'err'); return; }
    if (!form.monto || isNaN(Number(form.monto))) { toast('Monto inválido', 'err'); return; }
    setSaving(true);
    const exp = { id:genId(), userId:user.id, userName:user.name, ...form, monto:Number(form.monto), status:'pending', createdAt:new Date().toISOString(), fileName:file?.name || null, adminComment:'', aiExtracted:aiFields.length > 0 };
    await saveExpense(exp); toast('Rendición enviada', 'ok'); onSave(exp); setSaving(false);
  };

  const row = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 };

  return (
    <div>
      <div style={{ marginBottom:12 }}>
        <FLabel>Documento <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:20, background:'#1a1200', color:S.acc2, border:`1px solid ${S.acc}`, marginLeft:6 }}>✨ Gemini lee automático</span></FLabel>
        <div style={{ position:'relative', border:`2px dashed ${S.brd2}`, borderRadius:12, padding:'1.5rem', textAlign:'center', cursor:'pointer' }}>
          <input type="file" accept="image/*,.pdf" onChange={handleFile} disabled={ocr === 'loading'} style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer', width:'100%', height:'100%' }} />
          {!file
            ? <><div style={{ fontSize:28, marginBottom:4 }}>📎</div><div style={{ fontSize:13, color:S.tx2 }}>Foto o PDF de boleta / factura</div><div style={{ fontSize:11, color:S.tx3, marginTop:3 }}>JPG · PNG · PDF — máx 8 MB</div></>
            : <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'center' }}>
                <span style={{ fontSize:20 }}>{file.type.includes('pdf') ? '📄' : '🖼️'}</span>
                <div style={{ textAlign:'left' }}><div style={{ fontSize:13, fontWeight:500 }}>{file.name}</div><div style={{ fontSize:11, color:S.tx3 }}>{(file.size / 1024).toFixed(0)} KB</div></div>
              </div>}
        </div>
        {ocr === 'loading' && <div style={{ background:S.bg1, border:`1px solid ${S.brd}`, borderRadius:10, padding:'12px', textAlign:'center', marginTop:8 }}>
          <div style={{ width:24, height:24, border:`3px solid ${S.brd2}`, borderTopColor:S.acc, borderRadius:'50%', animation:'spin .7s linear infinite', margin:'0 auto 6px' }} />
          <div style={{ fontSize:13, color:S.acc2 }}>Gemini está leyendo el documento...</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>}
        {ocr === 'done' && aiFields.length > 0 && <div style={{ background:S.bg1, border:`1px solid ${S.brd}`, borderRadius:10, padding:'10px 14px', marginTop:8 }}>
          <div style={{ fontSize:12, color:S.acc2, marginBottom:3 }}>✨ {aiFields.length} campos completados automáticamente</div>
          <div style={{ fontSize:11, color:S.tx3 }}>Los campos en morado fueron extraídos. Revisa antes de enviar.</div>
        </div>}
        {ocr === 'error' && <div style={{ marginTop:8, padding:'8px 12px', background:'#1c0505', border:'1px solid #7f1d1d40', borderRadius:8, fontSize:12, color:S.err }}>⚠️ Error OCR: {ocrErr || 'desconocido'}</div>}
      </div>

      <div style={row}>
        <div><FLabel>Proveedor *</FLabel><input style={ai('proveedor') ? aiFilled : css.input} value={form.proveedor} onChange={e => set('proveedor', e.target.value)} placeholder="Nombre proveedor" /></div>
        <div><FLabel>RUT proveedor</FLabel><input style={ai('rut') ? aiFilled : css.input} value={form.rut} onChange={e => set('rut', e.target.value)} placeholder="12.345.678-9" /></div>
      </div>
      <div style={row}>
        <div><FLabel>Monto (CLP) *</FLabel><div style={{ position:'relative' }}><span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:S.tx3, fontSize:13 }}>$</span><input style={{ ...(ai('monto') ? aiFilled : css.input), paddingLeft:24 }} type="number" value={form.monto} onChange={e => set('monto', e.target.value)} placeholder="0" /></div></div>
        <div><FLabel>Fecha</FLabel><input style={ai('fecha') ? aiFilled : css.input} type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} /></div>
      </div>
      <div style={row}>
        <div><FLabel>N° documento</FLabel><input style={ai('ndoc') ? aiFilled : css.input} value={form.ndoc} onChange={e => set('ndoc', e.target.value)} placeholder="00001" /></div>
        <div><FLabel>Categoría</FLabel><select style={css.select} value={form.categoria} onChange={e => set('categoria', e.target.value)}>{CATS.map(c => <option key={c} style={{ background:S.bg2 }}>{c}</option>)}</select></div>
      </div>
      <div style={row}>
        <div><FLabel>Centro de costo</FLabel><select style={css.select} value={form.centroCosto} onChange={e => set('centroCosto', e.target.value)}>{COSTOS.map(c => <option key={c} style={{ background:S.bg2 }}>{c}</option>)}</select></div>
        <div><FLabel>Ítems</FLabel><input style={ai('items') ? aiFilled : css.input} value={form.items} onChange={e => set('items', e.target.value)} placeholder="Descripción breve" /></div>
      </div>
      <div style={{ marginBottom:12 }}><FLabel>Comentario</FLabel><textarea style={css.textarea} value={form.comentario} onChange={e => set('comentario', e.target.value)} placeholder="Contexto adicional..." /></div>
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button style={css.btn('secondary')} onClick={onCancel}>Cancelar</button>
        <button style={{ ...css.btn('primary'), opacity:(saving || ocr === 'loading') ? .5 : 1 }} onClick={handleSubmit} disabled={saving || ocr === 'loading'}>{saving ? 'Guardando...' : 'Enviar rendición'}</button>
      </div>
    </div>
  );
}

function UserView({ user, expenses, userData, onNewExpense, toast, geminiKey }) {
  const [tab, setTab] = useState('list');
  const myExp = expenses.filter(e => e.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const approved = myExp.filter(e => e.status === 'approved').reduce((s, e) => s + e.monto, 0);
  const pending = myExp.filter(e => e.status === 'pending').reduce((s, e) => s + e.monto, 0);
  const ud = userData[user.id] || { assigned: 0 };

  return (
    <div>
      <div style={{ display:'flex', background:S.bg1, borderBottom:`1px solid ${S.brd}`, overflowX:'auto' }}>
        {[['list', 'Mis Rendiciones'], ['nueva', 'Nueva Rendición']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding:'10px 16px', fontSize:13, color:tab===k?S.acc2:S.tx2, background:'none', border:'none', borderBottom:tab===k?`2px solid ${S.acc}`:'2px solid transparent', cursor:'pointer', whiteSpace:'nowrap' }}>{l}</button>
        ))}
      </div>

      {tab === 'list' && <div style={{ padding:16, maxWidth:1100, margin:'0 auto' }}>
        <div style={{ background:S.bg2, border:`1px solid ${S.brd}`, borderRadius:14, padding:'16px 20px', marginBottom:14, display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div><div style={{ fontSize:12, color:S.tx2 }}>Fondo asignado</div><div style={{ fontSize:22, fontWeight:700, color:S.acc2 }}>{fmt(ud.assigned)}</div><div style={{ fontSize:12, color:S.tx2 }}>Saldo disponible: <b style={{ color:S.ok }}>{fmt(ud.assigned - approved - pending)}</b></div></div>
          <div style={{ textAlign:'right' }}><div style={{ fontSize:12, color:S.tx2 }}>Aprobado</div><div style={{ fontSize:16, fontWeight:700, color:S.ok }}>{fmt(approved)}</div><div style={{ fontSize:12, color:S.tx2 }}>En revisión: <b style={{ color:S.inf }}>{fmt(pending)}</b></div></div>
        </div>
        {myExp.length === 0
          ? <div style={{ textAlign:'center', padding:'3rem', color:S.tx3 }}><div style={{ fontSize:36, marginBottom:8 }}>📋</div>No tienes rendiciones aún</div>
          : <div style={{ overflowX:'auto', borderRadius:12, border:`1px solid ${S.brd}` }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:560 }}>
                <thead><tr style={{ background:S.bg2 }}>
                  {['Fecha','Proveedor','Categoría','Monto','Estado','Obs.'].map(h => <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:11, color:S.tx2, fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em', borderBottom:`1px solid ${S.brd}` }}>{h}</th>)}
                </tr></thead>
                <tbody>{myExp.map(e => (
                  <tr key={e.id} style={{ borderBottom:`1px solid ${S.brd}` }}>
                    <td style={{ padding:'10px 12px', fontSize:12, color:S.tx2, whiteSpace:'nowrap' }}>{e.fecha}</td>
                    <td style={{ padding:'10px 12px', fontSize:13 }}>{e.proveedor}{e.aiExtracted && <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:20, background:'#1a1200', color:S.acc2, border:`1px solid ${S.acc}`, marginLeft:4 }}>✨IA</span>}<br /><span style={{ fontSize:10, color:S.tx3 }}>{e.ndoc ? '#' + e.ndoc : ''}</span></td>
                    <td style={{ padding:'10px 12px' }}><span style={{ fontSize:11, background:S.bg2, padding:'2px 7px', borderRadius:5, color:S.tx2 }}>{e.categoria}</span></td>
                    <td style={{ padding:'10px 12px', fontWeight:600, whiteSpace:'nowrap', fontSize:13 }}>{fmt(e.monto)}</td>
                    <td style={{ padding:'10px 12px' }}><StatusBadge status={e.status} /></td>
                    <td style={{ padding:'10px 12px', fontSize:12, color:S.tx3, maxWidth:140 }}>{e.adminComment || e.comentario || '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
      </div>}

      {tab === 'nueva' && <div style={{ padding:16, maxWidth:1100, margin:'0 auto' }}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:12 }}>Nueva rendición</div>
        <div style={css.card}><ExpenseForm user={user} onSave={exp => { onNewExpense(exp); setTab('list'); }} onCancel={() => setTab('list')} toast={toast} geminiKey={geminiKey} /></div>
      </div>}
    </div>
  );
}

function AdminView({ expenses, userData, onUpdateExpense, onUpdateUserData, toast }) {
  const [tab, setTab] = useState('dashboard');
  const [filters, setFilters] = useState({ user:'', cat:'', status:'', from:'', to:'' });
  const [detailExp, setDetailExp] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [comment, setComment] = useState('');
  const [fundModal, setFundModal] = useState(null);
  const [fundAmt, setFundAmt] = useState('');
  const [inlineAction, setInlineAction] = useState(null);
  const [inlineComment, setInlineComment] = useState('');
  const setF = (k, v) => setFilters(p => ({ ...p, [k]: v }));

  const pendingExp = expenses.filter(e => e.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const doApprove = async (exp, cmt) => {
    const upd = { ...exp, status: 'approved', adminComment: cmt };
    await onUpdateExpense(upd);
    toast('✅ Rendición aprobada — fondo restituido', 'ok');
  };
  const doReject = async (exp, cmt) => {
    await onUpdateExpense({ ...exp, status: 'rejected', adminComment: cmt });
    toast('❌ Rendición rechazada', 'err');
  };
  const handleAction = async () => {
    if (!comment.trim()) { toast('El comentario es obligatorio', 'err'); return; }
    if (actionModal.type === 'approve') await doApprove(actionModal.exp, comment);
    else await doReject(actionModal.exp, comment);
    setActionModal(null); setComment(''); setDetailExp(null);
  };
  const handleInline = async () => {
    if (!inlineComment.trim()) { toast('El comentario es obligatorio', 'err'); return; }
    if (inlineAction.type === 'approve') await doApprove(inlineAction.exp, inlineComment);
    else await doReject(inlineAction.exp, inlineComment);
    setInlineAction(null); setInlineComment('');
  };
  const assignFund = async () => {
    if (!fundModal || !fundAmt || isNaN(Number(fundAmt))) return;
    const amt = Number(fundAmt);
    const ud = userData[fundModal.id] || { assigned: 0 };
    const newSpent = expenses.filter(e => e.userId === fundModal.id && e.status === 'approved').reduce((s, e) => s + e.monto, 0);
    await onUpdateUserData({ ...userData, [fundModal.id]: { ...ud, assigned: ud.assigned + amt, spent: newSpent, balance: (ud.assigned + amt) - newSpent } });
    toast(`Fondo asignado a ${fundModal.name}`, 'ok'); setFundModal(null); setFundAmt('');
  };

  const approvedExp = expenses.filter(e => e.status === 'approved');
  const catPieData = CATS.map((c, i) => ({ name: c, value: approvedExp.filter(e => e.categoria === c).reduce((s, e) => s + e.monto, 0), color: CAT_COLORS[i] })).filter(d => d.value > 0);
  const monthUserData = USERS.map(u => ({ name: u.name.split(' ')[0], value: approvedExp.filter(e => e.userId === u.id && e.fecha?.startsWith(thisMonth())).reduce((s, e) => s + e.monto, 0), color: u.color }));
  const monthlyTrend = () => {
    const map = {};
    approvedExp.forEach(e => { const m = e.fecha?.slice(0, 7) || ''; if (m) map[m] = (map[m] || 0) + e.monto; });
    return Object.entries(map).sort().slice(-6).map(([m, v]) => ({ mes: m.slice(5) + '/' + m.slice(2, 4), total: v }));
  };
  const totalApproved = approvedExp.reduce((s, e) => s + e.monto, 0);
  const totalPending = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.monto, 0);
  const totalFunds = Object.values(userData).reduce((s, u) => s + (u.assigned || 0), 0);
  const TT = { contentStyle: { background: S.bg2, border: `1px solid ${S.brd}`, borderRadius: 8, color: S.tx1, fontSize: 12 }, formatter: v => fmt(v) };

  const filtered = expenses.filter(e => {
    if (filters.user && e.userId !== filters.user) return false;
    if (filters.cat && e.categoria !== filters.cat) return false;
    if (filters.status && e.status !== filters.status) return false;
    if (filters.from && e.fecha < filters.from) return false;
    if (filters.to && e.fecha > filters.to) return false;
    return true;
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const exportCSV = () => {
    const rows = [['Fecha','Usuario','Proveedor','RUT','N°Doc','Categoría','Centro','Monto','Estado','IA','Obs']];
    filtered.forEach(e => rows.push([e.fecha, e.userName, e.proveedor, e.rut||'', e.ndoc||'', e.categoria, e.centroCosto, e.monto, STATUS_LABELS[e.status]||'', e.aiExtracted?'Sí':'No', e.adminComment||e.comentario||'']));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const b = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'rendiciones.csv'; a.click();
  };

  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.06) return null;
    const R = Math.PI / 180, r = innerRadius + (outerRadius - innerRadius) * 0.58;
    return <text x={cx + r * Math.cos(-midAngle * R)} y={cy + r * Math.sin(-midAngle * R)} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>{(percent * 100).toFixed(0)}%</text>;
  };

  const exportXLSX = async () => {
    const fname = `reporte_fondos_${new Date().toISOString().slice(0,10)}`;
    try {
      const XLSX = await import("https://esm.sh/xlsx");
      const wb = XLSX.utils.book_new();
      const sheet1 = [['Fecha','Usuario','Proveedor','Monto (CLP)','Categoría','Centro Costo','Estado','N° Doc','Comentario']];
      expenses.forEach(e => sheet1.push([e.fecha, e.userName, e.proveedor, e.monto, e.categoria, e.centroCosto||'', STATUS_LABELS[e.status]||e.status, e.ndoc||'', e.adminComment||e.comentario||'']));
      sheet1.push([], ['TOTAL','','', expenses.reduce((s,e)=>s+e.monto,0),'','','','','']);
      const ws1 = XLSX.utils.aoa_to_sheet(sheet1);
      ws1['!cols'] = [{ wch:12 },{ wch:18 },{ wch:24 },{ wch:14 },{ wch:14 },{ wch:16 },{ wch:12 },{ wch:10 },{ wch:30 }];
      ws1['!freeze'] = { xSplit:0, ySplit:1 };
      XLSX.utils.book_append_sheet(wb, ws1, 'Gastos');
      const catMap = {};
      expenses.forEach(e => { if (!catMap[e.categoria]) catMap[e.categoria] = { total:0, count:0 }; catMap[e.categoria].total += e.monto; catMap[e.categoria].count++; });
      const sheet2 = [['Categoría','Total (CLP)','Promedio (CLP)','Cantidad']];
      Object.entries(catMap).sort((a,b)=>b[1].total-a[1].total).forEach(([cat,d]) => sheet2.push([cat, d.total, Math.round(d.total/d.count), d.count]));
      const ws2 = XLSX.utils.aoa_to_sheet(sheet2);
      ws2['!cols'] = [{ wch:16 },{ wch:16 },{ wch:16 },{ wch:10 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Por Categoría');
      const userMap = {};
      expenses.forEach(e => { if (!userMap[e.userId]) userMap[e.userId] = { name:e.userName, total:0, approved:0, pending:0, count:0 }; userMap[e.userId].total += e.monto; userMap[e.userId].count++; if(e.status==='approved') userMap[e.userId].approved += e.monto; if(e.status==='pending') userMap[e.userId].pending += e.monto; });
      const sheet3 = [['Usuario','Total (CLP)','Aprobado (CLP)','En Revisión (CLP)','Cantidad']];
      Object.values(userMap).sort((a,b)=>b.total-a.total).forEach(d => sheet3.push([d.name, d.total, d.approved, d.pending, d.count]));
      const ws3 = XLSX.utils.aoa_to_sheet(sheet3);
      ws3['!cols'] = [{ wch:20 },{ wch:16 },{ wch:16 },{ wch:18 },{ wch:10 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Por Usuario');
      XLSX.writeFile(wb, fname + '.xlsx');
    } catch(e) {
      const rows = [['Fecha','Usuario','Proveedor','Monto','Categoría','Estado','Comentario']];
      expenses.forEach(e => rows.push([e.fecha, e.userName, e.proveedor, e.monto, e.categoria, STATUS_LABELS[e.status]||'', e.adminComment||e.comentario||'']));
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
      const b = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fname+'.csv'; a.click();
    }
  };

  const generatePDF = async (exp) => {
    let jsPDF;
    try { ({ jsPDF } = await import("https://esm.sh/jspdf")); } catch(e) { jsPDF = null; }
    if (!jsPDF) {
      const w = window.open('','_blank');
      w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Comprobante</title><style>body{font-family:sans-serif;padding:30px;max-width:580px;margin:0 auto;color:#222}h2{color:#7c6ff7;margin-bottom:4px}.sub{color:#888;font-size:13px;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-bottom:16px}td{padding:9px 6px;border-bottom:1px solid #eee;font-size:13px}td:first-child{color:#888;width:140px}.badge{display:inline-block;background:#052e16;color:#4ade80;border:1px solid #166534;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700}.monto{font-size:22px;font-weight:700;color:#7c6ff7;margin:16px 0}.footer{margin-top:30px;font-size:11px;color:#aaa;text-align:center;border-top:1px solid #eee;padding-top:12px}@media print{button{display:none}}</style></head><body>
        <h2>Fondos Corporativos</h2><div class="sub">Boragó Restaurant · Comprobante de Rendición</div>
        <span class="badge">✓ APROBADA</span>
        <div class="monto">${fmt(exp.monto)}</div>
        <table>
          <tr><td>Proveedor</td><td><b>${exp.proveedor}</b></td></tr>
          <tr><td>RUT</td><td>${exp.rut||'—'}</td></tr>
          <tr><td>N° Documento</td><td>${exp.ndoc||'—'}</td></tr>
          <tr><td>Fecha</td><td>${exp.fecha}</td></tr>
          <tr><td>Usuario</td><td>${exp.userName}</td></tr>
          <tr><td>Categoría</td><td>${exp.categoria}</td></tr>
          <tr><td>Centro de Costo</td><td>${exp.centroCosto||'—'}</td></tr>
          <tr><td>Ítems</td><td>${exp.items||'—'}</td></tr>
          <tr><td>Aprobado por</td><td>Alan Estévez — Finanzas</td></tr>
          ${exp.adminComment?`<tr><td>Comentario</td><td>${exp.adminComment}</td></tr>`:''}
        </table>
        <div class="footer">Fondos Corporativos · Boragó Restaurant · Santiago, Chile · ${new Date().toLocaleDateString('es-CL')}</div>
        <script>window.onload=()=>window.print();<\/script>
      </body></html>`);
      w.document.close();
      return;
    }
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const W = 210, M = 20, CW = 170;

    // Header
    doc.setFillColor(18, 18, 31);
    doc.rect(0, 0, W, 42, 'F');
    doc.setFontSize(20); doc.setFont('helvetica','bold'); doc.setTextColor(226,226,240);
    doc.text('Fondos Corporativos', M, 18);
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(144,144,184);
    doc.text('Boragó Restaurant · Comprobante de Rendición', M, 27);
    doc.setFillColor(5,46,22); doc.roundedRect(W-M-38, 14, 38, 10, 2, 2, 'F');
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(74,222,128);
    doc.text('APROBADA', W-M-19, 20.5, { align:'center' });

    // Monto destacado
    let y = 52;
    doc.setFillColor(26,21,53); doc.roundedRect(M, y, CW, 20, 3, 3, 'F');
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(169,157,245);
    doc.text('Monto Total', M+6, y+8);
    doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.setTextColor(124,111,247);
    doc.text(fmt(exp.monto), M+CW-6, y+13, { align:'right' });
    y += 28;

    // Detalle
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,50);
    doc.text('Detalle de Rendición', M, y); y += 5;
    doc.setDrawColor(200,200,220); doc.line(M, y, M+CW, y); y += 7;

    const fields = [['Proveedor',exp.proveedor],['RUT Proveedor',exp.rut||'—'],['N° Documento',exp.ndoc||'—'],['Fecha',exp.fecha],['Usuario',exp.userName],['Categoría',exp.categoria],['Centro de Costo',exp.centroCosto||'—'],['Ítems',exp.items||'—']];
    fields.forEach(([label, value]) => {
      doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(120,120,160);
      doc.text(label, M, y);
      doc.setFont('helvetica','normal'); doc.setTextColor(30,30,50);
      const lines = doc.splitTextToSize(String(value), CW-48);
      doc.text(lines, M+48, y);
      y += Math.max(7, lines.length*6);
    });

    // Aprobación
    y += 3; doc.setDrawColor(200,200,220); doc.line(M, y, M+CW, y); y += 7;
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,50);
    doc.text('Aprobación', M, y); y += 7;
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(120,120,160);
    doc.text('Aprobado por', M, y);
    doc.setFont('helvetica','normal'); doc.setTextColor(30,30,50);
    doc.text('Alan Estévez — Finanzas', M+48, y); y += 7;
    if (exp.adminComment) {
      doc.setFont('helvetica','bold'); doc.setTextColor(120,120,160);
      doc.text('Comentario', M, y);
      doc.setFont('helvetica','normal'); doc.setTextColor(30,30,50);
      const lines = doc.splitTextToSize(exp.adminComment, CW-48);
      doc.text(lines, M+48, y); y += lines.length*6+4;
    }

    // Footer
    doc.setFillColor(18,18,31); doc.rect(0,278,W,19,'F');
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(107,104,128);
    doc.text('Fondos Corporativos · Boragó Restaurant · Santiago, Chile', W/2, 287, { align:'center' });
    doc.text(`Generado: ${new Date().toLocaleDateString('es-CL')}`, W/2, 293, { align:'center' });

    doc.save(`comprobante_${exp.proveedor.replace(/\s+/g,'_')}_${exp.fecha}.pdf`);
  };

  const P = { padding:16, maxWidth:1100, margin:'0 auto' };
  const thStyle = { padding:'8px 12px', textAlign:'left', fontSize:11, color:S.tx2, fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em', borderBottom:`1px solid ${S.brd}` };
  const tdStyle = { padding:'10px 12px', fontSize:13, borderBottom:`1px solid ${S.brd}`, color:S.tx1, verticalAlign:'middle' };

  return (
    <div>
      <div style={{ display:'flex', background:S.bg1, borderBottom:`1px solid ${S.brd}`, overflowX:'auto' }}>
        {[['dashboard','Dashboard'],['pending','Pendientes'],['expenses','Todas'],['funds','Fondos']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding:'10px 16px', fontSize:13, color:tab===k?S.acc2:S.tx2, background:'none', border:'none', borderBottom:tab===k?`2px solid ${S.acc}`:'2px solid transparent', cursor:'pointer', whiteSpace:'nowrap', position:'relative' }}>
            {l}{k==='pending'&&pendingExp.length>0&&<span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', background:'#92400e', color:S.warn, fontSize:10, fontWeight:700, width:16, height:16, borderRadius:'50%', marginLeft:5, verticalAlign:'middle' }}>{pendingExp.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <div style={P}>
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
          <button style={{ ...css.btn('secondary'), padding:'7px 14px', fontSize:12 }} onClick={exportXLSX}>↓ Exportar Reporte</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10, marginBottom:14 }}>
          {[['Fondos asignados',fmt(totalFunds),null],['Gasto aprobado',fmt(totalApproved),S.ok],['En revisión',fmt(totalPending),S.warn],['Total registros',expenses.length,null]].map(([t,v,c],i) => (
            <div key={i} style={css.card}><div style={{ fontSize:11, color:S.tx2, marginBottom:4, textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600 }}>{t}</div><div style={{ fontSize:22, fontWeight:700, color:c||S.tx1 }}>{v}</div></div>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div style={css.card}>
            <div style={{ fontSize:11, color:S.tx2, marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600 }}>Distribución por categoría</div>
            {catPieData.length === 0
              ? <div style={{ textAlign:'center', padding:'2rem', color:S.tx3 }}><div style={{ fontSize:28 }}>🥧</div><div style={{ fontSize:13, marginTop:6 }}>Sin datos aprobados</div></div>
              : <>
                  <ResponsiveContainer width="100%" height={180}><PieChart><Pie data={catPieData} cx="50%" cy="50%" outerRadius={75} dataKey="value" labelLine={false} label={renderPieLabel}>{catPieData.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}</Pie><Tooltip {...TT} /></PieChart></ResponsiveContainer>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 10px', marginTop:4 }}>
                    {catPieData.map((d, i) => <div key={i} style={{ display:'flex', alignItems:'center', fontSize:11, color:S.tx2 }}><span style={{ width:8, height:8, borderRadius:'50%', background:d.color, display:'inline-block', marginRight:5 }} />{d.name}</div>)}
                  </div>
                </>}
          </div>
          <div style={css.card}>
            <div style={{ fontSize:11, color:S.tx2, marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600 }}>Gasto este mes por usuario</div>
            <ResponsiveContainer width="100%" height={205}><BarChart data={monthUserData} margin={{ top:5, right:5, left:0, bottom:5 }}><CartesianGrid strokeDasharray="3 3" stroke="#3a2e00" /><XAxis dataKey="name" tick={{ fill:S.tx2, fontSize:11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill:S.tx2, fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + Math.round(v / 1000) + 'k'} /><Tooltip {...TT} /><Bar dataKey="value" radius={[5,5,0,0]}>{monthUserData.map((d, i) => <Cell key={i} fill={d.color} />)}</Bar></BarChart></ResponsiveContainer>
          </div>
        </div>
        <div style={css.card}>
          <div style={{ fontSize:11, color:S.tx2, marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600 }}>Evolución mensual — gasto aprobado</div>
          {monthlyTrend().length === 0
            ? <div style={{ textAlign:'center', padding:'2rem', color:S.tx3 }}><div style={{ fontSize:28 }}>📈</div><div style={{ fontSize:13, marginTop:6 }}>Sin datos aún</div></div>
            : <ResponsiveContainer width="100%" height={175}><LineChart data={monthlyTrend()} margin={{ top:5, right:10, left:0, bottom:5 }}><CartesianGrid strokeDasharray="3 3" stroke="#3a2e00" /><XAxis dataKey="mes" tick={{ fill:S.tx2, fontSize:11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill:S.tx2, fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + Math.round(v / 1000) + 'k'} /><Tooltip {...TT} /><Line type="monotone" dataKey="total" stroke={S.acc} strokeWidth={2.5} dot={{ fill:S.acc, r:4 }} activeDot={{ r:6 }} /></LineChart></ResponsiveContainer>}
        </div>
      </div>}

      {tab === 'pending' && <div style={P}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <div style={{ fontWeight:700, fontSize:15 }}>Rendiciones pendientes</div>
          {pendingExp.length > 0 && <div style={{ fontSize:12, color:S.tx2 }}>{pendingExp.length} pendiente{pendingExp.length !== 1 ? 's' : ''} · {fmt(totalPending)}</div>}
        </div>
        {pendingExp.length === 0
          ? <div style={{ textAlign:'center', padding:'3rem', color:S.tx3 }}><div style={{ fontSize:36, marginBottom:8 }}>✅</div>No hay rendiciones pendientes</div>
          : <div style={{ overflowX:'auto', borderRadius:12, border:`1px solid ${S.brd}` }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
                <thead><tr style={{ background:S.bg2 }}>
                  {['Fecha','Usuario','Proveedor','Cat.','Monto','Acciones'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {pendingExp.map(e => {
                    const u = USERS.find(x => x.id === e.userId) || { color:'#888', initials:'??', name:e.userName };
                    const isOpen = inlineAction?.exp?.id === e.id;
                    return [
                      <tr key={e.id}>
                        <td style={tdStyle}><span style={{ fontSize:12, color:S.tx2, whiteSpace:'nowrap' }}>{e.fecha}</span></td>
                        <td style={tdStyle}><div style={{ display:'flex', alignItems:'center', gap:6 }}><div style={{ width:26, height:26, borderRadius:'50%', background:u.color+'28', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:u.color }}>{u.initials}</div><span style={{ fontSize:13 }}>{u.name.split(' ')[0]}</span></div></td>
                        <td style={tdStyle}><span style={{ fontWeight:500 }}>{e.proveedor}</span>{e.aiExtracted && <span style={{ fontSize:10, fontWeight:700, padding:'2px 5px', borderRadius:20, background:'#1a1200', color:S.acc2, border:`1px solid ${S.acc}`, marginLeft:4 }}>✨IA</span>}</td>
                        <td style={tdStyle}><span style={{ fontSize:11, background:S.bg2, padding:'2px 7px', borderRadius:5, color:S.tx2 }}>{e.categoria}</span></td>
                        <td style={{ ...tdStyle, fontWeight:700, color:S.acc2, whiteSpace:'nowrap' }}>{fmt(e.monto)}</td>
                        <td style={tdStyle}>
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                            <button style={{ ...css.btn('xs'), padding:'4px 8px', fontSize:12, borderRadius:7 }} onClick={() => setDetailExp(e)}>Ver</button>
                            <button style={{ ...css.btn('ok'), padding:'5px 10px', fontSize:12 }} onClick={() => { setInlineAction({ exp:e, type:'approve' }); setInlineComment(''); }}>✓ Aprobar</button>
                            <button style={{ ...css.btn('err'), padding:'5px 10px', fontSize:12 }} onClick={() => { setInlineAction({ exp:e, type:'reject' }); setInlineComment(''); }}>✕ Rechazar</button>
                          </div>
                        </td>
                      </tr>,
                      isOpen && <tr key={e.id + '_inline'}>
                        <td colSpan={6} style={{ padding:0, background:S.bg0, borderTop:`1px solid ${S.brd}` }}>
                          <div style={{ padding:'10px 14px', display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
                            <div style={{ flex:1, minWidth:220 }}>
                              <div style={{ fontSize:12, color:inlineAction.type==='approve'?S.ok:S.err, marginBottom:4, fontWeight:600 }}>
                                {inlineAction.type === 'approve' ? '✓ Comentario de aprobación *' : '✕ Motivo de rechazo *'}
                              </div>
                              <input style={css.input} value={inlineComment} onChange={e => setInlineComment(e.target.value)} placeholder="Obligatorio..." autoFocus />
                            </div>
                            <button style={{ ...css.btn(inlineAction.type==='approve'?'ok':'err'), opacity:!inlineComment.trim()?.5:1 }} onClick={handleInline} disabled={!inlineComment.trim()}>
                              {inlineAction.type === 'approve' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
                            </button>
                            <button style={css.btn('secondary')} onClick={() => { setInlineAction(null); setInlineComment(''); }}>Cancelar</button>
                          </div>
                        </td>
                      </tr>
                    ];
                  })}
                </tbody>
              </table>
            </div>}
      </div>}

      {tab === 'expenses' && <div style={P}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12, alignItems:'center' }}>
          <select style={{ ...css.select, flex:1, minWidth:110 }} value={filters.user} onChange={e => setF('user', e.target.value)}><option value="">Todos</option>{USERS.map(u => <option key={u.id} value={u.id} style={{ background:S.bg2 }}>{u.name.split(' ')[0]}</option>)}</select>
          <select style={{ ...css.select, flex:1, minWidth:110 }} value={filters.cat} onChange={e => setF('cat', e.target.value)}><option value="">Categoría</option>{CATS.map(c => <option key={c} style={{ background:S.bg2 }}>{c}</option>)}</select>
          <select style={{ ...css.select, flex:1, minWidth:110 }} value={filters.status} onChange={e => setF('status', e.target.value)}><option value="">Estado</option><option value="pending" style={{ background:S.bg2 }}>Pendiente</option><option value="approved" style={{ background:S.bg2 }}>Aprobada</option><option value="rejected" style={{ background:S.bg2 }}>Rechazada</option></select>
          <input style={{ ...css.input, flex:1, minWidth:125 }} type="date" value={filters.from} onChange={e => setF('from', e.target.value)} />
          <input style={{ ...css.input, flex:1, minWidth:125 }} type="date" value={filters.to} onChange={e => setF('to', e.target.value)} />
          <button style={{ ...css.btn('secondary'), padding:'7px 12px', fontSize:12 }} onClick={() => setFilters({ user:'', cat:'', status:'', from:'', to:'' })}>Limpiar</button>
          <button style={{ ...css.btn('primary'), padding:'7px 12px', fontSize:12 }} onClick={exportCSV}>↓ CSV</button>
        </div>
        {filtered.length === 0
          ? <div style={{ textAlign:'center', padding:'3rem', color:S.tx3 }}><div style={{ fontSize:36, marginBottom:8 }}>📋</div>Sin rendiciones con esos filtros</div>
          : <div style={{ overflowX:'auto', borderRadius:12, border:`1px solid ${S.brd}` }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
                <thead><tr style={{ background:S.bg2 }}>{['Fecha','Usuario','Proveedor','Categoría','Monto','Estado','Acciones'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>{filtered.map(e => {
                  const u = USERS.find(x => x.id === e.userId) || { color:'#888', initials:'??' };
                  return (
                    <tr key={e.id}>
                      <td style={tdStyle}><span style={{ fontSize:12, color:S.tx2, whiteSpace:'nowrap' }}>{e.fecha}</span></td>
                      <td style={tdStyle}><div style={{ display:'flex', alignItems:'center', gap:6 }}><div style={{ width:24, height:24, borderRadius:'50%', background:u.color+'28', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:u.color }}>{u.initials}</div><span style={{ fontSize:13 }}>{e.userName.split(' ')[0]}</span></div></td>
                      <td style={tdStyle}>{e.proveedor}{e.aiExtracted && <span style={{ fontSize:10, fontWeight:700, padding:'2px 5px', borderRadius:20, background:'#1a1200', color:S.acc2, border:`1px solid ${S.acc}`, marginLeft:4 }}>✨IA</span>}</td>
                      <td style={tdStyle}><span style={{ fontSize:11, background:S.bg2, padding:'2px 7px', borderRadius:5, color:S.tx2 }}>{e.categoria}</span></td>
                      <td style={{ ...tdStyle, fontWeight:600, whiteSpace:'nowrap' }}>{fmt(e.monto)}</td>
                      <td style={tdStyle}><StatusBadge status={e.status} /></td>
                      <td style={tdStyle}><div style={{ display:'flex', gap:6 }}>
                        <button style={{ ...css.btn('xs'), padding:'4px 8px', fontSize:12, borderRadius:7 }} onClick={() => setDetailExp(e)}>Ver</button>
                        {e.status === 'approved' && <button style={{ ...css.btn('xs'), padding:'4px 8px', fontSize:12, borderRadius:7 }} onClick={() => generatePDF(e)}>↓ PDF</button>}
                        {e.status === 'pending' && <>
                          <button style={{ ...css.btn('ok'), padding:'5px 9px', fontSize:12 }} onClick={() => { setActionModal({ exp:e, type:'approve' }); setComment(''); }}>✓</button>
                          <button style={{ ...css.btn('err'), padding:'5px 9px', fontSize:12 }} onClick={() => { setActionModal({ exp:e, type:'reject' }); setComment(''); }}>✕</button>
                        </>}
                      </div></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>}
      </div>}

      {tab === 'funds' && <div style={P}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:12 }}>Gestión de fondos</div>
        <div style={{ display:'grid', gap:10 }}>
          {USERS.map(u => {
            const ud = userData[u.id] || { assigned: 0 };
            const spent = expenses.filter(e => e.userId === u.id && e.status === 'pending').reduce((s, e) => s + e.monto, 0);
            const pct = ud.assigned > 0 ? Math.min(100, Math.round(spent / ud.assigned * 100)) : 0;
            return (
              <div key={u.id} style={css.card}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}><Avatar u={u} size={40} /><div><div style={{ fontWeight:600 }}>{u.name}</div><div style={{ fontSize:12, color:S.tx3 }}>{u.role}</div></div></div>
                  <div style={{ textAlign:'right' }}><div style={{ fontSize:11, color:S.tx2 }}>Asignado</div><div style={{ fontSize:17, fontWeight:700, color:S.acc2 }}>{fmt(ud.assigned)}</div></div>
                  <div style={{ textAlign:'right' }}><div style={{ fontSize:11, color:S.tx2 }}>En uso / Saldo</div><div style={{ fontWeight:600 }}><span style={{ color:S.warn }}>{fmt(spent)}</span> / <span style={{ color:S.ok }}>{fmt(ud.assigned - spent)}</span></div></div>
                  <button style={css.btn('primary')} onClick={() => { setFundModal(u); setFundAmt(''); }}>+ Asignar</button>
                </div>
                <div style={{ marginTop:10, background:S.bg2, borderRadius:6, height:5, overflow:'hidden' }}><div style={{ height:'100%', width:pct + '%', background:pct > 85 ? '#ef4444' : pct > 60 ? '#f59e0b' : S.acc, borderRadius:6, transition:'width .4s' }} /></div>
                <div style={{ fontSize:11, color:S.tx3, marginTop:3 }}>{pct}% utilizado</div>
              </div>
            );
          })}
        </div>
      </div>}

      {detailExp && <Modal title="Detalle rendición" onClose={() => setDetailExp(null)}>
        {detailExp.aiExtracted && <div style={{ background:S.bg1, border:`1px solid ${S.brd}`, borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:12, color:S.acc2 }}>✨ Datos extraídos automáticamente por Gemini</div>}
        <div style={{ ...css.card, marginBottom:12 }}>
          {[['Usuario',detailExp.userName],['Proveedor',detailExp.proveedor],['RUT',detailExp.rut||'—'],['N° Documento',detailExp.ndoc||'—'],['Fecha',detailExp.fecha],['Monto',fmt(detailExp.monto)],['Categoría',detailExp.categoria],['Centro costo',detailExp.centroCosto],['Ítems',detailExp.items||'—'],['Comentario',detailExp.comentario||'—'],['Archivo',detailExp.fileName||'—']].map(([l,v],i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'7px 0', borderBottom:`1px solid ${S.brd}` }}>
              <span style={{ fontSize:12, color:S.tx2, flexShrink:0, marginRight:12 }}>{l}</span>
              <span style={{ fontSize:13, fontWeight:500, textAlign:'right', color:l==='Monto'?S.acc2:S.tx1 }}>{v}</span>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0' }}>
            <span style={{ fontSize:12, color:S.tx2 }}>Estado</span>
            <StatusBadge status={detailExp.status} />
          </div>
          {detailExp.adminComment && <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderTop:`1px solid ${S.brd}` }}><span style={{ fontSize:12, color:S.tx2 }}>Obs. Finanzas</span><span style={{ fontSize:13, fontWeight:500, textAlign:'right' }}>{detailExp.adminComment}</span></div>}
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {detailExp.status === 'approved' && <button style={{ ...css.btn('secondary'), flex:1 }} onClick={() => generatePDF(detailExp)}>↓ Comprobante PDF</button>}
          {detailExp.status === 'pending' && <>
            <button style={{ ...css.btn('ok'), flex:1 }} onClick={() => { setActionModal({ exp:detailExp, type:'approve' }); setComment(''); setDetailExp(null); }}>✓ Aprobar</button>
            <button style={{ ...css.btn('err'), flex:1 }} onClick={() => { setActionModal({ exp:detailExp, type:'reject' }); setComment(''); setDetailExp(null); }}>✕ Rechazar</button>
          </>}
        </div>
      </Modal>}

      {actionModal && <Modal title={actionModal.type === 'approve' ? 'Confirmar aprobación' : 'Confirmar rechazo'} onClose={() => setActionModal(null)}>
        <div style={{ padding:'10px 14px', marginBottom:12, borderRadius:9, fontSize:13, background:actionModal.type==='approve'?'#052e16':'#1c0505', border:`1px solid ${actionModal.type==='approve'?'#166534':'#991b1b'}`, color:actionModal.type==='approve'?S.ok:S.err }}>
          {actionModal.exp.proveedor} — {fmt(actionModal.exp.monto)}
        </div>
        <div style={{ marginBottom:12 }}>
          <FLabel>{actionModal.type === 'approve' ? 'Comentario de aprobación *' : 'Motivo de rechazo *'}</FLabel>
          <textarea style={css.textarea} value={comment} onChange={e => setComment(e.target.value)} placeholder="Obligatorio..." autoFocus />
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button style={{ ...css.btn('secondary'), flex:1 }} onClick={() => setActionModal(null)}>Cancelar</button>
          <button style={{ ...css.btn(actionModal.type==='approve'?'ok':'err'), flex:1, opacity:!comment.trim()?.5:1 }} onClick={handleAction} disabled={!comment.trim()}>
            {actionModal.type === 'approve' ? '✓ Aprobar' : '✕ Rechazar'}
          </button>
        </div>
      </Modal>}

      {fundModal && <Modal title={`Asignar fondo — ${fundModal.name}`} onClose={() => setFundModal(null)}>
        <div style={{ marginBottom:12 }}><FLabel>Monto a asignar (CLP)</FLabel><div style={{ position:'relative' }}><span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:S.tx3, fontSize:13 }}>$</span><input style={{ ...css.input, paddingLeft:24 }} type="number" value={fundAmt} onChange={e => setFundAmt(e.target.value)} placeholder="0" autoFocus /></div></div>
        <div style={{ display:'flex', gap:8 }}>
          <button style={{ ...css.btn('secondary'), flex:1 }} onClick={() => setFundModal(null)}>Cancelar</button>
          <button style={{ ...css.btn('primary'), flex:1, opacity:(!fundAmt||isNaN(Number(fundAmt)))?.5:1 }} onClick={assignFund} disabled={!fundAmt || isNaN(Number(fundAmt))}>Confirmar</button>
        </div>
      </Modal>}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [userData, setUserData] = useState({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [geminiKey, setGeminiKey] = useState('');
  const showToast = (msg, type = 'ok') => setToast({ msg, type, key: Date.now() });
  const saveGeminiKey = (val) => { setGeminiKey(val); saveGeminiKeyStorage(val); };

  useEffect(() => {
    (async () => {
      const [exps, ud, key] = await Promise.all([loadAll(), loadUsers(), loadGeminiKey()]);
      setExpenses(exps);
      setUserData(ud || initUsers());
      setGeminiKey(key);
      setLoading(false);
    })();
  }, []);

  const handleNewExpense = async (exp) => setExpenses(p => [exp, ...p]);
  const handleUpdateExpense = async (upd) => { await saveExpense(upd); setExpenses(p => p.map(e => e.id === upd.id ? upd : e)); };
  const handleUpdateUserData = async (d) => { await saveUsers(d); setUserData(d); };

  if (loading) return (
    <div style={{ ...css.wrap, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:48, height:48, background:S.acc, borderRadius:14, margin:'0 auto 12px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>💼</div>
        <div style={{ color:S.tx2 }}>Cargando...</div>
      </div>
    </div>
  );

  if (!user) return (
    <div style={{ ...css.wrap, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'radial-gradient(ellipse at 50% 0%,#1a1100 0%,#050505 70%)' }}>
      <div style={{ background:S.bg1, border:`1px solid ${S.brd}`, borderRadius:20, padding:'2.5rem 2rem', width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <BoragonLogo size={26} />
          <div style={{ marginTop:10, fontSize:12, color:S.tx2, letterSpacing:'.06em' }}>Rendición de Gastos</div>
        </div>
        <div style={{ fontSize:12, color:S.tx3, textAlign:'center', marginBottom:10 }}>Selecciona tu perfil</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
          {USERS.map(u => (
            <button key={u.id} onClick={() => setUser(u)} style={{ background:S.bg2, border:`1px solid ${S.brd}`, borderRadius:12, padding:'12px 10px', cursor:'pointer', textAlign:'center', color:S.tx1 }}>
              <div style={{ width:38, height:38, borderRadius:'50%', background:u.color+'22', border:`1.5px solid ${u.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:u.color, margin:'0 auto 6px' }}>{u.initials}</div>
              <div style={{ fontSize:13, fontWeight:600, lineHeight:1.2 }}>{u.name.split(' ')[0]}<br />{u.name.split(' ').slice(1).join(' ')}</div>
              <div style={{ fontSize:11, color:S.tx2, marginTop:2 }}>{u.role}</div>
            </button>
          ))}
        </div>
        <div style={{ textAlign:'center', color:S.tx3, fontSize:12, margin:'8px 0', position:'relative' }}>
          <span style={{ position:'relative', zIndex:1, background:S.bg1, padding:'0 8px' }}>Administrador</span>
          <div style={{ position:'absolute', top:'50%', left:0, right:0, height:1, background:S.brd, zIndex:0 }} />
        </div>
        <button onClick={() => setUser(ADMIN)} style={{ background:S.bg2, border:`1px solid ${S.brd}`, borderRadius:12, padding:'12px', width:'100%', cursor:'pointer', textAlign:'center', color:S.tx1 }}>
          <div style={{ width:38, height:38, borderRadius:'50%', background:ADMIN.color+'18', border:`1.5px solid ${ADMIN.color}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:ADMIN.color, margin:'0 auto 6px' }}>{ADMIN.initials}</div>
          <div style={{ fontSize:13, fontWeight:600 }}>{ADMIN.name}</div>
          <div style={{ fontSize:11, color:S.tx2, marginTop:2 }}>{ADMIN.role} — Vista completa</div>
        </button>
        <div style={{ marginTop:16, paddingTop:14, borderTop:`1px solid ${S.brd}`, textAlign:'center' }}>
          <div style={{ fontSize:11, color: geminiKey ? S.ok : S.tx3 }}>
            {geminiKey ? '✓ OCR automático activo (Gemini)' : '⚠ OCR no disponible — completa los campos manualmente'}
          </div>
        </div>
      </div>
    </div>
  );

  const isAdmin = user.id === ADMIN.id;
  return (
    <div style={css.wrap}>
      <div style={{ background:S.bg1, borderBottom:`1px solid ${S.brd}`, padding:'10px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <BoragonLogo size={17} />
          <span style={{ width:1, height:18, background:S.brd, display:'inline-block' }} />
          <span style={{ fontSize:12, color:S.tx2, letterSpacing:'.04em' }}>Fondos Corporativos</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:30, height:30, borderRadius:'50%', background:user.color+'22', border:`1.5px solid ${user.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:user.color }}>{user.initials}</div>
            <span style={{ fontSize:13, color:S.tx2 }}>{user.name.split(' ')[0]}</span>
          </div>
          <button style={{ ...css.btn('xs'), padding:'4px 10px', fontSize:12, borderRadius:7 }} onClick={() => setUser(null)}>Salir</button>
        </div>
      </div>
      {isAdmin
        ? <AdminView expenses={expenses} userData={userData} onUpdateExpense={handleUpdateExpense} onUpdateUserData={handleUpdateUserData} toast={showToast} />
        : <UserView user={user} expenses={expenses} userData={userData} onNewExpense={handleNewExpense} toast={showToast} geminiKey={geminiKey} />}
      {toast && <Toast key={toast.key} msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
