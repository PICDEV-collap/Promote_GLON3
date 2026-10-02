export const BOT_SERVICE_ID = 'glo-n3-bot';

// Probe only the tunnel recorded by this project. Do not launch a shell or
// treat an unrelated cloudflared process as proof that this bot is reachable.
export async function probeProjectTunnel(
  webhookUrl: string,
  instanceId: string,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  try {
    const url = new URL(webhookUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.trycloudflare.com') || url.username || url.password) return false;
    url.pathname = '/health/instance';
    url.search = '';
    url.hash = '';
    const response = await fetcher(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      cache: 'no-store'
    });
    if (!response.ok) return false;
    const data = await response.json() as { status?: string; service?: string; instanceId?: string };
    return data.status === 'ok' && data.service === BOT_SERVICE_ID && data.instanceId === instanceId;
  } catch {
    return false;
  }
}

export class TunnelHealthMonitor {
  private checking = false;
  private failures = 0;
  private down = false;

  constructor(private readonly probe: () => Promise<boolean>, private readonly failureThreshold = 3) {}

  public async checkNow(): Promise<'down' | 'recovered' | null> {
    if (this.checking) return null;
    this.checking = true;
    try {
      const healthy = await this.probe().catch(() => false);
      if (healthy) {
        this.failures = 0;
        if (this.down) {
          this.down = false;
          return 'recovered';
        }
      } else if (++this.failures >= this.failureThreshold && !this.down) {
        this.down = true;
        return 'down';
      }
      return null;
    } finally {
      this.checking = false;
    }
  }
}
