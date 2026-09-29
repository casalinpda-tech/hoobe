# 琥比遊戲間 HOOBE

免費分享用的遊戲入口頁。一個網址、兩台機台。

線上網址：https://casalinpda-tech.github.io/hoobe/

## 目錄結構

```
index.html            入口首頁（兩張卡：輪盤／水果盤）
roulette/index.html   完整版輪盤（本體，單一檔案、GIF 已內嵌 base64）
slot/index.html       琥比水果盤 —— 預留位子（施工中，不是可玩的機台）
assets/hubi.jpg       琥比照片（入口首頁用）
assets/hub.gif        琥比動畫（128×128）
```

## 之後怎麼更新

- **水果盤做好**：把做好的單一 HTML 覆蓋掉 `slot/index.html`，並把 `index.html` 裡那張卡的
  `<div class="tag soon">施工中</div>` 改成 `<div class="tag live">可以玩了</div>`、
  說明文字與按鈕文字一起改，其餘不用動。
- **輪盤改版**：用新版覆蓋 `roulette/index.html`（記得更新的版本要保留 `<title>` 那一段 head 設定）。
  原稿在 `D:\AI\roulette-lcd\table.html`。
- 推送後 GitHub Pages 約 1 分鐘生效，可用 `Ctrl+F5` 強制更新快取。

## 技術備註

- 純靜態，無任何外部 CDN 依賴，離線也能開。
- `.nojekyll`：避免 Pages 的 Jekyll 處理動到檔案（含底線開頭的檔名）。
- 圖示與展示圖都是用 HTML/CSS/SVG 畫的，沒有用 AI 生圖當介面。

© 琥比 HOOBE
