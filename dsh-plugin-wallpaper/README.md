# dsh-plugin-wallpaper

DeepSeek Harness 壁纸插件 - 聊天界面自定义背景

## 功能

- 支持图片壁纸 (JPG, PNG, GIF)
- 支持视频壁纸 (MP4, WebM) - 自动播放、循环、静音
- 透明度控制 (遮罩层)
- 填充/适应/拉伸三种模式
- 设置自动保存到 localStorage
- 一键清除壁纸

## 安装

```bash
dsh plugin add /path/to/dsh-plugin-wallpaper
```

## 使用

### 通过 UI

插件会在界面右上角添加一个壁纸管理面板，可以：
1. 粘贴图片或视频 URL
2. 选择媒体类型 (图片/视频)
3. 调整显示模式
4. 调整透明度
5. 点击"设置"应用

### 通过 Agent

Agent 可以使用以下工具：
- `set_wallpaper(url, type, mode, opacity)` - 设置壁纸
- `clear_wallpaper()` - 清除壁纸

### 通过控制台

```javascript
// 设置图片壁纸
WallpaperManager.set('https://example.com/image.jpg', 'cover', 0.3);

// 设置视频壁纸
WallpaperManager.setVideo('https://example.com/video.mp4');

// 清除壁纸
WallpaperManager.clear();
```

## 文件结构

```
dsh-plugin-wallpaper/
├── package.json      # 插件配置
├── index.js          # 服务端插件
├── client.js         # 客户端 React 组件
└── README.md         # 本文档
```

## 技术说明

- 客户端使用 React 组件注入到 `shell.overlay` 插槽
- 壁纸元素使用 absolute 定位，覆盖在聊天区域下方
- 遮罩层使用 semi-transparent 黑色背景，确保文字可读
- 设置存储在 localStorage，刷新后自动恢复

## License

MIT
