import type { NextConfig } from 'next';

// Everything runs in the browser, so the app is exported as static files (out/) and served by
// Firebase Hosting. No server, nothing to bill.
const nextConfig: NextConfig = {
  output: 'export',
};

export default nextConfig;
