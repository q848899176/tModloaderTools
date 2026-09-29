export interface Settings {
  installDir: string; saveDir: string; workshopDir: string; webPort: number;
  serverName: string; port: number; maxPlayers: number; password: string; motd: string;
  world: string; difficulty: number; worldSize: number; seed: string;
}
export interface World { name: string; size: number; modified: string; hasModData: boolean; evil?:'crimson'|'corruption'|'unknown'; difficulty?:number; seed?:string; sizeLabel?:string; worldTitle?:string }
export interface Mod {
  name: string; displayName: string; version: string; buildVersion: string; author: string;
  dependencies: string[]; side: number; source: string; workshopId?: string;
  path: string; enabled: boolean; compatible: boolean; error?: string;
}
export interface Download { id: string; title: string; status: 'queued'|'downloading'|'installing'|'complete'|'failed'; message: string; updated: string }
export interface LogEntry { id: number; time: string; level: 'info'|'error'|'success'; text: string; instanceId?:string }
export interface Player {slot:number;name:string;life:number;maxLife:number}
export interface InstanceConfig { id:string;name:string;world:string;port:number;maxPlayers:number;password:string;motd:string;difficulty:number;worldSize:number;seed:string;secure:boolean;npcStream:number }
export interface InstanceView {config:InstanceConfig;server:ServerStatus;players:Player[];bridge:'unknown'|'ready'|'unavailable';configText:string}
export interface ServerStatus { state: 'stopped'|'starting'|'running'|'stopping'|'error'|'external'; message: string; pid?: number; startedAt?: string; world?: string }
export interface AppState {
  settings: Settings; worlds: World[]; mods: Mod[]; enabled: string[]; revision: string;
  server: ServerStatus; downloads: Download[]; logs: LogEntry[]; urls: string[];
  version: string; busy: boolean;
  instances:InstanceView[];
}
