export function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const cause = (error as { cause?: { code?: string } })?.cause?.code ?? '';
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(`${message} ${cause}`);
}
