# 給 Claude（與其他 AI 代理）的自動設定流程

使用者把這個 repo 交給你，意思是：**在這台 Mac 裝好 Claude 用量小工具，驗證通過，並帶他完成 iPhone 上無法自動化的幾步。**
用使用者的語言回覆（預設繁體中文）。照下列順序做，每一步的實際輸出要看過再往下。

## 完成條件

1. `bash doctor.sh` 結束碼 0（沒有 `[!!]`）。
2. 使用者已在 iPhone 主畫面看到小工具，或你已給他下方「iPhone 步驟」並說明只剩這幾步。

## 步驟

### 0. 取得 repo

若目前資料夾不是這個 repo，先放到固定位置（已存在就 `git -C ~/claude-usage-widget pull`）：

```bash
git clone https://github.com/zeuikli/claude-usage-widget ~/claude-usage-widget && cd ~/claude-usage-widget
```

### 1. 安裝前檢查

```bash
bash doctor.sh --pre
```

- `[!!] 沒有 Claude Code 使用紀錄`：請使用者先用過 Claude Code 再來。
- `[!!] iCloud 雲碟沒開`／`還沒有 Scriptable 的 iCloud 資料夾`：這兩項需要使用者動手（見「iPhone 步驟」第 1 步）。
  **Scriptable 資料夾不必等**：可以先安裝，資料夾出現後背景匯出會在 5 分鐘內自動放好小工具腳本。
- `[--]` 項目只影響部分頁面，告知即可。

### 2. 問使用者兩個選項（用選項題，一次問完）

- **插電時讓 Mac 保持清醒**（預設：要）。好處：Remote Control 不會因 Mac 睡著而斷線、資料持續更新；代價：插電時系統不睡（螢幕照常關）。不要就加 `--no-keepawake`。
- **心跳**（預設：要）。每分鐘檢查 Claude Desktop、Remote Control 與網路，Claude Desktop 被關掉會在背景重新打開。不要就加 `--no-heartbeat`。
  沒裝 Claude Desktop 的使用者建議不要。

### 3. 安裝

```bash
bash install.sh [--no-keepawake] [--no-heartbeat]
```

### 4. 驗證

```bash
bash doctor.sh --wait
```

必須沒有 `[!!]`。失敗時看 `~/.claude/token-usage/export.log`，修好後重跑。要立刻重跑匯出：

```bash
launchctl kickstart -k gui/$(id -u)/claude-usage-widget.export
```

### 5. 帶使用者做 iPhone 步驟

把下面這段（必要時依 doctor 結果調整）交給使用者：

1. iPhone 從 App Store 安裝 **Scriptable**（免費），打開一次；設定 → Apple 帳號 → iCloud → iCloud 雲碟要開著。
2. 在 Scriptable 腳本清單等「**Claude Token 用量**」出現（iCloud 同步可能 1–5 分鐘），點一下執行，選一頁預覽。
3. 長按主畫面空白處 → 左上「＋」→ 搜尋 **Scriptable** → 選尺寸（建議「大」）→ 加入小工具。
4. 長按新的小工具 →「編輯小工具」→ Script 從清單選頁面：「Claude Token 用量」＝用量頁，「Claude Token 用量・趣味／更多／狀態／寵物／額度／日曆／洞察／速度／費用」＝各頁
   （Mac 的背景匯出自動放好這 9 份頁面腳本）。不需要填 Parameter。
5. 想看多頁：加多個小工具疊成「智慧型堆疊」，上下滑切換。
6. 選用：鎖定畫面小工具（長按鎖定畫面 → 自訂 → 加 Scriptable 小工具）、Siri 語音摘要（見 README「Siri 語音摘要」）。

然後問使用者有沒有看到；看到就完成。

## 規則（一定要遵守）

- **不要從終端機直接執行 `export_usage.py` 寫 iCloud 的 `claude-usage.json`。** 由互動 shell 建立的 iCloud 檔，之後背景服務可能永遠卡在開檔。
  要重跑匯出用上面的 `launchctl kickstart`；要手動測試加 `USAGE_WIDGET_DIR=/tmp/某資料夾` 寫到別處。
- 不讀取、不印出任何登入憑證或 token；額度只透過 `claude -p /usage --no-session-persistence` 取得。
- 只動這個工具自己的檔案：`~/.claude/token-usage/`、`~/Library/LaunchAgents/claude-usage-widget.*.plist`、
  Scriptable 資料夾裡的 `Claude Token 用量.js` 與 `claude-usage.json`。不要改使用者其他的 LaunchAgent 或系統設定。
- 不要替使用者在 App Store 下載、登入或購買任何東西；iPhone 上的步驟由使用者自己做。

## 疑難排解

| 症狀 | 處理 |
| --- | --- |
| iPhone 看不到「Claude Token 用量」腳本 | Mac 上 `ls ~/Library/Mobile\ Documents/iCloud~dk~simonbs~Scriptable/Documents/`；有檔案就是 iCloud 還沒同步到手機，請使用者打開 Scriptable 等一下 |
| 小工具顯示「暫時讀不到用量資料」 | `bash doctor.sh`；通常是 claude-usage.json 還沒產生或 iCloud 還沒同步 |
| 小工具右上角時間變橘色 | 超過 90 分鐘沒更新：Mac 睡著、關機，或 iCloud 延遲 |
| 額度頁「這次沒讀到額度」 | 沒有登入訂閱方案的 `claude` CLI；請使用者在終端機執行 `claude` 登入一次 |
| 「狀態」「寵物」頁是空的 | 只用終端機 CLI、沒用 Claude Desktop 時正常 |
| 通知沒跳出來 | Scriptable 開在前景時 iOS 不跳橫幅（測試通知已改成 5 秒後送出）；開著專注模式時通知會收進「專注模式期間」，請使用者把 Scriptable 加進該專注模式允許的 App。設定頁「查看已排定與已送出的通知」可確認有沒有排上 |
| 要移除 | `bash uninstall.sh`，再請使用者在 iPhone 刪掉小工具與腳本 |

## 發布新版時（維護者）

改了 `ios/Claude Token 用量.js` 就要同時把腳本裡的 `const VERSION` 與 repo 根目錄的 `VERSION` 改成同一個新版本號
（`YYYY.M.D`，同一天第二版起加 `.1`、`.2`），否則使用者的小工具不會提示更新、一鍵更新也拿不到新版。

## 使用者想改版面時

版面在 `ios/Claude Token 用量.js`（每頁一個函式，見 README「修改」）。改完先預覽給使用者看，確認後再部署：

```bash
cp "ios/Claude Token 用量.js" tools/preview/w.js
cd tools/preview && python3 -m http.server 8765   # 開 http://127.0.0.1:8765/?data=sample.json
```

部署：把 `.js` 複製到 `~/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents/` 與 `~/.claude/token-usage/`，
請使用者在 Scriptable 執行一次。內容寬度不要超過 `contentWidth()`，否則 iOS 會把整列文字縮小。
