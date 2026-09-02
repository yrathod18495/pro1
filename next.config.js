
/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: false,
  productionBrowserSourceMaps: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    webpackBuildWorker: false,
    cpus: 1,
  },
  onDemandEntries: {
    maxInactiveAge: 10 * 1000,
    pagesBufferLength: 1,
  },
  async redirects() {
    return [
      {
        source: '/voice-india',
        destination: '/studio',
        permanent: true,
      },
      {
        source: '/voice-india/:path*',
        destination: '/studio',
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'drive.google.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.12labs.in',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'blogger.googleusercontent.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
  env: {
    NEXT_PUBLIC_HF_TOKEN: process.env.HF_TOKEN,
    NEXT_PUBLIC_H1: process.env.H1,
    NEXT_PUBLIC_H2: process.env.H2,
    NEXT_PUBLIC_H3: process.env.H3,
    NEXT_PUBLIC_VAPID: process.env.NEXT_PUBLIC_VAPID,
    NEXT_PUBLIC_C2: process.env.C2,
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(self), geolocation=(), interest-cohort=(), otp-credentials=(self)',
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ],
    },
  ],
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        'node:buffer': 'buffer',
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: require.resolve('buffer'),
        fs: false,
        path: false,
        stream: false,
        zlib: false,
        os: false,
        net: false,
        tls: false,
        http2: false,
      };
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
        })
      );
    }

    return config;
  },
};

module.exports = nextConfig;
