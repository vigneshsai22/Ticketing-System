import { DatabaseClient } from '../db/client.js';
export interface CanaryTestResult {
    surfaceName: string;
    leaked: boolean;
    details?: string;
}
export interface CanaryRegistryEntry {
    name: string;
    testSurface: (db: DatabaseClient, canaryToken: string, sampleData?: Record<string, unknown>) => Promise<boolean>;
}
export declare const canarySurfaces: CanaryRegistryEntry[];
export declare function runCanaryLeakCheck(db: DatabaseClient, canaryToken: string): Promise<CanaryTestResult[]>;
