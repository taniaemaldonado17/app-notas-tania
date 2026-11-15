import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helpers'
import ZAI from 'z-ai-web-dev-sdk'

type Action = 'review' | 'reformat' | 'explain' | 'edit'

const SYSTEM_PROMPTS: Record<Action, string> = {
  review: `Sos un corrector de texto profesional especializado en español rioplatense (Argentina). Revisá el texto del usuario y devolvé únicamente la versión corregida, sin comentarios ni explicaciones. Corregí:
- Ortografía y acentuación
- Gramática y concordancia
- Puntuación
- Errores tipográficos
- Mayúsculas/minúsculas según contexto
Mantené el significado, el tono, el idioma (español) y el formato (markdown, saltos de línea, listas) del original. Si el texto está en otro idioma, corregí en ese idioma.`,
  reformat: `Sos un editor de texto. Reformateá el texto del usuario para que sea más claro y legible, devolviendo únicamente la versión reformateada, sin comentarios. Podés:
- Reorganizar los párrafos en listas si ayuda a la lectura
- Añadir subtítulos en **negrita** si el texto tiene secciones
- Reordenar las ideas para que fluyan mejor
- Eliminar redundancias
- Mantener TODOS los datos técnicos, números, IPs, URLs, nombres de archivos y comandos sin modificar
Mantené el idioma original (español si está en español) y el significado.`,
  explain: `Sos un asistente que explica textos técnicos de forma clara. Leé el texto del usuario y devolvé una explicación en español, en formato markdown con secciones. La explicación debe tener:
- Un párrafo inicial que resuma de qué trata el texto
- Una lista de los pasos o conceptos clave (si aplica)
- Una nota con cualquier dato técnico relevante (IPs, URLs, comandos) extraído del texto
No inventes información que no esté en el texto. Si el texto es muy corto, devolvé una explicación breve.`,
  edit: `Sos un editor de texto inteligente. El usuario te va a dar un texto y una instrucción de edición. Aplicá la instrucción al texto y devolvé únicamente el resultado, sin comentarios ni explicaciones. Mantené el idioma original (español por defecto). Si la instrucción no se entiende o es ambigua, devolvé el texto original sin modificar.`,
}

export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const action = body?.action as Action
    const text = (body?.text ?? '').toString()
    const instruction = (body?.instruction ?? '').toString().trim()

    if (!text.trim()) {
      return NextResponse.json({ error: 'Texto vacío' }, { status: 400 })
    }
    if (!['review', 'reformat', 'explain', 'edit'].includes(action)) {
      return NextResponse.json(
        { error: 'Acción inválida. Debe ser: review, reformat, explain o edit.' },
        { status: 400 }
      )
    }
    if (action === 'edit' && !instruction) {
      return NextResponse.json(
        { error: 'Se requiere una instrucción para editar' },
        { status: 400 }
      )
    }

    const systemPrompt = SYSTEM_PROMPTS[action]
    const userPrompt =
      action === 'edit'
        ? `Texto original:\n\n"""\n${text}\n"""\n\nInstrucción de edición: ${instruction}\n\nDevolver solo el resultado:`
        : `Texto:\n\n"""\n${text}\n"""\n\nDevolver solo el resultado:`

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      // Slightly lower temperature for deterministic, faithful edits
      temperature: 0.4,
    })

    // The SDK returns an OpenAI-like shape
    const result =
      completion?.choices?.[0]?.message?.content ??
      completion?.content ??
      ''

    const finalText = typeof result === 'string' ? result : String(result ?? '')

    return NextResponse.json({
      result: finalText.trim(),
      action,
    })
  } catch (err) {
    console.error('[ai/text POST]', err)
    return NextResponse.json(
      { error: 'No se pudo procesar el texto con IA' },
      { status: 500 }
    )
  }
}
