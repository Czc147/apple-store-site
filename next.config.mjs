/** @type {import('next').NextConfig} */
const nextConfig = {
  // 项目暂未集成 ESLint，跳过构建时 lint，避免阻塞 Netlify 构建
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      // Supabase Storage 公共图片域名（所有项目子域）
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
