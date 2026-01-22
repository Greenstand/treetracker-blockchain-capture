import { Contract, ContractEvent } from 'fabric-network';
import { ensureFabricConnected, fabricClient } from './fabric';
import { getCaptureById, upsertCapture } from '../db/captures';
import { CaptureData } from '../types';

interface TreeEvent {
  id: string;
  userId: string;
  species?: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  gpsAccuracy?: number;
  imageUrl?: string;
  note?: string;
  timestamp?: number;
  blockchainTxId?: string;
  approved?: boolean;
  metadata?: Record<string, unknown>;
}

const toCaptureData = (event: TreeEvent): CaptureData => {
  const timestampSeconds = event.timestamp || Math.floor(Date.now() / 1000);

  const metadataUserId = typeof event.metadata?.userId === 'string' ? event.metadata.userId : undefined;

  return {
    id: event.id,
    userId: metadataUserId || event.userId,
    species: event.species,
    latitude: event.latitude,
    longitude: event.longitude,
    altitude: event.altitude,
    gpsAccuracy: event.gpsAccuracy,
    imageUrl: event.imageUrl,
    note: event.note,
    timestamp: new Date(timestampSeconds * 1000),
    approved: event.approved ?? false,
    blockchainTxId: event.blockchainTxId,
  };
};

const getContract = (): Contract => {
  const contract = fabricClient.getContract();
  return contract;
};

export async function startFabricListener(): Promise<void> {
  await ensureFabricConnected();

  const contract = getContract();

  await contract.addContractListener(async (event: ContractEvent) => {
    if (!event.payload) {
      return;
    }

    const eventName = event.eventName || '';
    if (eventName !== 'TreePlanted' && eventName !== 'CaptureStatusUpdated') {
      return;
    }

    try {
      const payload = JSON.parse(event.payload.toString()) as TreeEvent;
      if (!payload.id || !payload.userId) {
        return;
      }

      const capture = toCaptureData(payload);
      const existing = await getCaptureById(capture.id);
      if (existing && !capture.imageUrl) {
        capture.imageUrl = existing.imageUrl;
      }
      await upsertCapture(capture);
      console.log(`📦 Stored capture event ${eventName} for ${payload.id}`);
    } catch (error) {
      console.error('Failed to process capture event:', error);
    }
  });

  console.log('✅ Fabric contract listener registered');
}
