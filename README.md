# Claude 用量小工具（iPhone 主畫面 × Mac）

把 Mac 上 Claude Code（Claude Desktop 的 Code 分頁與終端機 CLI）的使用量、方案額度和 session 狀態，
顯示在 iPhone 主畫面的小工具上。資料由 Mac 產生，經 iCloud 雲碟送到手機，不經過任何第三方伺服器。

<img src="docs/images/widgets/5-pet-large.png" width="360" alt="小克的工作狀態頁">

```
Mac（每 5 分鐘）                       iCloud 雲碟                    iPhone
~/.claude/projects 的使用紀錄  ─┐
Claude Desktop 的 session 狀態 ─┼─▶ claude-usage.json ─▶ Scriptable 小工具（6 頁 × 3 尺寸）
claude /usage 的方案額度       ─┤
心跳（每分鐘）                  ─┘
```

## 交給 Claude 自動設定（推薦）

在 Mac 打開 **Claude Code**（Claude Desktop 的 Code 分頁或終端機 `claude`），貼上這一句：

> 請幫我安裝 https://github.com/zeuikli/claude-usage-widget 這個 iPhone 小工具：照 repo 裡 CLAUDE.md 的步驟在這台 Mac 設定好、跑 doctor.sh 驗證，再帶我完成 iPhone 上的步驟。

Claude 會：檢查環境 → 問你兩個選項（插電時是否保持清醒、是否要心跳）→ 安裝 → 用 `doctor.sh` 驗證 →
告訴你 iPhone 上剩下的 4 步（安裝 Scriptable、加小工具、選腳本、填參數）。iPhone 的部分 Apple 不允許程式代勞，需要你自己點。

之後想改版面，也可以直接跟 Claude 說，例如「把小克改成藍色」「大尺寸用量頁加一張快取圖」——它會先用預覽器給你看，確認後再更新到手機。

## 手動安裝（不用 Claude 也可以）

1. 下載：`git clone https://github.com/zeuikli/claude-usage-widget`，或按 Code → Download ZIP 解壓縮。
2. Mac：在資料夾裡依序執行 `bash doctor.sh --pre`、`bash install.sh`、`bash doctor.sh --wait`（全部 `[OK]` 就完成）。
3. iPhone：安裝 Scriptable，加一個 Scriptable 小工具，Script 直接選想看的頁面（例如「Claude Token 用量・速度」），Parameter 不用填。

## 會看到什麼

小工具有九頁，在「編輯小工具」的 **Script** 清單直接選：「Claude Token 用量」是用量頁，其他頁是「Claude Token 用量・<頁名>」（Mac 會自動放好這 8 份頁面腳本，內容與主腳本相同，只是依名稱決定頁面）。也可以照舊用主腳本加 Parameter 填下表的參數，有填 Parameter 時以它為準。每頁都有小、中、大三種尺寸。不想要頁面腳本可在 LaunchAgent 加環境變數 `USAGE_WIDGET_PAGE_SCRIPTS=0`。

| 參數 | 頁面 | 內容 |
| --- | --- | --- |
| （留空） | 用量 | 近 30 天實際使用、快取、今天、每日長條圖、5 小時與每週額度 |
| 趣味 | 趣味統計 | 連續使用天數、最常用的時段、快取省下多少（依 API 定價估算）、最忙的一天 |
| 更多 | 花絮 | 工具呼叫次數與排行、對話數、夜貓指數、最長的對話、換算成幾本書 |
| 狀態 | 工作狀態 | 哪些 session 在執行、等你回答、有新回覆；心跳與額度 |
| 寵物 | 小克 | 一隻跟著 session 狀態換表情的小寵物；體力＝5 小時額度、飽足＝今天用量、天線＝Remote Control |
| 額度 | 方案額度 | 圓環儀表、即時倒數到重置、照目前速度重置前會用到多少 |
| 日曆 | 使用日曆 | 半年熱力圖（像 GitHub 的貢獻圖）、目前與最長連續天數、最忙的一週 |
| 速度 | 各模型 tok/s | 生成速度、等第一個字的時間、思考與工具輸入速度（近 30 天中位數） |
| 洞察 | 背後的數據 | 你說一句 Claude 回幾次、思考占輸出多少、工具成功率、子代理用的模型、自動核准與壓縮次數、Claude Code 版本 |

另外還有**鎖定畫面小工具**（圓形、長方形、單行）與 **Siri 語音摘要**，見下方。

以下是 9 頁 × 3 種尺寸的模擬圖（示範資料，非真實帳號）。實機字型寬度會略有不同。

### 用量（參數留空）

| 小 | 中 | 大 |
| :-: | :-: | :-: |
| <img src="docs/images/widgets/1-usage-small.png" width="170" alt="用量・小"> | <img src="docs/images/widgets/1-usage-medium.png" width="340" alt="用量・中"> | <img src="docs/images/widgets/1-usage-large.png" width="340" alt="用量・大"> |

### 趣味

| 小 | 中 | 大 |
| :-: | :-: | :-: |
| <img src="docs/images/widgets/2-fun-small.png" width="170" alt="趣味・小"> | <img src="docs/images/widgets/2-fun-medium.png" width="340" alt="趣味・中"> | <img src="docs/images/widgets/2-fun-large.png" width="340" alt="趣味・大"> |

### 更多

| 小 | 中 | 大 |
| :-: | :-: | :-: |
| <img src="docs/images/widgets/3-more-small.png" width="170" alt="更多・小"> | <img src="docs/images/widgets/3-more-medium.png" width="340" alt="更多・中"> | <img src="docs/images/widgets/3-more-large.png" width="340" alt="更多・大"> |

### 狀態

| 小 | 中 | 大 |
| :-: | :-: | :-: |
| <img src="docs/images/widgets/4-status-small.png" width="170" alt="狀態・小"> | <img src="docs/images/widgets/4-status-medium.png" width="340" alt="狀態・中"> | <img src="docs/images/widgets/4-status-large.png" width="340" alt="狀態・大"> |

### 寵物

小克的心情跟著 session 狀態換——有人等你回應時舉手、有 session 在跑時冒汗、有新回覆時開心、深夜沒事時睡覺；頭上的天線亮綠燈代表 Remote Control 連著。

| 小 | 中 | 大 |
| :-: | :-: | :-: |
| <img src="docs/images/widgets/5-pet-small.png" width="170" alt="寵物・小"> | <img src="docs/images/widgets/5-pet-medium.png" width="340" alt="寵物・中"> | <img src="docs/images/widgets/5-pet-large.png" width="340" alt="寵物・大"> |

### 額度

| 小 | 中 | 大 |
| :-: | :-: | :-: |
| <img src="docs/images/widgets/6-limits-small.png" width="170" alt="額度・小"> | <img src="docs/images/widgets/6-limits-medium.png" width="340" alt="額度・中"> | <img src="docs/images/widgets/6-limits-large.png" width="340" alt="額度・大"> |

### 日曆

| 小 | 中 | 大 |
| :-: | :-: | :-: |
| <img src="docs/images/widgets/7-calendar-small.png" width="170" alt="日曆・小"> | <img src="docs/images/widgets/7-calendar-medium.png" width="340" alt="日曆・中"> | <img src="docs/images/widgets/7-calendar-large.png" width="340" alt="日曆・大"> |

### 洞察

| 小 | 中 | 大 |
| :-: | :-: | :-: |
| <img src="docs/images/widgets/9-insight-small.png" width="170" alt="洞察・小"> | <img src="docs/images/widgets/9-insight-medium.png" width="340" alt="洞察・中"> | <img src="docs/images/widgets/9-insight-large.png" width="340" alt="洞察・大"> |

這些都從本機 Claude Code 紀錄算出來（近 30 天）：你送出的訊息數、每則回覆的停止原因（還要用工具，或這回合結束）、
輸出 token 裡思考占多少與每次思考花多久、工具結果是否出錯、你按 Esc 中斷的次數、自動壓縮對話時的 token 數、
子代理實際跑的模型、權限決定（設定自動核准／你親手核准／被擋下），以及用過的 Claude Code 版本。

### 速度

| 小 | 中 | 大 |
| :-: | :-: | :-: |
| <img src="docs/images/widgets/12-speed-small.png" width="170" alt="速度・小"> | <img src="docs/images/widgets/12-speed-medium.png" width="340" alt="速度・中"> | <img src="docs/images/widgets/12-speed-large.png" width="340" alt="速度・大"> |

怎麼算的（每則回覆，近 30 天取中位數；輸出少於 200 token 或超過 10 分鐘的不計）：

| 指標 | 算法 |
| --- | --- |
| 含等待 | 輸出 token ÷（最後一行寫入時間 − 它回應的那一行，也就是你的訊息或工具結果的時間） |
| 等第一個字 | 第一行寫入前的時間，扣掉 Claude Code 記錄的思考時間 `thinkingDurationMs` |
| 生成 | 輸出 token ÷（總時間 − 等第一個字），最接近模型實際的出字速度 |
| 思考 | 思考 token（`output_tokens_details.thinking_tokens`）÷ 思考時間 |
| 工具輸入 | 非思考的輸出 token ÷ 工具輸入串流時間（`toolInputStreamMs`） |

時間戳是 Claude Code 寫入紀錄的時間，含網路延遲，所以是「你感受到的速度」而非伺服器端的純推論速度。

### 鎖定畫面

| 圓形 | 長方形 | 單行（時間上方） |
| :-: | :-: | :-: |
| <img src="docs/images/widgets/8-lock-circular.png" width="88" alt="鎖定畫面・圓形"> | <img src="docs/images/widgets/8-lock-rectangular.png" width="188" alt="鎖定畫面・長方形"> | <img src="docs/images/widgets/8-lock-inline.png" width="256" alt="鎖定畫面・單行"> |

圓形是 5 小時額度圓環（有 session 等你回應時下方會寫「等你 N」）；長方形多了即時倒數與每週額度；單行是一句話摘要。
iOS 會依鎖定畫面配色自動上色，所以實際顏色跟著你的桌布。加法：長按鎖定畫面 → 自訂 → 鎖定畫面 → 點小工具區 → Scriptable →
選樣式 → 點它選「Claude Token 用量」。鎖定畫面不分頁面，參數可以留空。

### Siri 語音摘要

「捷徑」App 新增捷徑：動作加 Scriptable 的「Run Script」選「Claude Token 用量」，捷徑取名「Claude 狀態」。
之後說「嘿 Siri，Claude 狀態」，Siri 會直接念出（不必再加「朗讀文字」動作）：

> Claude 狀態：5 小時用了百分之42，1 小時 21 分後重置；每週用了百分之31；有 1 個 session 在等你回應；1 個 session 在執行；今天用了 169萬 token。

### 設定頁（在 Scriptable 裡執行腳本）

在 Scriptable 點「Claude Token 用量」會打開設定頁，所有選項都存在 iCloud，小工具與 App 共用：

<img src="docs/images/app/settings-preview.png" width="320" alt="設定頁的預覽區：九頁各有小、中、大三個按鈕">

（iPhone 實機截圖）


| 區塊 | 選項 |
| --- | --- |
| 預覽 | 九頁各有「小／中／大」三個按鈕，點了直接預覽該尺寸；鎖定畫面長方形／圓形 |
| 通知 | **額度重置時通知**（5 小時與每週額度回滿的那一刻，事先排好、時間準）、**5 小時額度用到門檻時通知**（70／80／90%，每個區段一次）、**有 session 等你回應時通知**（附「打開 session」按鈕）、送一則測試通知 |
| 外觀 | **主題**：預設／暖橘漸層／夜空；**透明背景**（顯示桌布，iOS 27.2 以上）；**刷新按鈕 ↻**（標題列右邊，點了在主畫面直接重畫，iOS 17 以上，預設開） |
| 提醒事項與行事曆 | 每週額度用到門檻時建一則提醒事項、把每週額度重置時間寫進行事曆（第一次會詢問權限） |
| 版本 | 自動檢查新版（每 12 小時讀一次 GitHub 上的 `VERSION`，不傳出任何資料）；有新版時小工具底部會提示，設定頁可一鍵更新 |

| 夜空 | 暖橘漸層 |
| :-: | :-: |
| <img src="docs/images/widgets/10-theme-night-large.png" width="300" alt="夜空主題"> | <img src="docs/images/widgets/11-theme-warm-large.png" width="300" alt="暖橘漸層主題"> |
| <img src="docs/images/widgets/10-theme-night-medium.png" width="300" alt="夜空主題・中"> | <img src="docs/images/widgets/11-theme-warm-medium.png" width="300" alt="暖橘漸層主題・中"> |

圖示使用 Apple 的 SF Symbols（模擬圖以色點代替，實機是真正的圖示）。iPad 的特大尺寸會使用大尺寸版面。

開了專注模式（例如睡眠）時，通知會收進「專注模式期間」而不跳橫幅；想讓它照常提醒，到「設定 → 專注模式 → 該模式 → 允許的通知 → App」加入 Scriptable。

通知只能在腳本執行時排定（小工具刷新或你點開時）：「額度重置」時間事先知道，會準時送達；「有 session 等你回應」則取決於 iOS 多久刷新小工具，可能晚幾分鐘。

「幾分鐘前」與重置倒數由 iOS 即時跳動；其他數字在小工具刷新時更新（Mac 每 5 分鐘產生一次資料，
iOS 自己決定多久刷新小工具，通常 5–30 分鐘）。用量、趣味、更多頁點一下會打開 Scriptable 立刻重抓；
狀態、寵物、額度頁點一下會打開 Claude App（中、大尺寸點某個 session 會直接開那個 session）。

## 需要

- macOS，已用過 Claude Code（會有 `~/.claude/projects/`），有 `python3`。
- iPhone 安裝 [Scriptable](https://apps.apple.com/app/scriptable/id1405459188)，Mac 與 iPhone 登入同一個 Apple 帳號並開啟 iCloud 雲碟。
- 額度（5 小時、每週）需要 Mac 上有登入訂閱方案的 `claude` CLI（`~/.local/bin/claude`）；沒有的話這部分會改用 Claude Desktop 最後一筆紀錄或留空。
- 「狀態」「寵物」頁的 session 資訊來自 Claude Desktop；只用終端機 CLI 的話這兩頁會比較空。

## Mac 端安裝

```bash
bash install.sh
```

選項（可重複執行，改選項就重跑一次）：

- `--no-keepawake`：不要讓 Mac 插電時保持清醒。預設會用 `caffeinate -s` 讓 Mac **只在插電時**不睡（螢幕照樣關），以免 Remote Control 斷線；用電池時照常睡眠。
- `--no-heartbeat`：不要心跳。心跳每分鐘檢查 Claude Desktop 是否開著（沒開會在背景重新打開）、Remote Control 與網路。
  想暫停自動重開，在 `~/.claude/token-usage/` 建一個 `heartbeat.pause` 檔案。

安裝內容：

| 位置 | 用途 |
| --- | --- |
| `~/.claude/token-usage/export_usage.py` | 每 5 分鐘讀本機 Claude Code 紀錄，寫 `usage-daily.csv`（帳本）與 iCloud 的 `claude-usage.json` |
| `~/.claude/token-usage/heartbeat.py` | 每分鐘心跳，寫 `heartbeat.json` |
| `doctor.sh` | 健檢：安裝前後都能跑，逐項列出 `[OK]`／`[!!]`／`[--]` 與修法 |
| `~/Library/LaunchAgents/claude-usage-widget.*.plist` | 三個背景服務：`export`、`heartbeat`、`keepawake` |
| iCloud `Scriptable/Claude Token 用量.js` | iPhone 小工具腳本 |

立刻重跑一次匯出：

```bash
launchctl kickstart -k gui/$(id -u)/claude-usage-widget.export
```

> 注意：`claude-usage.json` 只能由背景服務寫。從終端機直接執行 `export_usage.py` 寫 iCloud 的檔案，
> 之後背景服務可能永遠卡在開檔（macOS 對 iCloud 檔案的限制）。要手動測試請加
> `USAGE_WIDGET_DIR=/tmp/某個資料夾` 寫到別處。

## iPhone 端

1. 打開 Scriptable，等「Claude Token 用量」出現在腳本清單（iCloud 同步可能要一兩分鐘；如果安裝 Mac 端時還沒裝 Scriptable，背景匯出會在 5 分鐘內自動補上腳本）。點一下執行，可預覽每一頁。
2. 長按主畫面空白處 → 左上「＋」→ 搜尋 Scriptable → 選尺寸 → 加入。
3. 長按新的小工具 → 編輯小工具：Script 選想看的頁面——「Claude Token 用量」（用量）或「Claude Token 用量・速度」等，Parameter 留空。
4. 想多頁，就加多個小工具，或疊成「智慧型堆疊」上下滑。

選用：讓資料更常更新——「捷徑」→ 自動化 →「＋」→ App → 選常開的 App、勾「已關閉」、「立即執行」→
動作加 Scriptable 的「Run Script」選「Claude Token 用量」。從捷徑執行時不會跳選單，只會更新手機上的資料。

## 修改

- 版面都在 `ios/Claude Token 用量.js`，每一頁是一個函式：`usagePage`、`funPage`、`morePage`、`statusPage`、`petPage`、`limitsPage`、`calendarPage`、`insightPage`、`speedPage`，鎖定畫面是 `lockPage`。
  大尺寸用 `BIG` 與 `S(小, 大)` 切換字級；`contentWidth()` 依 iPhone 寬度算內容寬（內容超過實際寬度時，iOS 會把整列字縮小）。
- 資料欄位在 Mac 的 `export_usage.py` 最後組成 `summary`；加欄位後小工具才讀得到。
- 預覽：不用 iPhone 也能看版面。

  ```bash
  cp "ios/Claude Token 用量.js" tools/preview/w.js
  cd tools/preview && python3 -m http.server 8765
  ```

  用瀏覽器開 `http://127.0.0.1:8765/?data=sample.json`（示範資料），一次看 9 頁 × 3 尺寸（加 `&lock=1` 看鎖定畫面）；
  `&pages=狀態,寵物` 只看指定頁；`&pages=寵物&only=large&shot=1` 只畫一個小工具（README 的圖就是這樣截的）。想看自己的資料，把 iCloud 的 `claude-usage.json` 複製到 `tools/preview/`，網址拿掉 `?data=sample.json`。
  超出邊框的會標紅框。預覽器的尺寸是在 402pt 寬的 iPhone 量的（中、大 360pt 寬，大尺寸 359pt 高），
  實機字寬會略有差異，最後以手機為準。
- 改完把 `.js` 覆蓋到 iCloud 的 Scriptable 資料夾（或貼進 Scriptable），在 Scriptable 裡執行一次即生效。

## 資料與隱私

- 只讀本機檔案：`~/.claude/projects/**/*.jsonl`（token 數、時間、工具名稱、專案資料夾名稱，以及停止原因、思考時間、工具是否出錯、權限決定等統計欄位）、
  Claude Desktop 的 session 紀錄（標題、狀態）與 `remote-control-state.json`。**不讀對話內容。**
- 會寫進你自己 iCloud 的內容：用量數字、專案資料夾名稱、session 標題與它們的 Remote Control 連結。
  若標題或專案名稱敏感，分享截圖前請留意。
- 額度由 `claude -p /usage --no-session-persistence` 取得；程式本身不讀取任何登入憑證，也不呼叫模型、不花 token。
- 「快取省下」與金額依公開 API 定價估算，不是你的實際帳單。Claude Desktop 一般聊天不在本機紀錄裡，不會被計入。
- Claude Desktop 的 session 檔是 App 內部格式，App 改版後「狀態」「寵物」頁可能失效；其他頁不受影響。

## 移除

```bash
bash uninstall.sh
```

再到 iPhone 刪除小工具與 Scriptable 腳本；不要的資料刪 `~/.claude/token-usage/`。

## 更新紀錄

見 [CHANGELOG.md](CHANGELOG.md)。

## 授權

MIT License，歡迎自由使用與修改。本專案與 Anthropic 無關；「小克」是原創角色。
