# 美术素材

## 立体图标系统（评审 v1）

精选素材、来源清单和许可证位于 [icons/v1](icons/v1/README.md)，在 [UI Design System](../docs/ui-system.html#icons) 中评审。当前采用第一版 City Kit 风格的 2D 重绘图标：20 个透明 PNG 与 12 个项目操作 SVG。建筑通过生产设备与成品表达用途，不附加产物角标。仅复制采用文件，不依赖整包目录。已用于游戏原型的建筑、货物、金币与部分操作图标；工人手指继续沿用原有动画素材。

仓库根 `.gitignore` 排除了完整的 `Kenney Game Assets All-in-1 3.7.0/` 及同名 ZIP。

## 当前原型的像素图标

全部来自 Kenney（kenney.nl）的 Tiny Town / Tiny Farm / Tiny Battle / Cursor Pack，CC0 许可，见 LICENSE-kenney.txt。以 base64 内嵌在 index.html 的 sprite 里（避免每次重绘重新请求）。

Tiny 系列是 16×16 像素图，页面里以整数倍放大并使用 `image-rendering: pixelated`。cursor.png 是 32×32，在地图上被缩小到 13 像素左右，所以它单独用 `image-rendering: auto`：最近邻缩小会把它 1 像素的描边打碎。

| 文件 | 来源 | 用途 |
| --- | --- | --- |
| camp.png | tiny-farm tile_0084（斧头） | 伐木营 |
| sawmill.png | tiny-battle tile_0047（蓝色工厂） | 锯木厂 |
| quarry.png | tiny-town tile_0115（镐） | 采石场 |
| town.png | tiny-battle tile_0082（橙色城镇） | 城镇 |
| log.png | tiny-farm tile_0097 | 原木 |
| board.png | tiny-farm tile_0098 | 木板 |
| stone.png | tiny-battle tile_0006 | 石头 |
| coin.png | tiny-town tile_0093 | 金币 |
| cursor.png | cursor-pack PNG/Outline/Default/hand_point_n | 工人（指向上方的手指） |
