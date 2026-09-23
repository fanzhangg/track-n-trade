# Tracks & Trade · 圆润资源与微缩图标系统 v5

当前原型和设计系统共用本目录的 catalog.js、provenance.js 和 icons.css。保留目录 v1 名称以兼容引用，实际版本以 sources.json 为准。

## 视觉与语义

- 世界对象、建筑与货物使用透明 PNG，以第一版 City Kit / Survival Kit 的暖色木材、简洁切面和无硬描边外观为参考，使用内置 image_gen 逐个生成。没有使用 OBJ 模型或 3D 渲染器。
- 六座生产设施通过实体设备与成品表达生产内容：木架原木堆、阶梯采石场、圆锯出料台、石锤工作台、矿洞矿车、熔炉浇铸槽。没有房屋上的产品徽章，也没有独立角标。
- 货物保持独立图标，材料色与生产设施对应。建筑在 32 / 48 / 64px 都保持原身份，不再切换为货物。
- 12 个操作与状态符号为项目绘制的墨蓝 SVG，保持小尺寸简洁清晰。
- 工人和居民采用同一 meeple 轮廓：以现有伐木营与城镇图标作为风格参考，用内置 imagegen 重绘为透明 PNG；蓝灰表示生产工人，陶土表示城镇居民。它们作为实体棋子直接落在板块上，不使用 UI 浮层。
- 依据 alpha 边界归一视觉尺寸，主体最长边占容器 82%。原图保留透明度和全部像素，不拉伸、染色或叠加描边。

## 复用

TradeIcons.icon(id, {base:'assets/icons/v1/',size:48,decorative:true}) 用于 HTML；TradeIcons.svgIcon 用于地图 SVG。紧邻文字的图标作为装饰，独立图标必须有可访问名称。

## 文件与来源

redrawn/ 保存建筑、角色、地形及操作图标，resources/ 保存当前十种货物 PNG。各目录的 prompts.json 保存对应生成提示词与参考说明。sources.json 记录当前路径、真实尺寸、透明边界与 SHA-256。运行时不依赖素材库、3D 模型或生成工具。

生成 PNG 与项目 SVG 为项目重绘资产，不标为 Kenney 原素材或继承其 CC0 声明。Kenney 原参考的许可保留在 licenses/。hexagon/ 与 rendered/ 保留之前版本作比较，当前原型不引用。旧 tools/render-icon-models.cjs 不适用于本版。

完整 Kenney 库与 ZIP 继续由 .gitignore 排除。未自动提交或推送本次修改。

## 圆润资源图标 v5

当前十种货物使用 resources/*-rounded.png；通过内置 image_gen 逐件生成，与建筑和地形共用大色面、左上光和哑光微缩材质。resources/design.json 规定每种资源的颜色家族、亮暗色、独立轮廓及避免项，resources/prompts.json 保存完整提示词和生成来源。旧 resources/*.svg 为上一版参考，不再被原型引用。

原始 PNG 完整保留透明像素，不裁切、描边或滤色。tools/install-rounded-resources.cjs 根据 alpha > 16 的主体边界登记视觉尺寸、文件 SHA-256 和来源，原型与设计系统通过同一 catalog/provenance 使用这些素材。设计系统提供 16/20/24/32px、64px 原貌、灰度、剪影与价格胶囊检查。
