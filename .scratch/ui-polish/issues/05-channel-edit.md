# 05 — 通知渠道原地编辑

**What to build:** 通知渠道（Webhook / Email）每行增加"编辑"操作，打开与创建表单同构的预填表单，保存后原地更新。渠道类型不可更改（想换类型 = 删除重建）；`enabled` 启停状态编辑后保留；邮箱渠道的密码字段留空表示保留原密码。新增更新用的服务端动作与服务函数，校验逻辑与创建一致，服务函数配单测。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Webhook 渠道可编辑：名称、URL、方法、自定义头、请求体模板
- [ ] Email 渠道可编辑：名称、host、port、secure、user、pass、from、to；pass 留空 = 保留原值
- [ ] 编辑表单预填现有配置（pass 除外，留空占位）
- [ ] 类型在编辑中不可更改；enabled 状态编辑后保持不变
- [ ] 校验规则与创建一致，失败有错误提示；保存后列表立即反映更新
- [ ] 服务层单测覆盖：正常更新、校验失败、enabled 保留、pass 留空保留原值
