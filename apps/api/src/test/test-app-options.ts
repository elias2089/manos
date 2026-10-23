import type { AppOptions } from '../app.setup.js';

/** The setup options every integration test uses. The origin matches the feature files. */
export const TEST_APP_OPTIONS: AppOptions = { webOrigin: 'https://manos.example' };
