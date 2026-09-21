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
      // 演示数据封面（lib/demo-data.ts 用 picsum.photos 占位图）：
      // 未配置 SUPABASE 环境时前台走演示数据，此前未放行该域名会让 next/image
      // 直接抛「Invalid src prop」把整页打崩；放行后演示模式才真的可用
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'fastly.picsum.photos' },
    ],
  },
};

export default nextConfig;
