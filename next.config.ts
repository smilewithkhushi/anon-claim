import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stub missing optional deps from @coinbase/cdp-sdk (pulled in by RainbowKit's
  // Coinbase Smart Wallet connector). These packages are only needed at runtime
  // for x402 payment flows, which we don't use.
  turbopack: {
    resolveAlias: {
      '@x402/core/client': './stubs/empty.js',
      '@x402/evm/exact/client': './stubs/empty.js',
      '@x402/evm/upto/client': './stubs/empty.js',
      '@x402/svm/exact/client': './stubs/empty.js',
      '../../x402/account-signers.js': './stubs/empty.js',
    },
  },
};

export default nextConfig;
