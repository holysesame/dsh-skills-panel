window.__ModuleLoader__.load({
  id: "dsh-skills-panel",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
    var ReactDOM = require("react-dom");
    var h = React.createElement;
    var SKILLS = [];

    var PANEL_ID = "skills-panel";
    var PIN_KEY = "dsh-skills-panel.pinned";

    function loadPins() {
      try {
        var raw = window.localStorage.getItem(PIN_KEY);
        var parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(function (x) { return typeof x === "string"; }) : [];
      } catch (error) { return []; }
    }

    function savePins(pins) {
      try { window.localStorage.setItem(PIN_KEY, JSON.stringify(pins)); } catch (error) { /* ignore */ }
    }


    /** Compact description of the composer DOM, for the failure hint. */
    function describeComposer() {
      var parts = [];
      try {
        parts.push("conv:" + (document.querySelector('[data-slot="conversation"]') ? "y" : "n"));
        var tas = document.querySelectorAll("textarea");
        parts.push("ta:" + tas.length);
        for (var i = 0; i < Math.min(tas.length, 2); i++) {
          var t = tas[i];
          var b = t.getBoundingClientRect();
          parts.push("[ph=" + (t.getAttribute("data-phase") || "-") + " w=" + Math.round(b.width) + " h=" + Math.round(b.height) + "]");
        }
        parts.push("ce:" + document.querySelectorAll('[contenteditable="true"]').length);
        parts.push("path:" + String(location.pathname).slice(0, 30));
      } catch (error) { parts.push("err"); }
      return parts.join(" ");
    }

    /** Insert text into a contenteditable composer at the end of its content. */
    /** 在可编辑区末尾插入；必要时先补一个空格，保证 / 命令单独成 token。 */
    function insertIntoEditable(el, name) {
      el.focus();
      var before = (el.innerText || el.textContent || "").replace(/\u200b/g, "");
      var trimmedRight = before.replace(/\s+$/, "");
      // 已有内容且末尾不是空格 → 先补空格，否则 /name 会粘在前一个词上
      var needsLeadingSpace = trimmedRight.length > 0;
      var text = (needsLeadingSpace ? " " : "") + "/" + name + " ";

      var selection = window.getSelection();
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);

      var inserted = false;
      try { inserted = document.execCommand("insertText", false, text); } catch (error) { inserted = false; }
      if (!inserted) {
        el.textContent = before + text;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      }
      return needsLeadingSpace ? "已插入（已补前置空格）" : "已插入";
    }

    /** Compact description of the composer DOM, for the failure hint. */
    function describeComposer() {
      var parts = [];
      try {
        parts.push("conv:" + (document.querySelector('[data-slot="conversation"]') ? "y" : "n"));
        parts.push("ta:" + document.querySelectorAll("textarea").length);
        parts.push("ce:" + document.querySelectorAll('[contenteditable="true"]').length);
        parts.push("path:" + String(location.pathname).slice(0, 30));
      } catch (error) { parts.push("err"); }
      return parts.join(" ");
    }

    /** Write "/name" into the composer; returns a diagnostic string. */
    function insertOrCopy(name) {
      var text = "/" + name + " ";
      var el = null, hit = "";
      var textareas = [
        '#root [data-slot="conversation"] textarea[data-phase]',
        'textarea[data-phase]',
        '#root textarea'
      ];
      for (var i = 0; i < textareas.length; i++) {
        var found = null;
        try { found = document.querySelector(textareas[i]); } catch (error) { found = null; }
        if (found && !found.disabled && !found.readOnly) {
          var box = found.getBoundingClientRect();
          if (box.width > 40 && box.height > 8) { el = found; hit = "textarea"; break; }
        }
      }
      if (el) {
        try {
          el.focus();
          var current = el.value || "";
          var head = current.replace(/\s+$/, "");
          var joined = head.length === 0 ? text : head + " " + text;
          var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
          setter.call(el, joined);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          try { el.setSelectionRange(joined.length, joined.length); } catch (error) { /* ignore */ }
          return "已插入 (textarea)";
        } catch (error) { return "textarea 插入出错: " + (error && error.message ? error.message : String(error)); }
      }

      var editables = document.querySelectorAll('[contenteditable="true"]');
      var target = null;
      for (var j = 0; j < editables.length; j++) {
        var b = editables[j].getBoundingClientRect();
        if (b.width > 80 && b.height > 8) { target = editables[j]; break; }
      }
      if (target) {
        try {
          var note = insertIntoEditable(target, name);
          return note + " (contenteditable)";
        } catch (error) { return "editable 插入出错: " + (error && error.message ? error.message : String(error)); }
      }

      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text.trim()); } catch (error) { /* ignore */ }
      return "未找到输入框 · " + describeComposer();
    }


    /** 运行时从当前 DSH 实例读取技能，取代构建期内嵌清单。 */
    function createSkillCatalog(ctx) {
      var state = { skills: [], status: "loading", error: "", revision: 0 };
      var listeners = new Set();

      function emit() {
        listeners.forEach(function (fn) { try { fn(state); } catch (error) { /* ignore */ } });
      }
      function setState(patch) {
        state = Object.assign({}, state, patch, { revision: state.revision + 1 });
        emit();
      }
      function sourceOf(path) {
        var p = String(path || "").replace(/\\/g, "/").toLowerCase();
        if (p.indexOf("/.dsh/skills/") !== -1 || p.indexOf("/.agents/skills/") !== -1) return "user";
        if (p.indexOf("/runtime/office-skills/") !== -1 || p.indexOf("app.asar") !== -1) return "builtin";
        if (p.indexOf("/.dsh/skills/") !== -1) return "project";
        return "user";
      }
      function pickSessionId() {
        try {
          var snap = ctx.sessions.list.getSnapshot() || {};
          var byId = snap.byId || {};
          var ids = Object.keys(byId);
          if (ids.length === 0) return "";
          var activeId = snap.activeId || snap.selectedId || snap.currentId || "";
          if (activeId && byId[activeId]) return activeId;
          // 取最近活跃的会话
          var best = "";
          var bestAt = -1;
          ids.forEach(function (id) {
            var s = byId[id] || {};
            var at = Number(s.lastActivityAt || s.updatedAt || s.createdAt || 0);
            if (at >= bestAt) { bestAt = at; best = id; }
          });
          return best;
        } catch (error) { return ""; }
      }
      async function load(force) {
        setState({ status: state.skills.length ? "refreshing" : "loading", error: "" });
        var sessionId = pickSessionId();
        if (!sessionId) {
          setState({ status: "empty", skills: [], error: "没有打开的会话，无法读取技能目录" });
          return;
        }
        try {
          var result = await ctx.remote.skills.list({ sessionId });
          if (!result || !result.ok) {
            var msg = result && result.error ? (result.error.code + ": " + result.error.message) : "未知错误";
            setState({ status: "error", error: msg });
            return;
          }
          var raw = (result.value && result.value.skills) || [];
          var skills = raw.map(function (s) {
            return {
              name: s.name,
              description: s.description || "",
              path: s.path || "",
              source: sourceOf(s.path),
              modelInvocable: s.modelInvocable !== false
            };
          }).sort(function (a, b) { return a.name.localeCompare(b.name); });
          setState({ status: "ready", skills: skills, error: "" });
        } catch (error) {
          setState({ status: "error", error: error && error.message ? error.message : String(error) });
        }
      }
      return {
        get: function () { return state; },
        subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
        reload: function () { return load(true); }
      };
    }

    /** 订阅技能目录的 React hook。 */
    function useSkills(catalog) {
      var snapState = React.useState(catalog.get), snap = snapState[0], setSnap = snapState[1];
      React.useEffect(function () {
        return catalog.subscribe(function (s) { setSnap(Object.assign({}, s)); });
      }, [catalog]);
      React.useEffect(function () {
        if (catalog.get().status === "loading") catalog.reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return snap;
    }

    var BOOK_PATHS = ["M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z", "M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5Z", "M8.5 7.5h6"];

    function Book({ size }) {
      var s = size || 18;
      return h("svg", {
        width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
        strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true"
      }, BOOK_PATHS.map(function (d) { return h("path", { key: d, d: d }); }));
    }

    function Gear({ size }) {
      var s = size || 14;
      return h("svg", {
        width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
        strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true"
      },
      h("circle", { cx: 12, cy: 12, r: 3 }),
      h("path", { d: "M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09A1.7 1.7 0 0 0 21 10h.09a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" }));
    }

    /** The rail glyph: click opens the pinned flyout; the flyout's gear opens the full page. */
    function SkillsIcon({ size, catalog }) {
      var anchor = React.useRef(null);
      var flyNode = React.useRef(null);
      var timer = React.useRef(null);
      var openState = React.useState(false), open = openState[0], setOpen = openState[1];
      var posState = React.useState(null), pos = posState[0], setPos = posState[1];
      var pinsState = React.useState(loadPins), pins = pinsState[0], setPins = pinsState[1];
      var flashState = React.useState(""), flash = flashState[0], setFlash = flashState[1];
      var live = useSkills(catalog);
      var SKILLS = live.skills;

      var measure = React.useCallback(function () {
        var node = anchor.current;
        if (!node) return;
        var rowButton = node.closest ? node.closest("button") : null;
        var rect = (rowButton || node).getBoundingClientRect();
        setPos({ left: rect.right - 20, top: Math.max(8, rect.top - 6) });
      }, []);

      var show = React.useCallback(function () {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        setPins(loadPins());
        measure();
        setOpen(true);
      }, [measure]);

      var hideSoon = React.useCallback(function () {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(function () {
          var node = flyNode.current;
          if (node && node.matches && node.matches(":hover")) return;
          setOpen(false);
        }, 180);
      }, []);

      React.useEffect(function () {
        return function () { if (timer.current) clearTimeout(timer.current); };
      }, []);

      React.useEffect(function () {
        var node = anchor.current;
        var rowButton = node && node.closest ? node.closest("button") : null;
        if (!rowButton) return;
        function onEnter() { show(); }
        function onLeave() { hideSoon(); }
        function onClick(e) { e.preventDefault(); e.stopPropagation(); show(); }
        rowButton.addEventListener("mouseenter", onEnter);
        rowButton.addEventListener("mouseleave", onLeave);
        rowButton.addEventListener("click", onClick, true);
        return function () {
          rowButton.removeEventListener("mouseenter", onEnter);
          rowButton.removeEventListener("mouseleave", onLeave);
          rowButton.removeEventListener("click", onClick, true);
        };
      }, [show, hideSoon]);

      React.useEffect(function () {
        if (!open) return;
        var onResize = function () { measure(); };
        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", onResize, true);
        return function () {
          window.removeEventListener("resize", onResize);
          window.removeEventListener("scroll", onResize, true);
        };
      }, [open, measure]);

      function copy(name) {
        var result = insertOrCopy(name);
        setFlash(name + " → " + result);
        setTimeout(function () { setFlash(""); setOpen(false); }, 1400);
      }

      function unpin(name) {
        var next = loadPins().filter(function (x) { return x !== name; });
        savePins(next);
        setPins(next);
      }

      var pinnedSkills = SKILLS.filter(function (s) { return pins.indexOf(s.name) !== -1; });

      var flyout = open && pos ? ReactDOM.createPortal(
        h("div", {
          ref: flyNode,
          onMouseEnter: function () { if (timer.current) { clearTimeout(timer.current); timer.current = null; } },
          onMouseLeave: hideSoon,
          onMouseDown: function (e) { e.stopPropagation(); },
          onClick: function (e) { e.stopPropagation(); },
          style: {
            position: "fixed", left: pos.left + "px", top: pos.top + "px", zIndex: 2147483000,
            minWidth: "248px", maxWidth: "320px", maxHeight: "60vh", display: "flex", flexDirection: "column",
            background: "rgba(24,24,27,0.98)", color: "#f4f4f5",
            border: "1px solid rgba(255,255,255,0.14)", borderRadius: "10px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)", padding: "8px", gap: "4px",
            fontSize: "12px", backdropFilter: "blur(8px)"
          }
        },
        flash ? h("div", { style: { margin: "2px 4px 6px", padding: "6px 8px", borderRadius: "6px", background: "rgba(120,200,140,0.16)", fontSize: "11px", lineHeight: 1.4 } }, flash) : null,
        h("div", { style: { display: "flex", alignItems: "center", gap: "6px", padding: "2px 4px 6px" } },
          h("span", { style: { fontSize: "11px", opacity: 0.6, letterSpacing: "0.04em" } }, "已固定"),
          h("button", {
            type: "button",
            onClick: function (e) { e.preventDefault(); e.stopPropagation(); setOpen(false); if (typeof window.__skillsPanelOpen === "function") window.__skillsPanelOpen(); },
            title: "打开全部技能",
            style: {
              marginLeft: "auto", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              width: "24px", height: "24px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.16)",
              background: "transparent", color: "inherit", opacity: 0.85
            }
          }, h(Gear, { size: 14 }))),
        pinnedSkills.length === 0
          ? h("div", { style: { padding: "8px 6px", opacity: 0.65, lineHeight: 1.5 } },
              live.status === "loading" ? "正在读取技能目录…"
              : live.status === "error" ? ("读取失败：" + live.error)
              : live.status === "empty" ? "没有打开的会话，先开始一个对话再点这里。"
              : "还没有固定的技能。点右侧齿轮打开全部列表，点技能右侧的 ☆ 固定。")
          : h("div", { style: { display: "flex", flexDirection: "column", gap: "2px", overflowY: "auto" } },
              pinnedSkills.map(function (s) {
                return h("div", { key: s.name, style: { display: "flex", alignItems: "center", gap: "4px" } },
                  h("button", {
                    type: "button",
                    onClick: function (e) { e.preventDefault(); e.stopPropagation(); copy(s.name); },
                    title: "插入 /" + s.name,
                    style: {
                      flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer", padding: "6px 8px",
                      borderRadius: "6px", border: "none", background: "transparent", color: "inherit",
                      font: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                    },
                    onMouseEnter: function (e) { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; },
                    onMouseLeave: function (e) { e.currentTarget.style.background = "transparent"; }
                  }, s.name),
                  h("button", {
                    type: "button",
                    onClick: function (e) { e.preventDefault(); e.stopPropagation(); unpin(s.name); },
                    title: "取消固定",
                    style: {
                      cursor: "pointer", width: "20px", height: "20px", borderRadius: "4px", flexShrink: 0,
                      border: "none", background: "transparent", color: "inherit", opacity: 0.5
                    }
                  }, "\u2605"));
              }))),
        document.body) : null;

      return h("span", {
        ref: anchor,
        style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }
      }, h(Book, { size: size }), flyout);
    }

    var LIST_STYLE = { display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", minHeight: 0, paddingRight: "4px" };

    function SkillsPage(props) {
      var catalog = props.catalog;
      var qState = React.useState(""), q = qState[0], setQ = qState[1];
      var cState = React.useState(""), copied = cState[0], setCopied = cState[1];
      var pState = React.useState(loadPins), pins = pState[0], setPins = pState[1];
      var live = useSkills(catalog);
      var SKILLS = live.skills;

      var togglePin = React.useCallback(function (name) {
        setPins(function (current) {
          var next = current.indexOf(name) === -1 ? current.concat([name]) : current.filter(function (x) { return x !== name; });
          savePins(next);
          return next;
        });
      }, []);

      var filtered = React.useMemo(function () {
        var needle = q.trim().toLowerCase();
        if (!needle) return SKILLS;
        return SKILLS.filter(function (s) { return (s.name + " " + s.description).toLowerCase().indexOf(needle) !== -1; });
      }, [q]);

      var pinned = filtered.filter(function (s) { return pins.indexOf(s.name) !== -1; });
      var others = filtered.filter(function (s) { return pins.indexOf(s.name) === -1; });

      var copy = React.useCallback(function (name) {
        var result = insertOrCopy(name);
        setCopied(name + "|" + result);
        setTimeout(function () { setCopied(""); }, 1400);
      }, []);

      function row(s) {
        var isPinned = pins.indexOf(s.name) !== -1;
        return h("div", {
          key: s.name,
          style: {
            display: "flex", alignItems: "flex-start", gap: "6px", flexShrink: 0,
            border: "1px solid rgba(127,127,127," + (copied.split("|")[0] === s.name ? "0.6" : "0.22") + ")",
            background: copied.split("|")[0] === s.name ? "rgba(127,127,127,0.14)" : "transparent",
            borderRadius: "10px", padding: "9px 10px 9px 12px"
          }
        },
        h("button", {
          type: "button", onClick: function () { copy(s.name); }, title: s.path,
          style: { flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer", background: "transparent", border: "none", padding: 0, color: "inherit", font: "inherit" }
        },
        h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
          h("span", { style: { fontSize: "13px", fontWeight: 600 } }, s.name),
          h("span", {
            style: { fontSize: "10px", opacity: 0.7, padding: "1px 6px", borderRadius: "999px", border: "1px solid rgba(127,127,127,0.3)" }
          }, s.source === "user" ? "用户" : s.source === "project" ? "项目" : "内置"),
          copied.split("|")[0] === s.name ? h("span", { style: { fontSize: "11px", opacity: 0.85, marginLeft: "auto" } },
            copied.split("|")[1] === "inserted" ? "已插入输入框" : "已复制到剪贴板") : null),
        h("div", {
          style: { fontSize: "12px", opacity: 0.65, marginTop: "4px", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }
        }, s.description)),
        h("button", {
          type: "button", onClick: function (e) { e.stopPropagation(); togglePin(s.name); },
          title: isPinned ? "取消固定" : "固定到顶部", "aria-pressed": isPinned,
          style: {
            flexShrink: 0, cursor: "pointer", width: "24px", height: "24px", display: "flex", alignItems: "center",
            justifyContent: "center", background: "transparent", border: "none", padding: 0, color: "inherit",
            opacity: isPinned ? 0.95 : 0.35
          }
        }, isPinned ? "\u2605" : "\u2606"));
      }

      function group(title, items) {
        if (items.length === 0) return null;
        return h("div", { key: title, style: { display: "flex", flexDirection: "column", gap: "8px" } },
          h("div", { style: { fontSize: "11px", opacity: 0.55, letterSpacing: "0.04em" } }, title),
          items.map(row));
      }

      return h("div", {
        style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, boxSizing: "border-box", padding: "20px 24px 16px", gap: "12px", color: "inherit" }
      },
      h("div", { style: { display: "flex", alignItems: "baseline", gap: "10px", flexShrink: 0 } },
        h("div", { style: { fontSize: "18px", fontWeight: 600 } }, "技能"),
        h("div", { style: { fontSize: "12px", opacity: 0.6 } },
          live.status === "loading" ? "正在读取…"
          : live.status === "error" ? ("读取失败：" + live.error)
          : live.status === "empty" ? live.error
          : (SKILLS.length + " 个可用" + (pins.length ? " · " + pins.length + " 个已固定" : ""))),
        h("button", {
          type: "button",
          onClick: function () { catalog.reload(); },
          style: { marginLeft: "auto", cursor: "pointer", fontSize: "11px", padding: "2px 8px", borderRadius: "6px", border: "1px solid rgba(127,127,127,0.3)", background: "transparent", color: "inherit", opacity: 0.8 }
        }, "刷新")),
      h("input", {
        value: q, onChange: function (e) { setQ(e.target.value); }, placeholder: "搜索技能名或描述…",
        style: { flexShrink: 0, padding: "8px 12px", fontSize: "13px", borderRadius: "8px", border: "1px solid rgba(127,127,127,0.35)", background: "transparent", color: "inherit", outline: "none" }
      }),
      h("div", { style: Object.assign({}, LIST_STYLE, { flex: 1 }) },
        filtered.length === 0
          ? h("div", { style: { opacity: 0.6, fontSize: "13px", padding: "12px 2px" } }, "没有匹配的技能")
          : [group("已固定", pinned), group("全部技能", others)]),
      h("div", { style: { flexShrink: 0, fontSize: "11px", opacity: 0.5 } },
        "点技能名直接把 /技能名 写进输入框；点 \u2606 固定。固定项在左侧栏图标的浮层里直接显示。"));
    }

    function apply(ctx) {
      var catalog = createSkillCatalog(ctx);
      ctx.slots.inject("main", function* () {
        yield ctx.slots.register({ name: "main", key: PANEL_ID, inject: function () { return { catalog: catalog }; } }, SkillsPage);
      });
      ctx.slots.inject("sidebar.panellist", function () {
        return ctx.slots.register({ name: "sidebar.panellist", id: PANEL_ID, order: 20, label: "技能", inject: function () { return { catalog: catalog }; } }, SkillsIcon);
      });
      // 打开面板时刷新一次，保证看到最新技能
      ctx.effect(function () {
        return ctx.layout.panelInfo.subscribe(function () {
          if (ctx.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID) catalog.reload();
        });
      }, "dsh-skills-panel: refresh on open");
      catalog.reload();
      window.__skillsPanelOpen = function () { try { ctx.layout.selectPanel(PANEL_ID); } catch (error) { console.error(error); } };
    }

    exports.apply = apply;
    exports.inject = ["slots", "layout", "remote", "remote.skills", "sessions"];
    return module.exports;
  }
});
