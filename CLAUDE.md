# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Single-file React app for corporate expense reporting at Boragó restaurant. It runs as an interactive artifact on Claude.ai — paste the full JSX, tell Claude to render it as an artifact, and enter the Gemini API key at login.

There are no build tools, package.json, or test suite. Development means editing the JSX and re-pasting into Claude.ai.

**Active files:**
- `fondos_app_1.jsx` — current production version (committed)
- `fondos_app_v2.jsx` — work-in-progress version (untracked); edit this one when working on new features, then promote to v1 when ready

## How to test / deploy

1. Edit the target JSX file
2. Copy the entire file
3. In a new Claude.ai conversation: paste and say `"Muestra este componente React como artifact interactivo"`
4. Enter the Gemini API key at the login screen (loaded from Supabase `config` table or localStorage fallback)

## Architecture

Everything lives in one file. Top-to-bottom structure:

- **Constants** — `USERS`, `ADMIN`, `CATS` (11 expense categories), `CAT_COLORS`, `COSTOS` (centro de costo: Cocina/Sala/Bar/Eventos/Administración/Bodega), `STATUS_LABELS`
- **Utilities** — `fmt` (CLP currency), `genId`, `today`, `thisMonth`
- **Supabase layer** — `sbFetch`, `mapToDB`/`mapFromDB`, `loadAll`, `saveExpense`, `loadUsers`, `saveUsers`, `loadGeminiKey`, `saveGeminiKeyStorage`, `initUsers`
- **OCR** — `extractDocumentData(file, apiKey)` — calls Gemini 2.0 Flash, returns `{ proveedor, rut, monto, fecha, ndoc, items }`
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
- **Publishable key:** hardcoded at line 22 (`sb_publishable_...`) — intentionally public; protected by RLS "allow all" policies (internal app, no real auth)

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
| created_at | timestamptz | |

### `user_data` table
`user_id` (PK), `assigned`, `spent`, `balance` — all numeric (CLP).

### `config` table
Key-value store. Current row: `gemini_key` → Gemini API key.

## OCR — Gemini 2.0 Flash

- Free tier: 1,500 req/day; key obtained at https://aistudio.google.com/app/apikey
- Key entered at login → persisted to `config` table (key=`gemini_key`) + localStorage fallback
- `extractDocumentData(file, apiKey)` reads an image/PDF as base64 and returns structured JSON
- Supported formats: JPEG, PNG, WEBP, GIF, PDF — max 8 MB
- Fields auto-filled by AI are highlighted purple in the form (`aiFilled` style, border `#7c6ff760`)

## Expense lifecycle

- Submit → `status: 'pending'`, deducted from user balance immediately
- Approve (admin) → `status: 'approved'`, admin comment required
- Reject (admin) → `status: 'rejected'`, admin comment required
- Balance formula: `assigned − approved_total − pending_total`

## Exports (AdminView only)

Both use `await import(...)` for CDN libraries — required for Claude artifact sandbox.

- **XLSX** — `exportXLSX()` in `AdminView` Dashboard tab — `import("https://esm.sh/xlsx")` — 3 sheets: Gastos detalle, Por Categoría, Por Usuario. Always exports all data regardless of active filters. Falls back to CSV with UTF-8 BOM.
- **PDF comprobante** — `import("https://esm.sh/jspdf")` — A4 layout, only for approved expenses. Falls back to `window.print()`.

## Style conventions

- Color tokens: `S.bg0/bg1/bg2/bg3`, `S.acc/acc2/accD`, `S.brd/brd2`, `S.tx1/tx2/tx3`, `S.ok/warn/err/inf`
- Component styles: `css.card`, `css.input`, `css.select`, `css.textarea`, `css.btn(variant)`, `css.badge(status)`
- Button variants: `'primary'`, `'secondary'`, `'ok'`, `'err'`, `'xs'`
- Never add external CSS files or UI libraries — keep everything inline

## Key architectural decisions (changelog)

| Date | Change |
|---|---|
| 2026-05-13 | OCR migrated from Claude API (paid) to Gemini 2.0 Flash (free) |
| 2026-05-13 | XLSX (3 sheets) + PDF comprobante exports added |
| 2026-05-13 | Storage migrated from `window.storage` to Supabase for multi-user shared state |
| 2026-05-13 | Gemini API key persisted to Supabase config + localStorage fallback |

## Context files

- `contexto.md` — project overview and changelog (Spanish)
- `supabase.md` — full DB schema and RLS details
- `skill_xlsx.md` — XLSX export implementation notes
- `skill_pdf.md` — PDF comprobante implementation notes
- `skill_ocr.md` — OCR (Gemini) implementation notes
