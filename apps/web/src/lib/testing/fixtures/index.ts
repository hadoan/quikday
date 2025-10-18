/**
 * index.ts
 * 
 * Export all test fixtures for easy importing in test files.
 */

export * from './mock.run.fixture';
export * from './backend.run.fixture';

/**
 * Usage in tests:
 * 
 * ```typescript
 * import { mockRunFixture, backendRunFixture } from '@/lib/testing/fixtures';
 * import { adaptRunBackendToUi } from '@/lib/adapters/backendToViewModel';
 * 
 * test('adapter produces same output as mock', () => {
 *   const adapted = adaptRunBackendToUi(backendRunFixture);
 *   expect(adapted).toMatchSnapshot();
 *   // Compare key fields with mock fixture
 *   expect(adapted.id).toBe(mockRunFixture.id);
 *   expect(adapted.status).toBe('succeeded'); // normalized
 * });
 * ```
 */
