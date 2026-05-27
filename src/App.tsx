import { Dialog, Transition } from '@headlessui/react';
import {
  ArrowDownTrayIcon,
  CheckIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PencilIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  SunIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import axios from 'axios';
import Fuse, { type FuseResult } from 'fuse.js';
import { debounce, uniqWith } from 'lodash';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Dropzone from 'react-dropzone';
import { toast, ToastContainer } from 'react-toastify';
import { Button } from './Button';
import { appConfig } from './config';
import { AxisLabelMode, db, GameMap, MapTile, TileAnnotation, TileMarker, TilePicture } from './db';
import { configuredScreenshotPresets, getScreenshotPreset } from './presets';
import { useLocalStorageState } from './state';
import {
  annotationPath,
  cleanDetectedText,
  drawImageIntoRect,
  drawLinks,
  formatAxisLabel,
  fuseOptions,
  getObjectFit,
  getTileImage,
  loadImage,
  processImageFile,
  tileDisplayName,
} from './utils';

interface TempLink {
  tile: number;
  offsetX: number;
  offsetY: number;
}

interface GridState {
  rows: Array<Array<MapTile | null>>;
  minX: number;
  minY: number;
  columns: number;
  rowCount: number;
}

interface ExportOptions {
  labels: boolean;
  annotations: boolean;
  markers: boolean;
  links: boolean;
  emptyCells: boolean;
  darkBackground: boolean;
}

type ColorTheme = 'light' | 'dark';
type ImagePasteHandler = (files: File[]) => Promise<void>;
type AnnotationTool = 'none' | 'draw' | 'marker';

const DEFAULT_TILE_WIDTH = 320;
const DEFAULT_TILE_HEIGHT = 180;
const markerPresets = [
  { type: 'pin', label: 'PIN', color: '#ef4444' },
  { type: 'star', label: 'STAR', color: '#f59e0b' },
  { type: 'warn', label: 'WARN', color: '#eab308' },
  { type: 'check', label: 'OK', color: '#22c55e' },
  { type: 'key', label: 'KEY', color: '#38bdf8' },
  { type: 'door', label: 'DOOR', color: '#a78bfa' },
  { type: 'loot', label: 'LOOT', color: '#fb7185' },
] as const;

const defaultExportOptions: ExportOptions = {
  labels: true,
  annotations: true,
  markers: true,
  links: true,
  emptyCells: true,
  darkBackground: false,
};

function createGrid(tiles: MapTile[]): GridState {
  const minX = tiles.length ? Math.min(...tiles.map((tile) => tile.x)) : 0;
  const minY = tiles.length ? Math.min(...tiles.map((tile) => tile.y)) : 0;
  const maxX = tiles.length ? Math.max(...tiles.map((tile) => tile.x)) : 0;
  const maxY = tiles.length ? Math.max(...tiles.map((tile) => tile.y)) : 0;
  const columns = maxX - minX + 1;
  const rowCount = maxY - minY + 1;
  const rows = Array.from({ length: rowCount }, () => Array<MapTile | null>(columns).fill(null));

  tiles.forEach((tile) => {
    rows[tile.y - minY][tile.x - minX] = tile;
  });

  return { rows, minX, minY, columns, rowCount };
}

function getCurrentMap(maps: GameMap[], activeMap: number): GameMap | undefined {
  return maps.find((map) => map.id === activeMap) ?? maps[0];
}

function renderMarkerIcon(type: string, size: number) {
  if (type === 'star') {
    const points = Array.from({ length: 10 }, (_value, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 5;
      const radius = index % 2 === 0 ? size : size * 0.45;
      return `${Math.cos(angle) * radius},${Math.sin(angle) * radius}`;
    }).join(' ');
    return <polygon points={points} fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />;
  }
  if (type === 'warn') {
    return (
      <path
        d={`M 0 ${-size} L ${size * 0.9} ${size * 0.8} L ${-size * 0.9} ${size * 0.8} Z M 0 ${-size * 0.35} L 0 ${size * 0.25} M 0 ${size * 0.55} L 0 ${size * 0.56}`}
        fill="none"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  if (type === 'check') {
    return (
      <path
        d={`M ${-size * 0.8} 0 L ${-size * 0.25} ${size * 0.55} L ${size * 0.85} ${-size * 0.75}`}
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  if (type === 'key') {
    return (
      <path
        d={`M ${-size * 0.85} 0 A ${size * 0.35} ${size * 0.35} 0 1 0 ${-size * 0.15} 0 L ${size * 0.85} 0 M ${size * 0.35} 0 L ${size * 0.35} ${size * 0.45} M ${size * 0.65} 0 L ${size * 0.65} ${size * 0.35}`}
        fill="none"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  if (type === 'door') {
    return (
      <path
        d={`M ${-size * 0.65} ${size * 0.85} L ${-size * 0.65} ${-size * 0.85} L ${size * 0.6} ${-size * 0.7} L ${size * 0.6} ${size * 0.85} Z M ${size * 0.25} 0 L ${size * 0.3} 0`}
        fill="none"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  if (type === 'loot') {
    return (
      <path
        d={`M 0 ${-size * 0.9} L ${size * 0.85} 0 L 0 ${size * 0.9} L ${-size * 0.85} 0 Z M ${-size * 0.45} 0 L ${size * 0.45} 0`}
        fill="none"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  return (
    <path
      d={`M 0 ${-size * 0.95} C ${size * 0.7} ${-size * 0.95} ${size * 0.95} ${-size * 0.25} ${size * 0.45} ${size * 0.25} L 0 ${size * 0.95} L ${-size * 0.45} ${size * 0.25} C ${-size * 0.95} ${-size * 0.25} ${-size * 0.7} ${-size * 0.95} 0 ${-size * 0.95} Z M 0 ${-size * 0.35} L 0 ${-size * 0.34}`}
      fill="none"
      stroke="#fff"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

const App = () => {
  const [maps, setMaps] = useState<GameMap[]>([]);
  const [allNotes, setAllNotes] = useState<MapTile[]>([]);
  const [grid, setGrid] = useState<GridState>(() => createGrid([]));
  const [activeMap, setActiveMap] = useLocalStorageState('activemap', -1);
  const [screenshotPresetId, setScreenshotPresetId] = useLocalStorageState('screenshotPreset', 0);
  const [colorTheme, setColorTheme] = useLocalStorageState<ColorTheme>('colorTheme', 'light');
  const [mapLoading, setMapLoading] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [tempLink, setTempLink] = useState<TempLink>();
  const [searchResults, setSearchResults] = useState<FuseResult<MapTile>[]>([]);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [unsolvedTiles, setUnsolvedTiles] = useState<MapTile[]>([]);
  const [activeTile, setActiveTile] = useState<MapTile | null>(null);
  const [tilePictures, setTilePictures] = useState<TilePicture[]>([]);
  const [tileAnnotations, setTileAnnotations] = useState<TileAnnotation[]>([]);
  const [tileMarkers, setTileMarkers] = useState<TileMarker[]>([]);
  const [mapAnnotations, setMapAnnotations] = useState<TileAnnotation[]>([]);
  const [mapMarkers, setMapMarkers] = useState<TileMarker[]>([]);
  const [isTileDialogOpen, setIsTileDialogOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportOptions>(defaultExportOptions);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('none');
  const [activeMarkerType, setActiveMarkerType] = useState<(typeof markerPresets)[number]['type']>('pin');
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null);
  const [draggingMarkerId, setDraggingMarkerId] = useState<number | null>(null);
  const [draftStroke, setDraftStroke] = useState<TileAnnotation['points']>([]);
  const [mapPan, setMapPan] = useState({ x: 220, y: 160 });
  const [mapZoom, setMapZoom] = useState(1);
  const [isMapPanning, setIsMapPanning] = useState(false);
  const mapPanStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const mapPanMovedRef = useRef(false);
  const suppressTileClickRef = useRef(false);
  const pasteTargetRef = useRef<ImagePasteHandler | null>(null);
  const drawingRef = useRef(false);

  const currentMap = getCurrentMap(maps, activeMap);
  const selectedPreset = getScreenshotPreset(screenshotPresetId);
  const tileWidth = currentMap?.tileWidth ?? selectedPreset.tileWidth ?? DEFAULT_TILE_WIDTH;
  const tileHeight = currentMap?.tileHeight ?? selectedPreset.tileHeight ?? DEFAULT_TILE_HEIGHT;
  const columnLabelMode: AxisLabelMode = currentMap?.columnLabelMode ?? 'letters';
  const rowLabelMode: AxisLabelMode = currentMap?.rowLabelMode ?? 'numbers';
  const isDarkMode = colorTheme === 'dark';

  function clampMapZoom(value: number): number {
    return Math.min(4, Math.max(0.15, value));
  }

  function setBoardZoom(nextZoom: number, origin?: { x: number; y: number }) {
    const zoom = clampMapZoom(nextZoom);
    if (!origin) {
      setMapZoom(zoom);
      return;
    }

    const boardX = (origin.x - mapPan.x) / mapZoom;
    const boardY = (origin.y - mapPan.y) / mapZoom;
    setMapPan({
      x: origin.x - boardX * zoom,
      y: origin.y - boardY * zoom,
    });
    setMapZoom(zoom);
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.style.colorScheme = colorTheme;
  }, [colorTheme, isDarkMode]);

  const refreshMap = useCallback(
    async (requestedMapId?: number | null) => {
      setMapLoading(true);
      const dbMaps = await db.maps.toArray();
      setMaps(dbMaps);

      if (dbMaps.length === 0) {
        setGrid(createGrid([]));
        setAllNotes([]);
        setMapLoading(false);
        return;
      }

      const targetMapId = requestedMapId ?? (activeMap !== -1 ? activeMap : dbMaps[0].id!);
      const notes: MapTile[] = [];
      const mapTiles: MapTile[] = [];

      await db.tiles.each((tile) => {
        notes.push({
          id: tile.id,
          map: tile.map,
          name: tile.name,
          notes: tile.notes,
          x: tile.x,
          y: tile.y,
          unsolved: tile.unsolved,
        });
        if (tile.map === targetMapId) {
          mapTiles.push(tile);
        }
      });

      if (mapTiles.length === 0) {
        const tileId = await db.tiles.add({ map: targetMapId, x: 0, y: 0 });
        mapTiles.push({ id: tileId, map: targetMapId, x: 0, y: 0 });
      }

      setAllNotes(notes);
      setGrid(createGrid(mapTiles));
      const tileIds = mapTiles.map((tile) => tile.id!).filter(Boolean);
      if (tileIds.length > 0) {
        setMapAnnotations(await db.tileAnnotations.where('tileId').anyOf(tileIds).toArray());
        setMapMarkers(await db.tileMarkers.where('tileId').anyOf(tileIds).toArray());
      } else {
        setMapAnnotations([]);
        setMapMarkers([]);
      }
      if (activeMap === -1) {
        setActiveMap(targetMapId);
      }
      setMapLoading(false);
    },
    [activeMap, setActiveMap]
  );

  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener('contextmenu', preventContextMenu);
    refreshMap();

    return () => {
      window.removeEventListener('contextmenu', preventContextMenu);
    };
  }, [refreshMap]);

  const refreshLinks = useCallback(async () => {
    const targetMap = currentMap?.id;
    if (!targetMap) {
      return;
    }
    const links = await db.tilelinks.where('map').equals(targetMap).toArray();
    drawLinks(links);
  }, [currentMap?.id]);

  useEffect(() => {
    if (showLinks) {
      refreshLinks();
      return;
    }

    const canvas = document.getElementById('linecanvas') as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [refreshLinks, showLinks, grid, tileWidth, tileHeight]);

  async function updateCurrentMap(updates: Partial<GameMap>) {
    if (!currentMap?.id) {
      return;
    }
    await db.maps.update(currentMap.id, updates);
    const updatedMaps = await db.maps.toArray();
    setMaps(updatedMaps);
  }

  async function applyAutoTileSize(imageWidth: number, imageHeight: number) {
    if (!currentMap?.id || !getScreenshotPreset(screenshotPresetId).autoDetect) {
      return;
    }
    const hasImage = grid.rows.flat().some((tile) => getTileImage(tile));
    if (hasImage) {
      return;
    }

    await updateCurrentMap({ tileWidth: imageWidth, tileHeight: imageHeight });
  }

  const processDroppedImage = useCallback(
    async (acceptedFiles: File[]) => {
      const processedImage = await processImageFile(acceptedFiles, screenshotPresetId);
      if (!processedImage) {
        return;
      }
      if (processedImage.presetId !== screenshotPresetId) {
        setScreenshotPresetId(processedImage.presetId);
      }
      await applyAutoTileSize(processedImage.naturalWidth, processedImage.naturalHeight);
      return processedImage;
    },
    [applyAutoTileSize, screenshotPresetId, setScreenshotPresetId]
  );

  const getPasteProps = useCallback((handler: ImagePasteHandler) => {
    return {
      onMouseEnter: () => {
        pasteTargetRef.current = handler;
      },
      onMouseLeave: () => {
        if (pasteTargetRef.current === handler) {
          pasteTargetRef.current = null;
        }
      },
      title: 'Drop an image or paste one with Ctrl+V',
    };
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const handler = pasteTargetRef.current;
      if (!handler) {
        return;
      }

      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        activeElement?.getAttribute('contenteditable') === 'true'
      ) {
        return;
      }

      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (files.length === 0) {
        return;
      }

      event.preventDefault();
      handler(files).catch(() => {
        toast.error('Could not paste image');
      });
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  async function addMap() {
    const name = prompt('Enter map name');
    if (!name) {
      return;
    }
    const preset = getScreenshotPreset(screenshotPresetId);
    const newMapId = await db.maps.add({
      name,
      tileWidth: preset.tileWidth,
      tileHeight: preset.tileHeight,
      columnLabelMode: 'letters',
      rowLabelMode: 'numbers',
    });
    await db.tiles.add({ map: newMapId, x: 0, y: 0 });
    setActiveMap(newMapId);
    await refreshMap(newMapId);
  }

  async function deleteMap() {
    if (!currentMap?.id || !confirm('Are you sure you want to delete the selected map?')) {
      return;
    }

    const mapTiles = await db.tiles.where('map').equals(currentMap.id).toArray();
    const tileIds = mapTiles.map((tile) => tile.id!).filter(Boolean);
    if (tileIds.length > 0) {
      await db.tilepics.where('tileId').anyOf(tileIds).delete();
      await db.tileAnnotations.where('tileId').anyOf(tileIds).delete();
      await db.tileMarkers.where('tileId').anyOf(tileIds).delete();
    }
    await db.tilelinks.where('map').equals(currentMap.id).delete();
    await db.tiles.bulkDelete(tileIds);
    await db.maps.delete(currentMap.id);
    const nextMaps = await db.maps.toArray();
    setActiveMap(nextMaps[0]?.id ?? -1);
    await refreshMap(nextMaps[0]?.id);
  }

  async function renameMap() {
    if (!currentMap?.id) {
      return;
    }
    const newName = prompt('Insert new name for this map', currentMap.name);
    if (!newName) {
      return;
    }
    await updateCurrentMap({ name: newName });
    toast.info('Map name updated');
  }

  async function toggleColumnLabelMode() {
    await updateCurrentMap({ columnLabelMode: columnLabelMode === 'letters' ? 'numbers' : 'letters' });
  }

  async function toggleRowLabelMode() {
    await updateCurrentMap({ rowLabelMode: rowLabelMode === 'numbers' ? 'letters' : 'numbers' });
  }

  async function ensureTileAt(x: number, y: number): Promise<MapTile> {
    if (!currentMap?.id) {
      throw new Error('No active map');
    }
    const existing = await db.tiles
      .where('map')
      .equals(currentMap.id)
      .filter((tile) => tile.x === x && tile.y === y)
      .first();
    if (existing) {
      return existing;
    }
    const tileId = await db.tiles.add({ map: currentMap.id, x, y });
    const tile = { id: tileId, map: currentMap.id, x, y };
    await refreshMap(currentMap.id);
    return tile;
  }

  async function setTileImage(tile: MapTile | null, x: number, y: number, acceptedFiles: File[]) {
    const processed = await processDroppedImage(acceptedFiles);
    if (!processed) {
      return;
    }

    const targetTile = tile ?? (await ensureTileAt(x, y));
    await updateCurrentMap({ tileWidth: processed.naturalWidth, tileHeight: processed.naturalHeight });
    const updates: Partial<MapTile> = {
      img: processed.imgSrc,
      originalImg: processed.imgSrc,
      naturalWidth: processed.naturalWidth,
      naturalHeight: processed.naturalHeight,
      crop: processed.crop,
      fit: processed.fit,
    };
    await db.tiles.update(targetTile.id!, updates);
    await refreshMap(targetTile.map);
    if (activeTile?.id === targetTile.id) {
      setActiveTile({ ...targetTile, ...updates });
    }
    toast.info('Tile image updated');
  }

  async function openTile(tile: MapTile) {
    const dbTile = tile.id ? (await db.tiles.get(tile.id)) ?? tile : tile;
    setActiveTile(dbTile);
    setTilePictures(tile.id ? await db.tilepics.where('tileId').equals(tile.id).toArray() : []);
    setTileAnnotations(tile.id ? await db.tileAnnotations.where('tileId').equals(tile.id).toArray() : []);
    setTileMarkers(tile.id ? await db.tileMarkers.where('tileId').equals(tile.id).toArray() : []);
    setDraftStroke([]);
    setAnnotationTool('none');
    setIsTileDialogOpen(true);
  }

  async function saveActiveTile(updates: Partial<MapTile>) {
    if (!activeTile?.id) {
      return;
    }
    await db.tiles.update(activeTile.id, updates);
    const updatedTile = { ...activeTile, ...updates };
    setActiveTile(updatedTile);
    await refreshMap(activeTile.map);
    toast.info('Saved');
  }

  async function deleteTile() {
    if (!activeTile?.id || !confirm('Are you sure?')) {
      return;
    }
    await db.tilepics.where('tileId').equals(activeTile.id).delete();
    await db.tileAnnotations.where('tileId').equals(activeTile.id).delete();
    await db.tileMarkers.where('tileId').equals(activeTile.id).delete();
    await db.tilelinks.where('from').equals(activeTile.id).or('to').equals(activeTile.id).delete();
    await db.tiles.delete(activeTile.id);
    setIsTileDialogOpen(false);
    await refreshMap(activeTile.map);
  }

  async function deleteLinks() {
    if (!activeTile?.id || !confirm('Are you sure you want to delete links to and from this tile?')) {
      return;
    }
    await db.tilelinks.where('from').equals(activeTile.id).or('to').equals(activeTile.id).delete();
    await refreshLinks();
    toast.info('Links deleted');
  }

  async function addTileNote(acceptedFiles: File[]) {
    if (!activeTile?.id) {
      return;
    }
    const processed = await processDroppedImage(acceptedFiles);
    if (!processed) {
      return;
    }

    if (import.meta.env.VITE_API_KEY) {
      const onlyBase64 = processed.imgSrc.slice(processed.imgSrc.indexOf(',') + 1);
      toast.info('Detecting text');
      const result = await axios.post(
        'https://vision.googleapis.com/v1/images:annotate',
        {
          requests: [
            {
              image: { content: onlyBase64 },
              features: [{ type: 'TEXT_DETECTION' }],
              imageContext: { languageHints: ['en'] },
            },
          ],
        },
        { params: { key: import.meta.env.VITE_API_KEY } }
      );
      const detectedText = cleanDetectedText(result.data.responses[0].fullTextAnnotation?.text, screenshotPresetId);
      await saveActiveTile({ notes: `${activeTile.notes ? `${activeTile.notes}\n\n` : ''}${detectedText}` });
    }

    const id = await db.tilepics.add({ tileId: activeTile.id, img: processed.imgSrc });
    setTilePictures([...tilePictures, { id, tileId: activeTile.id, img: processed.imgSrc }]);
  }

  async function onMapChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextMap = Number(event.target.value);
    setActiveMap(nextMap);
    setShowLinks(false);
    setHighlight(null);
    setUnsolvedTiles([]);
    await refreshMap(nextMap);
  }

  async function onUnsolved() {
    if (unsolvedTiles.length === 0) {
      setUnsolvedTiles(await db.tiles.where('unsolved').equals(1).toArray());
      return;
    }
    setUnsolvedTiles([]);
  }

  async function onTileLink(tile: MapTile | null, event: React.MouseEvent) {
    if (!linkMode || !tile?.id || !currentMap?.id) {
      setLinkMode(false);
      setTempLink(undefined);
      return;
    }

    if (!tempLink) {
      setTempLink({ tile: tile.id, offsetX: event.nativeEvent.offsetX, offsetY: event.nativeEvent.offsetY });
      return;
    }

    await db.tilelinks.add({
      from: tempLink.tile,
      map: currentMap.id,
      to: tile.id,
      fromOffsetX: tempLink.offsetX,
      fromOffsetY: tempLink.offsetY,
      toOffsetX: event.nativeEvent.offsetX,
      toOffsetY: event.nativeEvent.offsetY,
    });
    toast.info('Link added');
    setTempLink(undefined);
    setLinkMode(false);
    await refreshLinks();
  }

  function startMapPan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest('button,input,select,textarea,[role="dialog"]')) {
      return;
    }
    mapPanMovedRef.current = false;
    mapPanStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: mapPan.x,
      panY: mapPan.y,
    };
    setIsMapPanning(true);
  }

  function moveMapPan(event: React.PointerEvent<HTMLDivElement>) {
    const start = mapPanStartRef.current;
    if (!start) {
      return;
    }
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      mapPanMovedRef.current = true;
    }
    setMapPan({ x: start.panX + deltaX, y: start.panY + deltaY });
  }

  function stopMapPan() {
    if (mapPanMovedRef.current) {
      suppressTileClickRef.current = true;
      window.setTimeout(() => {
        suppressTileClickRef.current = false;
      }, 0);
    }
    mapPanStartRef.current = null;
    setIsMapPanning(false);
  }

  function onMapWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const origin = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    setBoardZoom(mapZoom * zoomFactor, origin);
  }

  async function pasteIntoMainTile(tile: MapTile | null, x: number, y: number, files: File[]) {
    await setTileImage(tile, x, y, files);
  }

  const fuse = useMemo(() => new Fuse(allNotes, fuseOptions), [allNotes]);
  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        if (value.length <= 3) {
          setSearchResults([]);
          return;
        }
        const results = uniqWith(
          fuse.search(value),
          (a, b) => a.item.name === b.item.name && a.item.notes === b.item.notes
        );
        setHighlight(null);
        setSearchResults(results);
      }, 200),
    [fuse]
  );

  function screenToNormalizedPoint(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  async function addMarker(event: React.PointerEvent<SVGSVGElement>) {
    if (!activeTile?.id) {
      return;
    }
    const point = screenToNormalizedPoint(event);
    const preset = markerPresets.find((marker) => marker.type === activeMarkerType) ?? markerPresets[0];
    const id = await db.tileMarkers.add({
      tileId: activeTile.id,
      type: preset.type,
      label: preset.label,
      color: preset.color,
      x: point.x,
      y: point.y,
    });
    const marker = { id, tileId: activeTile.id, type: preset.type, label: preset.label, color: preset.color, x: point.x, y: point.y };
    setTileMarkers([...tileMarkers, marker]);
    setMapMarkers([...mapMarkers, marker]);
    setSelectedMarkerId(id);
  }

  async function deleteSelectedMarker() {
    if (!selectedMarkerId) {
      return;
    }
    await db.tileMarkers.delete(selectedMarkerId);
    setTileMarkers(tileMarkers.filter((marker) => marker.id !== selectedMarkerId));
    setMapMarkers(mapMarkers.filter((marker) => marker.id !== selectedMarkerId));
    setSelectedMarkerId(null);
  }

  async function moveMarker(markerId: number, point: { x: number; y: number }) {
    await db.tileMarkers.update(markerId, point);
    setTileMarkers(tileMarkers.map((marker) => (marker.id === markerId ? { ...marker, ...point } : marker)));
    setMapMarkers(mapMarkers.map((marker) => (marker.id === markerId ? { ...marker, ...point } : marker)));
  }

  function moveMarkerInState(markerId: number, point: { x: number; y: number }) {
    setTileMarkers((markers) => markers.map((marker) => (marker.id === markerId ? { ...marker, ...point } : marker)));
    setMapMarkers((markers) => markers.map((marker) => (marker.id === markerId ? { ...marker, ...point } : marker)));
  }

  async function finishStroke() {
    drawingRef.current = false;
    if (!activeTile?.id || draftStroke.length < 2) {
      setDraftStroke([]);
      return;
    }
    const stroke: Omit<TileAnnotation, 'id'> = {
      tileId: activeTile.id,
      color: '#38bdf8',
      width: 4,
      points: draftStroke,
    };
    const id = await db.tileAnnotations.add(stroke);
    const annotation = { ...stroke, id };
    setTileAnnotations([...tileAnnotations, annotation]);
    setMapAnnotations([...mapAnnotations, annotation]);
    setDraftStroke([]);
  }

  async function exportMap() {
    if (!currentMap?.id) {
      return;
    }
    const tiles = grid.rows.flat().filter((tile): tile is MapTile => tile !== null);
    const canvas = document.createElement('canvas');
    canvas.width = grid.columns * tileWidth;
    canvas.height = grid.rowCount * tileHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.fillStyle = exportOptions.darkBackground ? '#020617' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const tile of tiles) {
      const imageSrc = getTileImage(tile);
      const dx = (tile.x - grid.minX) * tileWidth;
      const dy = (tile.y - grid.minY) * tileHeight;
      if (imageSrc) {
        const img = await loadImage(imageSrc);
        drawImageIntoRect(ctx, img, dx, dy, tileWidth, tileHeight, getObjectFit(tile), tile.crop);
      } else if (exportOptions.emptyCells) {
        ctx.strokeStyle = exportOptions.darkBackground ? '#334155' : '#cbd5e1';
        ctx.strokeRect(dx, dy, tileWidth, tileHeight);
      }
      if (exportOptions.labels) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
        ctx.fillRect(dx + 6, dy + 6, 54, 24);
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px sans-serif';
        ctx.fillText(tileDisplayName(tile, grid.minX, grid.minY, columnLabelMode, rowLabelMode), dx + 12, dy + 23);
      }
      if (exportOptions.annotations) {
        const annotations = await db.tileAnnotations.where('tileId').equals(tile.id!).toArray();
        annotations.forEach((annotation) => {
          ctx.beginPath();
          annotation.points.forEach((point, index) => {
            const x = dx + point.x * tileWidth;
            const y = dy + point.y * tileHeight;
            if (index === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          ctx.strokeStyle = annotation.color;
          ctx.lineWidth = annotation.width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
        });
      }
      if (exportOptions.markers) {
        const markers = await db.tileMarkers.where('tileId').equals(tile.id!).toArray();
        markers.forEach((marker) => {
          const x = dx + marker.x * tileWidth;
          const y = dy + marker.y * tileHeight;
          ctx.fillStyle = marker.color ?? '#ef4444';
          ctx.beginPath();
          ctx.arc(x, y, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          if (marker.type === 'check') {
            ctx.beginPath();
            ctx.moveTo(x - 7, y);
            ctx.lineTo(x - 2, y + 6);
            ctx.lineTo(x + 8, y - 7);
            ctx.stroke();
          } else if (marker.type === 'warn') {
            ctx.beginPath();
            ctx.moveTo(x, y - 8);
            ctx.lineTo(x + 8, y + 7);
            ctx.lineTo(x - 8, y + 7);
            ctx.closePath();
            ctx.stroke();
          } else if (marker.type === 'star') {
            ctx.beginPath();
            for (let index = 0; index < 10; index++) {
              const angle = -Math.PI / 2 + (index * Math.PI) / 5;
              const radius = index % 2 === 0 ? 9 : 4;
              const px = x + Math.cos(angle) * radius;
              const py = y + Math.sin(angle) * radius;
              if (index === 0) {
                ctx.moveTo(px, py);
              } else {
                ctx.lineTo(px, py);
              }
            }
            ctx.closePath();
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(x - 7, y);
            ctx.lineTo(x + 7, y);
            ctx.moveTo(x, y - 7);
            ctx.lineTo(x, y + 7);
            ctx.stroke();
          }
        });
      }
    }

    const linkCanvas = document.getElementById('linecanvas') as HTMLCanvasElement | null;
    if (exportOptions.links && linkCanvas) {
      ctx.drawImage(linkCanvas, 0, 0);
    }

    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png');
    anchor.download = `${currentMap.name.replaceAll(/\W+/g, '-').toLowerCase()}-map.png`;
    anchor.click();
    setIsExportOpen(false);
  }

  function renderTileOverlay(tile: MapTile, compact = false) {
    const annotations = mapAnnotations.filter((annotation) => annotation.tileId === tile.id);
    const markers = mapMarkers.filter((marker) => marker.tileId === tile.id);

    return (
      <svg className="absolute inset-0 pointer-events-none" viewBox={`0 0 ${tileWidth} ${tileHeight}`} aria-hidden="true">
        {annotations.map((annotation) => (
            <path
              key={`annotation_${annotation.id}`}
              d={annotationPath(annotation.points, tileWidth, tileHeight)}
              fill="none"
              stroke={annotation.color}
              strokeWidth={annotation.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        {markers.map((marker) => (
            <g key={`marker_${marker.id}`} transform={`translate(${marker.x * tileWidth} ${marker.y * tileHeight})`}>
              <circle r={compact ? 10 : 13} fill={marker.color ?? '#ef4444'} />
              {renderMarkerIcon(marker.type, compact ? 8 : 10)}
            </g>
          ))}
      </svg>
    );
  }

  const activeTileLabel = activeTile
    ? tileDisplayName(activeTile, grid.minX, grid.minY, columnLabelMode, rowLabelMode)
    : '';

  return (
    <div className="h-screen w-screen grid place-items-center absolute overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="shadow bg-white dark:bg-slate-900 fixed top-0 left-0 flex w-full flex-row justify-between items-start p-2 z-[60]">
        <div className="flex flex-row items-center flex-wrap gap-2">
          <h1 className="mx-2 text-lg font-bold tracking-normal flex items-center">
            <span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-sm bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 text-sm">
              GT
            </span>
            {appConfig.appName}
          </h1>
          <button
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 border rounded-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setColorTheme(isDarkMode ? 'light' : 'dark')}
          >
            {isDarkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
          </button>
          <button
            className="p-2 border rounded-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            onClick={() => {
              alert(
                'Create a map, then click empty cells to create blank rooms. Drop or paste screenshots onto a tile to load images. Auto mode keeps original image files and adapts the tile shape from the first screenshot. Use the tile dialog for notes, markers, drawing, and image fit.'
              );
            }}
          >
            <QuestionMarkCircleIcon className="w-5 h-5" />
          </button>
          {currentMap?.id && (
            <button className="p-2 border rounded-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition" onClick={deleteMap}>
              <TrashIcon className="w-5 h-5" />
            </button>
          )}
          {maps.length === 0 && (
            <>
              <span className="text-sm">Screenshot preset:</span>
              <select className="text-sm" value={screenshotPresetId} onChange={(event) => setScreenshotPresetId(Number(event.target.value))}>
                {configuredScreenshotPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </>
          )}
          {currentMap?.id && (
            <button className="p-2 border rounded-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition" onClick={renameMap}>
              <PencilIcon className="w-5 h-5" />
            </button>
          )}
          {maps.length > 0 && (
            <select value={activeMap} className="text-sm" onChange={onMapChange}>
              {maps.map((map) => (
                <option key={`map_${map.id}`} value={map.id}>
                  {map.name}
                </option>
              ))}
            </select>
          )}
          <button className="p-2 border rounded-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition" onClick={addMap}>
            <PlusIcon className="w-5 h-5" />
          </button>
          {currentMap?.id && (
            <>
              <button
                className={`border p-2 hover:shadow rounded-sm flex flex-row items-center ${unsolvedTiles.length !== 0 ? 'bg-blue-500 text-white' : ''}`}
                onClick={onUnsolved}
              >
                {unsolvedTiles.length === 0 ? 'Show unsolved' : 'Hide unsolved'}
              </button>
              <button
                className={`border p-2 hover:shadow rounded-sm flex flex-row items-center ${linkMode ? 'bg-blue-500 text-white' : ''}`}
                onClick={() => setLinkMode(!linkMode)}
              >
                <LinkIcon className="w-5 h-5 mr-2" /> Link
              </button>
              <button
                className={`border p-2 hover:shadow rounded-sm flex flex-row items-center ${showLinks ? 'bg-blue-500 text-white' : ''}`}
                onClick={() => setShowLinks(!showLinks)}
              >
                {showLinks ? 'Hide links' : 'Show links'}
              </button>
              <button className="border p-2 hover:shadow rounded-sm flex flex-row items-center" onClick={() => setIsExportOpen(true)}>
                <ArrowDownTrayIcon className="w-5 h-5 mr-2" /> Download
              </button>
            </>
          )}
        </div>
        {allNotes.length > 0 && (
          <div className="flex flex-col items-end relative">
            <div className="flex items-center">
              <MagnifyingGlassIcon className="w-5 h-5 mr-2" />
              <input
                className="w-72"
                placeholder="Search notes"
                onChange={(event) => debouncedSearch(event.target.value)}
              />
            </div>
            {searchResults.length > 0 && (
              <div className="absolute top-11 right-0 w-96 bg-white dark:bg-slate-900 shadow max-h-96 overflow-y-auto z-[90]">
                {searchResults.map((result) => (
                  <button
                    key={`search_${result.item.id}`}
                    className="block w-full text-left p-2 border-b hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={async () => {
                      setActiveMap(result.item.map);
                      await refreshMap(result.item.map);
                      setHighlight(result.item.id ?? null);
                      setSearchResults([]);
                    }}
                  >
                    <strong>{result.item.name || tileDisplayName(result.item, grid.minX, grid.minY, columnLabelMode, rowLabelMode)}</strong>
                    <div className="text-xs line-clamp-2">{result.item.notes}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {mapLoading && <span className="fixed top-20 z-[70] bg-white dark:bg-slate-900 px-3 py-2 shadow">Loading...</span>}

      {maps.length === 0 ? (
        <div className="grid place-items-center gap-3 text-center">
          <h2 className="text-2xl font-bold">No maps yet</h2>
          <button className="p-3 border rounded-sm hover:bg-slate-100 dark:hover:bg-slate-800" onClick={addMap}>
            Create map
          </button>
        </div>
      ) : (
        <div
          className={`absolute inset-0 overflow-hidden pt-24 ${isMapPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={startMapPan}
          onPointerMove={moveMapPan}
          onPointerUp={stopMapPan}
          onPointerCancel={stopMapPan}
          onPointerLeave={stopMapPan}
          onWheel={onMapWheel}
        >
          <div className="fixed bottom-6 right-6 z-[70] flex items-center overflow-hidden rounded-sm border bg-white shadow dark:bg-slate-900">
            <button
              className="h-11 w-11 text-xl font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Zoom out"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setBoardZoom(mapZoom / 1.2)}
            >
              -
            </button>
            <button
              className="h-11 min-w-16 px-3 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Reset zoom"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setBoardZoom(1)}
            >
              {Math.round(mapZoom * 100)}%
            </button>
            <button
              className="h-11 w-11 text-xl font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Zoom in"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setBoardZoom(mapZoom * 1.2)}
            >
              +
            </button>
          </div>
          <div
            className="relative select-none"
            style={{
              transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})`,
              transformOrigin: 'top left',
              width: `${grid.columns * tileWidth}px`,
              height: `${grid.rowCount * tileHeight}px`,
            }}
          >
            <div
              className="relative"
              style={{
                width: `${grid.columns * tileWidth}px`,
                height: `${grid.rowCount * tileHeight}px`,
              }}
            >
              <canvas
                id="linecanvas"
                className="absolute z-40 pointer-events-none"
                width={grid.columns * tileWidth}
                height={grid.rowCount * tileHeight}
              />
              {grid.rows.map((row, yIndex) =>
                row.map((tile, xIndex) => {
                  const x = grid.minX + xIndex;
                  const y = grid.minY + yIndex;
                  const imageSrc = getTileImage(tile);
                  return (
                    <div
                      id={tile?.id ? `tile_${tile.id}` : undefined}
                      key={`${x}-${y}`}
                      className={`absolute bg-white dark:bg-slate-900 ${
                        imageSrc ? '' : 'border border-slate-300 dark:border-slate-700'
                      } ${
                        highlight === tile?.id ? 'outline outline-8 outline-pink-500 z-10' : ''
                      } ${linkMode ? 'cursor-crosshair' : 'cursor-pointer'}`}
                      style={{
                        height: `${tileHeight}px`,
                        width: `${tileWidth}px`,
                        top: `${yIndex * tileHeight}px`,
                        left: `${xIndex * tileWidth}px`,
                      }}
                      onClick={async (event) => {
                        if (suppressTileClickRef.current) {
                          return;
                        }
                        if (linkMode) {
                          await onTileLink(tile, event);
                          return;
                        }
                        const target = tile ?? (await ensureTileAt(x, y));
                        await openTile(target);
                      }}
                    >
                      {tile?.unsolved === 1 && (
                        <QuestionMarkCircleIcon className="w-5 h-5 p-0.5 bg-blue-500 absolute top-0 left-0 z-30 text-white rounded-br-sm" />
                      )}
                      {!imageSrc && (
                        <div
                          className="w-full h-full grid place-items-center hover:bg-slate-50 dark:hover:bg-slate-800 transition text-center"
                          {...getPasteProps((files) => pasteIntoMainTile(tile, x, y, files))}
                        >
                          <span className="text-xs px-4 text-slate-500">Click to edit tile; hover and paste image</span>
                        </div>
                      )}
                      {imageSrc && tile && (
                        <img
                          onContextMenu={(event) => {
                            event.preventDefault();
                            if (highlight === tile.id) {
                              setHighlight(null);
                            }
                            openTile(tile);
                          }}
                          title={`${tile.name ? `${tile.name} ` : ''}${tileDisplayName(tile, grid.minX, grid.minY, columnLabelMode, rowLabelMode)}`}
                          className="w-full h-full z-20 pointer-events-none select-none"
                          style={{ objectFit: getObjectFit(tile) }}
                          src={imageSrc}
                          alt=""
                          draggable={false}
                        />
                      )}
                      {tile && renderTileOverlay(tile, true)}
                      {yIndex === 0 && (
                        <div className="absolute h-16 left-0 -top-16 grid grid-rows-2" style={{ width: `${tileWidth}px` }}>
                          <button
                            className="grid place-items-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-sm text-sm font-bold"
                            title="Toggle column labels between letters and numbers"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleColumnLabelMode().catch(() => toast.error('Could not update column labels'));
                            }}
                          >
                            {formatAxisLabel(xIndex, columnLabelMode)}
                          </button>
                          <button
                            className="grid place-items-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-sm"
                            title="Add empty tile above"
                            onClick={(event) => {
                              event.stopPropagation();
                              ensureTileAt(x, grid.minY - 1).catch(() => toast.error('Could not add tile'));
                            }}
                          >
                            <PlusIcon className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                      {yIndex === grid.rowCount - 1 && (
                        <button
                          className="absolute h-16 left-0 -bottom-16 grid place-items-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-sm"
                          style={{ width: `${tileWidth}px` }}
                          onClick={(event) => {
                            event.stopPropagation();
                            ensureTileAt(x, grid.minY + grid.rowCount).catch(() => toast.error('Could not add tile'));
                          }}
                        >
                          <PlusIcon className="w-5 h-5" />
                        </button>
                      )}
                      {xIndex === 0 && (
                        <div className="absolute w-16 -left-16 top-0 grid grid-cols-2" style={{ height: `${tileHeight}px` }}>
                          <button
                            className="grid place-items-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-sm text-sm font-bold"
                            title="Toggle row labels between numbers and letters"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleRowLabelMode().catch(() => toast.error('Could not update row labels'));
                            }}
                          >
                            {formatAxisLabel(yIndex, rowLabelMode)}
                          </button>
                          <button
                            className="grid place-items-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-sm"
                            title="Add empty tile to the left"
                            onClick={(event) => {
                              event.stopPropagation();
                              ensureTileAt(grid.minX - 1, y).catch(() => toast.error('Could not add tile'));
                            }}
                          >
                            <PlusIcon className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                      {xIndex === grid.columns - 1 && (
                        <button
                          className="absolute w-16 -right-16 top-0 grid place-items-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-sm"
                          style={{ height: `${tileHeight}px` }}
                          onClick={(event) => {
                            event.stopPropagation();
                            ensureTileAt(grid.minX + grid.columns, y).catch(() => toast.error('Could not add tile'));
                          }}
                        >
                          <PlusIcon className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      <Transition appear show={isTileDialogOpen} as={Fragment}>
        <Dialog as="div" className="relative z-[80]" onClose={() => setIsTileDialogOpen(false)}>
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-black/40" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto grid place-items-center">
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-100" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <Dialog.Panel className="w-[min(1400px,96vw)] max-h-[92vh] overflow-y-auto rounded-sm bg-white dark:bg-slate-900 p-6 text-left shadow-xl transition-all">
                {activeTile && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="relative">
                      <span className="absolute right-0 -top-3 text-xs text-slate-500">{activeTileLabel}</span>
                      <label className="mb-2 text-lg font-bold block" htmlFor="name">
                        Name
                      </label>
                      <input
                        id="name"
                        className="mb-4 w-full"
                        type="text"
                        value={activeTile.name ?? ''}
                        onChange={(event) => setActiveTile({ ...activeTile, name: event.target.value })}
                      />
                      <label className="mb-2 block" htmlFor="notes">
                        Notes
                      </label>
                      <textarea
                        id="notes"
                        className="w-full min-h-[280px] mb-3"
                        value={activeTile.notes ?? ''}
                        onChange={(event) => setActiveTile({ ...activeTile, notes: event.target.value })}
                      />
                      <div className="mb-4 flex flex-row flex-wrap gap-3 items-center">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={activeTile.unsolved === 1}
                            onChange={(event) => setActiveTile({ ...activeTile, unsolved: event.target.checked ? 1 : 0 })}
                          />
                          Unsolved
                        </label>
                        {activeTile.naturalWidth && activeTile.naturalHeight && (
                          <button
                            type="button"
                            className="border rounded-sm px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                            onClick={() =>
                              updateCurrentMap({
                                tileWidth: activeTile.naturalWidth,
                                tileHeight: activeTile.naturalHeight,
                              }).catch(() => toast.error('Could not update tile size'))
                            }
                          >
                            Use image size
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() =>
                            saveActiveTile({
                              name: activeTile.name,
                              notes: activeTile.notes,
                              unsolved: activeTile.unsolved,
                            })
                          }
                        >
                          <CheckIcon className="w-5 h-5 mr-2" /> Save
                        </Button>
                        <Button onClick={deleteTile}>
                          <TrashIcon className="w-5 h-5 mr-2" /> Delete tile
                        </Button>
                        <Button onClick={deleteLinks}>
                          <TrashIcon className="w-5 h-5 mr-2" /> Delete links
                        </Button>
                      </div>
                    </div>
                    <div>
                      <div className="mb-3 flex flex-wrap gap-2 items-center">
                        <button
                          className={`border rounded-sm px-3 py-2 ${annotationTool === 'draw' ? 'bg-blue-500 text-white' : ''}`}
                          onClick={() => setAnnotationTool(annotationTool === 'draw' ? 'none' : 'draw')}
                        >
                          Draw
                        </button>
                        <button
                          className={`border rounded-sm px-3 py-2 ${annotationTool === 'marker' ? 'bg-blue-500 text-white' : ''}`}
                          onClick={() => setAnnotationTool(annotationTool === 'marker' ? 'none' : 'marker')}
                        >
                          Marker
                        </button>
                        {markerPresets.map((marker) => (
                          <button
                            key={marker.type}
                            className={`grid h-10 w-10 place-items-center rounded-sm border ${activeMarkerType === marker.type ? 'ring-2 ring-blue-500' : ''}`}
                            style={{ backgroundColor: marker.color, borderColor: marker.color }}
                            title={marker.label}
                            onClick={() => {
                              setActiveMarkerType(marker.type);
                              setAnnotationTool('marker');
                            }}
                          >
                            <svg viewBox="-14 -14 28 28" className="h-6 w-6" aria-hidden="true">
                              {renderMarkerIcon(marker.type, 9)}
                            </svg>
                          </button>
                        ))}
                        <button
                          className="border rounded-sm px-3 py-2 disabled:opacity-40"
                          disabled={!selectedMarkerId}
                          onClick={() => deleteSelectedMarker().catch(() => toast.error('Could not delete marker'))}
                        >
                          Delete marker
                        </button>
                        <button
                          className="border rounded-sm px-3 py-2"
                          onClick={async () => {
                            if (!activeTile.id || !confirm('Clear drawings and markers for this tile?')) {
                              return;
                            }
                            await db.tileAnnotations.where('tileId').equals(activeTile.id).delete();
                            await db.tileMarkers.where('tileId').equals(activeTile.id).delete();
                            setTileAnnotations([]);
                            setTileMarkers([]);
                            setMapAnnotations(mapAnnotations.filter((annotation) => annotation.tileId !== activeTile.id));
                            setMapMarkers(mapMarkers.filter((marker) => marker.tileId !== activeTile.id));
                          }}
                        >
                          Clear
                        </button>
                      </div>
                      <Dropzone noClick={false} onDrop={(files) => setTileImage(activeTile, activeTile.x, activeTile.y, files)}>
                        {({ getRootProps, getInputProps }) => (
                          <div
                            className="group relative w-full aspect-video border bg-slate-100 dark:bg-slate-950 grid place-items-center overflow-hidden cursor-pointer"
                            {...getRootProps(getPasteProps((files) => setTileImage(activeTile, activeTile.x, activeTile.y, files)))}
                          >
                            <input {...getInputProps()} />
                            {getTileImage(activeTile) ? (
                              <img
                                className="absolute inset-0 w-full h-full select-none"
                                style={{ objectFit: getObjectFit(activeTile) }}
                                src={getTileImage(activeTile)}
                                alt=""
                                draggable={false}
                              />
                            ) : (
                              <span className="text-sm text-slate-500">Click, drop, or paste tile image</span>
                            )}
                            {annotationTool === 'none' && (
                              <div className="absolute bottom-3 left-3 rounded-sm bg-slate-950/75 px-3 py-2 text-sm font-medium text-white opacity-0 transition group-hover:opacity-100">
                                Click, drop, or paste image
                              </div>
                            )}
                            <svg
                              className={`absolute inset-0 h-full w-full ${annotationTool === 'none' ? 'pointer-events-none' : ''}`}
                              viewBox="0 0 1 1"
                              preserveAspectRatio="none"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                if (annotationTool === 'marker') {
                                  addMarker(event);
                                  return;
                                }
                                if (annotationTool === 'draw') {
                                  drawingRef.current = true;
                                  setDraftStroke([screenToNormalizedPoint(event)]);
                                }
                              }}
                              onPointerMove={(event) => {
                                if (draggingMarkerId) {
                                  moveMarkerInState(draggingMarkerId, screenToNormalizedPoint(event));
                                  return;
                                }
                                if (annotationTool !== 'draw' || !drawingRef.current) {
                                  return;
                                }
                                setDraftStroke((points) => [...points, screenToNormalizedPoint(event)]);
                              }}
                              onPointerUp={async (event) => {
                                if (draggingMarkerId) {
                                  const point = screenToNormalizedPoint(event);
                                  const markerId = draggingMarkerId;
                                  setDraggingMarkerId(null);
                                  await moveMarker(markerId, point);
                                  return;
                                }
                                await finishStroke();
                              }}
                              onPointerLeave={async (event) => {
                                if (draggingMarkerId) {
                                  const point = screenToNormalizedPoint(event);
                                  const markerId = draggingMarkerId;
                                  setDraggingMarkerId(null);
                                  await moveMarker(markerId, point);
                                  return;
                                }
                                await finishStroke();
                              }}
                            >
                              {tileAnnotations.map((annotation) => (
                                <polyline
                                  key={`modal_annotation_${annotation.id}`}
                                  points={annotation.points.map((point) => `${point.x},${point.y}`).join(' ')}
                                  fill="none"
                                  stroke={annotation.color}
                                  strokeWidth={annotation.width / 320}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  vectorEffect="non-scaling-stroke"
                                />
                              ))}
                              {draftStroke.length > 0 && (
                                <polyline
                                  points={draftStroke.map((point) => `${point.x},${point.y}`).join(' ')}
                                  fill="none"
                                  stroke="#38bdf8"
                                  strokeWidth={4 / 320}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  vectorEffect="non-scaling-stroke"
                                />
                              )}
                              {tileMarkers.map((marker) => (
                                <g
                                  key={`modal_marker_${marker.id}`}
                                  className="cursor-move"
                                  transform={`translate(${marker.x} ${marker.y})`}
                                  onPointerDown={(event) => {
                                    event.stopPropagation();
                                    setSelectedMarkerId(marker.id ?? null);
                                    if (marker.id) {
                                      setDraggingMarkerId(marker.id);
                                    }
                                  }}
                                >
                                  <circle r={selectedMarkerId === marker.id ? '0.046' : '0.037'} fill={marker.color ?? '#ef4444'} vectorEffect="non-scaling-stroke" />
                                  {selectedMarkerId === marker.id && (
                                    <circle r="0.052" fill="none" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                                  )}
                                  <g transform="scale(0.003)">
                                    {renderMarkerIcon(marker.type, 9)}
                                  </g>
                                </g>
                              ))}
                            </svg>
                          </div>
                        )}
                      </Dropzone>
                      <h2 className="mt-5 mb-2 text-lg font-bold">Reference Images</h2>
                      <div className={`w-full max-h-[320px] ${tilePictures.length > 0 ? 'overflow-y-auto' : ''}`}>
                        {tilePictures.map((picture) => (
                          <div className="relative group" key={`tilepic_${picture.id}`}>
                            <Button
                              className="bg-red-600 absolute top-0 right-0 hidden group-hover:flex flex-row items-center"
                              onClick={async () => {
                                if (confirm('Are you sure?')) {
                                  await db.tilepics.delete(picture.id!);
                                  setTilePictures(tilePictures.filter((item) => item.id !== picture.id));
                                }
                              }}
                            >
                              <TrashIcon className="w-5 h-5 mr-2" /> Remove
                            </Button>
                            <img className="mb-1 w-full" src={picture.img} alt="" />
                          </div>
                        ))}
                        {tilePictures.length === 0 && (
                          <div className="w-full h-24 flex justify-center items-center text-xs text-slate-500">No reference images yet</div>
                        )}
                      </div>
                      <Dropzone noClick={false} onDrop={addTileNote}>
                        {({ getRootProps, getInputProps }) => (
                          <div
                            className="h-24 my-4 w-full rounded-sm border grid place-items-center hover:bg-slate-100 dark:hover:bg-slate-800 transition text-center"
                            {...getRootProps(getPasteProps(addTileNote))}
                          >
                            <input {...getInputProps()} />
                            <span>Drop reference image here</span>
                          </div>
                        )}
                      </Dropzone>
                    </div>
                  </div>
                )}
                <button className="absolute right-0 top-0 p-3 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setIsTileDialogOpen(false)}>
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>

      <Transition appear show={isExportOpen} as={Fragment}>
        <Dialog as="div" className="relative z-[80]" onClose={() => setIsExportOpen(false)}>
          <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-black/40" />
          </Transition.Child>
          <div className="fixed inset-0 grid place-items-center p-4">
            <Dialog.Panel className="w-full max-w-md rounded-sm bg-white dark:bg-slate-900 p-6 shadow-xl">
              <Dialog.Title className="text-lg font-bold mb-4">Download composed map</Dialog.Title>
              {(Object.keys(exportOptions) as Array<keyof ExportOptions>).map((key) => (
                <label className="mb-3 flex items-center gap-2" key={key}>
                  <input
                    type="checkbox"
                    checked={exportOptions[key]}
                    onChange={(event) => setExportOptions({ ...exportOptions, [key]: event.target.checked })}
                  />
                  {key.replaceAll(/([A-Z])/g, ' $1')}
                </label>
              ))}
              <div className="mt-5 flex gap-2">
                <Button onClick={exportMap}>
                  <ArrowDownTrayIcon className="w-5 h-5 mr-2" /> Download PNG
                </Button>
                <Button onClick={() => setIsExportOpen(false)}>Cancel</Button>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>
      </Transition>

      <ToastContainer autoClose={2000} position="bottom-left" />
    </div>
  );
};

export default App;
