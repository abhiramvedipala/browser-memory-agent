import type { El } from './dom.ts';

/** One thing that happened in a session; success checks read these. */
export interface BenchEvent {
  type: string;
  data: Record<string, string | number | boolean>;
}

export interface SessionState {
  sid: string;
  /** Count of final form submissions (hold placed, ticket submitted). */
  submissions: number;
  events: BenchEvent[];
  /** Multi-step form drafts, keyed by app. */
  draft: Record<string, Record<string, string>>;
  createdAt: number;
}

export interface AppRequest {
  method: 'GET' | 'POST';
  /** Path after the app base path, alias segments removed. Always starts with '/'. */
  path: string;
  query: URLSearchParams;
  form: URLSearchParams;
  session: SessionState;
}

export interface AppResponse {
  status?: number;
  page?: El;
  redirect?: string;
}

export interface DemoApp {
  name: string;
  /** e.g. '/bookshop' */
  basePath: string;
  title: string;
  handle(req: AppRequest): AppResponse | undefined;
}

export interface RequestLogEntry {
  ts: number;
  method: string;
  url: string;
  sid: string;
  status: number;
}
