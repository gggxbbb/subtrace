// 版本戳：构建期由 next.config 经 env 注入（git hash 在 Docker 构建时由 build-arg 传入）。
// 用于侧边栏与登录页显示，定位部署版本。

import { fmtDateTime } from "./dates";

export const APP_VERSION = process.env.APP_VERSION ?? "0.0.0";
export const APP_GIT_HASH = process.env.APP_GIT_HASH ?? "unknown";

const buildTime = process.env.APP_BUILD_TIME;

/** v0.2.0 · e79d0cc · 2026-07-29 11:54（构建时刻按北京墙钟，ADR-0008） */
export const versionLine = `v${APP_VERSION} · ${APP_GIT_HASH}${
  buildTime ? ` · ${fmtDateTime(new Date(buildTime))}` : ""
}`;
