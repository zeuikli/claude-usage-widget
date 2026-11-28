#!/usr/bin/env python3
"""Claude token usage from local Claude Code transcripts (~/.claude/projects/**/*.jsonl).

Writes usage-daily.csv: one row per local day, model and app (Claude Desktop Code tab or CLI) with
input (uncached), output, cache_write, cache_read and the number of replies. Each reply is counted
once (the same message id and request id can appear on several lines). Desktop chat conversations
are kept on Claude's servers and are not in these files.
"""
import csv, datetime, glob, json, os, re, signal, sys
from collections import defaultdict

DAYS = int(os.environ.get("USAGE_DAYS", "90"))
root = os.path.expanduser("~/.claude/projects")
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "usage-daily.csv")
now = datetime.datetime.now().astimezone()
since = (now - datetime.timedelta(days=DAYS)).replace(hour=0, minute=0, second=0, microsecond=0)
fields = ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
rows = defaultdict(lambda: [0, 0, 0, 0, 0])
seen = set()
# Extra detail for the widget, last 30 days only.
start30 = (now - datetime.timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
home_prefix = os.path.expanduser("~").replace("/", "-")
# API list prices per million tokens (input, output) and cache-read multiplier, from the claude-api skill
# (2026-11-03). Cache writes: 1.25x input for the 5-minute TTL, 2x for the 1-hour TTL.
PRICES = {"claude-fable-5-2": (8, 40, 0.025), "claude-mythos-5-2": (8, 40, 0.025), "claude-fable-5-1": (10, 50, 0.025), "claude-fable-5": (10, 50, 0.1),
          "claude-opus-5-5": (4, 20, 0.05), "claude-opus-5": (5, 25, 0.1), "claude-opus-4-8": (5, 25, 0.1),
          "claude-opus-4-7": (5, 25, 0.1), "claude-opus-4-6": (5, 25, 0.1), "claude-sonnet-5-5": (2, 10, 0.05),
          "claude-sonnet-5": (2, 10, 0.1), "claude-sonnet-4-6": (3, 15, 0.1), "claude-haiku-5-5": (0.1, 0.5, 0.1),
          "claude-haiku-4-5": (1, 5, 0.1)}
hours = [[0, 0] for _ in range(24)]          # replies, output tokens by local hour
weekdays = [0] * 7                           # replies by weekday (Mon=0)
projects = defaultdict(lambda: [0, 0])       # tokens, replies
apps = defaultdict(int)                      # actual tokens by app
cost = [0.0, 0.0]                            # API-price estimate with cache, and if every cached token were plain input
cost_day = defaultdict(float)                # API-price estimate per local day and per model (last 30 days)
cost_model = defaultdict(float)
unpriced = set()
longest = [0, ""]
tools = defaultdict(int)                     # tool calls by friendly name
tool_ids = set()
sessions = defaultdict(lambda: [0, "", ""])  # replies, project, last day
sub_replies = [0]                            # replies made by subagents
thinking = [0]
today_span = [None, None]                    # first and last reply today (local time)
today_iso = now.date().isoformat()
# "Insights" (last 30 days): what happens behind each reply. Counted from user/system lines too.
ins = defaultdict(int)
think_ms, compact_tokens = [], []
sub_models, versions, branches = defaultdict(int), set(), set()


def note_other(d, t):
    """Count the non-reply lines of the last 30 days: your prompts, tool results, interruptions, compactions."""
    if d.get("version"):
        versions.add(d["version"])
    if d.get("gitBranch") not in (None, "", "HEAD"):
        branches.add(d["gitBranch"])
    pd = d.get("permissionDecision")
    if isinstance(pd, dict):
        ins["perm_" + ("user" if str(pd.get("source", "")).startswith("user") else pd.get("decision", "?"))] += 1
    if d.get("type") == "system":
        st = d.get("subtype")
        if st == "compact_boundary":
            ins["compactions"] += 1
            compact_tokens.append(int((d.get("compactMetadata") or {}).get("preTokens") or 0))
        elif st == "api_error":
            ins["api_errors"] += 1
        return
    tur = d.get("toolUseResult")
    if isinstance(tur, dict):
        if tur.get("resolvedModel"):
            sub_models[tur["resolvedModel"]] += 1
        if tur.get("timedOutAfterMs"):
            ins["timeouts"] += 1
    c = (d.get("message") or {}).get("content")
    blocks = c if isinstance(c, list) else [{"type": "text", "text": c}] if isinstance(c, str) else []
    results = [b for b in blocks if isinstance(b, dict) and b.get("type") == "tool_result"]
    ins["tool_results"] += len(results)
    ins["tool_errors"] += sum(1 for b in results if b.get("is_error"))
    text = " ".join(str(b.get("text", "")) for b in blocks if isinstance(b, dict) and b.get("type") == "text")
    if "[Request interrupted" in text:
        ins["interrupts"] += 1
    elif not results and text.strip() and not text.lstrip().startswith("<") and not d.get("isMeta") \
            and not d.get("isSidechain") and not d.get("isCompactSummary"):
        ins["prompts"] += 1


# Speed per model (last 30 days). A reply's clock starts at the line it answers (its parent: your prompt or a tool
# result) and stops at its last line. Time to first token = until the first line, minus the thinking time Claude Code
# records; "generation" = output tokens / the rest. Thinking and tool-input speeds use the durations Claude Code logs.
speed = defaultdict(lambda: {"e2e": [], "gen": [], "ttft": [], "think": [], "tool": []})
uuid_re, ts_re = re.compile(r'"uuid":"([^"]+)"'), re.compile(r'"timestamp":"([^"]+)"')


def iso_s(x):
    return datetime.datetime.fromisoformat(x.replace("Z", "+00:00")).timestamp()


def add_speeds(reps, uuid_ts):
    for r in reps.values():
        pts = uuid_ts.get(r["parent"])
        if not pts:
            continue
        t0, first, last = iso_s(pts), min(r["ts"]), max(r["ts"])
        dur = last - t0
        if r["out"] < 200 or not 1 <= dur <= 600:
            continue
        s = speed[r["model"]]
        s["e2e"].append(r["out"] / dur)
        ttft = (first - t0) - r["think_ms"] / 1000
        if 0 < ttft < 60:
            s["ttft"].append(ttft)
            if dur - ttft > 0.5:
                s["gen"].append(r["out"] / (dur - ttft))
        if r["think_ms"] > 500 and r["think"] > 50:
            s["think"].append(r["think"] / (r["think_ms"] / 1000))
        if r["tool_ms"] > 500 and r["out"] - r["think"] > 100:
            s["tool"].append((r["out"] - r["think"]) / (r["tool_ms"] / 1000))


for path in glob.glob(root + "/**/*.jsonl", recursive=True):
    if os.path.getmtime(path) < since.timestamp():
        continue
    uuid_ts, reps = {}, {}
    with open(path, errors="ignore") as f:
        for line in f:
            if '"uuid":"' in line:  # cheap: every line's time, so a reply can find when its parent was written
                mu, mt = uuid_re.search(line), ts_re.search(line)
                if mu and mt:
                    uuid_ts[mu.group(1)] = mt.group(1)
            other = '"type":"user"' in line or '"type":"system"' in line
            if '"usage"' not in line and not other:
                continue
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if d.get("type") in ("user", "system"):
                ts = d.get("timestamp")
                if ts and datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")) >= start30:
                    note_other(d, ts)
                continue
            m = d.get("message") or {}
            u, ts = m.get("usage"), d.get("timestamp")
            if d.get("type") != "assistant" or not u or not ts or m.get("model") in (None, "<synthetic>"):
                continue
            t = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone()
            if t < since:
                continue
            # One reply can be split over several lines that share its id, each with other content blocks,
            # so tool calls and thinking blocks are counted per block before the reply-level dedup.
            if t >= start30:
                for b in m.get("content") or []:
                    if not isinstance(b, dict):
                        continue
                    if b.get("type") == "tool_use" and b.get("id") not in tool_ids:
                        tool_ids.add(b.get("id"))
                        name = b.get("name") or "?"
                        if not name.startswith("mcp__ccd_turn"):
                            tools[name.split("__")[-1]] += 1
                    elif b.get("type") == "thinking":
                        thinking[0] += 1
                if d.get("thinkingDurationMs"):
                    think_ms.append(int(d["thinkingDurationMs"]))
            key = (m.get("id"), d.get("requestId"))
            if t >= start30:  # every line of the reply, before the dedup below
                r_ = reps.setdefault(key, {"model": m["model"], "parent": d.get("parentUuid"), "ts": [], "out": 0,
                                          "think": 0, "think_ms": 0, "tool_ms": 0})
                r_["ts"].append(t.timestamp())
                r_["out"] = max(r_["out"], int(u.get("output_tokens") or 0))
                r_["think"] = max(r_["think"], int((u.get("output_tokens_details") or {}).get("thinking_tokens") or 0))
                r_["think_ms"] += int(d.get("thinkingDurationMs") or 0)
                r_["tool_ms"] += int(d.get("toolInputStreamMs") or 0)
            if key in seen:
                continue
            seen.add(key)
            app = "Desktop" if d.get("entrypoint") == "claude-desktop" else "CLI"
            r = rows[(t.date().isoformat(), m["model"], app)]
            v = [int(u.get(k) or 0) for k in fields]
            for i in range(4):
                r[i] += v[i]
            r[4] += 1
            if t >= start30:
                hours[t.hour][0] += 1
                hours[t.hour][1] += v[1]
                weekdays[t.weekday()] += 1
                proj = os.path.relpath(path, root).split(os.sep)[0]
                proj = proj[len(home_prefix):].lstrip("-") if proj.startswith(home_prefix) else proj
                proj = re.sub(r"--claude-worktrees-.*|-scratchpad-.*|-wt-.*", "", proj)  # fold worktrees into their repo
                projects[proj or "~"][0] += sum(v)
                projects[proj or "~"][1] += 1
                if d.get("isSidechain"):
                    sub_replies[0] += 1
                else:
                    sess = sessions[d.get("sessionId") or path]
                    sess[0] += 1
                    sess[1], sess[2] = proj or "~", t.date().isoformat()
                ins["stop_" + str(m.get("stop_reason"))] += 1
                ins["thinking_tokens"] += int((u.get("output_tokens_details") or {}).get("thinking_tokens") or 0)
                cc = u.get("cache_creation") or {}
                ins["write_1h"] += int(cc.get("ephemeral_1h_input_tokens") or 0)
                ins["write_5m"] += int(cc.get("ephemeral_5m_input_tokens") or 0)
                if t.date().isoformat() == today_iso:
                    hm = t.strftime("%H:%M")
                    today_span[0] = min(today_span[0] or hm, hm)
                    today_span[1] = max(today_span[1] or hm, hm)
                apps[app] += v[0] + v[1]
                if v[1] > longest[0]:
                    longest[:] = [v[1], t.date().isoformat()]
                price = PRICES.get(m["model"])
                if price:
                    pin, pout, read = price
                    w1h = int((u.get("cache_creation") or {}).get("ephemeral_1h_input_tokens") or 0)
                    w5m = max(0, v[2] - w1h)
                    c = (v[0] * pin + v[1] * pout + w5m * pin * 1.25 + w1h * pin * 2 + v[3] * pin * read) / 1e6
                    cost[0] += c
                    cost_day[t.date().isoformat()] += c
                    cost_model[m["model"]] += c
                    cost[1] += ((v[0] + v[2] + v[3]) * pin + v[1] * pout) / 1e6
                else:
                    unpriced.add(m["model"])
    add_speeds(reps, uuid_ts)
# Claude Code deletes transcripts after cleanupPeriodDays (30 by default), so the CSV doubles as a ledger:
# a day already counted keeps its larger value instead of shrinking when its transcripts are cleaned up.
if os.path.exists(out):
    with open(out, newline="") as f:
        for rec in csv.DictReader(f):
            key = (rec["date"], rec["model"], rec["app"])
            old = [int(rec[k]) for k in ("input", "output", "cache_write", "cache_read", "replies")]
            cur = rows.get(key)
            if cur is None or sum(old[:4]) > sum(cur[:4]):
                rows[key] = old
with open(out, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["date", "model", "app", "input", "output", "cache_write", "cache_read", "replies"])
    for (day, model, app), r in sorted(rows.items()):
        w.writerow([day, model, app, *r])

def plan_limits():
    """5-hour and weekly plan limits, read with Claude Code's own /usage command.

    Claude Code handles its sign-in (and refreshes it) itself; this script never touches the credentials.
    --no-session-persistence keeps it from leaving a transcript every run. Returns [] when unavailable.
    """
    import subprocess
    import shutil
    # launchd starts with a bare PATH, so look in the usual install places too.
    claude = next((c for c in (os.path.expanduser("~/.local/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude",
                               shutil.which("claude")) if c and os.path.exists(c)), None)
    if not claude:
        print("plan_limits: claude CLI not found, using Claude Desktop's last sample", file=sys.stderr)
        return desktop_limits()
    try:
        r = subprocess.run([claude, "-p", "/usage", "--no-session-persistence"], capture_output=True, text=True,
                           timeout=90, cwd=os.path.expanduser("~/.claude/token-usage"))
    except (OSError, subprocess.TimeoutExpired) as e:
        print("plan_limits:", e, file=sys.stderr)
        return []
    out = []
    for line in r.stdout.splitlines():
        m = re.match(r"\s*Current (session|week \(([^)]+)\)): (\d+)% used(?: · resets (.+?)(?: \(([^)]+)\))?)?\s*$", line)
        if not m:
            continue
        label = "5 小時" if m.group(1) == "session" else ("每週" if m.group(2) == "all models" else "每週 " + m.group(2))
        resets = None
        if m.group(4):
            txt = m.group(4).strip()
            for fmt_ in ("%b %d at %I:%M%p", "%b %d at %I%p", "%I:%M%p", "%I%p"):
                try:
                    t = datetime.datetime.strptime("%d %s" % (now.year, txt.replace("\u202f", " ")), "%Y " + fmt_)
                except ValueError:
                    continue
                if "%b" in fmt_:
                    if t.month < now.month - 6:
                        t = t.replace(year=now.year + 1)
                else:
                    t = datetime.datetime.combine(now.date(), t.time())
                    if t.time() < now.time():
                        t += datetime.timedelta(days=1)
                resets = t.astimezone().isoformat(timespec="minutes")  # the CLI prints the Mac's local time
                break
        out.append({"label": label, "percent": int(m.group(3)), "resets": resets, "resets_text": m.group(4),
                    "source": "cli", "at": now.isoformat(timespec="minutes")})
    if not out:
        print("plan_limits: no limits in /usage output (exit %s), using Claude Desktop's last sample" % r.returncode,
              file=sys.stderr)
        out = desktop_limits()
    return out


def desktop_limits():
    """Fallback: the last plan-usage sample Claude Desktop saved (only when its usage card was shown)."""
    try:
        with open(os.path.expanduser("~/Library/Application Support/Claude/plan-usage-history.json")) as f:
            last = (json.load(f).get("samples") or [])[-1]
    except (OSError, ValueError, IndexError):
        return []
    at = datetime.datetime.fromtimestamp(last["t"] / 1000).astimezone().isoformat(timespec="minutes")
    u = last.get("u") or {}
    return [{"label": label, "percent": int(u[key]), "resets": None, "resets_text": None, "source": "desktop", "at": at}
            for key, label in (("fh", "5 小時"), ("sd", "每週")) if key in u]


def read_heartbeat():
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "heartbeat.json")) as f:
            hb = json.load(f)
        hb["events"] = hb.get("events", [])[-5:]
        return hb
    except (OSError, ValueError):
        return None


remote = [0]  # recent sessions reachable through Remote Control, set by live_sessions()


def live_sessions():
    """Claude Desktop Code-tab sessions that are running or waiting on the user, for the status page.

    Reads the app's own session records (an internal format that may change) and the tail of each
    session's transcript. Never raises: the status page is optional.
    """
    out = []
    remote[0] = 0
    base = os.path.expanduser("~/Library/Application Support/Claude/claude-code-sessions")
    now_ms = now.timestamp() * 1000
    for meta_path in glob.glob(base + "/*/*/local_*.json"):
        try:
            with open(meta_path) as f:
                meta = json.load(f)
            last = meta.get("lastActivityAt") or 0
            if meta.get("isArchived") or now_ms - last > 7 * 86400e3:
                continue
            # Remote Control: switched on for this session, or left at the default and eligible for it.
            rc = meta.get("remoteControlUserEnabled")
            if rc or (rc is None and meta.get("remoteControlAutoEligible")):
                remote[0] += 1
            cli = meta.get("cliSessionId")
            found = glob.glob(root + "/*/" + cli + ".jsonl") if cli else []
            state, ask = "idle", ""
            if found:
                tp = found[0]
                idle_min = (now.timestamp() - os.path.getmtime(tp)) / 60
                with open(tp, "rb") as f:
                    f.seek(max(0, os.path.getsize(tp) - 400_000))
                    lines = f.read().decode("utf-8", "ignore").splitlines()[1:]
                last_asst, pending = None, {}
                for line in lines:
                    if '"type":"assistant"' not in line and '"type":"user"' not in line:
                        continue
                    try:
                        d = json.loads(line)
                    except ValueError:
                        continue
                    if d.get("isSidechain"):
                        continue
                    content = (d.get("message") or {}).get("content")
                    if d.get("type") == "assistant":
                        last_asst = d["message"]
                        for b in content or []:
                            if isinstance(b, dict) and b.get("type") == "tool_use":
                                pending[b.get("id")] = b
                                if b.get("name", "").endswith("wrap_up"):
                                    inp = b.get("input") or {}
                                    ask = inp.get("ask") or ""
                    elif isinstance(content, list):
                        for b in content:
                            if isinstance(b, dict) and b.get("type") == "tool_result":
                                pending.pop(b.get("tool_use_id"), None)
                    else:
                        ask = ""  # a new user prompt starts a new turn
                names = [b.get("name") or "" for b in pending.values()]
                ended = last_asst is not None and last_asst.get("stop_reason") == "end_turn" and not pending
                if any(n in ("AskUserQuestion", "ExitPlanMode") for n in names):
                    state = "question"
                elif pending and idle_min > 2 and not any(n in ("Bash", "Agent", "Workflow", "Monitor") for n in names):
                    state = "approval"
                elif not ended and idle_min < 15:
                    state = "running"
                elif ended and ask:
                    state = "decide"
                elif ended and (meta.get("lastFocusedAt") or 0) < (meta.get("lastTurnEdgeAt") or 0):
                    state = "unread"
            if meta.get("interruptedAwaitingPerson") and state == "idle":
                state = "decide"
            if state == "idle":
                continue
            out.append({"title": meta.get("title") or "（未命名）", "state": state, "ask": ask[:80],
                        "bridge": (meta.get("bridgeSessionIds") or [""])[-1] if (rc or (rc is None and meta.get("remoteControlAutoEligible"))) else "",
                        "at": datetime.datetime.fromtimestamp(last / 1000).astimezone().isoformat(timespec="minutes")})
        except Exception as e:  # noqa: BLE001 - one bad record must not stop the export
            print("live_sessions:", meta_path, e, file=sys.stderr)
    order = {"question": 0, "approval": 1, "decide": 2, "unread": 3, "running": 4}
    return sorted(out, key=lambda x: (order[x["state"]], x["at"]), reverse=False)


# Compact summary for the iPhone widget (Scriptable reads it from iCloud Drive).
widget_dir = os.path.expanduser(os.environ.get(
    "USAGE_WIDGET_DIR", "~/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents"))
if os.path.isdir(widget_dir):
    # If Scriptable was set up after install.sh ran, put the widget script there now (install.sh keeps a copy here).
    script_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Claude Token 用量.js")
    script_dst = os.path.join(widget_dir, "Claude Token 用量.js")
    if os.path.exists(script_src) and not os.path.exists(script_dst):
        import shutil
        shutil.copyfile(script_src, script_dst)
    # One copy per page, named "Claude Token 用量・<頁名>": in the widget's Script picker the user chooses the page
    # instead of typing a Parameter. The copies follow the main script in iCloud (also after an in-app update),
    # and are rewritten only when their content differs. USAGE_WIDGET_PAGE_SCRIPTS=0 turns this off.
    if os.environ.get("USAGE_WIDGET_PAGE_SCRIPTS", "1") != "0":
        main_code = None
        for src in (script_dst, script_src):
            try:
                with open(src, encoding="utf-8") as f:
                    main_code = f.read()
                if "Script.setWidget" in main_code and "pageFromName" in main_code:
                    break
                main_code = None
            except OSError:
                pass
        if main_code:
            for page in ("趣味", "更多", "狀態", "寵物", "額度", "日曆", "洞察", "速度", "費用"):
                copy = os.path.join(widget_dir, "Claude Token 用量・%s.js" % page)
                try:
                    with open(copy, encoding="utf-8") as f:
                        if f.read() == main_code:
                            continue
                except OSError:
                    pass
                with open(copy, "w", encoding="utf-8") as f:
                    f.write(main_code)
    today = now.date()
    def total(lo, hi):
        t = [0, 0, 0, 0, 0]
        for (day, _, _), r in rows.items():
            if lo <= day <= hi:
                t = [a + b for a, b in zip(t, r)]
        return {"input": t[0], "output": t[1], "cache_write": t[2], "cache_read": t[3], "replies": t[4],
                "actual": t[0] + t[1], "cache": t[2] + t[3], "total": sum(t[:4])}
    d = lambda n: (today - datetime.timedelta(days=n)).isoformat()
    daily = []
    for n in range(29, -1, -1):
        x = total(d(n), d(n))
        daily.append({"date": d(n), "actual": x["actual"], "cache": x["cache"]})
    by_model = defaultdict(int)
    for (day, model, _), r in rows.items():
        if d(29) <= day:
            by_model[model] += sum(r[:4])
    summary = {"generated": now.isoformat(timespec="seconds"), "range": [d(29), d(0)],
               "last30": total(d(29), d(0)), "prev30": total(d(59), d(30)), "today": total(d(0), d(0)),
               "daily": daily, "models": sorted(by_model.items(), key=lambda kv: -kv[1])[:5]}
    active = {day for (day, _, _) in rows}
    streak = 0
    while d(streak) in active:
        streak += 1
    busiest = max(daily, key=lambda x: x["actual"])
    # Half a year of daily actual use for the calendar heat map (the CSV ledger keeps days whose
    # transcripts are gone), plus the longest run of active days ever recorded.
    per_day = defaultdict(int)
    for (day, _, _), r in rows.items():
        per_day[day] += r[0] + r[1]
    calendar = [[d(n), per_day.get(d(n), 0)] for n in range(181, -1, -1)]
    best, run, prev = 0, 0, None
    for day in sorted(k for k, v in per_day.items() if v):
        cur = datetime.date.fromisoformat(day)
        run = run + 1 if prev and (cur - prev).days == 1 else 1
        best, prev = max(best, run), cur
    # Monthly API-price estimate from the CSV ledger (it outlives the transcripts). The ledger does not
    # split cache writes by TTL, so they are priced with the last 30 days' share of 1-hour writes.
    w_all = ins["write_1h"] + ins["write_5m"]
    w_mult = 1.25 + 0.75 * (ins["write_1h"] / w_all if w_all else 0)
    months = defaultdict(lambda: [0.0, set()])
    for (day, model, _), r in rows.items():
        price = PRICES.get(model)
        if price:
            pin, pout, read = price
            months[day[:7]][0] += (r[0] * pin + r[1] * pout + r[2] * pin * w_mult + r[3] * pin * read) / 1e6
            months[day[:7]][1].add(day)
    summary["costs"] = {
        "daily": [[x["date"], round(cost_day.get(x["date"], 0), 2)] for x in daily],
        "models": [[k, round(v, 2)] for k, v in sorted(cost_model.items(), key=lambda kv: -kv[1])[:5]],
        "months": [[k, round(v[0], 2), len(v[1])] for k, v in sorted(months.items())[-6:]],
    }
    summary.update({
        "calendar": calendar, "best_streak": best,
        "streak": streak, "active_days": sum(1 for x in daily if x["actual"] or x["cache"]),
        "busiest": busiest, "hours": hours, "weekdays": weekdays,
        "projects": sorted(([k, *v] for k, v in projects.items()), key=lambda x: -x[1])[:5],
        "apps": dict(apps), "longest_reply": longest,
        "cost_usd": round(cost[0], 2), "cost_nocache_usd": round(cost[1], 2), "unpriced_models": sorted(unpriced),
        "tools": sorted(tools.items(), key=lambda kv: -kv[1])[:8], "tool_calls": sum(tools.values()),
        "sessions": len(sessions), "longest_session": max(sessions.values(), default=[0, "", ""]),
        "subagent_replies": sub_replies[0], "thinking_blocks": thinking[0], "today_span": today_span,
        "insights": dict(ins, think_ms_median=sorted(think_ms)[len(think_ms) // 2] if think_ms else 0,
                         think_ms_p90=sorted(think_ms)[int(len(think_ms) * 0.9)] if think_ms else 0,
                         compact_tokens_median=sorted(compact_tokens)[len(compact_tokens) // 2] if compact_tokens else 0,
                         sub_models=sorted(sub_models.items(), key=lambda kv: -kv[1])[:5],
                         versions=[min(versions, key=lambda v: [int(x) for x in v.split(".") if x.isdigit()]),
                                   max(versions, key=lambda v: [int(x) for x in v.split(".") if x.isdigit()]), len(versions)]
                         if versions else [], branches=len(branches),
                         # [model, replies, end-to-end, generation, time to first token (s), thinking, tool input] — medians
                         speed=sorted(([k, len(v["e2e"])] + [round(sorted(v[x])[len(v[x]) // 2], 1) if v[x] else None
                                                              for x in ("e2e", "gen", "ttft", "think", "tool")]
                                       for k, v in speed.items() if len(v["e2e"]) >= 30), key=lambda x: -x[1])),
        "live": live_sessions(), "remote_sessions": remote[0], "limits": plan_limits(),
        "heartbeat": read_heartbeat()})
    # Written in place by the LaunchAgent. Under launchd, opening or renaming onto an iCloud Drive file
    # that another process (an interactive shell) created blocks indefinitely, so only the agent writes it;
    # the alarm turns such a hang into a failed run instead of a stuck job.
    signal.alarm(120)
    with open(os.path.join(widget_dir, "claude-usage.json"), "w") as f:
        json.dump(summary, f, ensure_ascii=False)
    signal.alarm(0)
print(out, len(rows), "rows", len(seen), "replies", "generated", now.isoformat(timespec="seconds"))
