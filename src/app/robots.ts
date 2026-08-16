import type { MetadataRoute } from 'next';

/** robots.txt：前台页面允许收录，后台与 API 一律排除 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/'],
      },
    ],
  };
}
