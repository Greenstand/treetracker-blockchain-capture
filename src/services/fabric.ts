import FabricClient from '../fabric/fabricClient';

export const fabricClient = new FabricClient();

const FABRIC_CONNECT_TIMEOUT_MS = parseInt(process.env.FABRIC_CONNECT_TIMEOUT_MS || '5000', 10);

let fabricReady = false;
let fabricConnectPromise: Promise<void> | null = null;

export const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout: ${label}`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
};

export const ensureFabricConnected = async (): Promise<void> => {
  if (fabricReady) {
    return;
  }

  if (!fabricConnectPromise) {
    fabricConnectPromise = withTimeout(
      fabricClient.connect(),
      FABRIC_CONNECT_TIMEOUT_MS,
      'fabric_connect'
    ).then(() => {
      fabricReady = true;
    }).catch((error) => {
      fabricConnectPromise = null;
      fabricReady = false;
      throw error;
    });
  }

  await fabricConnectPromise;
};
