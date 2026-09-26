/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Las fuentes .ttf del contrato se leen con fs en runtime: esto
    // asegura que Vercel las incluya en la función serverless.
    outputFileTracingIncludes: {
      '/api/generar-contrato': ['./src/lib/fuentes/**/*'],
    },
  },
}

module.exports = nextConfig
