import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            // Allow Shopify admin to embed this app in an iframe
            value:
              'frame-ancestors https://admin.shopify.com https://*.myshopify.com;',
          },
        ],
      },
    ]
  },
};

export default nextConfig;
