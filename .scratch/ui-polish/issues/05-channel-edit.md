# 05 — 通知渠道原地编辑

**What to build:** 通知渠道（Webhook / Email）每行增加"编辑"操作，打开与创建表单同构的预填表单，保存后原地更新。渠道类型不可更改（想换类型 = 删除重建）；`enabled` 启停状态编辑后保留；邮箱渠道的密码字段留空表示保留原密码。新增更新用的服务端动作与服务函数，校验逻辑与创建一致，服务函数配单测。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Webhook 渠道可编辑：名称、URL、方法、自定义头、请求体模板
- [x] Email 渠道可编辑：名称、host、port、secure、user、pass、from、to；pass 留空 = 保留原值
- [x] 编辑表单预填现有配置（pass 除外，留空占位）
- [x] 类型在编辑中不可更改；enabled 状态编辑后保持不变
- [x] 校验规则与创建一致，失败有错误提示；保存后列表立即反映更新
- [x] 服务层单测覆盖：正常更新、校验失败、enabled 保留、pass 留空保留原值

## Answer

- `updateChannel`（service）：仅 name+config 可改（updateMany 不碰 kind/enabled）；pass 缺席 = 保留原值；敏感头（authorization/x-api-key/token，与 toView 脱敏同口径）缺席 = 自动保留、同名重填 = 替换；非本人渠道抛错。4 个新单测（共 8）。
- `updateChannelAction`：与创建共用抽出的 `parseChannelConfig`，校验一致；kind 由隐藏字段回传仅用于解析，DB 层不可变。
- UI：ChannelRow 行内展开编辑表单（预填；类型显示"不可改"静态块；pass 占位"留空 = 保留原密码"；敏感头提示文案）。Webhook/Email 字段块抽出供创建与编辑复用。
- 冒烟：建 webhook 渠道 → 编辑改 URL/名称 → 保存生效 → 删除清理。
