import crypto from 'crypto';

export function generateTransactionId(sessionId) {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(4).toString('hex');
  return `TRX_${sessionId.slice(0, 4)}_${timestamp}_${randomPart}`;
}

export function generateProductId() {
  const timestamp = Date.now().toString(36).slice(-4);
  const randomPart = crypto.randomBytes(3).toString('hex');
  return `PRD_${timestamp}_${randomPart}`.toUpperCase();
}