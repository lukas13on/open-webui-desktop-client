import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PORT, PORT_RANGES, resolvePort } from './ports';

describe('desktop port resolution', () => {
  it('prefers the default port when available', async () => {
    const available = vi.fn(async () => true);
    await expect(resolvePort(DEFAULT_PORT, available)).resolves.toBe(DEFAULT_PORT);
    expect(available).toHaveBeenCalledTimes(1);
    expect(available).toHaveBeenCalledWith(DEFAULT_PORT);
  });

  it('scans the configured ranges when the preferred port is occupied', async () => {
    const available = vi.fn(async (port: number) => port === 3101 || port === 4100);
    await expect(resolvePort(DEFAULT_PORT, available)).resolves.toBe(3101);
    expect(available).toHaveBeenNthCalledWith(1, DEFAULT_PORT);
    expect(available).toHaveBeenLastCalledWith(3101);
    expect(PORT_RANGES).toEqual([[3100, 3999], [4100, 4999]]);
  });

  it('returns null when every port is occupied', async () => {
    const available = vi.fn(async () => false);
    await expect(resolvePort(3301, available)).resolves.toBeNull();
    expect(available).toHaveBeenCalledTimes(900 + 900);
  });
});
