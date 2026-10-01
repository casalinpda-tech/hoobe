/**
 * HOOBE 琥比水果盤・連線版 —— 「申請加入連線」自動審批
 *
 * 執行環境：Google Apps Script（免費，不需要伺服器、不需要伺服器費用）
 * 用途：使用者在網頁填表 → 這支程式驗通關密語 → 呼叫 Tailscale API
 *       建立「裝置分享邀請」寄給申請者 → 同時把遊戲網址一起寄過去。
 *
 * ── 一次性設定（見 ./README.md）────────────────────────────
 * 指令碼屬性（專案設定 → 指令碼屬性）要設這幾項：
 *   TS_API_KEY     Tailscale API 金鑰（Keys 頁產生，**必須是使用者金鑰**，最長 90 天）
 *   TS_DEVICE_ID   hoobe-sever 的機器 ID（node 的 Self.ID，形如 nXXXXXXXXXXXXXX）
 *   PASS_PHRASE    通關密語（只有自己人知道，驗在這裡，不會出現在網頁上）
 *   GAME_URL       給通過者用的遊戲網址（例：http://hoobe-sever.xxxx.ts.net:3000）
 *   NOTIFY_EMAIL   你自己的信箱（有人申請時通知你）
 *   KEY_SET_DATE   金鑰設定日 YYYY-MM-DD（用來提醒你換金鑰，可留空）
 *   SHEET_ID       選用：要寫申請紀錄的 Google Sheet ID（留空則只寄信）
 *
 * 部署：部署 → 新增部署作業 → 類型「網頁應用程式」
 *       執行身分：我　/　具有存取權的使用者：任何人
 *       部署後把「網頁應用程式網址」貼到 slot-online/join/index.html 的 APPLY_ENDPOINT
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, message: '沒有收到資料。' });
    }

    var body = JSON.parse(e.postData.contents);
    var name = String(body.name || '').trim().slice(0, 8);
    var email = String(body.email || '').trim().toLowerCase();
    var pass = String(body.pass || '').trim();

    if (!name) return json({ ok: false, message: '請先填稱呼。' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, message: '信箱格式不對。' });

    var P = PropertiesService.getScriptProperties();
    if (!pass || pass !== P.getProperty('PASS_PHRASE')) {
      logRow(name, email, 'FAIL 通關密語錯誤');
      return json({ ok: false, message: '通關密語不對，請跟小賀確認。' });
    }

    var apiKey = P.getProperty('TS_API_KEY');
    var deviceId = P.getProperty('TS_DEVICE_ID');
    if (!apiKey || !deviceId) {
      return json({ ok: false, message: '申請通道尚未設定完成，請直接跟小賀說一聲。' });
    }

    // 建立「裝置分享邀請」（單次有效；Tailscale 會寄信給申請者）
    var url = 'https://api.tailscale.com/api/v2/device/' + encodeURIComponent(deviceId) + '/device-invites';
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Basic ' + Utilities.base64Encode(apiKey + ':') },
      payload: JSON.stringify({ invites: [{ email: email }] }),
      muteHttpExceptions: true
    });

    var code = res.getResponseCode();
    var text = res.getContentText();

    if (code < 200 || code >= 300) {
      logRow(name, email, 'FAIL HTTP ' + code + ' ' + text.slice(0, 300));
      notifyOwner('自動核准失敗', name + ' <' + email + '> 申請失敗：HTTP ' + code + '\n' + text.slice(0, 500));
      return json({ ok: false, message: '邀請寄送失敗（' + code + '）。請跟小賀說一聲。' });
    }

    var inviteUrl = '';
    try {
      var d = JSON.parse(text);
      if (d.invites && d.invites[0] && d.invites[0].inviteUrl) inviteUrl = d.invites[0].inviteUrl;
    } catch (err) {}

    var gameUrl = P.getProperty('GAME_URL') || '';

    // 用我們自己的信箱寄出通知（連線位置只寫在信裡，不放在公開網頁上）
    GmailApp.sendEmail(
      email,
      'HOOBE 琥比水果盤・連線版 —— 你的連線邀請',
      name + ' 你好，\n\n' +
      '你申請加入「琥比水果盤・連線版」，已經核准了。兩件事：\n\n' +
      '一、先裝 Tailscale（免費）：\n' +
      '    https://tailscale.com/download\n' +
      '    裝好後登入你自己的帳號（Google／Microsoft／GitHub 都可以）。\n\n' +
      '二、點下面這個連結接受邀請（單次有效，請不要轉給別人）：\n' +
      (inviteUrl ? ('    ' + inviteUrl + '\n\n') : '    （邀請連結產生失敗，請跟小賀說一聲）\n\n') +
      '接受之後，遊戲在這裡：\n' +
      (gameUrl ? ('    ' + gameUrl + '\n') : '    （網址請跟小賀索取）\n') +
      '\n這台主機不一定開著 —— 打不開就是我們家那台還沒開機，晚點再試就好。\n\n' +
      '—— 琥比遊戲間'
    );

    logRow(name, email, 'OK');
    notifyOwner('自動核准成功', name + ' <' + email + '> 已自動核准並寄出邀請。');

    return json({ ok: true, message: '申請已核准，邀請已寄到 ' + email + '，請去收信（也看一下垃圾信匣）。' });

  } catch (err) {
    return json({ ok: false, message: '申請處理發生錯誤，請跟小賀說一聲。' });
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function notifyOwner(subject, body) {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return;
  try { GmailApp.sendEmail(to, '[琥比遊戲間] ' + subject, body); } catch (e) {}
}

function logRow(name, email, result) {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) return;
  try {
    var sh = SpreadsheetApp.openById(id).getSheets()[0];
    if (sh.getLastRow() === 0) sh.appendRow(['時間', '稱呼', '信箱', '結果']);
    sh.appendRow([new Date(), name, email, result]);
  } catch (e) {}
}

/**
 * 金鑰到期提醒：Tailscale 使用者金鑰最長 90 天。
 * 在 Apps Script 設一個「每日」時間驅動觸發器指向這支函式即可。
 * 第 80 天與第 88 天各提醒一次（KEY_SET_DATE 沒設就每 30 天提醒一次）。
 */
function keyReminder() {
  var P = PropertiesService.getScriptProperties();
  var set = P.getProperty('KEY_SET_DATE');
  var today = new Date();
  if (!set) {
    var last = P.getProperty('LAST_REMIND') || '';
    var stamp = Utilities.formatDate(today, 'Asia/Taipei', 'yyyy-MM');
    if (last === stamp) return;
    P.setProperty('LAST_REMIND', stamp);
    notifyOwner('提醒：請檢查 Tailscale API 金鑰', '建議把金鑰設定日填入指令碼屬性 KEY_SET_DATE（YYYY-MM-DD），之後我會在金鑰快到期前提醒你。');
    return;
  }
  var days = Math.floor((today - new Date(set + 'T00:00:00+08:00')) / 86400000);
  ['80', '88'].forEach(function (d) {
    var key = 'REMIND_' + d;
    if (days >= Number(d) && P.getProperty(key) !== set) {
      P.setProperty(key, set);
      notifyOwner('提醒：Tailscale API 金鑰即將到期（已 ' + days + ' 天）',
        '金鑰最長 90 天。請到 https://console.tailscale.com/admin/settings/keys 產生新金鑰，\n' +
        '再把指令碼屬性的 TS_API_KEY 換掉、KEY_SET_DATE 改成今天。\n' +
        '（不換的話，「申請加入連線」會停止自動核准。）');
    }
  });
}
