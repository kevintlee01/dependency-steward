/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dependency-steward/shared", "@dependency-steward/ui"]
};

export default nextConfig;