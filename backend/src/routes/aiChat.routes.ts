import { Router, Request, Response } from 'express';
import { aiChatLimiter } from '../middlewares/security.middleware';

const router = Router();

type ChatRole = 'user' | 'assistant';

interface ChatPayloadMessage {
  role: ChatRole;
  content: string;
}

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

const isSpanishMessage = (text: string): boolean => {
  const sample = text.toLowerCase();
  return /[áéíóúñ¿¡]/.test(sample) || /\b(hola|necesito|quiero|servicio|pago|cuenta|perfil|trabajador|ayuda|reservar|agendar|problema)\b/.test(sample);
};

const buildFallbackReply = (messages: ChatPayloadMessage[]): string => {
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'user' && typeof message.content === 'string')
    ?.content
    ?.trim() ?? '';

  const normalized = lastUserMessage.toLowerCase();
  const inSpanish = isSpanishMessage(lastUserMessage);

  if (!normalized) {
    return inSpanish
      ? 'Hola, soy Fixly. Puedo ayudarte con reservas, pagos o problemas de cuenta; que necesitas hoy?'
      : 'Hi, I am Fixly. I can help with bookings, payments, or account issues; what do you need today?';
  }

  if (/\b(hi|hello|hey|hola|buenas)\b/.test(normalized)) {
    return inSpanish
      ? 'Hola, soy Fixly. Puedo ayudarte a reservar un servicio o resolver un problema de cuenta; que necesitas hoy?'
      : 'Hi, I am Fixly. I can help you book a service or solve an account issue; what do you need today?';
  }

  if (/\b(book|booking|service|request|reserve|reservar|reserva|agendar|servicio)\b/.test(normalized)) {
    return inSpanish
      ? 'Para reservar, toca "Book a service", describe el trabajo, agrega ubicacion y fotos si puedes. Luego revisa profesionales cercanos y acepta la cotizacion que mas te convenga.'
      : 'To book a service, tap "Book a service", describe the job, and add your location and photos if you can. Then review nearby pros and accept the quote that works best for you.';
  }

  if (/\b(payment|paypal|pay|refund|charge|pago|pagar|reembolso|cobro)\b/.test(normalized)) {
    return inSpanish
      ? 'El pago se mantiene seguro durante el servicio y se libera cuando confirmas la finalizacion. Si ves un cobro incorrecto, escribe a fixlifeworks@gmail.com para ayuda humana.'
      : 'Payment is held securely during the service and released when you confirm completion. If a charge looks wrong, contact fixlifeworks@gmail.com for human support.';
  }

  if (/\b(account|profile|login|password|signin|sign in|cuenta|perfil|contrasena|contraseña|clave)\b/.test(normalized)) {
    return inSpanish
      ? 'Puedo ayudarte con problemas de cuenta o perfil. Intenta iniciar sesion de nuevo o restablecer tu clave, y si el problema sigue escribe a fixlifeworks@gmail.com.'
      : 'I can help with account or profile issues. Try signing in again or resetting your password, and if it still fails contact fixlifeworks@gmail.com.';
  }

  if (/\b(worker|professional|verified|rating|pro|trabajador|profesional|verificado|calificacion|calificación)\b/.test(normalized)) {
    return inSpanish
      ? 'Fixlife trabaja con profesionales verificados y calificaciones para ayudarte a elegir mejor. Tambien puedes chatear antes de aceptar y seguir al trabajador cuando vaya en camino.'
      : 'Fixlife works with verified professionals and ratings to help you choose with confidence. You can also chat before accepting and track the worker when they are on the way.';
  }

  if (/\b(cancel|cancellation|cancelled|cancelar|cancelacion|cancelación)\b/.test(normalized)) {
    return inSpanish
      ? 'Si necesitas cancelar, revisa el estado de tu solicitud desde la app lo antes posible. Si el caso requiere apoyo humano, escribe a fixlifeworks@gmail.com.'
      : 'If you need to cancel, review the request status in the app as soon as possible. If you need human help, contact fixlifeworks@gmail.com.';
  }

  return inSpanish
    ? 'Puedo ayudarte con reservas, pagos, seguimiento del trabajador y problemas de cuenta. Cuentame un poco mas y te guio paso a paso.'
    : 'I can help with bookings, payments, worker tracking, and account issues. Tell me a bit more and I will guide you step by step.';
};

router.post('/ai/chat', aiChatLimiter, async (req: Request, res: Response) => {
  const { messages } = req.body as { messages?: ChatPayloadMessage[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'The "messages" field is required and must be an array.' });
    return;
  }

  if (messages.length > 40) {
    res.status(400).json({ error: 'Too many messages in the conversation.' });
    return;
  }

  const validRoles = new Set<ChatRole>(['user', 'assistant']);
  for (const msg of messages) {
    if (!msg || typeof msg.content !== 'string' || !validRoles.has(msg.role)) {
      res.status(400).json({ error: 'Invalid message format.' });
      return;
    }
    if (msg.content.length > 2000) {
      res.status(400).json({ error: 'Message too long. Maximum 2000 characters.' });
      return;
    }
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    res.json({
      text: buildFallbackReply(messages),
      fallback: true,
      provider: 'rule-based',
    });
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
        Authorization: `Bearer ${apiKey}`,
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
      console.error('[AI Chat Fallback] Groq request failed:', groqRes.status, errData);
      res.json({
        text: buildFallbackReply(messages),
        fallback: true,
        provider: 'rule-based',
      });
      return;
    }

    const data: any = await groqRes.json();
    const text: string = data.choices?.[0]?.message?.content ?? buildFallbackReply(messages);

    res.json({
      text,
      fallback: false,
      provider: 'groq',
    });
  } catch (error: any) {
    console.error('[AI Chat Error]', error?.message || error);
    res.json({
      text: buildFallbackReply(messages),
      fallback: true,
      provider: 'rule-based',
    });
  }
});

export default router;
