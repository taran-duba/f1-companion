/** Shapes of the public state streamed by the backend (see backend/f1live/state.py). */

export interface DriverInfo {
  RacingNumber: string;
  Tla?: string;
  BroadcastName?: string;
  FullName?: string;
  FirstName?: string;
  LastName?: string;
  TeamName?: string;
  TeamColour?: string;
  Line?: number;
  CountryCode?: string;
}

export interface SectorTiming {
  Value?: string;
  Status?: number;
  OverallFastest?: boolean;
  PersonalFastest?: boolean;
  Stopped?: boolean;
  Segments?: { Status?: number }[] | Record<string, { Status?: number }>;
}

export interface LapTimeValue {
  Value?: string;
  Lap?: number;
  OverallFastest?: boolean;
  PersonalFastest?: boolean;
}

export interface TimingLine {
  RacingNumber?: string;
  Line?: number;
  Position?: string;
  ShowPosition?: boolean;
  GapToLeader?: string;
  IntervalToPositionAhead?: { Value?: string; Catching?: boolean };
  Retired?: boolean;
  InPit?: boolean;
  PitOut?: boolean;
  Stopped?: boolean;
  NumberOfLaps?: number;
  NumberOfPitStops?: number;
  Sectors?: SectorTiming[] | Record<string, SectorTiming>;
  BestLapTime?: LapTimeValue;
  LastLapTime?: LapTimeValue;
  Speeds?: Record<string, { Value?: string }>;
  // Practice and qualifying: gaps are to the fastest lap, not the leader on track.
  TimeDiffToFastest?: string;
  TimeDiffToPositionAhead?: string;
  /** Qualifying: out of the session (eliminated in an earlier part). */
  KnockedOut?: boolean;
  /** Qualifying: best lap per part (Q1, Q2, Q3). */
  BestLapTimes?: LapTimeValue[] | Record<string, LapTimeValue>;
  Stats?: { TimeDiffToFastest?: string; TimeDifftoPositionAhead?: string }[] | Record<string, { TimeDiffToFastest?: string; TimeDifftoPositionAhead?: string }>;
}

export interface TeamRadioCapture {
  Utc?: string;
  RacingNumber?: string;
  /** Relative to the session's static path, e.g. "TeamRadio/MAXVER01_1_20240302_154517.mp3". */
  Path?: string;
  /** Demo only: what is said (the real feed has no transcripts). */
  Text?: string;
}

export interface Stint {
  Compound?: string;
  New?: string;
  TotalLaps?: number;
  StartLaps?: number;
}

export interface RaceControlMessage {
  Utc?: string;
  Lap?: number;
  Category?: string;
  Flag?: string;
  Scope?: string;
  Sector?: number;
  RacingNumber?: string;
  Status?: string;
  Mode?: string;
  Message?: string;
}

export interface CarSample {
  rpm: number;
  speed: number;
  gear: number;
  throttle: number;
  brake: number;
  drs: number;
}

export interface LapRecord {
  lap: number;
  ms: number | null;
  time: string | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  pos: number | null;
  gap: number | null;
  lapsDown: number;
  interval: number | null;
  compound: string | null;
  tyreAge: number | null;
  pitIn: boolean;
  pitOut: boolean;
  personalBest: boolean;
  overallBest: boolean;
}

export interface TrackMap {
  points: [number, number][];
  bounds: [number, number, number, number] | null;
  closed: boolean;
}

export interface FeedInfo {
  t: number;
  utc: string | null;
  telemetry: boolean;
  position: boolean;
  messages: number;
  errors: number;
}

export interface TimingState {
  SessionInfo?: {
    Meeting?: { Name?: string; OfficialName?: string; Location?: string; Country?: { Name?: string }; Circuit?: { ShortName?: string } };
    Name?: string;
    Type?: string;
    StartDate?: string;
  };
  SessionStatus?: { Status?: string };
  TrackStatus?: { Status?: string; Message?: string };
  WeatherData?: Record<string, string>;
  LapCount?: { CurrentLap?: number; TotalLaps?: number };
  ExtrapolatedClock?: { Utc?: string; Remaining?: string; Extrapolating?: boolean };
  Heartbeat?: { Utc?: string };
  DriverList?: Record<string, DriverInfo>;
  TimingData?: {
    Lines?: Record<string, TimingLine>;
    Withheld?: boolean;
    /** Qualifying: 1, 2 or 3. */
    SessionPart?: number;
    /** Qualifying: cars taking part in each part, e.g. [22, 16, 10]. */
    NoEntries?: number[] | Record<string, number>;
  };
  TeamRadio?: { Captures?: TeamRadioCapture[] | Record<string, TeamRadioCapture> };
  TimingAppData?: { Lines?: Record<string, { Stints?: Stint[] | Record<string, Stint>; GridPos?: string; Line?: number }> };
  RaceControlMessages?: { Messages?: RaceControlMessage[] | Record<string, RaceControlMessage> };
  CarData?: { Utc: string | null; Cars: Record<string, CarSample> };
  Position?: { Timestamp: string | null; Entries: Record<string, { X: number; Y: number; Z: number; Status: string }> };
  Derived?: { LapHistory?: Record<string, LapRecord[] | Record<string, LapRecord>>; TrackMap?: TrackMap };
  Feed?: FeedInfo;
  [topic: string]: unknown;
}

export interface SourceStatus {
  kind: "demo" | "replay" | "fastf1" | "live" | "none" | string;
  state: "idle" | "connecting" | "connected" | "reconnecting" | "playing" | "paused" | "ended" | "error" | string;
  name?: string;
  speed?: number;
  position?: number;
  start?: number;
  end?: number;
  speeds?: number[];
  transport?: string;
  token_present?: boolean;
  last_error?: string | null;
  missing_topics?: string[];
  telemetry_available?: boolean;
  reconnects?: number;
  messages?: number;
  last_message_at?: string | number | null;
  connected_since?: string | number | null;
  [key: string]: unknown;
}

export interface ServerStatus {
  source: SourceStatus;
  recorder: { enabled: boolean; requested?: boolean; path?: string | null; messages?: number; bytes?: number; [k: string]: unknown };
  loading: Record<string, unknown> | null;
  error: string | null;
  token_present: boolean;
  /** Where the token came from: saved in the dashboard, or the F1TV_TOKEN environment variable. */
  token_source?: "dashboard" | "environment" | null;
  transport: string;
}

/** Browser ↔ backend connection, distinct from the backend's own feed state. */
export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";
