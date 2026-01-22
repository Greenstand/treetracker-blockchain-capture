import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { User } from '../types';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// Cache for Keycloak public keys
let keycloakPublicKey: string | null = null;
let keyLastFetched: number = 0;
const KEY_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Get Keycloak public key for token verification
async function getKeycloakPublicKey(): Promise<string> {
  const now = Date.now();
  
  // Return cached key if still valid
  if (keycloakPublicKey && (now - keyLastFetched) < KEY_CACHE_DURATION) {
    return keycloakPublicKey;
  }
  
  try {
    const keycloakUrl = process.env.KEYCLOAK_SERVER_URL || 'http://localhost:8080';
    const realm = process.env.KEYCLOAK_REALM || 'treetracker';
    const certsUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`;
    
    console.log(`Fetching Keycloak public key from: ${certsUrl}`);
    
    // Get realm public key from Keycloak
    const response = await axios.get(certsUrl, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'treetracker-capture-service/1.0'
      }
    });
    
    console.log(`Successfully fetched Keycloak certs, status: ${response.status}`);
    
    // Extract the signing key (look for key with use: 'sig' or alg: 'RS256')
    const keys = response.data.keys;
    if (keys && keys.length > 0) {
      // Find the signing key
      const signingKey = keys.find((k: any) => k.use === 'sig' || k.alg === 'RS256') || keys[0];
      
      // Use the certificate if available (x5c format)
      if (signingKey.x5c && signingKey.x5c[0]) {
        const cert = signingKey.x5c[0];
        const publicKey = `-----BEGIN CERTIFICATE-----\n${cert}\n-----END CERTIFICATE-----`;
        
        keycloakPublicKey = publicKey;
        keyLastFetched = now;
        console.log('Successfully cached Keycloak public key from certificate');
        return publicKey;
      } else {
        throw new Error('No certificate found in signing key');
      }
    } else {
      throw new Error('No public keys found');
    }
  } catch (error: any) {
    console.error('Failed to fetch Keycloak public key:', error);
    console.error('Error details:', error.response?.status, error.response?.statusText, error.response?.data);
    throw new Error('Unable to verify token - key fetch failed');
  }
}

// Bearer token authentication middleware
export const authenticateBearer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No valid authorization header found'
      });
      return;
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      res.status(401).json({
        success: false,
        error: 'No token provided'
      });
      return;
    }
    
    // Get Keycloak public key for verification
    const publicKey = await getKeycloakPublicKey();
    
    // Verify and decode the JWT token
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'], // Keycloak uses RS256
      issuer: `${process.env.KEYCLOAK_SERVER_URL || 'http://localhost:8080'}/realms/${process.env.KEYCLOAK_REALM || 'treetracker'}`,
      // Accept multiple audiences: account (default) and our client ID
      audience: ['account', 'treetracker-blockchain-auth']
    }) as any;
    
    // Extract user information from token
    req.user = {
      id: decoded.sub,
      username: decoded.preferred_username || decoded.sub,
      email: decoded.email || '',
      sub: decoded.sub,
      preferred_username: decoded.preferred_username || decoded.sub,
      given_name: decoded.given_name,
      family_name: decoded.family_name,
    };
    
    next();
    
  } catch (error: any) {
    console.error('Bearer token authentication failed:', error);
    
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
      return;
    }
    
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        error: 'Token expired'
      });
      return;
    }
    
    res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

// Alternative authentication middleware that tries Bearer token first, then falls back to session
export const authenticateFlexible = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  
  // If Bearer token is present, use Bearer authentication
  if (authHeader && authHeader.startsWith('Bearer ')) {
    console.log('Using Bearer token authentication');
    return authenticateBearer(req, res, next);
  }
  
  // Otherwise, fall back to session-based authentication
  console.log('No Bearer token found, falling back to session authentication');
  try {
    const sessionAuth = await import('./keycloakAuth');
    return sessionAuth.authenticate[0](req, res, () => {
      return sessionAuth.authenticate[1](req, res, next);
    });
  } catch (error) {
    console.error('Session authentication also failed:', error);
    res.status(401).json({
      success: false,
      error: 'No valid authentication method found'
    });
  }
};

export default { authenticateBearer, authenticateFlexible };