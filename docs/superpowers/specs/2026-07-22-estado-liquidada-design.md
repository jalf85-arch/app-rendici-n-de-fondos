# Estado "Liquidada" para rendiciones aprobadas

## Contexto

Hoy las rendiciones tienen tres estados: `pending`, `approved`, `rejected`. El saldo
disponible de un usuario se calcula como `assigned - approved - pending`, por lo que
una rendición aprobada sigue restando saldo indefinidamente.

En la práctica, toda rendición aprobada termina siendo pagada/repuesta fuera del ciclo
del fondo (liquidada). Se necesita un estado `liquidated` que archive esas rendiciones
y las saque del cálculo de saldo disponible, dejando `approved` como un paso transitorio
corto entre la aprobación y la liquidación real.

## Alcance

Cambios en `src/App.jsx` (fuente de verdad) + una migración de datos en Supabase.
`src/fondos_app_1.jsx` se actualiza copiando el contenido final, como ya indica CLAUDE.md.

## 1. Nuevo estado `liquidated`

- `STATUS_LABELS` agrega `liquidated: 'Liquidada'`.
- `StatusBadge` agrega un color/ícono propio para `liquidated` (distinto de `approved`),
  siguiendo el mismo patrón de `css.badge(status)` y el mapa de emoji-dot.
- Transición permitida: **solo `approved → liquidated`**, acción manual, una rendición a
  la vez, disparada únicamente por el admin (Alan). No hay reversa ni liquidación masiva
  en este alcance.

## 2. Fórmulas de saldo y gasto

- **Saldo disponible** (tarjeta de fondo en `UserView`, línea ~336): pasa de
  `assigned - approved - pending` a **`assigned - pending`**. Ni `approved` ni
  `liquidated` restan saldo disponible — se asume que lo aprobado ya fue repuesto.
- **`userData.spent`** (usado en `assignFund`, AdminView línea ~467-468): pasa de sumar
  `status==='approved'` a sumar **`status==='pending'`**. Coherente con la fórmula de
  saldo: `balance = assigned - spent` donde `spent` es solo lo pendiente de resolución.
- La barra "En uso / Saldo" en la pestaña "Fondos" del AdminView (línea ~791) ya usa
  `pending` para el "en uso" — no requiere cambios, queda coherente con la nueva fórmula.
- **Dashboard y reportes** (gráficos de torta/barra, tendencia mensual, totales, exports
  XLSX/CSV): `approvedExp` pasa a incluir **`approved` + `liquidated`** juntos, para no
  perder histórico de categorías/usuarios al liquidar. Es decir, se reemplaza el filtro
  `e.status === 'approved'` por `e.status === 'approved' || e.status === 'liquidated'`
  en el cálculo de `approvedExp`, `catPieData`, `monthUserData`, `monthlyTrend`,
  `totalApproved`, y en el resumen por usuario de `exportXLSX`.

## 3. Migración de datos (una vez, al desplegar)

Ejecutar contra Supabase antes o justo al desplegar el cambio de código:

```sql
UPDATE expenses SET status = 'liquidated' WHERE status = 'approved';
```

Después de la migración, recalcular `user_data` (`spent`/`balance`) de cada usuario con
la fórmula nueva (`spent = sum(pending)`), ya que sus valores actuales fueron calculados
con la fórmula vieja. Esto se hace releyendo `expenses` tras la migración y escribiendo
`user_data` vía el mismo mecanismo que usa `assignFund`/`saveUserData`.

## 4. Acción "Liquidar" en AdminView → tab "Todas"

- Nuevo botón `Liquidar` en la columna de acciones de la tabla, visible solo cuando
  `e.status === 'approved'` (mismo lugar donde hoy vive el botón `↓ PDF`).
- Confirmación simple (modal o `window.confirm`-style siguiendo el patrón de
  `confirmDelete` en `UserView`) — no exige un comentario nuevo, mantiene el
  `adminComment` ya existente de la aprobación.
- Al confirmar: `onUpdateExpense({ ...exp, status: 'liquidated' })` + toast de éxito.
- El filtro de estado (`select` de filtros en "Todas") agrega la opción
  `<option value="liquidated">Liquidada</option>`.

## 5. UserView → nuevo tab "Archivadas"

- Se agrega un tercer tab junto a "Mis Rendiciones" / "Nueva Rendición": **"Archivadas"**.
- Contenido: rendiciones del usuario con `status === 'liquidated'`, en una tabla con el
  mismo formato que "Mis Rendiciones" (fecha, proveedor, categoría, monto, estado, obs.).
- Filtro de rango de fechas (`from`/`to` sobre `fecha`), mismo patrón visual que los
  filtros ya usados en AdminView (`filters.from`/`filters.to`).
- "Mis Rendiciones" deja de listar `liquidated` — solo muestra `pending`, `approved`,
  `rejected`. Las tarjetas de resumen ("Aprobado" / "En revisión") no cambian de fuente
  de datos (siguen mirando `myExp`, que ahora simplemente no incluye liquidadas para
  efectos de esta lista, pero el cálculo de `approved`/`pending` en las tarjetas de
  saldo ya usa filtros de status explícitos y no se ve afectado).

## Fuera de alcance

- Reversar una liquidación (`liquidated → approved`).
- Liquidación masiva (bulk), a diferencia del bulk-approve existente.
- Cambios a `rejected` o al flujo de aprobación/rechazo.
- Cambios a la vista de empleado que no sea Jorge/Luisa/Héctor/Diego/Pedro (Alan sigue
  siendo el único admin).
