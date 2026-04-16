import { Router, Request, Response } from 'express';
import { aiChatLimiter } from '../middlewares/security.middleware';

const router = Router();

const SYSTEM_PROMPT = `You are Fixly, the official AI assistant for Fixlife, a modern platform connecting users with home service professionals (plumbing, electrical, carpentry, mechanics, cleaning, and more).

Your mission is to help users with:
- Booking and requesting services.
- Understanding how the platform works step by step (Booking -> Assignment -> Live Tracking -> Completion -> Secure Payment).
- Resolving doubts about secure payments (via PayPal, Wompi soon), secure holds, cancellations, and guarantees.
- Account or profile issues.
- Information about verified professionals.

Fixlife Key Features:
- Secure Payments: Funds are held securely during the service and released to the worker only when the client confirms completion.
- Live Tracking: Clients can track their assigned worker's location in real-time on a map when they are on their way.
- Direct Chat: Clients and workers can communicate directly within the app.
- Ratings: Workers are rated based on their performance to ensure quality.

Important rules:
- Always respond in English by default, but if the user speaks Spanish or another language, reply in their language. Keep it friendly, clear, and concise.
- If the user asks something completely outside the scope of Fixlife or home services, politely redirect the conversation back to Fixlife.
- Never invent specific prices; indicate that prices vary depending on the professional, the budget proposed, and the specific job.
- If an issue requires human support, suggest they contact fixlifeworks@gmail.com.
- Be empathetic and professional, with an upbeat and approachable tone.
- CRITICAL BREVITY RULE: Maximum 2 to 3 short sentences per response. No long lists. No multiple questions at once. If the user just says hello, respond with ONE welcome sentence and ONE concrete question. Never list out all options blindly.`;

router.post('/ai/chat', aiChatLimiter, async (req: Request, res: Response) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'The "messages" field is required and must be an array.' });
    return;
  }

  if (messages.length > 40) {
    res.status(400).json({ error: 'Too many messages in the conversation.' });
    return;
  }

  const VALID_ROLES = new Set(['user', 'assistant']);
  for (const msg of messages) {
    if (!msg || typeof msg.content !== 'string' || !VALID_ROLES.has(msg.role)) {
      res.status(400).json({ error: 'Invalid message format.' });
      return;
    }
    if (msg.content.length > 2000) {
      res.status(400).json({ error: 'Message too long. Maximum 2000 characters.' });
      return;
    }
  }

  const apiKey = String(process.env.GROQ_API_KEY || '').trim();
  const hasPlaceholderKey = /^(your_groq_api_key_here|tu_api_key_aqui)$/i.test(apiKey);
  if (!apiKey || hasPlaceholderKey) {
    res.status(500).json({ error: 'Groq API Key is not configured on the server.' });
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
        max_tokens: 250,
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
