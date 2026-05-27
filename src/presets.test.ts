import { describe, expect, it } from 'vitest';
import { detectScreenshotPreset, parseScreenshotPresets, screenshotPresets } from './presets';

describe('parseScreenshotPresets', () => {
  it('uses defaults when no custom presets are configured', () => {
    expect(parseScreenshotPresets(undefined)).toEqual(screenshotPresets);
  });

  it('accepts valid custom screenshot presets', () => {
    const presets = parseScreenshotPresets(
      JSON.stringify([
        {
          id: 10,
          label: 'Custom capture',
          tileWidth: 400,
          tileHeight: 225,
          canvasWidth: 800,
          canvasHeight: 450,
          crop: {
            sourceX: 20,
            sourceY: 30,
            sourceWidth: 1600,
            sourceHeight: 900,
          },
        },
      ])
    );

    expect(presets).toHaveLength(1);
    expect(presets[0].label).toBe('Custom capture');
  });

  it('falls back to defaults for invalid JSON', () => {
    expect(parseScreenshotPresets('nope')).toEqual(screenshotPresets);
  });
});

describe('detectScreenshotPreset', () => {
  it('chooses the common 16:9 full-frame preset for widescreen screenshots', () => {
    expect(detectScreenshotPreset(1920, 1080).label).toBe('Full frame 16:9');
  });

  it('chooses the common 4:3 full-frame preset for standard screenshots', () => {
    expect(detectScreenshotPreset(1024, 768).label).toBe('Full frame 4:3');
  });
});
