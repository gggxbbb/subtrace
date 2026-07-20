// 仓储缝测试：任务注册表（ticket 01，ADR-0006）。

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { listJobRuns, listJobs, runJob, scheduleJob, unscheduleJob } from "./index";

const testJob = (over: Record<string, unknown> = {}) => ({
  key: "test-job",
  cron: "0 0 * * *",
  title: "测试任务",
  link: "/settings",
  catchUp: false,
  handler: async () => "done",
  ...over,
});

beforeEach(async () => {
  await prisma.jobRun.deleteMany();
});

afterEach(() => {
  unscheduleJob("test-job");
  unscheduleJob("fail-job");
  unscheduleJob("prune-job");
});

describe("runJob", () => {
  it("成功落 OK 记录（耗时/摘要），失败落 FAIL 不抛出", async () => {
    scheduleJob(testJob());
    const r = await runJob("test-job");
    expect(r).toEqual({ ok: true, message: "done" });
    const rows = await prisma.jobRun.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobKey: "test-job", status: "OK", message: "done" });
    expect(rows[0].durationMs).toBeGreaterThanOrEqual(0);

    scheduleJob(
      testJob({
        key: "fail-job",
        handler: async () => {
          throw new Error("炸了");
        },
      }),
    );
    const f = await runJob("fail-job");
    expect(f).toEqual({ ok: false, message: "炸了" });
    expect((await prisma.jobRun.findFirst({ where: { jobKey: "fail-job" } }))!.status).toBe("FAIL");
  });

  it("未注册任务抛错", async () => {
    await expect(runJob("ghost")).rejects.toThrow(/job_not_registered/);
  });

  it("每个 job 只保留最近 50 条", async () => {
    scheduleJob(testJob({ key: "prune-job" }));
    for (let i = 0; i < 55; i++) await runJob("prune-job");
    expect(await prisma.jobRun.count({ where: { jobKey: "prune-job" } })).toBe(50);
  });
});

describe("listJobs", () => {
  it("系统任务始终可见；含 cron/链接/下次运行", async () => {
    const jobs = await listJobs();
    const keys = jobs.map((j) => j.key);
    expect(keys).toContain("reminders");
    expect(keys).toContain("rates");
    const r = jobs.find((x) => x.key === "reminders")!;
    expect(r).toMatchObject({ title: "提醒扫描", cron: "0 0 * * *", link: "/settings/channels" });
    expect(r.nextRun).toBeInstanceOf(Date);
    expect(r.nextRun!.getTime()).toBeGreaterThan(Date.now());
  });

  it("最近运行经 listJobRuns 可查", async () => {
    scheduleJob(testJob());
    await runJob("test-job");
    const runs = await listJobRuns("test-job");
    expect(runs[0]).toMatchObject({ status: "OK", message: "done" });
  });
});
