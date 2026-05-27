import Dexie from 'dexie';
import { appConfig } from './config';

export interface GameMap {
  id?: number;
  name: string;
  tileWidth?: number;
  tileHeight?: number;
  columnLabelMode?: AxisLabelMode;
  rowLabelMode?: AxisLabelMode;
}

export type AxisLabelMode = 'letters' | 'numbers';
export type TileImageFit = 'cover' | 'contain';

export interface ImageCrop {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
}

export interface MapTile {
  id?: number;
  map: number;
  x: number;
  y: number;
  name?: string;
  img?: string;
  originalImg?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  crop?: ImageCrop;
  fit?: TileImageFit;
  notes?: string;
  unsolved?: number;
}

export interface TilePicture {
  id?: number;
  tileId: number;
  img: string;
}

export interface TileLink {
  id?: number;
  map: number;
  from: number;
  to: number;
  fromOffsetX: number;
  fromOffsetY: number;
  toOffsetX: number;
  toOffsetY: number;
}

export interface TileAnnotation {
  id?: number;
  tileId: number;
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}

export interface TileMarker {
  id?: number;
  tileId: number;
  type: string;
  x: number;
  y: number;
  label?: string;
  color?: string;
}

export class GameTraxDB extends Dexie {
  maps!: Dexie.Table<GameMap, number>;
  tiles!: Dexie.Table<MapTile, number>;
  tilepics!: Dexie.Table<TilePicture, number>;
  tilelinks!: Dexie.Table<TileLink, number>;
  tileAnnotations!: Dexie.Table<TileAnnotation, number>;
  tileMarkers!: Dexie.Table<TileMarker, number>;

  constructor() {
    super(appConfig.databaseName);

    this.version(5).stores({
      maps: '++id,name',
      tiles: '++id,map,x,y,img,notes,name,unsolved',
      tilepics: '++id,tileId,img',
      tilelinks: '++id,map,from,to,fromOffsetX,fromOffsetY,toOffsetX,toOffsetY',
    });

    this.version(6).stores({
      maps: '++id,name,columnLabelMode,rowLabelMode',
      tiles: '++id,map,x,y,img,originalImg,notes,name,unsolved',
      tilepics: '++id,tileId,img',
      tilelinks: '++id,map,from,to,fromOffsetX,fromOffsetY,toOffsetX,toOffsetY',
      tileAnnotations: '++id,tileId',
      tileMarkers: '++id,tileId,type',
    });
  }
}

export const db = new GameTraxDB();
