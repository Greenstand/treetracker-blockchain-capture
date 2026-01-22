declare module 'jwks-client' {
  export interface JwksClientOptions {
    jwksUri: string;
    cache?: boolean;
    cacheMaxEntries?: number;
    cacheMaxAge?: number;
  }

  export interface SigningKey {
    getPublicKey(): string;
  }

  export class JwksClient {
    constructor(options: JwksClientOptions);
    getSigningKey(kid: string, callback: (err: any, key: SigningKey) => void): void;
  }

  export = JwksClient;
}