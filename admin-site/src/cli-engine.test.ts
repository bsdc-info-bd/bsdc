import { describe, expect, it } from 'vitest';
import {
  CLI_COMMANDS,
  cliAutocomplete,
  parseCli,
  splitMacroLines,
  tokenizeCli,
} from './cli-engine';

describe('admin CLI engine', () => {
  it('tokenizes double-quoted, single-quoted, and escaped arguments safely', () => {
    const res = tokenizeCli('cert revoke BSDC-CT-ABCD1234-1 "Typo in \\"name\\"" --yes');
    expect(res.error).toBeUndefined();
    expect(res.tokens).toEqual(['cert', 'revoke', 'BSDC-CT-ABCD1234-1', 'Typo in "name"', '--yes']);
  });

  it('rejects unclosed quotes cleanly', () => {
    const res = parseCli('audit --action "certificate');
    expect(res.error).toContain('Unclosed');
  });

  it('parses flags (--key val, --key=val, boolean --yes) and positional args', () => {
    const res = parseCli('audit --action certificate --limit=40 --yes');
    expect(res.positional).toEqual(['audit']);
    expect(res.flags).toEqual({ action: 'certificate', limit: '40', yes: true });
  });

  it('provides autocomplete suggestions and splits multi-line macros', () => {
    expect(CLI_COMMANDS.length).toBeGreaterThan(15);
    expect(cliAutocomplete('cert').map((c) => c.command)).toContain('cert revoke');
    expect(splitMacroLines('# header\ntelemetry\n\naudit --limit 10; portals')).toEqual([
      'telemetry',
      'audit --limit 10',
      'portals',
    ]);
  });
});
