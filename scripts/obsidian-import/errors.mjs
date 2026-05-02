export function toImportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  let details;
  const jsonMatch = message.match(/\{[\s\S]*\}$/);
  if (jsonMatch) {
    try {
      details = JSON.parse(jsonMatch[0]);
    } catch {
      details = undefined;
    }
  }

  return {
    message,
    details,
    retryAfterSeconds: details?.error?.reset_seconds ?? details?.error?.resets_in_seconds,
    code: details?.error?.code ?? details?.error?.type,
  };
}
