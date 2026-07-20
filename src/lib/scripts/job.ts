// 脚本任务解析（ticket 03 实现）：从订阅的 script 字段构建任务定义。
// 当前为占位——无脚本功能前系统任务路径不受影响。

import type { JobDef } from "../jobs";

/** script:<订阅id> → 任务定义；未启用/不存在为 null（ticket 03 填充）。 */
export async function resolveScriptJob(_key: string): Promise<JobDef | null> {
  return null;
}

/** 大盘用的脚本任务元数据（ticket 03 填充）。 */
export async function listScriptJobMeta(): Promise<{ key: string; title: string; cron: string; link: string }[]> {
  return [];
}
