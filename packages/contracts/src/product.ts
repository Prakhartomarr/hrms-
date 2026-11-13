/**
 * Product identity. "HRMS" is a working name: rename it here and nowhere else.
 * Code that shows the product name to users must import these constants.
 */
export const PRODUCT = {
  name: 'HRMS',
  slug: 'hrms',
  /** Key in a module's package.json that marks it as a plug-in: `"hrms": { "kind": "module" }`. */
  manifestKey: 'hrms',
} as const;
