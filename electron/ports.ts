import net from 'node:net';

export const DEFAULT_PORT = 3301;
export const PORT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [3100, 3999],
  [4100, 4999]
];

export async function isPortAvailable(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, host, () => server.close((error) => resolve(!error)));
  });
}

export async function resolvePort(
  preferred = DEFAULT_PORT,
  isAvailable: (port: number) => Promise<boolean> = isPortAvailable
): Promise<number | null> {
  if (await isAvailable(preferred)) return preferred;
  for (const [start, end] of PORT_RANGES) {
    for (let port = start; port <= end; port += 1) {
      if (port !== preferred && await isAvailable(port)) return port;
    }
  }
  return null;
}
