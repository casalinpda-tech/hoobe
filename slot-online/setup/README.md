# 「申請加入連線」—— 兩種做法，先挑一種就好

公開頁面完全不出現任何 IP 或主機名稱；申請者透過表單提出，由我們決定要不要給。
下面兩種做法**選一種**即可，差別只在「核准」是人工還是自動。

| | 做法 A：半自動（推薦先做這個） | 做法 B：全自動 |
|---|---|---|
| 你要準備 | 一個 Google 表單（約 2 分鐘） | Google Apps Script ＋ Tailscale API 金鑰 |
| 每個人核准 | 你到 Tailscale 後台按一下 | 完全自動 |
| 金鑰 | 不需要 | 需要（且每 90 天要換） |
| 適合 | 家人三五個 | 常常有人要加入 |

---

# 做法 A：半自動（最快路徑）

## A-1. 建立申請表（約 2 分鐘）

1. 到 <https://forms.google.com> → 空白表單
2. 標題填「申請加入琥比水果盤・連線版」
3. 加三個「簡答」題目（欄位名稱請照抄，之後比較好對）：

   | 題目 | 必填 |
   |---|---|
   | 你的稱呼（會顯示在遊戲畫面上） | 是 |
   | 電子信箱（邀請會寄到這裡） | 是 |
   | 通關密語 | 是 |

4. 右上「**回覆**」→ 打開「**取得新回覆的電子郵件通知**」
   （這樣有人填表，你就會收到一封含內容的通知信）
5. 右上「**傳送**」→ 連結 → 勾「縮短網址」→ 複製

## A-2. 把表單網址貼進網頁

編輯 `slot-online/join/index.html`，找到下面這一行，貼上第 5 步複製的網址：

```js
var FORM_URL = '';   // ← 貼上 Google 表單連結
```

還沒填之前，申請頁會顯示「申請通道還沒開通」的友善提示（不會是壞掉的頁面）。

## A-3. 收到通知後怎麼核准（每人約 30 秒）

1. Tailscale 後台 → <https://login.tailscale.com/admin/machines>
   找到 `hoobe-sever` → 該列的「…」選單 → **Share**
2. **Share by email** → 填入申請者的信箱 → Share
   （Tailscale 會寄一封邀請信給他）
3. 再回一封信把**遊戲網址**給他
   （網址怎麼組見最下面「遊戲網址怎麼來」）

對方收到信、按一次接受，就能連進來玩了。
要撤銷某人：同一個 Share 對話框裡 → Revoke invite。

## A-4.（選用）通關密語

做法 A 沒有程式可以驗密語，所以**通關密語就靠你自己看**：
通知信裡如果密語不對，就不要核准。
（想要真的做程式驗證，就做做法 B。）

---

# 做法 B：全自動（進階）

流程：

```
申請者填表（join/index.html 內建表單）
   → Google Apps Script（驗通關密語）
      → Tailscale API：建立「裝置分享邀請」給這個信箱
      → 用 Gmail 寄一封通知信（內含邀請連結 ＋ 遊戲網址）
   → 申請者按信裡的連結接受 → 完成
```

## B-1. 取得裝置 ID 與網路名稱

在樹莓派上執行（這行沒有引號、不會被換行切斷）：

```bash
tailscale status --json | head -40
```

- `"ID": "nXXXXXXXXXXXXXX"` → `TS_DEVICE_ID`
- `"DNSName": "hoobe-sever.<你的網路>.ts.net."` → 遊戲網址就是
  `http://hoobe-sever.<你的網路>.ts.net:3000`

（若看不到，也可以到 Tailscale 後台 → DNS 頁面查 MagicDNS 名稱。）

## B-2. 產生 Tailscale API 金鑰

<https://console.tailscale.com/admin/settings/keys> → Generate access token

- ⚠️ **一定要用「使用者金鑰」**。Tailscale 官方明文：device invites
  **不能**用 OAuth client 產生的金鑰建立（見 API 文件
  `/device/{deviceId}/device-invites` 的說明）。
- ⚠️ 最長 **90 天**，到期要換（Code.gs 內建到期提醒，會寄信給你）。
- 金鑰只放進 Apps Script 的指令碼屬性，**不要**寫進 repo、不要貼在對話裡。

## B-3. 建立 Apps Script

1. <https://script.google.com> → 新增專案
2. 把 `setup/Code.gs` 的內容整份貼進 `Code.gs`
3. 專案設定 → **指令碼屬性**，新增這幾項：

   | 屬性 | 內容 |
   |---|---|
   | `TS_API_KEY` | B-2 的金鑰 |
   | `TS_DEVICE_ID` | B-1 的裝置 ID |
   | `PASS_PHRASE` | 你自訂的通關密語 |
   | `GAME_URL` | `http://hoobe-sever.<你的網路>.ts.net:3000` |
   | `NOTIFY_EMAIL` | 你的信箱（有人申請時通知你） |
   | `KEY_SET_DATE` | 今天的日期 `YYYY-MM-DD` |
   | `SHEET_ID` | 選用：申請紀錄要寫進哪張 Google Sheet |

4. 部署 → 新增部署作業 → 類型「**網頁應用程式**」
   - 執行身分：**我**
   - 具有存取權的使用者：**任何人**
5. 授權（第一次會要你同意寄信與對外連線的權限）
6. 複製「**網頁應用程式網址**」（形如 `https://script.google.com/macros/s/AKfy.../exec`）

## B-4. 設金鑰到期提醒（建議）

Apps Script → 觸發條件 → 新增觸發條件
- 函式：`keyReminder`
- 事件來源：時間驅動 → 日計時器

> 註：`join/index.html` 目前是「做法 A」的版本（連到 Google 表單）。
> 要改成做法 B，就是把裡面那段換成原本的內建表單版本（會 POST 到 Apps Script 網址）。
> 需要時跟水果盤專員說一聲就好。

---

# 為什麼用「裝置分享」而不是「加入我的網路」

Tailscale 的分享有兩種：

| 方式 | 對方看到什麼 | 風險 |
|---|---|---|
| 使用者邀請（加入我的 tailnet） | 我家**所有**裝置（含我的 Windows 電腦） | 高 |
| **裝置分享（本方案用的）** | **只有 hoobe-sever 這一台** | 低 |

裝置分享預設還會**隔離**：被分享的機器可以接受連線，但**不能主動連出去**。
所以就算有人矇混通過了，他也只能玩這台遊戲機，碰不到家裡其他電腦。

（來源：<https://tailscale.com/kb/1084/sharing>　「Sharing is available for all plans.」）

---

# 遊戲網址怎麼來

```
http://hoobe-sever.<你家 tailnet 的 MagicDNS 名稱>:3000
```

- 分享出去的機器**只能用完整主機名稱**連，不能用家用內網位址
  （內網位址只在同一個 Wi-Fi 內有效）。
- MagicDNS 名稱可以在 Tailscale 後台 → DNS 頁面看到，
  或樹莓派上 `tailscale status --json | head -40` 看 `DNSName`。

# 注意事項

- **未使用的邀請連結 30 天後失效**（Tailscale 規定），所以是「申請一次、產生一次」。
- 要撤銷某人：Tailscale 後台 → Machines → hoobe-sever → Share → Revoke invite。
- `Code.gs` 本身不含任何機密，所以放在公開 repo 沒問題；
  機密全部在 Apps Script 的指令碼屬性裡（做法 B 才需要）。
