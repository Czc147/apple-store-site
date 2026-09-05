#!/usr/bin/env node
/**
 * 卡密清洗脚本：去空白 / 去重 / 分隔符统一成一行一码
 *
 * 用法：node scripts/clean-keys.mjs <input> [output]
 *   <input>   待清洗的文本文件（.txt / .csv 等）
 *   [output]  输出文件路径，缺省输出到 stdout
 *
 * 分隔符：换行、空格、制表符、逗号、分号、竖线均视为分隔符；
 * 每条卡密去除首尾空白后按首次出现顺序去重。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const input = process.argv[2];
const output = process.argv[3];

if (!input) {
  console.error('用法：node scripts/clean-keys.mjs <input> [output]');
  process.exit(1);
}

const raw = readFileSync(input, 'utf8').replace(/^﻿/, '');
const tokens = raw.split(/[\s,;|]+/).filter(Boolean);

const seen = new Set();
const keys = [];
for (const t of tokens) {
  if (!seen.has(t)) {
    seen.add(t);
    keys.push(t);
  }
}

const result = keys.join('\n') + '\n';

if (output) {
  writeFileSync(output, result, 'utf8');
  console.log(`已写入 ${keys.length} 条到 ${output}（去重前 ${tokens.length} 条）`);
} else {
  process.stdout.write(result);
}
