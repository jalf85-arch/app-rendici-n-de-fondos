# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Single-file React app for corporate expense reporting at Boragó restaurant. It can run as a Vite app (deployed on Vercel) or as an interactive artifact on Claude.ai.

**Files:**
- `src/App.jsx` — **fuente de verdad**. Editar siempre aquí. Lo que Vercel sirve.
- `src/fondos_app_1.jsx` — copia manual de `src/App.jsx` para pegar en Claude.ai como artifact. Actualizar copiando el contenido de `src/App.jsx` cuando sea necesario; no se sincroniza automáticamente.
- `src/main.jsx`, `src/index.css` — boilerplate Vite; no tocar.

## Commands

```bash
npm run dev      # local dev server (localhost:5173)
npm run build    # production build to dist/
npm run preview  # preview built app
npm run lint     # ESLint
```

## Deploy a Vercel

Cualquier push a `main` en GitHub redespliega automáticamente en `app-rendici-n-de-fondos.vercel.app`.

Al hacer deploy desde Claude.ai, indicar explícitamente: *"usa el proyecto Vercel existente `app-rendici-n-de-fondos`, no crees uno nuevo"*.

## Probar como artifact en Claude.ai

1. Copiar todo el contenido de `src/App.jsx` (o `src/fondos_app_1.jsx`)
2. En una conversación nueva de Claude.ai: pegar y escribir `"Muestra este componente React como artifact interactivo"`
3. Ingresar la Gemini API key en la pantalla de login

## Architecture

Everything lives in one file. Top-to-bottom structure:

- **Constants** — `USERS`, `ADMIN`, `CATS` (11 expense categories), `CAT_COLORS`, `COSTOS` (centro de costo: Cocina/Sala/Bar/Eventos/Administración/Bodega), `STATUS_LABELS`
- **Utilities** — `fmt` (CLP currency), `genId`, `today`, `thisMonth`
- **Supabase layer** — `sbFetch`, `mapToDB`/`mapFromDB`, `loadAll`, `saveExpense`, `deleteExpense`, `uploadReceipt` (Storage), `loadUsers`, `saveUsers`, `loadGeminiKey`, `saveGeminiKeyStorage`, `initUsers`
- **OCR** — `extractDocumentData(file, apiKey)` — calls Gemini 2.5 Flash, returns `{ proveedor, rut, monto, fecha, ndoc, items }`
- **Style system** — `S` (color tokens) + `css` (component styles, all inline — no CSS files)
- **Shared UI** — `Toast`, `StatusBadge`, `Modal`, `Avatar`, `FLabel`
- **Components** — `ExpenseForm`, `UserView`, `AdminView`
- **Root** — `App` (profile selector, toast state, shared `expenses[]` + `userData{}`)

## Users

| ID | Name | Role | View |
|---|---|---|---|
| jorge | Jorge Laso | Gerente Adm. | UserView |
| luisa | Luisa | Enc. Compras | UserView |
| hector | Héctor Vergara | Bodega | UserView |
| diego | Diego Durán | Salas | UserView |
| pedro | Pedro | Staff | UserView |
| alan | Alan Estévez | Finanzas | AdminView (full access) |

## Supabase

- **Project:** `fondos-borago` — region `sa-east-1` (São Paulo), project ID `lvzriwmlsyxgydtzyjan`
- **URL:** `https://lvzriwmlsyxgydtzyjan.supabase.co`
- **Publishable key:** hardcoded as `SB_KEY` at line 23 (`sb_publishable_...`) — intentionally public; protected by RLS "allow all" policies (internal app, no real auth)

All writes use `Prefer: resolution=merge-duplicates` (upsert). The Supabase MCP is available — use `list_tables`, `execute_sql`, `get_logs`, `apply_migration` for direct DB access.

JS uses camelCase; DB uses snake_case via `mapToDB` / `mapFromDB`:
```
userId ↔ user_id  |  centroCosto ↔ centro_costo  |  adminComment ↔ admin_comment
aiExtracted ↔ ai_extracted  |  fileName ↔ file_name  |  createdAt ↔ created_at
```

### `expenses` table
| Column | Type | Notes |
|---|---|---|
| id | text PK | `e_<timestamp>_<random>` generated in JS |
| user_id / user_name | text | author |
| proveedor | text | vendor name |
| rut | text? | vendor RUT |
| monto | numeric | amount in CLP |
| fecha | date | expense date |
| ndoc | text? | invoice/receipt number |
| items | text? | line-item description |
| categoria | text | one of `CATS` |
| centro_costo | text? | one of `COSTOS` |
| comentario | text? | user note |
| status | text | `pending` / `approved` / `rejected` |
| admin_comment | text? | required on approve/reject |
| ai_extracted | boolean | true if OCR pre-filled the form |
| file_name | text? | uploaded file name |
| file_url | text? | public URL in Supabase Storage `receipts` bucket |
| created_at | timestamptz | |

### `user_data` table
`user_id` (PK), `assigned`, `spent`, `balance` — all numeric (CLP).

### `config` table
Key-value store. Current row: `gemini_key` → Gemini API key.

### Supabase Storage
- **Bucket:** `receipts` (public) — stores uploaded receipt images/PDFs
- Path pattern: `<expenseId>.<ext>` (e.g. `e_1234_abc.jpg`)
- Public URL: `<SB_URL>/storage/v1/object/public/receipts/<path>`
- `uploadReceipt(file, expId)` returns the public URL or `null` on failure; stored in `fileUrl`/`file_url`

## OCR — Gemini 2.5 Flash

- Model: `gemini-2.5-flash` (endpoint: `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`)
- Free tier: 1,500 req/day; key obtained at https://aistudio.google.com/app/apikey
- Key entered at login → persisted to `config` table (key=`gemini_key`) + localStorage fallback
- `extractDocumentData(file, apiKey)` reads an image/PDF as base64 and returns structured JSON
- Supported formats: JPEG, PNG, WEBP, GIF, PDF — max 8 MB
- Fields auto-filled by AI are highlighted purple in the form (`aiFilled` style, border `#7c6ff760`)

## Expense lifecycle

- Submit → `status: 'pending'`, deducted from user balance immediately
- **Edit** — user can edit or cancel their own `pending` expenses; cancel calls `deleteExpense`
- **Bulk approve** — admin can approve all pending expenses at once with a single comment (`bulkModal` state in `AdminView`)
- Approve (admin) → `status: 'approved'`, admin comment required
- Reject (admin) → `status: 'rejected'`, admin comment required
- **Admin edit** — admin can correct any expense regardless of status (`adminEditExp`/`openAdminEdit`/`saveAdminEdit` in `AdminView`); does not change `status`
- **Liquidar (admin)** — admin marks an `approved` expense as `liquidated` (archived), one at a time, no comment required, no reversal (`liquidateConfirm`/`doLiquidate` in `AdminView`). Liquidated expenses stop counting against the user's saldo disponible but still count in dashboard/report totals alongside `approved`
- Balance formula: `assigned − pending_total` (approved and liquidated expenses no longer reduce available balance — they're assumed already reimbursed)
- `categoria` is mandatory (enforced client-side)

## Exports (AdminView only)

Both use `await import(...)` for CDN libraries — required for Claude artifact sandbox.

- **XLSX** — `exportXLSX()` in `AdminView` Dashboard tab — `import("https://esm.sh/xlsx")` — 3 sheets: Gastos detalle, Por Categoría, Por Usuario. Always exports all data regardless of active filters. Falls back to CSV with UTF-8 BOM.
- **PDF comprobante** — `import("https://esm.sh/jspdf")` — A4 layout, only for approved expenses. Falls back to `window.print()`.

## Style conventions

- Color tokens: `S.bg0/bg1/bg2/bg3`, `S.acc/acc2/accD`, `S.brd/brd2`, `S.tx1/tx2/tx3`, `S.ok/warn/err/inf`
- Component styles: `css.card`, `css.input`, `css.select`, `css.textarea`, `css.btn(variant)`, `css.badge(status)`
- Button variants: `'primary'`, `'secondary'`, `'ok'`, `'err'`, `'xs'`
- Never add external CSS files or UI libraries — keep everything inline

## Tests

There is no test suite. Verify changes manually via `npm run dev` or by running as a Claude.ai artifact.

## Key architectural decisions (changelog)

| Date | Change |
|---|---|
| 2026-05-13 | OCR migrated from Claude API (paid) to Gemini 2.5 Flash (free) |
| 2026-05-13 | XLSX (3 sheets) + PDF comprobante exports added |
| 2026-05-13 | Storage migrated from `window.storage` to Supabase for multi-user shared state |
| 2026-05-13 | Gemini API key persisted to Supabase config + localStorage fallback |
| 2026-06-02 | Edit/cancel for pending expenses; mandatory category; bulk approve for admin |
| 2026-06-02 | Receipt files backed up to Supabase Storage (`receipts` bucket); `file_url` added to expenses |
| 2026-06-02 | Items column included in XLSX export |
| 2026-06-02 | XLSX export splits `comentario` (user note) and `admin_comment` into separate columns |
| 2026-07-22 | Admin can edit any expense regardless of status (`adminEditExp` in `AdminView`) |
| 2026-07-22 | Added `liquidated` status: archives approved expenses, excludes them from active balance calc, adds admin "Liquidar" action and per-user "Archivadas" tab with date filter. All pre-existing `approved` expenses were migrated to `liquidated` |

## Context files

- `supabase.md` — full DB schema, RLS policies, and camelCase ↔ snake_case mapping reference

## Notes

- `@supabase/supabase-js` is in `package.json` but **not used** — all Supabase calls go through the raw `sbFetch` wrapper (plain `fetch` + REST API). Don't import the SDK.
