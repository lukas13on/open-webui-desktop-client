import { describe, expect, it } from 'vitest';
import {
  applyEnvEntries,
  changedEnvKeys,
  formatEnvLine,
  mergeEnvEntries,
  isValidEnvKey,
  normalizeEnvEntries,
  parseEnvEntries,
  validateRawEnv,
  EnvValidationError
} from './env-file';

describe('env file handling', () => {
  it('parses quoted, unquoted and commented values', () => {
    const content = [
      '# comment',
      "OPENAI_API_BASE_URL='https://openrouter.ai/api/v1'",
      'OPENAI_API_KEY="sk-value"',
      'PLAIN=value',
      'WITH_COMMENT=value # inline',
      '',
      'INVALID LINE'
    ].join('\n');

    expect(parseEnvEntries(content)).toEqual([
      { key: 'OPENAI_API_BASE_URL', value: 'https://openrouter.ai/api/v1' },
      { key: 'OPENAI_API_KEY', value: 'sk-value' },
      { key: 'PLAIN', value: 'value' },
      { key: 'WITH_COMMENT', value: 'value' }
    ]);
  });

  it('keeps the last occurrence of a duplicated key', () => {
    const entries = parseEnvEntries('A=1\nA=2\n');
    expect(entries).toEqual([{ key: 'A', value: '2' }]);
  });

  it('rewrites values and removes variables that are no longer present', () => {
    const content = ["# header", "KEEP='old'", "DROP='x'", '', 'OTHER=1'].join('\n');
    const next = applyEnvEntries(content, [
      { key: 'KEEP', value: 'new' },
      { key: 'OTHER', value: '1' },
      { key: 'ADDED', value: 'yes' }
    ]);

    expect(next).toContain('# header');
    expect(next).toContain("KEEP='new'");
    expect(next).not.toContain('DROP=');
    expect(next).toContain("ADDED='yes'");
    expect(next.endsWith('\n')).toBe(true);
    expect(parseEnvEntries(next)).toEqual([
      { key: 'KEEP', value: 'new' },
      { key: 'OTHER', value: '1' },
      { key: 'ADDED', value: 'yes' }
    ]);
  });

  it('merges values while keeping unrelated variables', () => {
    const content = ["# header", "KEEP='old'", "OTHER='1'"].join('\n');
    const next = mergeEnvEntries(content, [
      { key: 'KEEP', value: 'new' },
      { key: 'ADDED', value: 'yes' }
    ]);

    expect(next).toContain('# header');
    expect(next).toContain("KEEP='new'");
    expect(next).toContain("OTHER='1'");
    expect(next).toContain("ADDED='yes'");
    expect(parseEnvEntries(next)).toEqual([
      { key: 'KEEP', value: 'new' },
      { key: 'OTHER', value: '1' },
      { key: 'ADDED', value: 'yes' }
    ]);
  });

  it('quotes values that contain quotes', () => {
    expect(formatEnvLine('A', "it's fine")).toBe('A="it\'s fine"');
    expect(formatEnvLine('B', 'say "hi"')).toBe("B='say \"hi\"'");
  });

  it('validates variable names', () => {
    expect(isValidEnvKey('OPENAI_API_KEY')).toBe(true);
    expect(isValidEnvKey('_PRIVATE')).toBe(true);
    expect(isValidEnvKey('1INVALID')).toBe(false);
    expect(isValidEnvKey('WITH SPACE')).toBe(false);
    expect(isValidEnvKey('')).toBe(false);
  });

  it('rejects invalid payloads', () => {
    expect(() => normalizeEnvEntries('nope')).toThrow(EnvValidationError);
    expect(() => normalizeEnvEntries([{ key: 'bad key', value: '1' }])).toThrow(EnvValidationError);
    expect(() => normalizeEnvEntries([{ key: 'A', value: 1 }])).toThrow(EnvValidationError);
    expect(() => normalizeEnvEntries([{ key: 'A', value: 'line\nbreak' }])).toThrow(EnvValidationError);
    expect(() => normalizeEnvEntries([{ key: 'A', value: '1' }, { key: 'A', value: '2' }])).toThrow(EnvValidationError);
  });

  it('accepts a valid snapshot and trims keys', () => {
    expect(normalizeEnvEntries([{ key: ' A ', value: 'v' }])).toEqual([{ key: 'A', value: 'v' }]);
  });

  it('reports invalid raw lines with their number', () => {
    expect(() => validateRawEnv("A='1'\nbroken line\n")).toThrow(EnvValidationError);
    expect(() => validateRawEnv("A='1'\nA='2'\n")).toThrow(EnvValidationError);
    expect(() => validateRawEnv("# comment\nA='1'\n\nB=2\n")).not.toThrow();
  });

  it('detects changed, added and removed keys', () => {
    const changed = changedEnvKeys(
      [{ key: 'A', value: '1' }, { key: 'B', value: '2' }],
      [{ key: 'A', value: '1' }, { key: 'C', value: '3' }]
    );
    expect(changed.sort()).toEqual(['B', 'C']);
  });
});
