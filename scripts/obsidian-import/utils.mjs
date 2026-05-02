import crypto from 'node:crypto';

export function cleanString(value) {
  if (value === undefined || value === null) return undefined;
  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : undefined;
}

export function normalizeDateValue(value) {
  return cleanString(value) || undefined;
}

export function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const stringValue = cleanString(value);
  return stringValue ? [stringValue] : [];
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
