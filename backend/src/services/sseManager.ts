import { Response } from 'express';
import crypto from 'crypto';

interface SSEClient {
  userId: number;
  rol: string;
  res: Response;
}

const clients = new Map<string, SSEClient>();

export function registerClient(userId: number, rol: string, res: Response): string {
  const clientId = crypto.randomUUID();
  clients.set(clientId, { userId, rol, res });
  return clientId;
}

export function removeClient(clientId: string): void {
  clients.delete(clientId);
}

export function pushToUser(userId: number, event: string, data: unknown): void {
  clients.forEach((client, clientId) => {
    if (client.userId === userId) {
      try {
        client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        clients.delete(clientId);
      }
    }
  });
}

export function pushToWorkers(event: string, data: unknown): void {
  clients.forEach((client, clientId) => {
    if (client.rol === 'worker') {
      try {
        client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        clients.delete(clientId);
      }
    }
  });
}

export function connectedCount(): number {
  return clients.size;
}
