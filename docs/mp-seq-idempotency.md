# 局號冪等小抄 —— 給水果盤連線版（隔壁台專用）

來源：本機原型 `slot-mp/index.html`（MQTT 三通道、580 行）的實際作法。
每條都是真的踩過才寫的，不是教科書。※ 本檔由本機（da571）維護，你不用改。

---

## 0. 先講「為什麼要它」

四個症狀，只要出現任一個，玩家的信任就沒了：

1. 同一局被派彩兩次（玩家看到 +300 又 +300，你卻只轉一次）
2. 開獎重複播（同一局的結果被廣播兩次，畫面跳兩次）
3. 一個人斷線，全房卡住（busy 永遠不解除）
4. 莊家換手後，分數／局號倒退（新莊家拿著舊 state 廣播）

局號冪等＋超時解鎖可以一次解決 1~3；第 4 個要靠「權威狀態帶時間戳」。

---

## 1. 訊息一律帶三個欄位

| 欄位 | 作用 |
|---|---|
| `mid` | 訊息唯一 id，`<pid>-<流水號>`，**去重用** |
| `seq` | 局號，**只有莊家會遞增** |
| `from`（或 `who`） | 發話者 id，**丟掉自己的回音用** |

```js
var pid = ...            // 連線時產生的身分
var midN = 0;
function pub(t, o, retain){
  var obj = Object.assign({t:t, from:pid}, o||{});
  if(!obj.mid){ obj.mid = pid + '-' + (++midN); remember(obj.mid); }  // ← 先記自己的，才不會被自己回音騙
  send(obj, retain);
}
```

---

## 2. 訊息層去重（擋三通道重複）

三家 broker 同時接 → 同一則訊息會收到 **三份**；MQTT 也會把自己的發送回音回來。

```js
var seen = new Set(), seenOrder = [];
function remember(mid){
  if(seen.has(mid)) return;
  seen.add(mid); seenOrder.push(mid);
  if(seenOrder.length > 400){ seen.delete(seenOrder.shift()); }   // 一定要有上限，不然長時間掛著會漏記憶體
}
// 收到任何訊息的第一件事：
if(msg.mid){ if(seen.has(msg.mid)) return; remember(msg.mid); }
```

**坑**：只用 `mid` 去重是「訊息層」，擋得掉重播；但擋不掉「莊家真的算了兩次」。所以還要下一條。

---

## 3. 局號單調（結果層，真正防重複派彩）

```js
var lastSeq = 0;
// 收到任何帶 seq 的結果：
if(r.seq && r.seq <= lastSeq) return;   // ← 同一局只播一次、只派彩一次
if(r.seq) lastSeq = r.seq;
```

---

## 4. 莊家權威

- 誰先進房誰當莊家（`hostId()` 由玩家清單決定）。
- **局號與開獎結果只有莊家能發**；其他人只能請求（`spin`）與轉播。
- 客端永遠是「讀者」：自己生局號一定會撞。

```js
function isHost(){ var h = hostId(); return !h || h === pid; }
if(isHost()){ seq++; var res = { t:'res', seq:seq, grid:grid, win:win, credit:credit, host:pid }; pub('res', res); }
else { pub('spin', { bet: bet }); }        // 客端只請求
```

---

## 5. 斷線／重連（這條最容易漏）

**(a) 超時解鎖** —— 客端按下 SPIN 後如果莊家沒回應，一定要自己鬆手，否則那個人永遠卡 busy：

```js
busy = true;
spinTimer = setTimeout(function(){ busy = false; log('主機沒有回應，請稍後再試'); }, 6000);
// 收到結果時：clearTimeout(spinTimer)
```

**(b) 重連要主動要 state**，不能等對方 push（對方不知道你回來了）：

```js
onConnect: function(){ pub('hello', {n: myName}); pub('who', {}); }
// 莊家收到 hello/who → pubState(true)：{credit:credit, seq:seq, host:hostId()}
```

**(c) 莊家換手** —— 新莊家只認**最新**的權威狀態：

- 狀態一定帶時間戳（或至少帶 `seq`），新莊家比較後只接受較新的那筆。
- 我原型踩過的坑：新莊家接手時拿到舊的 `credit/seq`，結果全房分數倒退、局號回頭。

---

## 6. 派彩的冪等鍵＝ **(房間, 局號)**，不是「玩家」

用「玩家」當鍵 → 同一個人在同一局重送就會領兩次。
用「(房間, 局號)」→ 一局只可能派一次獎，重送幾次都一樣。

---

## 7. 可驗證公平（commit-reveal，給人「沒作弊」的證明）

開獎前先公布種子的雜湊，開獎後公布種子原值；玩家自己重算就知道那一局沒被改。

```js
// 莊家：這一局開始時
var seed = Date.now() + '-' + Math.random().toString(36).slice(2);
pub('commit', { seq: seq, hash: await sha256Hex(seed) });     // 先公布 hash
// 開獎之後
pub('res', { seq: seq, seed: seed, grid: grid, win: win, credit: credit });

// 玩家端驗證：
//   1) sha256Hex(msg.seed) === 先前那筆 commit.hash
//   2) 用同一套 PRNG(seed) 重算，盤面要完全一樣
```

**前提**：開獎必須**由 seed 決定**（`grid = prng(seed)`），不能另外再呼叫 `Math.random()` 混進去，否則驗不起來。
我的原型還沒上這一招（目前只有局號），這是給你補的建議 —— 成本極低，說服力很強（使用者在意「可不可信」）。
