import { describe, expect, it } from 'vitest'
import {
  V1_DATA_GENERATION,
  V1_MIGRATION_INTENT_KEY,
  compareSemver,
  didMigrationBecomeReady,
  isMigrationBlocking,
  migrationIntent,
  migrationState,
  reconcileMigrationUiState,
  shouldPersistV1MigrationIntent,
  shouldRecoverV1Migration,
  shouldStartV1Migration,
} from '@/migration/state'

describe('v1 migration gating', () => {
  it.each([
    ['0.3.0', true],
    ['0.9.99', true],
    ['1.0.0', false],
    ['1.0.1', false],
  ])('gates previous version %s', (previousVersion, expected) => {
    expect(shouldStartV1Migration({
      reason: 'update', previousVersion, currentVersion: '1.0.0',
    })).toBe(expected)
  })

  it('ignores fresh installs, Chrome updates, malformed versions and completed migrations', () => {
    expect(shouldStartV1Migration({ reason: 'install', currentVersion: '1.0.0' })).toBe(false)
    expect(shouldStartV1Migration({ reason: 'chrome_update', previousVersion: '0.3.0', currentVersion: '1.0.0' })).toBe(false)
    expect(shouldStartV1Migration({ reason: 'update', previousVersion: 'dev', currentVersion: '1.0.0' })).toBe(false)
    expect(shouldStartV1Migration({
      reason: 'update', previousVersion: '0.3.0', currentVersion: '1.0.0', completedGeneration: V1_DATA_GENERATION,
    })).toBe(false)
  })

  it('compares semantic versions rather than strings', () => {
    expect(compareSemver('0.10.0', '0.9.0')).toBe(1)
    expect(compareSemver('1.0.0-beta.1', '1.0.0')).toBe(0)
  })

  it('blocks every non-ready state including error', () => {
    expect(isMigrationBlocking(migrationState('pending'))).toBe(true)
    expect(isMigrationBlocking(migrationState('error', { error: 'network' }))).toBe(true)
    expect(isMigrationBlocking(migrationState('ready'))).toBe(false)
    expect(isMigrationBlocking(null)).toBe(false)
  })

  it('records pre-v1 update intent without waiting for storage reads', () => {
    expect(V1_MIGRATION_INTENT_KEY).toBe('slophammer-v1-migration-intent')
    expect(shouldPersistV1MigrationIntent({
      reason: 'update', previousVersion: '0.3.0', currentVersion: '1.0.0',
    })).toBe(true)
    expect(shouldPersistV1MigrationIntent({
      reason: 'install', currentVersion: '1.0.0',
    })).toBe(false)
  })

  it('recovers a persisted update intent on startup unless generation is complete', () => {
    const intent = migrationIntent('0.3.0', '1.0.0', 123)
    expect(shouldRecoverV1Migration({ intent, currentVersion: '1.0.0' })).toBe(true)
    expect(shouldRecoverV1Migration({
      intent, currentVersion: '1.0.0', completedGeneration: V1_DATA_GENERATION,
    })).toBe(false)
    expect(shouldRecoverV1Migration({ intent: null, currentVersion: '1.0.0' })).toBe(false)
  })

  it('stays blocked across the storage.clear mirror gap', () => {
    const wiping = migrationState('wiping')
    expect(reconcileMigrationUiState(wiping, null)).toBe(wiping)
    expect(reconcileMigrationUiState(wiping, migrationState('ready'))?.phase).toBe('ready')
    expect(reconcileMigrationUiState(null, null)).toBeNull()
  })

  it('detects only a blocking-to-ready transition for options refresh', () => {
    expect(didMigrationBecomeReady(migrationState('downloading'), migrationState('ready'))).toBe(true)
    expect(didMigrationBecomeReady(migrationState('error', { error: 'x' }), migrationState('ready'))).toBe(true)
    expect(didMigrationBecomeReady(null, migrationState('ready'))).toBe(false)
    expect(didMigrationBecomeReady(migrationState('ready'), migrationState('ready'))).toBe(false)
    expect(didMigrationBecomeReady(migrationState('pending'), migrationState('installing'))).toBe(false)
  })
})
