/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export: `entergram viz` serves these files from its own tiny node:http
  // server, so the published CLI carries no Next.js runtime dependency.
  output: "export",
  images: { unoptimized: true },
  // The API is same-origin in production (served by the viz server). In `next dev`
  // it lives on 4700 while the UI is on 4701 — see lib/api.ts.
};

export default nextConfig;
