# MCP: Supabase — Fondos Corporativos

## Proyecto Supabase
- **Nombre:** fondos-borago
- **ID:** lvzriwmlsyxgydtzyjan
- **Región:** sa-east-1 (São Paulo)
- **URL REST:** https://lvzriwmlsyxgydtzyjan.supabase.co/rest/v1

## Credenciales
- **Anon Key** (pública, segura para frontend): en línea 22 de `fondos_app_2.jsx`
- La anon key está protegida por RLS — solo permite las operaciones configuradas en las políticas

## Tablas

### `expenses`
Almacena todas las rendiciones de gastos.

| Columna | Tipo | Descripción |
|---|---|---|
| id | text (PK) | ID único generado en JS (`e_<timestamp>_<random>`) |
| user_id | text | ID del usuario (jorge, luisa, hector, diego, pedro) |
| user_name | text | Nombre completo del usuario |
| proveedor | text | Nombre del proveedor/comercio |
| rut | text | RUT del proveedor (nullable) |
| monto | numeric | Monto en CLP |
| fecha | date | Fecha del gasto |
| ndoc | text | Número de documento/boleta (nullable) |
| items | text | Descripción de ítems (nullable) |
| categoria | text | Categoría del gasto |
| centro_costo | text | Centro de costo (nullable) |
| comentario | text | Comentario del usuario (nullable) |
| status | text | Estado: pending / approved / rejected |
| admin_comment | text | Comentario del administrador (nullable) |
| ai_extracted | boolean | Si los datos fueron extraídos por OCR |
| file_name | text | Nombre del archivo subido (nullable) |
| created_at | timestamptz | Timestamp de creación |

### `user_data`
Fondos por usuario.

| Columna | Tipo | Descripción |
|---|---|---|
| user_id | text (PK) | ID del usuario |
| assigned | numeric | Monto asignado |
| spent | numeric | Monto usado (pendiente) |
| balance | numeric | Saldo disponible |

### `config`
Configuraciones clave-valor.

| Columna | Tipo | Descripción |
|---|---|---|
| key | text (PK) | Nombre de la configuración |
| value | text | Valor |

**Registros actuales:**
- `gemini_key` → API key de Google Gemini para OCR

## Políticas RLS
Todas las tablas tienen RLS habilitado con políticas "allow all" para anon y authenticated — acceso libre por diseño (app interna sin autenticación de usuarios).

## Cómo usar el MCP de Supabase en Claude Code
El MCP de Supabase está disponible en esta sesión de Claude Code. Comandos útiles:
- `list_tables` — ver estructura actual
- `execute_sql` — consultas directas
- `get_logs` — ver errores recientes
- `apply_migration` — aplicar cambios de esquema

## Mapeo JS ↔ DB
La app usa camelCase en JavaScript y snake_case en la base de datos.

```javascript
// JS → DB (mapToDB)
userId      → user_id
userName    → user_name
centroCosto → centro_costo
adminComment → admin_comment
aiExtracted → ai_extracted
fileName    → file_name
createdAt   → created_at

// DB → JS (mapFromDB)
// Inverso del anterior
```
