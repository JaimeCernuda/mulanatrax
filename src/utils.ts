import { AxisLabelMode, ImageCrop, MapTile, TileAnnotation, TileImageFit, TileLink, TileMarker } from './db';
import { detectScreenshotPreset, getScreenshotPreset } from './presets';

export function seededRandomColor(seed: string) {
  let res = 0;

  for (let i = 0; i < seed.length; ++i) res = res * 10 + seed[i].charCodeAt(0) - '0'.charCodeAt(0);
  return '#' + Math.floor(Math.abs(Math.sin(res) * 16777215) % 16777215).toString(16);
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export async function readFileAsDataURL(file: File): Promise<string> {
  const resultBase64: string = await new Promise((resolve) => {
    const fileReader = new FileReader();
    fileReader.onload = () => resolve(fileReader.result as string);
    fileReader.readAsDataURL(file);
  });

  return resultBase64;
}

export interface ProcessedImage {
  imgSrc: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: ImageCrop;
  fit: TileImageFit;
  presetId: number;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

export async function processImageFile(files: File[], presetId: number = 0): Promise<ProcessedImage | undefined> {
  const file = files[0];
  if (!file) {
    return;
  }
  const result = await readFileAsDataURL(file);
  const img = await loadImage(result);
  const requestedPreset = getScreenshotPreset(presetId);
  const preset = requestedPreset.autoDetect ? detectScreenshotPreset(img.naturalWidth, img.naturalHeight) : requestedPreset;
  const sourceX = preset.crop?.sourceX ?? 0;
  const sourceY = preset.crop?.sourceY ?? 0;
  const sourceWidth = preset.crop?.sourceWidth ?? img.naturalWidth;
  const sourceHeight = preset.crop?.sourceHeight ?? img.naturalHeight;

  return {
    imgSrc: result,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    crop: {
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
    },
    fit: 'contain',
    presetId: preset.id,
  };
}

export function getTileImage(tile: MapTile | TilePictureLike | null | undefined): string | undefined {
  return tile?.originalImg ?? tile?.img;
}

interface TilePictureLike {
  img?: string;
  originalImg?: string;
}

export function formatAxisLabel(index: number, mode: AxisLabelMode): string {
  const visibleIndex = index + 1;
  if (mode === 'numbers') {
    return String(visibleIndex);
  }

  let value = visibleIndex;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = alphabet[value % alphabet.length] + label;
    value = Math.floor(value / alphabet.length);
  }
  return label;
}

export function tileDisplayName(
  tile: Pick<MapTile, 'x' | 'y'>,
  minX: number,
  minY: number,
  columnMode: AxisLabelMode,
  rowMode: AxisLabelMode
): string {
  return `${formatAxisLabel(tile.x - minX, columnMode)}-${formatAxisLabel(tile.y - minY, rowMode)}`;
}

export function getObjectFit(tile: MapTile | null | undefined): TileImageFit {
  return tile?.fit ?? 'contain';
}

export function drawImageIntoRect(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  fit: TileImageFit,
  crop?: ImageCrop
) {
  const sx = crop?.sourceX ?? 0;
  const sy = crop?.sourceY ?? 0;
  const sw = crop?.sourceWidth ?? img.naturalWidth;
  const sh = crop?.sourceHeight ?? img.naturalHeight;

  if (fit === 'contain') {
    const scale = Math.min(dw / sw, dh / sh);
    const width = sw * scale;
    const height = sh * scale;
    ctx.drawImage(img, sx, sy, sw, sh, dx + (dw - width) / 2, dy + (dh - height) / 2, width, height);
    return;
  }

  const sourceRatio = sw / sh;
  const destRatio = dw / dh;
  let coverSx = sx;
  let coverSy = sy;
  let coverSw = sw;
  let coverSh = sh;

  if (sourceRatio > destRatio) {
    coverSw = sh * destRatio;
    coverSx = sx + (sw - coverSw) / 2;
  } else {
    coverSh = sw / destRatio;
    coverSy = sy + (sh - coverSh) / 2;
  }

  ctx.drawImage(img, coverSx, coverSy, coverSw, coverSh, dx, dy, dw, dh);
}

export function annotationPath(points: TileAnnotation['points'], width: number, height: number): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x * width} ${point.y * height}`)
    .join(' ');
}

export function markerLabel(marker: TileMarker): string {
  return marker.label ?? marker.type;
}

export function cleanDetectedText(text: string | undefined, presetId: number) {
  if (!text) {
    return '';
  }

  const preset = getScreenshotPreset(presetId);
  const trailingControlText = preset.ocrCleanup?.trailingPattern
    ? new RegExp(preset.ocrCleanup.trailingPattern)
    : undefined;

  const textWithoutIgnoredPhrases = preset.ocrCleanup?.removeText?.reduce(
    (result, phrase) => result.replaceAll(phrase, ''),
    text
  ) ?? text;

  return textWithoutIgnoredPhrases
    .replaceAll(/^[\d]*\s*/gm, '')
    .replace(trailingControlText ?? /$(?![\s\S])/, '')
    .trim();
}

export function drawLinks(links: TileLink[]) {
  const c = document.getElementById('linecanvas') as HTMLCanvasElement | null;
  if (!c) {
    return;
  }
  const ctx = c.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, c.width, c.height);
  links.forEach((link) => {
    const fromTile = document.getElementById(`tile_${link.from}`);
    const toTile = document.getElementById(`tile_${link.to}`);
    if (fromTile && toTile) {
      ctx.beginPath();
      ctx.moveTo(fromTile?.offsetLeft + link.fromOffsetX, fromTile?.offsetTop + link.fromOffsetY);
      ctx.lineTo(toTile?.offsetLeft + link.toOffsetX, toTile?.offsetTop + link.toOffsetY);
      ctx.strokeStyle = seededRandomColor(`${link.from} + ${link.to}`);
      ctx.lineWidth = 5;
      ctx.shadowColor = 'gray';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.stroke();
      ctx.closePath();
    }
  });
}

export const fuseOptions = {
  keys: ['name', 'notes'],
  findAllMatches: true,
  threshold: 0.7,
  ignoreLocation: true,
  useExtendedSearch: true,
};
