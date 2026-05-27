import { describe, expect, it } from 'vitest';
import { cleanDetectedText, formatAxisLabel, tileDisplayName } from './utils';

describe('cleanDetectedText', () => {
  it('removes common OCR line numbers', () => {
    expect(cleanDetectedText('001 First line\n002 Second line', 1)).toBe('First line\nSecond line');
  });

  it('returns an empty string when OCR returned no text', () => {
    expect(cleanDetectedText(undefined, 1)).toBe('');
  });
});

describe('formatAxisLabel', () => {
  it('formats spreadsheet-style letter labels beyond Z', () => {
    expect(formatAxisLabel(0, 'letters')).toBe('A');
    expect(formatAxisLabel(25, 'letters')).toBe('Z');
    expect(formatAxisLabel(26, 'letters')).toBe('AA');
    expect(formatAxisLabel(27, 'letters')).toBe('AB');
  });

  it('formats one-based numeric labels', () => {
    expect(formatAxisLabel(0, 'numbers')).toBe('1');
    expect(formatAxisLabel(8, 'numbers')).toBe('9');
  });
});

describe('tileDisplayName', () => {
  it('relabels the visible top-left tile as A-1 when map coordinates are negative', () => {
    expect(tileDisplayName({ x: -3, y: -2 }, -3, -2, 'letters', 'numbers')).toBe('A-1');
    expect(tileDisplayName({ x: -2, y: -1 }, -3, -2, 'letters', 'numbers')).toBe('B-2');
  });
});
