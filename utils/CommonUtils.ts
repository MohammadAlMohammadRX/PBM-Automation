import * as fs from 'fs';
import * as path from 'path';

/**
 * Small, genuinely reusable helpers that don't belong to a more specific
 * utility class. Kept deliberately minimal to avoid unnecessary abstraction.
 */
export class CommonUtils {
  /** Ensures a directory exists, creating it (recursively) if necessary. */
  static ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /** Sanitizes a string so it is safe to use as a filename on Windows/macOS/Linux. */
  static sanitizeForFilename(value: string): string {
    return value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').trim();
  }

  /** Resolves a path that may be relative or absolute, expanding it to absolute. */
  static toAbsolutePath(target: string): string {
    return path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
  }

  /** Simple typed sleep for the rare, justified case where no Playwright wait applies.
   *  Prefer expect()/waitFor*() everywhere else - see README "Wait Strategy". */
  static async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
