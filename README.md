# Notas — Clon de Notion

App de notas y gestión de tareas estilo Notion, construida con Next.js 16, TypeScript, Tailwind CSS, Prisma (SQLite) y NextAuth.

## Funciones

- Tablero Kanban con 4 columnas (Recursos, Sin empezar, PRIORIDAD, En progreso)
- Tarjetas arrastrables entre columnas (drag-and-drop con @dnd-kit)
- Editor de bloques tipo Notion con `/comandos`: Encabezado, Lista, Tarea, Código, Cita, Página, Imagen
- Panel de detalle lateral redimensionable (arrastrar borde, colapsar, `Ctrl+\`)
- Subtareas con checkboxes y barra de progreso
- Archivos auxiliares: PDF, Google Drive, Figma, enlaces
- Menú contextual (clic derecho) en tarjetas: Favoritos, Editar icono, Diseño, Copiar enlace, Duplicar, Mover a papelera
- Menú de selección de texto con IA: Revisar, Reformatear, Explicar, Editar con IA, Convertir bloque
- Modo claro/oscuro
- Buscador de tarjetas
- Autenticación con email + contraseña (NextAuth)
- Persistencia en SQLite vía Prisma

## Requisitos

- Node.js 20+ (recomendado) o Bun
- npm, pnpm o bun (cualquiera funciona)

## Cómo correrlo localmente

### 1. Instalar dependencias

```bash
npm install
# o
pnpm install
# o
bun install
```

### 2. Configurar variables de entorno

Copiá el archivo de ejemplo y completá tus valores:

```bash
cp .env.example .env
```

Editá `.env` y cambiá:

- `NEXTAUTH_SECRET` → generá uno nuevo con:
  ```bash
  openssl rand -base64 32
  ```
- `NEXTAUTH_URL` → dejá `http://localhost:3000` para desarrollo local
- `DATABASE_URL` → la cadena de conexión de tu base PostgreSQL (por ejemplo una gratuita de [Neon](https://neon.tech))

### 3. Crear la base de datos

```bash
npx prisma db push
# o
bunx prisma db push
```

Esto crea todas las tablas en la base de datos.

### 4. (Opcional) Crear usuario demo

La app crea automáticamente el usuario demo (`demo@notas.local` / `demo1234`) con la página de plantilla la primera vez que entrás. También podés registrarte con tu propio email desde la pantalla de login.

### 5. Levantar el servidor de desarrollo

```bash
npm run dev
# o
bun run dev
```

Abrí [http://localhost:3000](http://localhost:3000) en tu navegador.

### 6. Entrar con el usuario demo

- Email: `demo@notas.local`
- Contraseña: `demo1234`

O registrate con tu propio email desde la pantalla de login.

## Cómo deployar en Vercel (gratis)

### 1. Subir el código a GitHub

```bash
git init
git add .
git commit -m "Initial commit: Notion clone"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/notas-notion-clone.git
git push -u origin main
```

### 2. Crear cuenta en Vercel

- Andá a [vercel.com](https://vercel.com) y registrate (gratis con tu cuenta de GitHub)

### 3. Importar el repositorio

- En el dashboard de Vercel, hacé clic en **"Add New Project"**
- Conectá tu cuenta de GitHub si no lo hiciste
- Elegí el repositorio `notas-notion-clone`
- Vercel va a detectar automáticamente que es un proyecto Next.js

### 4. Configurar variables de entorno

En la sección **"Environment Variables"** agregá:

| Nombre | Valor |
|---|---|
| `DATABASE_URL` | la cadena de conexión de PostgreSQL (ver paso 7) |
| `NEXTAUTH_SECRET` | generalo con `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://TU-APP.vercel.app` (te lo da Vercel después del primer deploy) |

### 5. Deployar

- Hacé clic en **"Deploy"**
- Vercel va a instalar dependencias, hacer el build y deployar
- Cuando termine, te da una URL tipo `https://notas-notion-clone-tu-usuario.vercel.app`

### 6. Configurar NEXTAUTH_URL

**Importante**: después del primer deploy, volvé a la configuración de Vercel:
- Andá a **Settings → Environment Variables**
- Actualizá `NEXTAUTH_URL` con la URL real que te dio Vercel
- Hacé un redeploy (Deployments → los tres puntitos → Redeploy)

### 7. Crear la base de datos

La app usa PostgreSQL (Vercel no persiste archivos, así que SQLite no sirve ahí).

1. Creá una base de datos PostgreSQL gratuita en [Neon](https://neon.tech) (recomendado), [Supabase](https://supabase.com) o [Railway](https://railway.app). También podés crearla desde Vercel: **Storage → Create Database → Neon**.

2. En Vercel, poné en `DATABASE_URL` la cadena de conexión (algo como `postgresql://user:pass@host/db?sslmode=require`).

3. Deployá. El build (`vercel.json`) corre `prisma db push`, que crea las tablas automáticamente.

## Estructura del proyecto

```
notas-notion-clone/
├── prisma/
│   └── schema.prisma        # Modelos: User, Page, Column, Card, ChecklistItem, Attachment
├── src/
│   ├── app/
│   │   ├── api/             # Rutas de API REST
│   │   │   ├── auth/        # NextAuth (login/register)
│   │   │   ├── pages/       # CRUD de páginas
│   │   │   ├── columns/     # CRUD de columnas
│   │   │   ├── cards/       # CRUD de tarjetas
│   │   │   ├── checklist/   # CRUD de subtareas
│   │   │   ├── attachments/ # CRUD de archivos auxiliares
│   │   │   ├── upload/      # Subida de imágenes/PDFs
│   │   │   ├── ai/          # Endpoint de IA (Revisar, Reformatear, etc.)
│   │   │   └── search/      # Búsqueda de tarjetas
│   │   ├── layout.tsx       # Root layout con ThemeProvider
│   │   └── page.tsx         # Página principal (login + tablero)
│   ├── components/
│   │   ├── board.tsx                # Tablero Kanban
│   │   ├── column-item.tsx          # Columna con tarjetas
│   │   ├── card-item.tsx            # Tarjeta con menú contextual
│   │   ├── card-detail-panel.tsx    # Panel lateral de detalle
│   │   ├── block-editor.tsx         # Editor de bloques tipo Notion
│   │   ├── text-selection-menu.tsx  # Menú flotante de selección (IA + Convertir)
│   │   ├── attachments-section.tsx  # Sección de archivos auxiliares
│   │   ├── resizable-side-panel.tsx # Panel lateral redimensionable
│   │   ├── auth-screen.tsx          # Pantalla de login/registro
│   │   ├── top-bar.tsx              # Barra superior (búsqueda, tema, usuario)
│   │   └── ui/                      # Componentes shadcn/ui
│   ├── hooks/
│   │   └── use-workspace-page.ts    # Hook con estado optimista del tablero
│   ├── lib/
│   │   ├── auth.ts                  # Configuración de NextAuth
│   │   ├── db.ts                    # Cliente de Prisma
│   │   ├── api.ts                   # Cliente HTTP para las APIs
│   │   ├── blocks.ts                # Tipos y serialización de bloques
│   │   ├── types.ts                 # Tipos TypeScript
│   │   └── utils.ts                 # Utilidades (formatDateAR, hexToRgba, etc.)
│   └── app/globals.css              # Estilos globales (dark/light theme)
├── public/
│   ├── uploads/                    # Imágenes subidas (se crea sola)
│   └── logo.svg
├── .env.example                    # Variables de entorno de ejemplo
├── package.json
├── prisma/schema.prisma            # Schema de la base de datos
├── tailwind.config.ts
├── tsconfig.json
└── README.md                       # Este archivo
```

## Scripts disponibles

```bash
npm run dev          # Levanta el servidor de desarrollo en http://localhost:3000
npm run build        # Hace el build de producción
npm run start        # Levanta el servidor de producción (después del build)
npm run lint         # Corre ESLint
npm run db:push      # Aplica el schema de Prisma a la base de datos
npm run db:generate  # Regenera el cliente de Prisma
npm run db:migrate   # Crea una migración de Prisma
npm run db:reset     # Borra y recrea la base de datos (¡cuidado!)
```

## Credenciales demo

- Email: `demo@notas.local`
- Contraseña: `demo1234`

## Tecnologías usadas

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Lenguaje**: TypeScript 5
- **Estilos**: Tailwind CSS 4 + shadcn/ui (componentes Radix)
- **Base de datos**: SQLite (vía Prisma ORM)
- **Auth**: NextAuth.js v4 (Credentials provider + JWT)
- **Drag-and-drop**: @dnd-kit/core + @dnd-kit/sortable
- **Iconos**: lucide-react
- **Toast notifications**: sonner
- **Tema claro/oscuro**: next-themes
- **IA**: Z.ai SDK (z-ai-web-dev-sdk) — para las funciones de Revisar/Reformatear/Explicar/Editar

## Notas sobre la IA

Las funciones de IA (Revisar, Reformatear, Explicar, Editar con IA) usan el SDK de Z.ai. Si deployás en Vercel u otro hosting, vas a necesitar configurar las credenciales de Z.ai (o desactivar esas funciones eliminando la ruta `src/app/api/ai/text/route.ts` y el componente `TextSelectionMenu` del `block-editor.tsx`).

## Licencia

Código libre para uso personal. Modificá y adaptá como quieras.
