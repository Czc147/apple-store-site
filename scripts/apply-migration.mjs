// 一次性脚本：把单个迁移 SQL 文件执行到 Supabase（只跑指定文件，不碰其它迁移）
// 用法：DB_URL="postgresql://..." node scripts/apply-migration.mjs [path/to/file.sql]
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.DB_URL;
const file = process.argv[2] || 'supabase/migrations/006_home_builder.sql';

if (!url) {
  console.error('缺少 DB_URL 环境变量');
  process.exit(1);
}

const sql = await readFile(file, 'utf8');
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('OK 迁移已执行：' + file);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('失败：' + (e && e.message ? e.message : e));
  process.exitCode = 1;
} finally {
  await client.end();
}
