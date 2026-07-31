export async function fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
  const maxRetries = 3;
  const baseDelays = [300, 600, 1200];

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(`HTTP error! status: ${response.status}, body: ${bodyText}`);
      }
      return response;
    } catch (error) {
      if (i === maxRetries) {
        throw error;
      }
      const jitter = Math.random() * 100;
      const delay = baseDelays[i] + jitter;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}
