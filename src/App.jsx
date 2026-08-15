import React, { useState, useEffect, useMemo } from "react";
import { watchList, saveList } from "./firebase.js";

// ---------- helpers ----------
const todayStr = () => new Date().toISOString().slice(0, 10);

function daysDiff(dateStr) {
  const today = new Date(todayStr());
  const target = new Date(dateStr);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function dueLabel(dateStr) {
  const d = daysDiff(dateStr);
  if (d < 0) return { text: `逾期${-d}天`, tone: "overdue" };
  if (d === 0) return { text: "今天到期", tone: "today" };
  return { text: `${d}天後`, tone: "upcoming" };
}

function ageLabel(birthday) {
  if (!birthday) return null;
  const days = -daysDiff(birthday);
  if (days < 0) return null;
  const months = Math.floor(days / 30);
  return months >= 1 ? `${days}天大（約${months}個月）` : `${days}天大`;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const VACCINE_TYPES = ["第一劑", "第二劑", "第三劑", "狂犬病"];
const PERIOD_OPTIONS = ["上午", "下午"];
const SEX_OPTIONS = ["公", "母"];
const BREED_OPTIONS = [
  "英短",
  "曼赤肯",
  "英長",
  "布偶",
  "緬因",
  "小步",
  "挪威",
  "非標準",
  "其他",
];

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [userName, setUserName] = useState("");
  const [members, setMembers] = useState([]);
  const [tab, setTab] = useState("home");
  const [cats, setCats] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let loaded = { cats: false, records: false, members: false };
    const checkLoaded = () => {
      if (loaded.cats && loaded.records && loaded.members) setLoading(false);
    };

    const unsubCats = watchList("cats", (v) => {
      setCats(v);
      loaded.cats = true;
      checkLoaded();
    });
    const unsubRecords = watchList("records", (v) => {
      setRecords(v);
      loaded.records = true;
      checkLoaded();
    });
    const unsubMembers = watchList("members", (v) => {
      setMembers(v);
      loaded.members = true;
      checkLoaded();
      const saved = localStorage.getItem("myName");
      if (saved && v.includes(saved)) {
        setUserName(saved);
        setAuthed(true);
      }
    });

    return () => {
      unsubCats();
      unsubRecords();
      unsubMembers();
    };
  }, []);

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  async function persistCats(next) {
    setCats(next);
    await saveList("cats", next);
  }
  async function persistRecords(next) {
    setRecords(next);
    await saveList("records", next);
  }

  async function loginAs(name) {
    let nextMembers = members;
    if (!members.includes(name)) {
      nextMembers = [...members, name];
      setMembers(nextMembers);
      await saveList("members", nextMembers);
    }
    setUserName(name);
    setAuthed(true);
    localStorage.setItem("myName", name);
  }

  function logout() {
    localStorage.removeItem("myName");
    setAuthed(false);
    setUserName("");
  }

  function addCat(name) {
    if (!name.trim()) return;
    const cat = {
      id: uid(),
      name: name.trim(),
      createdAt: todayStr(),
      createdBy: userName,
      chipId: "",
      sex: "",
      breed: "",
      birthday: "",
      healthLogs: [],
    };
    persistCats([...cats, cat]);
    flash(`已新增貓咪「${cat.name}」`);
  }
  function renameCat(id, name) {
    persistCats(cats.map((c) => (c.id === id ? { ...c, name } : c)));
  }
  function deleteCat(id) {
    persistCats(cats.filter((c) => c.id !== id));
    persistRecords(records.filter((r) => r.catId !== id));
    flash("已刪除貓咪與相關紀錄");
  }

  function updateCatProfile(id, patch) {
    const nextCats = cats.map((c) => (c.id === id ? { ...c, ...patch } : c));
    persistCats(nextCats);

    if (patch.birthday) {
      const dueDate = addMonths(patch.birthday, 3);
      const filtered = records.filter(
        (r) => !(r.catId === id && r.type === "狂犬病" && r.auto)
      );
      const newRec = {
        id: uid(),
        catId: id,
        type: "狂犬病",
        dueDate,
        done: false,
        doneAt: null,
        doneBy: null,
        auto: true,
        createdBy: userName,
      };
      persistRecords([...filtered, newRec]);
      flash("已自動建立滿3個月狂犬病提醒");
    }
  }

  function addHealthLog(catId, date, period, note, method) {
    if (!note.trim()) return;
    const nextCats = cats.map((c) =>
      c.id === catId
        ? {
            ...c,
            healthLogs: [
              ...(c.healthLogs || []),
              {
                id: uid(),
                date,
                period,
                note: note.trim(),
                method: (method || "").trim(),
                by: userName,
              },
            ],
          }
        : c
    );
    persistCats(nextCats);
    flash("已新增健康紀錄");
  }
  function deleteHealthLog(catId, logId) {
    const nextCats = cats.map((c) =>
      c.id === catId
        ? { ...c, healthLogs: (c.healthLogs || []).filter((l) => l.id !== logId) }
        : c
    );
    persistCats(nextCats);
  }

  function addRecord(catId, type, dueDate) {
    const rec = {
      id: uid(),
      catId,
      type,
      dueDate,
      done: false,
      doneAt: null,
      doneBy: null,
      createdBy: userName,
    };
    persistRecords([...records, rec]);
    flash("已新增提醒");
  }
  function toggleRecord(id) {
    persistRecords(
      records.map((r) =>
        r.id === id
          ? {
              ...r,
              done: !r.done,
              doneAt: !r.done ? todayStr() : null,
              doneBy: !r.done ? userName : null,
            }
          : r
      )
    );
  }
  function deleteRecord(id) {
    persistRecords(records.filter((r) => r.id !== id));
  }

  async function clearAllData() {
    await persistCats([]);
    await persistRecords([]);
    flash("已清空所有資料");
  }

  const pending = useMemo(
    () =>
      records
        .filter((r) => !r.done)
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)),
    [records]
  );

  const catById = (id) => cats.find((c) => c.id === id);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6efe4] text-[#5c4a3a] font-medium">
        載入中…
      </div>
    );
  }

  if (!authed) {
    return <NameSelectScreen members={members} onSelect={loginAs} />;
  }

  return (
    <div className="min-h-screen bg-[#f6efe4] text-[#3f3226] flex flex-col font-[system-ui]">
      <Header
        subtitle={
          tab === "home" ? "今日待辦" : tab === "cats" ? "貓咪管理" : "設定"
        }
        userName={userName}
      />

      <main className="flex-1 overflow-y-auto pb-24">
        {toast && (
          <div className="mx-4 mt-4 rounded-xl bg-[#3f3226] text-[#f6efe4] text-sm px-4 py-2 shadow-lg animate-[fadein_0.2s_ease]">
            {toast}
          </div>
        )}

        {tab === "home" && (
          <HomeTab
            pending={pending}
            catById={catById}
            onToggle={toggleRecord}
            onDelete={deleteRecord}
          />
        )}
        {tab === "cats" && (
          <CatsTab
            cats={cats}
            records={records}
            onAddCat={addCat}
            onRenameCat={renameCat}
            onDeleteCat={deleteCat}
            onUpdateProfile={updateCatProfile}
            onAddRecord={addRecord}
            onDeleteRecord={deleteRecord}
            onToggleRecord={toggleRecord}
            onAddHealthLog={addHealthLog}
            onDeleteHealthLog={deleteHealthLog}
          />
        )}
        {tab === "settings" && (
          <SettingsTab
            catCount={cats.length}
            recordCount={records.length}
            onClear={clearAllData}
            userName={userName}
            onLogout={logout}
          />
        )}
      </main>

      <BottomNav tab={tab} setTab={setTab} />

      <style>{`
        @keyframes fadein { from { opacity:0; transform: translateY(-4px);} to {opacity:1; transform: translateY(0);} }
      `}</style>
    </div>
  );
}

// ---------- Header ----------
function Header({ subtitle, userName }) {
  return (
    <header className="bg-[#5c4a3a] text-[#f6efe4] px-5 pt-6 pb-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐾</span>
          <h1 className="text-xl font-bold tracking-wide">{subtitle}</h1>
        </div>
        <span className="text-sm opacity-80 tabular-nums">
          {todayStr().replaceAll("-", "/")}
        </span>
      </div>
      <p className="text-xs mt-2 opacity-70">
        多人共用版・即時同步・目前登入：{userName}
      </p>
    </header>
  );
}

// ---------- Name Select Screen ----------
function NameSelectScreen({ members, onSelect }) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(members.length === 0);

  function submitNew(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    onSelect(newName.trim());
  }

  return (
    <div className="min-h-screen bg-[#f6efe4] flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#ece1d0] shadow-sm p-6 space-y-4">
        <div className="text-center mb-2">
          <div className="text-3xl mb-1">🐾</div>
          <h1 className="text-lg font-bold text-[#3f3226]">今日待辦</h1>
          <p className="text-xs text-[#8a7261] mt-1">選擇你的名字進入</p>
        </div>

        {members.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {members.map((m) => (
              <button
                key={m}
                onClick={() => onSelect(m)}
                className="rounded-xl border border-[#e0d3bc] bg-[#faf6ee] py-2.5 text-sm font-medium text-[#3f3226] active:scale-95 transition-transform"
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {!adding && members.length > 0 && (
          <button
            onClick={() => setAdding(true)}
            className="w-full text-xs text-[#a88a63] underline pt-1"
          >
            + 我是新的人，加入名字
          </button>
        )}

        {adding && (
          <form onSubmit={submitNew} className="space-y-2 pt-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="輸入你的名字"
              className="w-full rounded-lg border border-[#e0d3bc] px-3 py-2 text-sm outline-none focus:border-[#a88a63]"
              autoFocus
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-[#5c4a3a] text-[#f6efe4] py-2.5 text-sm font-medium active:scale-95 transition-transform"
            >
              進入
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------- Home / Todo Tab ----------
function HomeTab({ pending, catById, onToggle, onDelete }) {
  return (
    <div className="px-4 pt-5">
      <div className="text-sm font-semibold text-[#8a7261] mb-3">
        需要處理（{pending.length}）
      </div>

      {pending.length === 0 && (
        <div className="rounded-2xl bg-white/70 border border-[#e8dcc9] p-8 text-center text-[#8a7261]">
          目前沒有待辦事項 🎉
        </div>
      )}

      <div className="space-y-3">
        {pending.map((r) => {
          const cat = catById(r.catId);
          const label = dueLabel(r.dueDate);
          const toneClasses =
            label.tone === "overdue"
              ? "text-[#c05a3a]"
              : label.tone === "today"
              ? "text-[#b8862f]"
              : "text-[#6f8c5f]";
          return (
            <div
              key={r.id}
              className="rounded-2xl bg-white border border-[#ece1d0] p-4 flex items-center gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <button
                onClick={() => onToggle(r.id)}
                className="w-6 h-6 rounded-md border-2 border-[#c9b79c] shrink-0 active:scale-90 transition-transform"
                aria-label="標記完成"
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[#3f3226] truncate">
                  {(cat?.name || "未命名") + " ・ " + r.type}
                  {r.auto && (
                    <span className="ml-1 text-[10px] text-[#a88a63] font-normal align-middle">
                      自動
                    </span>
                  )}
                </div>
                {r.createdBy && (
                  <div className="text-[11px] text-[#b3a48f]">
                    建立者：{r.createdBy}
                  </div>
                )}
                <div className="text-sm text-[#8a7261] mt-0.5">
                  {r.dueDate.replaceAll("-", "/")}{" "}
                  <span className={`font-medium ${toneClasses}`}>
                    （{label.text}）
                  </span>
                </div>
              </div>
              <button
                onClick={() => onDelete(r.id)}
                className="text-[#c9b79c] hover:text-[#c05a3a] text-lg px-1"
                aria-label="刪除"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Cats Tab ----------
function CatsTab({
  cats,
  records,
  onAddCat,
  onRenameCat,
  onDeleteCat,
  onUpdateProfile,
  onAddRecord,
  onDeleteRecord,
  onToggleRecord,
  onAddHealthLog,
  onDeleteHealthLog,
}) {
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState("");

  const filteredCats = cats.filter((c) => {
    const q = search.trim();
    if (!q) return true;
    return c.name.includes(q) || (c.chipId || "").includes(q);
  });

  return (
    <div className="px-4 pt-5">
      <div className="text-sm font-semibold text-[#8a7261] mb-3">
        貓咪列表（{cats.length}）
      </div>

      <div className="relative mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋名字或晶片末幾碼…"
          className="w-full rounded-xl border border-[#e0d3bc] bg-white pl-3 pr-8 py-2 text-sm outline-none focus:border-[#a88a63]"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#c9b79c] hover:text-[#c05a3a]"
          >
            ×
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="輸入貓咪名字…"
          className="flex-1 rounded-xl border border-[#e0d3bc] bg-white px-3 py-2 text-sm outline-none focus:border-[#a88a63]"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onAddCat(newName);
              setNewName("");
            }
          }}
        />
        <button
          onClick={() => {
            onAddCat(newName);
            setNewName("");
          }}
          className="rounded-xl bg-[#5c4a3a] text-[#f6efe4] px-4 text-sm font-medium active:scale-95 transition-transform"
        >
          新增
        </button>
      </div>

      {cats.length === 0 && (
        <div className="rounded-2xl bg-white/70 border border-[#e8dcc9] p-8 text-center text-[#8a7261]">
          還沒有貓咪資料，先新增一隻吧
        </div>
      )}

      {cats.length > 0 && filteredCats.length === 0 && (
      {cats.length > 0 && filteredCats.length === 0 && (
        <div className="rounded-2xl bg-white/70 border border-[#e8dcc9] p-8 text-center text-[#8a7261]">
          找不到符合「{search}」的貓咪
        </div>
      )}

      <div className="space-y-3">
        {filteredCats.map((cat) => (
          <CatCard
            key={cat.id}
            cat={cat}
            records={records.filter((r) => r.catId === cat.id)}
            expanded={expanded === cat.id}
            onToggleExpand={() =>
              setExpanded(expanded === cat.id ? null : cat.id)
            }
            onRename={(name) => onRenameCat(cat.id, name)}
            onDelete={() => onDeleteCat(cat.id)}
            onUpdateProfile={(patch) => onUpdateProfile(cat.id, patch)}
            onAddRecord={(type, dueDate) => onAddRecord(cat.id, type, dueDate)}
            onDeleteRecord={onDeleteRecord}
            onToggleRecord={onToggleRecord}
            onAddHealthLog={(date, period, note, method) =>
              onAddHealthLog(cat.id, date, period, note, method)
            }
            onDeleteHealthLog={(logId) => onDeleteHealthLog(cat.id, logId)}
          />
        ))}
      </div>
    </div>
  );
}

function CatCard({
  cat,
  records,
  expanded,
  onToggleExpand,
  onRename,
  onDelete,
  onUpdateProfile,
  onAddRecord,
  onDeleteRecord,
  onToggleRecord,
  onAddHealthLog,
  onDeleteHealthLog,
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(cat.name);

  const [editingProfile, setEditingProfile] = useState(false);
  const [chipId, setChipId] = useState(cat.chipId || "");
  const [sex, setSex] = useState(cat.sex || "");
  const [breed, setBreed] = useState(cat.breed || "");
  const [birthday, setBirthday] = useState(cat.birthday || "");

  const [type, setType] = useState(VACCINE_TYPES[0]);
  const [dueDate, setDueDate] = useState(todayStr());

  const [logDate, setLogDate] = useState(todayStr());
  const [logPeriod, setLogPeriod] = useState(PERIOD_OPTIONS[0]);
  const [logNote, setLogNote] = useState("");
  const [logMethod, setLogMethod] = useState("");

  const chipValid = chipId === "" || /^\d{15}$/.test(chipId);

  const sorted = [...records].sort(
    (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
  );
  const logs = [...(cat.healthLogs || [])].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  function saveProfile() {
    if (!chipValid) return;
    onUpdateProfile({ chipId, sex, breed, birthday });
    setEditingProfile(false);
  }

  const age = ageLabel(cat.birthday);

  return (
    <div className="rounded-2xl bg-white border border-[#ece1d0] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="p-4 flex items-center gap-3">
        <span className="text-2xl">🐱</span>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                onRename(name);
                setEditingName(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRename(name);
                  setEditingName(false);
                }
              }}
              autoFocus
              className="w-full border-b border-[#a88a63] outline-none text-[#3f3226] font-semibold"
            />
          ) : (
            <button
              className="font-semibold text-[#3f3226] text-left"
              onClick={() => setEditingName(true)}
            >
              {cat.name}
            </button>
          )}
          <div className="text-xs text-[#8a7261] mt-0.5 flex flex-wrap gap-x-2">
            {cat.chipId && <span>晶片 …{cat.chipId.slice(-6)}</span>}
            {cat.sex && <span>{cat.sex}</span>}
            {cat.breed && <span>{cat.breed}</span>}
            {age && <span>{age}</span>}
            {!cat.chipId && !cat.sex && !cat.breed && !age && (
              <span>尚未填寫資料</span>
            )}
          </div>
        </div>
        <button
          onClick={onToggleExpand}
          className="text-[#8a7261] px-2 text-sm"
        >
          {expanded ? "收起 ▲" : "展開 ▼"}
        </button>
        <button
          onClick={() => {
            if (confirm(`確定刪除「${cat.name}」與其所有紀錄？`)) onDelete();
          }}
          className="text-[#c9b79c] hover:text-[#c05a3a] text-lg px-1"
        >
          ×
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[#ece1d0] bg-[#faf6ee] p-4 space-y-5">
          {/* ---- Profile ---- */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-[#8a7261]">
                基本資料
              </div>
              {!editingProfile && (
                <button
                  onClick={() => setEditingProfile(true)}
                  className="text-xs text-[#a88a63] underline"
                >
                  編輯
                </button>
              )}
            </div>

            {editingProfile ? (
              <div className="space-y-2 bg-white rounded-lg border border-[#ece1d0] p-3">
                <div>
                  <label className="text-xs text-[#8a7261]">
                    晶片號碼（15位數字）
                  </label>
                  <input
                    value={chipId}
                    onChange={(e) =>
                      setChipId(e.target.value.replace(/\D/g, "").slice(0, 15))
                    }
                    placeholder="例：900000000123456"
                    className={`w-full rounded-lg border px-2 py-1.5 text-sm mt-1 ${
                      chipValid ? "border-[#e0d3bc]" : "border-[#c05a3a]"
                    }`}
                  />
                  {!chipValid && (
                    <div className="text-[11px] text-[#c05a3a] mt-1">
                      晶片號碼需為15位數字
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-[#8a7261]">性別</label>
                    <select
                      value={sex}
                      onChange={(e) => setSex(e.target.value)}
                      className="w-full rounded-lg border border-[#e0d3bc] px-2 py-1.5 text-sm mt-1"
                    >
                      <option value="">未選擇</option>
                      {SEX_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-[#8a7261]">品種</label>
                    <select
                      value={breed}
                      onChange={(e) => setBreed(e.target.value)}
                      className="w-full rounded-lg border border-[#e0d3bc] px-2 py-1.5 text-sm mt-1"
                    >
                      <option value="">未選擇</option>
                      {BREED_OPTIONS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-[#8a7261]">
                    生日（會自動建立滿3個月狂犬病提醒）
                  </label>
                  <input
                    type="date"
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    className="w-full rounded-lg border border-[#e0d3bc] px-2 py-1.5 text-sm mt-1"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={saveProfile}
                    disabled={!chipValid}
                    className="flex-1 rounded-lg bg-[#5c4a3a] text-[#f6efe4] text-sm font-medium py-1.5 disabled:opacity-40"
                  >
                    儲存
                  </button>
                  <button
                    onClick={() => {
                      setChipId(cat.chipId || "");
                      setSex(cat.sex || "");
                      setBreed(cat.breed || "");
                      setBirthday(cat.birthday || "");
                      setEditingProfile(false);
                    }}
                    className="flex-1 rounded-lg border border-[#e0d3bc] text-[#8a7261] text-sm font-medium py-1.5"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm bg-white rounded-lg border border-[#ece1d0] p-3 space-y-1">
                <div className="text-[#3f3226]">
                  晶片號碼：{cat.chipId || "－"}
                </div>
                <div className="text-[#3f3226]">性別：{cat.sex || "－"}</div>
                <div className="text-[#3f3226]">品種：{cat.breed || "－"}</div>
                <div className="text-[#3f3226]">
                  生日：{cat.birthday ? cat.birthday.replaceAll("-", "/") : "－"}
                  {age && (
                    <span className="text-[#8a7261]">（{age}）</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ---- Vaccine records ---- */}
          <div>
            <div className="text-xs font-semibold text-[#8a7261] mb-2">
              疫苗紀錄
            </div>
            <div className="space-y-2">
              {sorted.map((r) => {
                const label = dueLabel(r.dueDate);
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 text-sm bg-white rounded-lg border border-[#ece1d0] px-3 py-2"
                  >
                    <button
                      onClick={() => onToggleRecord(r.id)}
                      className={`w-5 h-5 rounded border-2 shrink-0 ${
                        r.done
                          ? "bg-[#6f8c5f] border-[#6f8c5f]"
                          : "border-[#c9b79c]"
                      }`}
                    />
                    <span
                      className={`flex-1 ${
                        r.done ? "line-through text-[#b3a48f]" : ""
                      }`}
                    >
                      {r.type} ・ {r.dueDate.replaceAll("-", "/")}
                      {r.auto && (
                        <span className="ml-1 text-[10px] text-[#a88a63]">
                          自動
                        </span>
                      )}
                      {!r.done && (
                        <span className="ml-1 text-xs text-[#8a7261]">
                          （{label.text}）
                        </span>
                      )}
                      {r.done && r.doneBy && (
                        <span className="block text-[11px] text-[#b3a48f]">
                          完成者：{r.doneBy}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => onDeleteRecord(r.id)}
                      className="text-[#c9b79c] hover:text-[#c05a3a]"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              {sorted.length === 0 && (
                <div className="text-xs text-[#8a7261]">尚無疫苗紀錄</div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="rounded-lg border border-[#e0d3bc] bg-white px-2 py-1.5 text-sm"
              >
                {VACCINE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex-1 rounded-lg border border-[#e0d3bc] bg-white px-2 py-1.5 text-sm"
              />
              <button
                onClick={() => onAddRecord(type, dueDate)}
                className="rounded-lg bg-[#5c4a3a] text-[#f6efe4] px-3 text-sm font-medium active:scale-95 transition-transform"
              >
                新增
              </button>
            </div>
          </div>

          {/* ---- Health status ---- */}
          <div>
            <div className="text-xs font-semibold text-[#8a7261] mb-2">
              健康狀態記錄
            </div>
            <div className="space-y-2">
              {logs.map((l) => (
                <div
                  key={l.id}
                  className="flex items-start gap-2 text-sm bg-white rounded-lg border border-[#ece1d0] px-3 py-2"
                >
                  <span className="text-xs text-[#8a7261] w-24 shrink-0 pt-0.5">
                    {l.date.replaceAll("-", "/")}
                    {l.period ? ` ${l.period}` : ""}
                  </span>
                  <div className="flex-1">
                    <div className="text-[#3f3226]">{l.note}</div>
                    {l.method && (
                      <div className="text-xs text-[#8a7261] mt-0.5">
                        方法：{l.method}
                      </div>
                    )}
                    {l.by && (
                      <div className="text-[11px] text-[#b3a48f] mt-0.5">
                        記錄人：{l.by}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onDeleteHealthLog(l.id)}
                    className="text-[#c9b79c] hover:text-[#c05a3a]"
                  >
                    ×
                  </button>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-xs text-[#8a7261]">尚無健康紀錄</div>
              )}
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex gap-2">
                <input
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  className="rounded-lg border border-[#e0d3bc] bg-white px-2 py-1.5 text-sm flex-1"
                />
                <select
                  value={logPeriod}
                  onChange={(e) => setLogPeriod(e.target.value)}
                  className="rounded-lg border border-[#e0d3bc] bg-white px-2 py-1.5 text-sm w-20"
                >
                  {PERIOD_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                placeholder="症狀，例：吐了、拉肚子、不吃飯…"
                className="w-full rounded-lg border border-[#e0d3bc] bg-white px-2 py-1.5 text-sm"
              />
              <input
                value={logMethod}
                onChange={(e) => setLogMethod(e.target.value)}
                placeholder="方法，例：吃益生菌、禁食觀察、送醫…"
                className="w-full rounded-lg border border-[#e0d3bc] bg-white px-2 py-1.5 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onAddHealthLog(logDate, logPeriod, logNote, logMethod);
                    setLogNote("");
                    setLogMethod("");
                  }
                }}
              />
              <button
                onClick={() => {
                  onAddHealthLog(logDate, logPeriod, logNote, logMethod);
                  setLogNote("");
                  setLogMethod("");
                }}
                className="w-full rounded-lg bg-[#5c4a3a] text-[#f6efe4] px-3 py-1.5 text-sm font-medium active:scale-95 transition-transform"
              >
                新增紀錄
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Settings Tab ----------
function SettingsTab({ catCount, recordCount, onClear, userName, onLogout }) {
  return (
    <div className="px-4 pt-5 space-y-4">
      <div className="rounded-2xl bg-white border border-[#ece1d0] p-4">
        <div className="text-sm font-semibold text-[#3f3226] mb-2">
          目前登入
        </div>
        <div className="text-sm text-[#8a7261]">{userName}</div>
        <button
          onClick={onLogout}
          className="mt-2 text-xs text-[#a88a63] underline"
        >
          切換使用者 / 登出這台裝置
        </button>
      </div>

      <div className="rounded-2xl bg-white border border-[#ece1d0] p-4">
        <div className="text-sm font-semibold text-[#3f3226] mb-2">
          資料狀態
        </div>
        <div className="text-sm text-[#8a7261]">貓咪數量：{catCount}</div>
        <div className="text-sm text-[#8a7261]">疫苗紀錄：{recordCount}</div>
        <div className="text-xs text-[#b3a48f] mt-2">
          資料為多人共用，所有使用者看到的是同一份即時資料，任何人修改大家都會馬上看到最新狀態。
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-[#ece1d0] p-4">
        <div className="text-sm font-semibold text-[#3f3226] mb-2">
          危險操作
        </div>
        <button
          onClick={() => {
            if (confirm("確定要清空所有貓咪與紀錄嗎？此動作無法復原。"))
              onClear();
          }}
          className="w-full rounded-xl bg-[#c05a3a] text-white text-sm font-medium py-2.5 active:scale-95 transition-transform"
        >
          清空所有資料
        </button>
      </div>
    </div>
  );
}

// ---------- Bottom Nav ----------
function BottomNav({ tab, setTab }) {
  const items = [
    { key: "home", label: "首頁", icon: "🏠" },
    { key: "cats", label: "貓咪", icon: "🐈" },
    { key: "settings", label: "設定", icon: "⚙️" },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#f6efe4]/95 backdrop-blur border-t border-[#e8dcc9] flex justify-around py-2">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => setTab(it.key)}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg text-xs font-medium transition-colors ${
            tab === it.key ? "text-[#5c4a3a]" : "text-[#b3a48f]"
          }`}
        >
          <span className="text-xl">{it.icon}</span>
          {it.label}
        </button>
      ))}
    </nav>
  );
}
