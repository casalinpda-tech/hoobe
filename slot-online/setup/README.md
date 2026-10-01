# 「申請加入連線」自動審批 —— 建置說明

目的：讓家人／朋友在分享站填一張表單，**自動**取得進入連線版的邀請，
而且**公開頁面上完全不出現任何 IP 或主機名稱**。

流程：

```
申請者填表（slot-online/join/）
   → Google Apps Script（驗通關密語）
      → Tailscale API：建立「裝置分享邀請」給這個信箱
      → 用 Gmail 寄一封通知信（內含邀請連結 ＋ 遊戲網址）
   → 申請者按信裡的連結接受 → 他的裝置就加入（只看到這台遊戲主機）
```

---

## 為什麼用「裝置分享」而不是「加入我的網路」

Tailscale 的分享有兩種：

| 方式 | 對方看到什麼 | 風險 |
|---|---|---|
| 使用者邀請（加入我的 tailnet） | 我家**所有**裝置（含我的 Windows 電腦） | 高 |
| **裝置分享（本方案用的）** | **只有 hoobe-sever 這一台** | 低 |

裝置分享預設還會**隔離**：被分享的機器可以接受連線，但**不能主動連出去**。
所以就算有人亂申請通過了，他也只能玩這台遊戲機，碰不到家裡其他電腦。

（來源：<https://tailscale.com/kb/1084/sharing>　「Sharing is available for all plans.」）

---

## 一次性設定（約 10 分鐘）

### 1. 取得兩個值

在樹莓派上執行：

```bash
# ① 這台機器的裝置 ID（nodes 的 Self.ID）
tailscale status --json | python3 -c "import json,sys;print(json.load(sys.stdin)['Self']['ID'])"

# ② 你們家 tailnet 的 MagicDNS 名稱（後面拿來組遊戲網址）
tailscale status --json | python3 -c "import json,sys;print(json.load(sys.stdin).get('MagicDNSSuffix',''))"
```

- ① 的結果（形如 `nXXXXXXXXXXXXXX`）＝ `TS_DEVICE_ID`
- ② 的結果（形如 `tailxxxx.ts.net`）→ 遊戲網址就是
  `http://hoobe-sever.<②的結果>:3000`
  （若 ② 印不出來，到 Tailscale 後台 → DNS 頁面看 MagicDNS 名稱）

### 2. 產生 Tailscale API 金鑰

<https://console.tailscale.com/admin/settings/keys> → Generate access token

- ⚠️ **一定要用「使用者金鑰」**。Tailscale 官方明文：
  device invites **不能**用 OAuth client 產生的金鑰建立
  （見 API 文件 `/device/{deviceId}/device-invites` 的說明）。
- ⚠️ 最長 **90 天**，到期要換（Code.gs 內建到期提醒，會寄信給你）。
- 金鑰只放進 Apps Script 的指令碼屬性，**不要**寫進 repo、不要貼在對話裡。

### 3. 建立 Apps Script

1. <https://script.google.com> → 新增專案
2. 把 `setup/Code.gs` 的內容整份貼進 `Code.gs`
3. 專案設定 → **指令碼屬性**，新增這幾項：

| 屬性 | 內容 |
|---|---|
| `TS_API_KEY` | 步驟 2 的金鑰 |
| `TS_DEVICE_ID` | 步驟 1 ① 的裝置 ID |
| `PASS_PHRASE` | 你自訂的通關密語（只給自己人） |
| `GAME_URL` | `http://hoobe-sever.<②的結果>:3000` |
| `NOTIFY_EMAIL` | 你的信箱（有人申請時通知你） |
| `KEY_SET_DATE` | 今天的日期 `YYYY-MM-DD` |
| `SHEET_ID` | 選用：申請紀錄要寫進哪張 Google Sheet |

4. 部署 → 新增部署作業 → 類型「**網頁應用程式**」
   - 執行身分：**我**
   - 具有存取權的使用者：**任何人**
5. 授權（第一次會要你同意寄信與對外連線的權限）
6. 複製「**網頁應用程式網址**」（形如 `https://script.google.com/macros/s/AKfy.../exec`）

### 4. 把網址貼進網頁

編輯 `slot-online/join/index.html`，找到這一行，把網址填進去：

```js
var APPLY_ENDPOINT = '';   // ← 貼上第 3 步的網頁應用程式網址
```

填好之前，申請頁會顯示「申請通道還沒開通」的友善提示（不會壞掉）。

### 5. 設金鑰到期提醒（建議）

Apps Script → 觸發條件 → 新增觸發條件
- 函式：`keyReminder`
- 事件來源：時間驅動 → 日計時器

---

## 申請者那一端會經歷什麼

1. 打開 `…/hoobe/slot-online/` → 按「申請加入連線 ▶」
2. 填：稱呼、信箱、通關密語 → 送出
3. 立刻在網頁看到「已核准，邀請已寄到你的信箱」
4. 收到我們寄的信：內容含 Tailscale 安裝網址、邀請連結、遊戲網址
5. 按連結接受（單次有效）→ 之後就能連進來玩

---

## 注意事項

- **未使用的邀請連結 30 天後失效**（Tailscale 規定），所以是「申請一次、產生一次」。
- 分享的機器**只能用完整主機名稱**連（`<hostname>.<tailnet>.ts.net`），
  不能用家用內網位址（那只在同一個 Wi-Fi 內有效）。
- 要撤銷某人：Tailscale 後台 → Machines → hoobe-sever → Share → Revoke invite。
- `Code.gs` 本身不含任何機密，所以放在公開 repo 沒問題；
  機密全部在 Apps Script 的指令碼屬性裡。
