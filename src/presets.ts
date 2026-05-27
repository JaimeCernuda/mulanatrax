import { runtimeConfig } from './config';

export interface ScreenshotPreset {
  id: number;
  label: string;
  autoDetect?: boolean;
  tileWidth: number;
  tileHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  ocrCleanup?: {
    removeText?: string[];
    trailingPattern?: string;
  };
  crop?: {
    sourceX: number;
    sourceY: number;
    sourceWidth: number;
    sourceHeight: number;
  };
}

export const screenshotPresets: ScreenshotPreset[] = [
  {
    id: 0,
    label: 'Auto detect',
    autoDetect: true,
    tileWidth: 320,
    tileHeight: 180,
    canvasWidth: 320,
    canvasHeight: 180,
  },
  {
    id: 1,
    label: 'Full frame 16:9',
    tileWidth: 320,
    tileHeight: 180,
    canvasWidth: 320,
    canvasHeight: 180,
  },
  {
    id: 2,
    label: 'Full frame 4:3',
    tileWidth: 320,
    tileHeight: 240,
    canvasWidth: 320,
    canvasHeight: 240,
  },
];

function isScreenshotPreset(value: unknown): value is ScreenshotPreset {
  const preset = value as ScreenshotPreset;
  return (
    typeof preset?.id === 'number' &&
    typeof preset.label === 'string' &&
    typeof preset.tileWidth === 'number' &&
    typeof preset.tileHeight === 'number' &&
    typeof preset.canvasWidth === 'number' &&
    typeof preset.canvasHeight === 'number' &&
    (preset.crop === undefined ||
      (typeof preset.crop.sourceX === 'number' &&
        typeof preset.crop.sourceY === 'number' &&
        typeof preset.crop.sourceWidth === 'number' &&
        typeof preset.crop.sourceHeight === 'number'))
  );
}

export function parseScreenshotPresets(value: unknown): ScreenshotPreset[] {
  if (!value) {
    return screenshotPresets;
  }

  try {
    const parsedValue = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
    if (Array.isArray(parsedValue) && parsedValue.every(isScreenshotPreset)) {
      return parsedValue;
    }
  } catch {
    return screenshotPresets;
  }

  return screenshotPresets;
}

export const configuredScreenshotPresets = parseScreenshotPresets(
  runtimeConfig.screenshotPresets ?? import.meta.env.VITE_SCREENSHOT_PRESETS
);

export function getScreenshotPreset(id: number): ScreenshotPreset {
  return configuredScreenshotPresets.find((preset) => preset.id === id) ?? configuredScreenshotPresets[0];
}

export function detectScreenshotPreset(width: number, height: number): ScreenshotPreset {
  const aspectRatio = width / height;
  const candidates = configuredScreenshotPresets.filter((preset) => !preset.autoDetect && !preset.crop);
  const fallbackCandidates = candidates.length > 0 ? candidates : configuredScreenshotPresets.filter((preset) => !preset.autoDetect);

  return fallbackCandidates.reduce((bestPreset, preset) => {
    const bestDelta = Math.abs(bestPreset.tileWidth / bestPreset.tileHeight - aspectRatio);
    const presetDelta = Math.abs(preset.tileWidth / preset.tileHeight - aspectRatio);
    return presetDelta < bestDelta ? preset : bestPreset;
  }, fallbackCandidates[0] ?? configuredScreenshotPresets[0]);
}
