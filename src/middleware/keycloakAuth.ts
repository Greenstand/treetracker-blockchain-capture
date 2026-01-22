import { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import Keycloak from 'keycloak-connect';
import { KeycloakTokenPayload, User } from '../types';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      kauth?: {
        grant?: {
          access_token?: {
            token?: string;
            content?: any;
          };
        };
      };
    }
  }
}

// Session configuration
export const sessionConfig = session({
  secret: process.env.SESSION_SECRET || 'treetracker-capture-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
});

// Keycloak configuration
const keycloakConfig = {
  realm: process.env.KEYCLOAK_REALM || 'treetracker',
  'auth-server-url': process.env.KEYCLOAK_SERVER_URL || 'http://localhost:8080',
  'ssl-required': 'external',
  resource: process.env.KEYCLOAK_CLIENT_ID || 'treetracker-capture-service',
  'public-client': true,
  'confidential-port': 0
};

// Initialize Keycloak
const memoryStore = new session.MemoryStore();
export const keycloak = new Keycloak({ store: memoryStore }, keycloakConfig);

// Middleware to extract user info from Keycloak token
export const extractUserInfo = (req: Request, res: Response, next: NextFunction): void => {
  if (req.kauth && req.kauth.grant) {
    const token = req.kauth.grant.access_token;
    if (token && token.content) {
      const tokenContent = token.content;
      
      req.user = {
        id: tokenContent.sub,
        username: tokenContent.preferred_username || tokenContent.sub,
        email: tokenContent.email || '',
        sub: tokenContent.sub,
        preferred_username: tokenContent.preferred_username || tokenContent.sub,
        given_name: tokenContent.given_name,
        family_name: tokenContent.family_name,
      };
    }
  }
  next();
};

// Combined authentication middleware
export const authenticate = [
  keycloak.protect(),
  extractUserInfo
];

// Role-based authorization middleware
export const requireRole = (role: string) => {
  return keycloak.protect(`realm:${role}`);
};

// Admin role middleware
export const requireAdmin = requireRole('admin');

// Export individual middleware functions for flexibility
export const keycloakAuth = {
  authenticate,
  requireRole,
  requireAdmin,
  protect: keycloak.protect.bind(keycloak),
  middleware: keycloak.middleware.bind(keycloak)
};

export default keycloakAuth;
