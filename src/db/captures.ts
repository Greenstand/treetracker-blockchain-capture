import { pool } from './pool';
import { CaptureData } from '../types';

const toTimestamp = (value?: Date): Date | null => {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
};

export async function upsertCapture(capture: CaptureData): Promise<void> {
  if (!pool) {
    return;
  }

  const status = capture.approved ? 'verified' : 'pending';

  await pool.query(
    `
      INSERT INTO captures (
        id,
        user_id,
        data,
        species,
        common_name,
        status,
        latitude,
        longitude,
        image_url,
        capture_time,
        tx_id,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        data = EXCLUDED.data,
        species = EXCLUDED.species,
        common_name = EXCLUDED.common_name,
        status = EXCLUDED.status,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        image_url = EXCLUDED.image_url,
        capture_time = EXCLUDED.capture_time,
        tx_id = EXCLUDED.tx_id,
        updated_at = NOW();
    `,
    [
      capture.id,
      capture.userId,
      capture,
      capture.species || null,
      capture.commonName || null,
      status,
      capture.latitude,
      capture.longitude,
      capture.imageUrl || null,
      toTimestamp(capture.timestamp),
      capture.blockchainTxId || null,
    ]
  );
}

export async function getCapturesByUser(
  userId: string,
  page: number,
  limit: number
): Promise<{ captures: CaptureData[]; total: number }> {
  if (!pool) {
    return { captures: [], total: 0 };
  }

  const offset = (page - 1) * limit;
  const totalResult = await pool.query(
    'SELECT COUNT(*)::int AS total FROM captures WHERE user_id = $1',
    [userId]
  );
  const total = totalResult.rows[0]?.total || 0;

  const result = await pool.query(
    `
      SELECT data
      FROM captures
      WHERE user_id = $1
      ORDER BY capture_time DESC NULLS LAST, created_at DESC
      LIMIT $2 OFFSET $3
    `,
    [userId, limit, offset]
  );

  const captures = result.rows.map((row: { data: CaptureData }) => row.data);

  const deduped = new Map<string, CaptureData>();
  for (const capture of captures) {
    const key = capture.blockchainTxId || capture.id;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, capture);
      continue;
    }

    const existingHasImage = Boolean(existing.imageUrl);
    const captureHasImage = Boolean(capture.imageUrl);
    if (!existingHasImage && captureHasImage) {
      deduped.set(key, capture);
    }
  }

  const uniqueCaptures = Array.from(deduped.values());

  return { captures: uniqueCaptures, total: uniqueCaptures.length };
}

export async function getCaptureById(id: string): Promise<CaptureData | null> {
  if (!pool) {
    return null;
  }

  const result = await pool.query('SELECT data FROM captures WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].data as CaptureData;
}

export async function getCaptureByTxId(txId: string): Promise<CaptureData | null> {
  if (!pool) {
    return null;
  }

  const result = await pool.query('SELECT data FROM captures WHERE tx_id = $1', [txId]);
  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].data as CaptureData;
}

export async function updateCaptureApproval(
  captureId: string,
  approved: boolean,
  verifiedBy?: string
): Promise<CaptureData | null> {
  if (!pool) {
    return null;
  }

  const current = await getCaptureById(captureId);
  if (!current) {
    return null;
  }

  const updated: CaptureData = {
    ...current,
    approved,
    verifiedBy: verifiedBy || current.verifiedBy,
    verificationDate: new Date(),
  };

  await upsertCapture(updated);
  return updated;
}
