/**
 * Lokalni foto projekti (4.3): anonimna sesija s lokalno spremljenim
 * projektima - foto-only korisnik nikad ne ulazi u wagen bazu kao
 * registrirani korisnik. Sync u public.photo_sessions dolazi u G4;
 * lokalna pohrana je izvor istine do crossposta.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

/** Ulazni mod odredjuje default izlaza (4.2). Zrcali public.session_mode. */
export type SessionMode = 'photo' | 'listing';
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';
export type PhotoAngle = 'exterior' | 'interior' | 'detail' | 'trunk' | 'feature' | 'mechanical';

export interface LocalPhoto {
  id: string;
  /** Lokalni file URI dok se ne uploada. */
  uri: string;
  angleCategory: PhotoAngle | null;
  sortOrder: number;
  /** Putanja u Storageu nakon uploada - undefined dok ceka. */
  remotePath?: string;
  /** Lokalni URI obradjene verzije (I2); original ostaje u uri. */
  processedUri?: string;
}

export interface VehicleInfo {
  make: string;
  model: string;
  engineLabel: string | null;
  modelYear: number | null;
}

export interface LocalSession {
  id: string;
  mode: SessionMode;
  status: SessionStatus;
  vin: string | null;
  /** Rezultat server-side decodea (E2); null = jos nije dekodirano. */
  vehicleInfo?: VehicleInfo | null;
  photos: LocalPhoto[];
  createdAt: string;
  updatedAt: string;
}

const INDEX_KEY = 'wagen.sessions.index';
const keyFor = (id: string) => `wagen.session.${id}`;

async function readIndex(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export async function createSession(mode: SessionMode): Promise<LocalSession> {
  const now = new Date().toISOString();
  const session: LocalSession = {
    id: Crypto.randomUUID(),
    mode,
    status: 'in_progress',
    vin: null,
    photos: [],
    createdAt: now,
    updatedAt: now,
  };
  await AsyncStorage.setItem(keyFor(session.id), JSON.stringify(session));
  const index = await readIndex();
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify([session.id, ...index]));
  return session;
}

export async function getSession(id: string): Promise<LocalSession | null> {
  const raw = await AsyncStorage.getItem(keyFor(id));
  return raw ? (JSON.parse(raw) as LocalSession) : null;
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<LocalSession, 'id' | 'createdAt'>>,
): Promise<LocalSession> {
  const existing = await getSession(id);
  if (!existing) throw new Error(`Sesija ${id} ne postoji`);
  const next: LocalSession = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(keyFor(id), JSON.stringify(next));
  return next;
}

export async function listSessions(): Promise<LocalSession[]> {
  const index = await readIndex();
  const sessions = await Promise.all(index.map(getSession));
  return sessions.filter((s): s is LocalSession => s !== null);
}
