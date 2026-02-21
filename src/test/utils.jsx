/**
 * Test Utilities
 * Shared helpers for testing React components
 */

import { render } from '@testing-library/react';

/**
 * Custom render function that wraps components with necessary providers
 * Can be extended to include context providers, routers, etc.
 */
function customRender(ui, options = {}) {
  return render(ui, {
    // Add any global providers here
    ...options,
  });
}

// Re-export everything from testing-library
export * from '@testing-library/react';

// Override the default render with our custom render
export { customRender as render };
