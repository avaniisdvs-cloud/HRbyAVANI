/**
 * Public API of the AVANIIS HR document storage abstraction.
 *
 * Import from here — never import provider implementations directly in business
 * modules (modules/, app/).
 *
 * Usage:
 *   import { getStorageProvider } from '@/lib/storage'
 *   const storage = getStorageProvider()
 *   const result  = await storage.uploadFile({ key, data, mimeType })
 *   const url     = await storage.getSignedUrl(result.storageKey, 7 * 24 * 60)
 */

// Re-export the factory entry point
export {
  getStorageProvider,
  resetStorageInstance,
  isLocalStorageActive,
  isPostgresStorageActive,
  isVercelDeployed,
  isFileServingEnabled,
  getStorageMode,
  getStorageUIState,
  getActiveProvider,
} from './factory'

// Re-export storage mode types for UI layers
export type { StorageMode, StorageUIState, ActiveProvider } from './factory'

// Re-export types for callers
export type {
  IDocumentStorage,
  UploadArgs,
  UploadResult,
  StorageProviderName,
} from './types'

export { DocumentStorageError } from './types'
