export interface DatabaseClient {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{
        rows: T[];
        rowCount: number;
    }>;
    exec(sql: string): Promise<void>;
    close(): Promise<void>;
}
export declare function getDbClient(inMemory?: boolean): Promise<DatabaseClient>;
