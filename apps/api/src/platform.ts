export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface R2ObjectBody {
  body: ReadableStream;
  size: number;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
}

export interface R2UploadedPart {
  partNumber: number;
  etag: string;
}

export interface R2MultipartUpload {
  uploadId: string;
  uploadPart(partNumber: number, value: ReadableStream | ArrayBuffer | Uint8Array): Promise<R2UploadedPart>;
  complete(parts: R2UploadedPart[]): Promise<unknown>;
  abort(): Promise<void>;
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<Omit<R2ObjectBody, 'body'> | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
  createMultipartUpload(key: string, options?: { httpMetadata?: { contentType?: string } }): Promise<R2MultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload;
}

export interface Env {
  DB: D1Database;
  OBJECTS: R2Bucket;
  ENVIRONMENT: string;
  GIT_GATEWAY_URL: string;
  GIT_PUBLIC_URL?: string;
  GIT_SSH_PUBLIC_URL?: string;
  GIT_GATEWAY_TOKEN?: string;
  PUBLIC_URL?: string;
  AUTH_SECRET?: string;
  SECRET_ENCRYPTION_KEY?: string;
  EMAIL?: SendEmail;
  EMAIL_FROM?: string;
  GIT_EDGE: Fetcher;
  PULL_ROOMS: DurableObjectNamespace;
  RUN_ROOMS: DurableObjectNamespace;
  RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}
