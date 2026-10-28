export function buildPackage(options?: { appOrigin?: string; apiOrigin?: string; output?: string }): Promise<{ files: string[]; bytes: number; archive: Buffer; extensionId: string }>;
