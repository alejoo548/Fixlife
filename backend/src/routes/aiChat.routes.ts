import { Router, Request, Response } from 'express';
import { aiChatLimiter } from '../middlewares/security.middleware';

const router = Router();

const SYSTEM_PROMPT = `Eres Fixly, el asistente IA oficial de Fixlife, una plataforma que conecta usuarios con profesionales de servicios del hogar (plomería, electricidad, carpintería, mecánica, limpieza y más).

Tu misión es ayudar a los usuarios con:
- Reservar y solicitar servicios
- Entender cómo funciona la plataforma paso a paso
- Resolver dudas sobre pagos, cancelaciones y garantías
- Problemas con su cuenta o perfil
- Información sobre profesionales verificados

Reglas importantes:
- Responde siempre en español, de forma amigable, clara y concisa
- Si el usuario pregunta algo fuera de Fixlife, redirige educadamente la conversación
- Nunca inventes información sobre precios específicos; indica que varían por profesional
- Si el problema requiere soporte humano, sugiere que contacten a fixlifeworks@gmail.com
- Sé empático y profesional, pero con un tono cercano y animado
- REGLA CRÍTICA DE BREVEDAD: Máximo 2 oraciones cortas por respuesta. Sin listas. Sin preguntas múltiples. Si el usuario solo saluda, responde con UNA sola oración de bienvenida y UNA pregunta concreta. Nunca enumeres opciones.`;

router.post('/ai/chat', aiChatLimiter, async (req: Request, res: Response) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'El campo "messages" es requerido y debe ser un arreglo.' });
    return;
  }

  if (messages.length > 40) {
    res.status(400).json({ error: 'Demasiados mensajes en la conversación.' });
    return;
  }

  const VALID_ROLES = new Set(['user', 'assistant']);
  for (const msg of messages) {
    if (!msg || typeof msg.content !== 'string' || !VALID_ROLES.has(msg.role)) {
      res.status(400).json({ error: 'Formato de mensaje inválido.' });
      return;
    }
    if (msg.content.length > 2000) {
      res.status(400).json({ error: 'Mensaje demasiado largo. Máximo 2000 caracteres.' });
      return;
    }
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Clave de API de Groq no configurada en el servidor.' });
    return;
  }

  try {
    const groqMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        temperature: 0.5,
        max_tokens: 120,
      }),
    });

    if (!groqRes.ok) {
      const errData: any = await groqRes.json().catch(() => ({}));
      const status = groqRes.status;
      if (status === 429) {
        res.status(429).json({ error: 'Límite de Groq alcanzado. Espera unos segundos e intenta de nuevo.' });
      } else if (status === 401) {
        res.status(401).json({ error: 'Clave de API inválida. Verifica la configuración del servidor.' });
      } else {
        res.status(500).json({ error: errData?.error?.message || 'Error al conectar con la IA.' });
      }
      return;
    }

    const data: any = await groqRes.json();
    const text: string = data.choices?.[0]?.message?.content ?? '';
    res.json({ text });
  } catch (error: any) {
    console.error('[AI Chat Error]', error?.message || error);
    res.status(500).json({ error: 'Error al conectar con la IA. Inténtalo de nuevo.' });
  }
});

export default router;
