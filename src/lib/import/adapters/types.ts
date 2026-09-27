import type { ParsedTable } from "../csv";
import type { ColumnMapping } from "../fields";
import type { NormalizedRow, NormalizedTrade, NormalizeOptions } from "../normalize";

/**
 * Every trade source (file export or live platform API) implements TradeSourceAdapter and
 * produces NormalizedTrade records; the import service takes it from there (instruments,
 * fingerprints, duplicates, batches, rebuild). Only file adapters are implemented today.
 */

export type { NormalizedTrade };

export interface AdapterBase {
  /** Stable id, stored as ImportBatch.source / IntegrationConnection.provider. */
  id: string;
  label: string;
  description: string;
  /** Typical file formats or platform names, shown in the UI. */
  formats?: string[];
}

export interface FileParseInput {
  table: ParsedTable;
  mapping: ColumnMapping;
  options: NormalizeOptions;
}

export interface AvailableFileAdapter extends AdapterBase {
  kind: "file";
  status: "available";
  accept: string[];
  /** 0 (not this format) … 1 (certain) from the header row. */
  detect(headers: string[]): number;
  /** Initial column mapping for this format. */
  suggestMapping(headers: string[], samples: string[][]): ColumnMapping;
  /** Format defaults the user can still override (e.g. profit is gross in MetaTrader). */
  defaults: Partial<Pick<NormalizeOptions, "dateFormat" | "decimal" | "profitIsNet">>;
  parse(input: FileParseInput): NormalizedRow[];
}

export interface PlannedFileAdapter extends AdapterBase {
  kind: "file";
  status: "coming_later";
  accept: string[];
}

/** Credentials a platform connection will need; typed now so the settings UI can be built later. */
export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "select";
  secret?: boolean;
  options?: { value: string; label: string }[];
  help?: string;
}

export interface ApiConnection {
  /** IntegrationConnection.id */
  id: string;
  accountId: string | null;
  config: Record<string, unknown>;
  lastSyncAt: Date | null;
}

export interface ApiSyncResult {
  trades: NormalizedTrade[];
  /** Opaque cursor for the next incremental sync. */
  cursor?: string;
}

export interface ApiAdapterMethods {
  connect(credentials: Record<string, string>): Promise<{ ok: true; config: Record<string, unknown> } | { ok: false; error: string }>;
  sync(connection: ApiConnection, since: Date | null): Promise<ApiSyncResult>;
  disconnect?(connection: ApiConnection): Promise<void>;
}

export interface PlannedApiAdapter extends AdapterBase {
  kind: "api";
  status: "coming_later";
  credentials: CredentialField[];
}

export interface AvailableApiAdapter extends AdapterBase, ApiAdapterMethods {
  kind: "api";
  status: "available";
  credentials: CredentialField[];
}

export type TradeSourceAdapter = AvailableFileAdapter | PlannedFileAdapter | AvailableApiAdapter | PlannedApiAdapter;
export type FileAdapter = AvailableFileAdapter | PlannedFileAdapter;
