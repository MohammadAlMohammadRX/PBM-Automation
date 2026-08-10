import * as path from 'path';

/**
 * Centralized filesystem paths used by the framework itself (as opposed to
 * artifact paths that are user-configurable via .env - see ScreenshotUtils).
 */

/** Where the one-time admin authentication session is persisted (gitignored). */
export const AUTH_STORAGE_STATE_PATH = path.resolve(__dirname, '..', '.auth', 'admin.json');
