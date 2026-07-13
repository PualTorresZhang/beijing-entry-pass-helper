const storageKey = "beijing-entry-pass-helper.records.v1";
const permitValidityDays = 7;

const form = document.querySelector("#passForm");
const fields = {
  id: document.querySelector("#recordId"),
  plate: document.querySelector("#plate"),
  owner: document.querySelector("#owner"),
  phone: document.querySelector("#phone"),
  issueDate: document.querySelector("#issueDate"),
  effectiveDate: document.querySelector("#effectiveDate"),
  expireDate: document.querySelector("#expireDate"),
  usedCount: document.querySelector("#usedCount"),
  remainingCount: document.querySelector("#remainingCount"),
  channel: document.querySelector("#channel"),
  notes: document.querySelector("#notes"),
};

const recordsList = document.querySelector("#recordsList");
const emptyState = document.querySelector("#emptyState");
const emptyTitle = document.querySelector("#emptyTitle");
const emptyDescription = document.querySelector("#emptyDescription");
const template = document.querySelector("#recordTemplate");
const searchInput = document.querySelector("#searchInput");
const formTitle = document.querySelector("#formTitle");
const todayLabel = document.querySelector("#todayLabel");
const resetButton = document.querySelector("#resetButton");
const tabs = [...document.querySelectorAll(".tab")];
const reminderStrip = document.querySelector("#reminderStrip");
const reminderTitle = document.querySelector("#reminderTitle");
const reminderDescription = document.querySelector("#reminderDescription");
const reminderSchedule = document.querySelector("#reminderSchedule");
const calendarButton = document.querySelector("#calendarButton");
const notificationButton = document.querySelector("#notificationButton");
const importButton = document.querySelector("#importButton");
const backupButton = document.querySelector("#backupButton");
const importFile = document.querySelector("#importFile");
const accountActions = document.querySelector("#accountActions");
const authGate = document.querySelector("#authGate");
const toast = document.querySelector("#toast");

const renewDialog = document.querySelector("#renewDialog");
const renewForm = document.querySelector("#renewForm");
const renewTitle = document.querySelector("#renewTitle");
const previousPeriod = document.querySelector("#previousPeriod");
const renewIssueDate = document.querySelector("#renewIssueDate");
const renewEffectiveDate = document.querySelector("#renewEffectiveDate");
const renewExpireDate = document.querySelector("#renewExpireDate");
const renewError = document.querySelector("#renewError");
const renewCloseButton = document.querySelector("#renewCloseButton");
const renewCancelButton = document.querySelector("#renewCancelButton");

let records = [];
let activeFilter = "all";
let renewingRecordId = null;
let toastTimer = null;

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const shortDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
});

function todayStart() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function parseDate(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText || "")) return null;
  const date = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(dateText) {
  const date = parseDate(dateText);
  return date ? dateFormatter.format(date) : "--";
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `record-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function diffDays(dateText) {
  const target = parseDate(dateText);
  return target ? Math.round((target - todayStart()) / 86400000) : Number.POSITIVE_INFINITY;
}

function getStatus(record) {
  const days = diffDays(record.expireDate);

  if (!Number.isFinite(days)) {
    return { key: "expired", label: "日期有误", className: "status-expired", priority: 0 };
  }
  if (days < 0) {
    return {
      key: "expired",
      label: `已过期 ${Math.abs(days)} 天`,
      className: "status-expired",
      priority: 0,
    };
  }
  if (days === 0) {
    return {
      key: "soon",
      label: "今天到期，请办理",
      className: "status-soon",
      priority: 1,
    };
  }
  return {
    key: "active",
    label: `有效，剩余 ${days} 天`,
    className: "status-active",
    priority: 2,
  };
}

async function loadRecords() {
  const stored = localStorage.getItem(storageKey);
  if (!stored) return [];
  const parsed = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed : [];
}

async function saveRecords(nextRecords) {
  localStorage.setItem(storageKey, JSON.stringify(nextRecords));
}

function applySession() {
  accountActions.replaceChildren();
  const controls = form.querySelectorAll("input, select, textarea, button");
  const storageStatus = document.createElement("span");
  storageStatus.className = "account-email";
  storageStatus.textContent = "本机保存";
  accountActions.append(storageStatus);
  authGate.hidden = false;
  calendarButton.hidden = false;
  controls.forEach((control) => {
    control.disabled = false;
  });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function updateNotificationButton() {
  if (!("Notification" in window)) {
    notificationButton.hidden = true;
    return;
  }
  if (Notification.permission === "granted") {
    notificationButton.textContent = "通知已开启";
    notificationButton.disabled = true;
    return;
  }
  if (Notification.permission === "denied") {
    notificationButton.textContent = "通知被阻止";
    notificationButton.disabled = true;
  }
}

async function requestNotifications() {
  if (!("Notification" in window)) return;
  const permission = await Notification.requestPermission();
  updateNotificationButton();
  showToast(permission === "granted" ? "到期通知已开启" : "未获得通知权限");
}

function showDueNotification() {
  const dueRecords = records.filter((record) => diffDays(record.expireDate) <= 0);
  if (!dueRecords.length) return;

  const plates = dueRecords.map((record) => record.plate).join("、");
  showToast(`${plates} 的进京证需要办理`);
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("进京证到期提醒", {
      body: `${plates} 的进京证已到期，请及时办理。`,
      tag: `entry-pass-${toDateInputValue(todayStart())}`,
    });
  }
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function exportBackup() {
  if (!records.length) {
    showToast("还没有可备份的车辆记录");
    return;
  }
  downloadFile(
    `进京证助手备份-${toDateInputValue(todayStart())}.json`,
    JSON.stringify(records, null, 2),
    "application/json;charset=utf-8",
  );
}

async function importBackup(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed) || !parsed.length) throw new Error("empty");
    const imported = parsed.map((item) => ({
      ...item,
      id: item.id || createId(),
      plate: normalizePlate(String(item.plate || "")),
      usedCount: Number(item.usedCount || 0),
      remainingCount: Number(item.remainingCount || 0),
      reminderDays: "0",
      updatedAt: item.updatedAt || new Date().toISOString(),
    }));
    const invalid = imported.find((item) => {
      const effective = parseDate(item.effectiveDate);
      return (
        !item.plate ||
        item.plate.length < 7 ||
        !parseDate(item.issueDate) ||
        !effective ||
        item.expireDate !== toDateInputValue(addDays(effective, permitValidityDays - 1))
      );
    });
    if (invalid) throw new Error("invalid");

    await saveRecords(imported);
    records = imported;
    resetForm();
    render();
    showDueNotification();
    showToast(`已导入 ${imported.length} 辆车`);
  } catch {
    alert("导入失败，请选择由进京证助手生成的 JSON 备份文件。");
  }
}

function syncExpireDate() {
  const effective = parseDate(fields.effectiveDate.value);
  fields.expireDate.value = effective
    ? toDateInputValue(addDays(effective, permitValidityDays - 1))
    : "";
}

function resetForm() {
  form.reset();
  fields.id.value = "";
  formTitle.textContent = "新增车辆";
  resetButton.textContent = "重置";
  const today = todayStart();
  fields.issueDate.value = toDateInputValue(today);
  fields.effectiveDate.value = toDateInputValue(today);
  fields.usedCount.value = "0";
  fields.remainingCount.value = "0";
  syncExpireDate();
}

function normalizePlate(value) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function recordFromForm() {
  return {
    id: fields.id.value || createId(),
    plate: normalizePlate(fields.plate.value),
    owner: fields.owner.value.trim(),
    phone: fields.phone.value.trim(),
    issueDate: fields.issueDate.value,
    effectiveDate: fields.effectiveDate.value,
    expireDate: fields.expireDate.value,
    usedCount: Number(fields.usedCount.value || 0),
    remainingCount: Number(fields.remainingCount.value || 0),
    channel: fields.channel.value,
    reminderDays: "0",
    notes: fields.notes.value.trim(),
    updatedAt: new Date().toISOString(),
  };
}

function validateRecord(record) {
  const issue = parseDate(record.issueDate);
  const effective = parseDate(record.effectiveDate);
  const expire = parseDate(record.expireDate);

  if (!record.plate || record.plate.length < 7) return "请填写完整车牌号。";
  if (!issue || !effective || !expire) return "请填写完整日期。";
  if (issue > effective) return "办理日期不能晚于生效日期。";
  if (record.expireDate !== toDateInputValue(addDays(effective, permitValidityDays - 1))) {
    return "到期日期应为生效日期起第 7 天。";
  }
  if (record.usedCount < 0 || record.remainingCount < 0) return "办理次数不能小于 0。";

  const duplicate = records.find(
    (item) => item.id !== record.id && normalizePlate(item.plate) === record.plate,
  );
  if (duplicate) return `${record.plate} 已经登记过，无需重复添加。`;
  return "";
}

function fillForm(record) {
  fields.id.value = record.id;
  fields.plate.value = record.plate;
  fields.owner.value = record.owner;
  fields.phone.value = record.phone || "";
  fields.issueDate.value = record.issueDate;
  fields.effectiveDate.value = record.effectiveDate || record.issueDate;
  syncExpireDate();
  fields.usedCount.value = record.usedCount ?? 0;
  fields.remainingCount.value = record.remainingCount ?? 0;
  fields.channel.value = record.channel || "北京交警 App";
  fields.notes.value = record.notes || "";
  formTitle.textContent = `编辑 ${record.plate}`;
  resetButton.textContent = "取消编辑";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record || !confirm(`确定删除 ${record.plate} 的记录？`)) return;

  const nextRecords = records.filter((item) => item.id !== id);
  try {
    await saveRecords(nextRecords);
    records = nextRecords;
    if (fields.id.value === id) resetForm();
    render();
    showToast(`${record.plate} 已删除`);
  } catch {
    alert("删除失败，请检查浏览器存储设置后重试。");
  }
}

function openRenewDialog(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  const today = todayStart();
  const previousExpire = parseDate(record.expireDate);
  if (!previousExpire || today < previousExpire) return;

  renewingRecordId = id;
  const issue = today;
  const previousNext = addDays(previousExpire, 1);
  const effective = issue > previousNext ? issue : previousNext;

  renewTitle.textContent = `${record.plate} 已办理`;
  previousPeriod.textContent = `${formatDate(record.effectiveDate || record.issueDate)} 至 ${formatDate(record.expireDate)}`;
  renewIssueDate.value = toDateInputValue(issue);
  renewIssueDate.min = record.expireDate;
  renewIssueDate.max = toDateInputValue(today);
  renewEffectiveDate.value = toDateInputValue(effective);
  renewEffectiveDate.min = toDateInputValue(previousNext);
  renewExpireDate.value = toDateInputValue(addDays(effective, permitValidityDays - 1));
  renewError.textContent = "";
  renewDialog.showModal();
}

function syncRenewDates() {
  const record = records.find((item) => item.id === renewingRecordId);
  const issue = parseDate(renewIssueDate.value);
  const previousExpire = parseDate(record?.expireDate);
  if (!record || !issue || !previousExpire) return;

  const earliestEffective = issue > addDays(previousExpire, 1) ? issue : addDays(previousExpire, 1);
  const selectedEffective = parseDate(renewEffectiveDate.value);
  renewEffectiveDate.min = toDateInputValue(earliestEffective);
  if (!selectedEffective || selectedEffective < earliestEffective) {
    renewEffectiveDate.value = toDateInputValue(earliestEffective);
  }
  const effective = parseDate(renewEffectiveDate.value);
  renewExpireDate.value = effective
    ? toDateInputValue(addDays(effective, permitValidityDays - 1))
    : "";
  renewError.textContent = "";
}

function closeRenewDialog() {
  renewingRecordId = null;
  renewDialog.close();
}

async function submitRenewal(event) {
  event.preventDefault();
  const record = records.find((item) => item.id === renewingRecordId);
  if (!record) return;

  const issue = parseDate(renewIssueDate.value);
  const effective = parseDate(renewEffectiveDate.value);
  const previousExpire = parseDate(record.expireDate);
  const today = todayStart();
  if (!issue || !effective || !previousExpire) {
    renewError.textContent = "请填写完整日期。";
    return;
  }
  if (issue < previousExpire || issue > today) {
    renewError.textContent = `办理日期应在 ${record.expireDate} 至今天之间。`;
    return;
  }
  const earliestEffective = issue > addDays(previousExpire, 1) ? issue : addDays(previousExpire, 1);
  if (effective < earliestEffective) {
    renewError.textContent = `生效日期不能早于 ${toDateInputValue(earliestEffective)}。`;
    return;
  }

  const updatedRecord = {
    ...record,
    issueDate: toDateInputValue(issue),
    effectiveDate: toDateInputValue(effective),
    expireDate: toDateInputValue(addDays(effective, permitValidityDays - 1)),
    usedCount: Number(record.usedCount || 0) + 1,
    remainingCount: Math.max(0, Number(record.remainingCount || 0) - 1),
    reminderDays: "0",
    updatedAt: new Date().toISOString(),
  };
  const nextRecords = records.map((item) => (item.id === record.id ? updatedRecord : item));

  try {
    await saveRecords(nextRecords);
    records = nextRecords;
    closeRenewDialog();
    render();
    showToast(`${record.plate} 已更新，新一轮至 ${formatDate(updatedRecord.expireDate)}`);
  } catch {
    renewError.textContent = "更新失败，请检查浏览器存储设置后重试。";
  }
}

function filteredRecords() {
  const query = searchInput.value.trim().toLowerCase();

  return records
    .filter((record) => {
      const status = getStatus(record);
      const matchesFilter = activeFilter === "all" || activeFilter === status.key;
      const matchesSearch =
        !query ||
        String(record.plate || "").toLowerCase().includes(query) ||
        String(record.owner || "").toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    })
    .sort((a, b) => {
      const statusA = getStatus(a);
      const statusB = getStatus(b);
      return statusA.priority - statusB.priority || diffDays(a.expireDate) - diffDays(b.expireDate);
    });
}

function renderRecord(record) {
  const node = template.content.firstElementChild.cloneNode(true);
  const status = getStatus(record);

  node.querySelector(".plate-badge").textContent = record.plate;
  node.querySelector("h3").textContent = record.owner;
  node.querySelector(".record-meta").textContent = record.phone || "未填写手机号";
  const statusNode = node.querySelector(".record-status");
  statusNode.textContent = status.label;
  statusNode.classList.add(status.className);
  node.querySelector('[data-field="issue"]').textContent = formatDate(record.issueDate);
  node.querySelector('[data-field="effective"]').textContent = formatDate(
    record.effectiveDate || record.issueDate,
  );
  node.querySelector('[data-field="expire"]').textContent = formatDate(record.expireDate);
  node.querySelector('[data-field="channel"]').textContent = record.channel || "--";
  node.querySelector('[data-field="reminder"]').textContent = "到期日提醒";
  node.querySelector('[data-field="counts"]').textContent =
    `已办 ${record.usedCount ?? 0} 次 · 剩余 ${record.remainingCount ?? 0} 次`;
  node.querySelector(".notes").textContent = record.notes || "";

  const renewedButton = node.querySelector(".renewed-button");
  if (status.key === "active") {
    renewedButton.disabled = true;
    renewedButton.textContent = "到期后可办理";
    renewedButton.title = `最早可在 ${formatDate(record.expireDate)} 更新`;
  } else {
    renewedButton.addEventListener("click", () => openRenewDialog(record.id));
  }
  node.querySelector(".edit-button").addEventListener("click", () => fillForm(record));
  node.querySelector(".delete-button").addEventListener("click", () => deleteRecord(record.id));

  return node;
}

function renderSummary() {
  const statuses = records.map(getStatus);
  const soonCount = statuses.filter((status) => status.key === "soon").length;
  const expiredCount = statuses.filter((status) => status.key === "expired").length;
  const next = records
    .filter((record) => diffDays(record.expireDate) >= 0)
    .sort((a, b) => diffDays(a.expireDate) - diffDays(b.expireDate))[0];

  document.querySelector("#totalCars").textContent = records.length;
  document.querySelector("#expiringSoon").textContent = soonCount;
  document.querySelector("#expiredCars").textContent = expiredCount;
  document.querySelector("#nextPlate").textContent = next ? next.plate : "--";
  document.querySelector("#nextDate").textContent = next
    ? `${shortDateFormatter.format(parseDate(next.expireDate))} 到期`
    : "暂无有效记录";
}

function renderEmptyState(visibleCount) {
  emptyState.classList.toggle("show", visibleCount === 0);
  if (records.length === 0) {
    emptyTitle.textContent = "还没有车辆记录";
    emptyDescription.textContent = "添加一辆外地车，记录会保存在当前浏览器。";
  } else {
    emptyTitle.textContent = "没有符合条件的车辆";
    emptyDescription.textContent = "可以切换筛选条件或清除搜索内容。";
  }
}

function render() {
  todayLabel.textContent = `今天 ${dateFormatter.format(todayStart())}`;
  renderSummary();
  recordsList.replaceChildren();

  const visibleRecords = filteredRecords();
  visibleRecords.forEach((record) => recordsList.append(renderRecord(record)));
  renderEmptyState(visibleRecords.length);
}

function renderCloudStatus() {
  reminderStrip.classList.remove("is-checking", "is-active", "is-warning");
  reminderStrip.classList.add("is-active");
  reminderTitle.textContent = "数据已保存在本浏览器";
  reminderDescription.textContent = "同一设备和浏览器再次打开时会自动恢复";
  reminderSchedule.textContent = "到期日打开页面提醒";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  syncExpireDate();
  const nextRecord = recordFromForm();
  const validationMessage = validateRecord(nextRecord);
  if (validationMessage) {
    alert(validationMessage);
    return;
  }

  const index = records.findIndex((record) => record.id === nextRecord.id);
  const nextRecords = [...records];
  if (index >= 0) nextRecords[index] = nextRecord;
  else nextRecords.push(nextRecord);

  try {
    await saveRecords(nextRecords);
    records = nextRecords;
    resetForm();
    render();
    showToast(`${nextRecord.plate} 已保存`);
  } catch {
    alert("保存失败，请检查浏览器存储设置后重试。");
  }
});

fields.effectiveDate.addEventListener("change", syncExpireDate);
resetButton.addEventListener("click", resetForm);
searchInput.addEventListener("input", render);
renewIssueDate.addEventListener("change", syncRenewDates);
renewEffectiveDate.addEventListener("change", syncRenewDates);
renewCloseButton.addEventListener("click", closeRenewDialog);
renewCancelButton.addEventListener("click", closeRenewDialog);
renewForm.addEventListener("submit", submitRenewal);
renewDialog.addEventListener("close", () => {
  renewingRecordId = null;
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeFilter = tab.dataset.filter;
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    render();
  });
});

resetForm();

function escapeCalendarText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function compactDate(dateText) {
  return String(dateText || "").replace(/-/g, "");
}

function exportCalendar(event) {
  event.preventDefault();
  if (!records.length) {
    showToast("请先添加车辆记录");
    return;
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Entry Pass Helper//CN",
    "CALSCALE:GREGORIAN",
  ];
  records.forEach((record) => {
    const nextDay = toDateInputValue(addDays(parseDate(record.expireDate), 1));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeCalendarText(record.id)}@entry-pass-helper`,
      `DTSTART;VALUE=DATE:${compactDate(record.expireDate)}`,
      `DTEND;VALUE=DATE:${compactDate(nextDay)}`,
      `SUMMARY:${escapeCalendarText(record.plate)} 进京证到期`,
      `DESCRIPTION:${escapeCalendarText("请办理新一轮进京证")}`,
      "BEGIN:VALARM",
      "TRIGGER;RELATED=START:PT9H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeCalendarText(record.plate)} 进京证今天到期`,
      "END:VALARM",
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");

  const blob = new Blob([`${lines.join("\r\n")}\r\n`], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "进京证到期提醒.ics";
  link.click();
  URL.revokeObjectURL(url);
}

calendarButton.addEventListener("click", exportCalendar);
notificationButton.addEventListener("click", requestNotifications);
importButton.addEventListener("click", () => importFile.click());
backupButton.addEventListener("click", exportBackup);
importFile.addEventListener("change", importBackup);

async function init() {
  applySession();
  try {
    records = await loadRecords();
  } catch {
    records = [];
    showToast("浏览器数据读取失败，请检查存储设置");
  }
  render();
  renderCloudStatus();
  updateNotificationButton();
  showDueNotification();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

init();
