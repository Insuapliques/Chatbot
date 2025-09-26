import type { NextFunction, Request, Response } from 'express';
import admin from 'firebase-admin';
import { db } from '../firebaseConfig.js';

type AuthContextType = 'apiKey' | 'serviceToken' | 'firebase' | 'unauthenticated' | 'invalid';

interface AuthContext {
  type: AuthContextType;
  identifier?: string;
  uid?: string;
  email?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      authContext?: AuthContext;
    }
  }
}

const parseEnvList = (value?: string | null): string[] =>
  value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

const allowedApiKeys = parseEnvList(process.env.ALLOWED_API_KEYS);
const allowedServiceTokens = parseEnvList(process.env.ALLOWED_SERVICE_TOKENS ?? process.env.SERVICE_TOKEN ?? undefined);

const maskCredential = (value: string): string => {
  if (value.length <= 4) {
    return value;
  }

  const visibleSection = value.slice(-4);
  return `${'*'.repeat(value.length - visibleSection.length)}${visibleSection}`;
};

const extractApiKey = (req: Request): string | undefined => {
  const headerApiKey = req.header('x-api-key');
  if (typeof headerApiKey === 'string' && headerApiKey.trim().length > 0) {
    return headerApiKey.trim();
  }

  const queryApiKey = req.query['apiKey'];
  if (typeof queryApiKey === 'string' && queryApiKey.trim().length > 0) {
    return queryApiKey.trim();
  }

  return undefined;
};

const extractBearerToken = (authorizationHeader?: string | null): string | undefined => {
  if (!authorizationHeader) {
    return undefined;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined;
  }

  return token.trim();
};

export const authenticateRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.method === 'OPTIONS') {
      res.locals.authContext = { type: 'unauthenticated' };
      next();
      return;
    }

    const apiKey = extractApiKey(req);

    if (apiKey) {
      if (allowedApiKeys.includes(apiKey)) {
        res.locals.authContext = {
          type: 'apiKey',
          identifier: maskCredential(apiKey),
        };
        next();
        return;
      }

      res.locals.authContext = { type: 'invalid' };
      res.status(401).json({ error: 'No autorizado', message: 'API key inválida' });
      return;
    }

    const bearerToken = extractBearerToken(req.header('authorization'));

    if (bearerToken) {
      if (allowedServiceTokens.includes(bearerToken)) {
        res.locals.authContext = {
          type: 'serviceToken',
          identifier: maskCredential(bearerToken),
        };
        next();
        return;
      }

      try {
        const decoded = await admin.auth().verifyIdToken(bearerToken);
        res.locals.authContext = {
          type: 'firebase',
          identifier: decoded.uid,
          uid: decoded.uid,
          email: decoded.email ?? undefined,
        };
        next();
        return;
      } catch (error) {
        console.warn('Token de Firebase inválido o expirado', error);
        res.locals.authContext = { type: 'invalid' };
        res.status(401).json({ error: 'No autorizado', message: 'Token inválido' });
        return;
      }
    }

    res.locals.authContext = { type: 'unauthenticated' };
    res.status(401).json({ error: 'No autorizado', message: 'Credenciales faltantes' });
  } catch (error) {
    console.error('Error durante la autenticación', error);
    res.status(500).json({ error: 'Error interno de autenticación' });
  }
};

export const auditAccess = (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    const context = res.locals.authContext;
    const auditEntry = {
      path: req.originalUrl,
      method: req.method,
      statusCode: res.statusCode,
      authType: context?.type ?? 'unknown',
      authIdentifier: context?.identifier ?? context?.uid ?? null,
      userUid: context?.uid ?? null,
      userEmail: context?.email ?? null,
      requestId: (req.headers['x-request-id'] as string | undefined) ?? null,
      ip: req.ip,
      hasBody: Boolean(req.body && Object.keys(req.body as Record<string, unknown>).length > 0),
      userAgent: req.get('user-agent') ?? null,
      durationMs: Date.now() - startedAt,
      createdAt: new Date(),
    };

    db.collection('accessAudit')
      .add(auditEntry)
      .catch((error) => {
        console.error('Error registrando auditoría de acceso', error);
      });
  });

  next();
};
