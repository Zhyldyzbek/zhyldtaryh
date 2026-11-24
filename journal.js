"use strict";

(() => {
  const endpoint = window.ZHYLDTARYH_API;
  const sessionKey = "zhyldtaryh.journal.session";
  const header = document.querySelector("#journal-link");
  const errors = {
    login: t("Кирүү маалыматы туура эмес. Кайра текшериңиз."),
    expired: t("Кирүү убактысы бүттү. Аккаунттан кайра кириңиз."),
    forbidden: t("Бул бөлүмгө кирүүгө уруксатыңыз жок."),
    setup: t("Журналдын сактагычы даярдала элек."),
    missing: t("Бул окуучу табылган жок."),
    invalid: t("Киргизилген маалыматты текшериңиз."),
    busy: t("Журнал бошобой жатат. Бир аздан кийин кайра аракет кылыңыз."),
    taken: t("Бул логин колдонулуп жатат. Башкасын тандаңыз."),
    retryLogin: t("Кирүү аракети көп болду. Бир аздан кийин кайра аракет кылыңыз."),
    changeRequired: t("Адегенде жаңы сырсөз коюңуз.")
  };
  let token = "";
  let profile = null;
  let restoring = false;
  let roster = null;
  let rosterError = "";
  let rosterLoading = false;
  let student = null;
  let loadingStudent = "";
  let issued = null;
  let resetIssued = null;
  let sessionVersion = 0;

  function storeToken(value) {
    token = value;
    try {
      if (value) sessionStorage.setItem(sessionKey, value);
      else sessionStorage.removeItem(sessionKey);
    } catch {
      // A browser can disable session storage without blocking sign-in.
    }
  }

  async function request(action, data = {}) {
    if (!endpoint) throw new Error(errors.setup);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22000);
    let result;
    const presentedToken = token;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        credentials: "omit",
        body: JSON.stringify({ action, data, token: presentedToken }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error();
      result = await response.json();
    } catch {
      throw new Error(t("Журналга туташуу үзүлдү. Кайра аракет кылып көрүңүз."));
    } finally {
      clearTimeout(timeout);
    }
    if (!result.ok) {
      if (result.error === "expired" && presentedToken && token === presentedToken) {
        storeToken("");
        adopt(null);
        if (getRoute().section === "account") render({ moveFocus: true });
        else location.hash = "#account";
      }
      throw new Error(errors[result.error] || t("Журналда ката чыкты. Кийин кайра аракет кылыңыз."));
    }
    return result.data;
  }

  function updateHeader() {
    header.hidden = !endpoint;
    header.href = profile?.role === "teacher" ? "#admin" : "#account";
    header.textContent = profile?.role === "teacher" ? t("Мугалим журналы") : profile ? t("Аккаунт") : t("Кирүү");
  }

  function adopt(next) {
    sessionVersion++;
    profile = next;
    roster = null;
    rosterError = "";
    rosterLoading = false;
    student = null;
    loadingStudent = "";
    issued = null;
    resetIssued = null;
    loadWork(next?.uid || "");
    updateHeader();
  }

  function absorb(events) {
    for (const track of Object.keys(work)) work[track].attempts = {};
    const saved = new Set();
    for (const event of events) {
      saved.add(event.id);
      const courseWork = work[event.track];
      if (event.kind === "test") {
        const previous = attemptsFor(event.track, event.activity);
        courseWork.attempts[event.activity] = {
          count: previous.count + 1,
          best: Math.max(previous.best, event.percent),
          latest: { percent: event.percent, correct: event.correct, answers: event.answers }
        };
      } else {
        courseWork.reports[event.activity] = { answers: event.answers, date: event.date, submitted: true };
      }
    }
    for (const courseWork of Object.values(work)) {
      for (const [key, staged] of Object.entries(courseWork.pending)) {
        if (!saved.has(staged.eventId)) continue;
        const [kind, activity] = key.split(":");
        if (kind === "test") delete courseWork.quizDrafts[activity];
        delete courseWork.pending[key];
      }
    }
    save();
  }

  async function activate(next) {
    const data = next.role === "student" && !next.mustChange ? await request("myWork") : null;
    adopt(next);
    if (data) absorb(data.events);
  }

  function status(element, text, error = false) {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("error", error);
  }

  function usernameInput(value = "") {
    return `<div class="field"><label for="journal-username">${t("Логин")}</label>
      <input class="journal-input" id="journal-username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="32" value="${escape(value)}"></div>`;
  }

  function passwordInput(isNew) {
    return `<div class="field"><label for="journal-password">${isNew ? t("Жаңы сырсөз") : t("Сырсөз")}</label>
      <input class="journal-input" id="journal-password" name="password" type="password" autocomplete="${isNew ? "new-password" : "current-password"}" required ${isNew ? 'minlength="12"' : ""} maxlength="128">
      ${isNew ? `<p class="small-note">${t("Кеминде 12 белги колдонуңуз.")}</p>` : ""}</div>
    ${isNew ? `<div class="field"><label for="journal-confirm">${t("Сырсөздү кайталаңыз")}</label><input class="journal-input" id="journal-confirm" name="confirm" type="password" autocomplete="new-password" required maxlength="128"></div>` : ""}`;
  }

  function authNavigation(mode) {
    return `<nav class="actions journal-auth-nav" aria-label="${t("Аккаунт")}">
      ${[["password", "#account", t("Окуучу кирүү")], ["register", "#account/register", t("Катталуу")], ["code", "#account/code", t("Код менен кирүү")]].map(([key, url, label]) =>
        `<a class="button button-${key === mode ? "primary" : "quiet"}" ${key === mode ? 'aria-current="page"' : ""} href="${url}">${label}</a>`
      ).join("")}
    </nav>`;
  }

  function account() {
    if (!endpoint) return pageHead(t("Аккаунт"), errors.setup);
    if (restoring) return pageHead(t("Аккаунт"), t("Кирүү абалы текшерилүүдө…"));
    if (profile) {
      if (profile.mustChange) {
        return pageHead(t("Жаңы сырсөз коюңуз"), t("Мугалим берген убактылуу сырсөздү жаңыртыңыз.")) + `<section class="panel article">
          <form id="journal-account" data-mode="change">
            ${passwordInput(true)}
            <p id="login-status" class="notice" role="status"></p>
            <div class="actions"><button class="button button-primary" type="submit">${t("Жаңы сырсөздү сактоо")}</button>
              <button class="button button-quiet" type="button" data-journal="logout">${t("Чыгуу")}</button></div>
          </form></section>`;
      }
      const teacher = profile.role === "teacher";
      return pageHead(profile.name, teacher ? t("Мугалимдин кабинети") : t("Окуучунун кабинети")) + `<section class="panel article"><div class="actions">
        ${link(teacher ? "#admin" : "#progress/kg", teacher ? t("Мугалим журналын ачуу") : t("Менин иштерим"), "primary")}
        <button class="button button-quiet" type="button" data-journal="logout">${t("Чыгуу")}</button>
      </div></section>`;
    }
    const page = location.hash.split("/")[1];
    const mode = page === "register" || page === "code" ? page : "password";
    const registering = mode === "register";
    const title = registering ? t("Окуучу катталуу") : t("Кирүү");
    const lead = mode === "code" ? t("Мугалим же мурда код алган окуучу жеке коду менен кирет.") :
      registering ? t("Атыңызды жазып, өзүңүзгө логин жана сырсөз тандаңыз.") : t("Окуучу катары катталган логиниңиз жана сырсөзүңүз менен кириңиз.");
    return pageHead(title, lead) + authNavigation(mode) + `<section class="panel article">
      <form id="journal-account" data-mode="${mode}">
        ${mode === "code" ? `<div class="field"><label for="journal-code">${t("Жеке кирүү коду")}</label><input class="journal-input" id="journal-code" name="code" type="password" autocomplete="current-password" spellcheck="false" required maxlength="40"></div>` : `
          ${registering ? `<div class="field"><label for="journal-name">${t("Атыңыз")}</label><input class="journal-input" id="journal-name" name="name" autocomplete="name" required minlength="2" maxlength="80"></div>` : ""}
          ${usernameInput()} ${passwordInput(registering)}`}
        <p id="login-status" class="notice" role="status"></p>
        <button class="button button-primary" type="submit">${registering ? t("Катталуу") : t("Кирүү")}</button>
      </form>
      <p class="small-note">${mode === "password" ? t("Сырсөздү унутсаңыз, мугалимден убактылуу сырсөз алыңыз.") : t("Киргенден кийин аяктаган тесттер жана тапшырылган отчёттор мугалимге көрүнөт.")}</p>
    </section>`;
  }

  function usernameOf(value) {
    const username = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error(t("Логинге 3–32 латын тамгасын же санды колдонуңуз. Ичинде чекит, сызыкча жана астын сызуу белгиси да боло алат."));
    return username;
  }

  const hex = bytes => Array.from(bytes, number => number.toString(16).padStart(2, "0")).join("");
  const randomHex = bytes => hex(crypto.getRandomValues(new Uint8Array(bytes)));

  async function passwordProof(password, salt) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const options = { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode("zhyldtaryh:v1:" + salt), iterations: 600000 };
    return hex(new Uint8Array(await crypto.subtle.deriveBits(options, key, 256)));
  }

  async function freshPassword(password) {
    const salt = randomHex(16);
    return { salt, proof: await passwordProof(password, salt) };
  }

  async function authenticate(form) {
    const read = name => form.elements.namedItem(name).value;
    let result;
    const mode = form.dataset.mode;
    if (mode === "code") {
      result = await request("login", { code: read("code") });
    } else if (mode === "password") {
      const username = usernameOf(read("username"));
      const { salt } = await request("passwordSalt", { username });
      result = await request("passwordLogin", { username, salt, proof: await passwordProof(read("password"), salt) });
    } else {
      const password = read("password");
      if (password.length < 12) throw new Error(t("Сырсөз кеминде 12 белгиден турсун."));
      if (password !== read("confirm")) throw new Error(t("Жазылган сырсөздөр дал келген жок."));
      const credentials = await freshPassword(password);
      result = mode === "change" ? await request("changePassword", credentials)
        : await request("register", { ...credentials, name: read("name"), username: usernameOf(read("username")) });
    }
    storeToken(result.token);
    try { await activate(result.profile); } catch (error) {
      storeToken("");
      adopt(null);
      throw error;
    }
    const target = profile.role === "teacher" ? "#admin" : profile.mustChange ? "#account" : "#progress/kg";
    if (location.hash === target) render({ moveFocus: true });
    else location.hash = target;
  }

  const formatDate = new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "ky-KG", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bishkek"
  });
  const showDate = date => date && Number.isFinite(Date.parse(date)) ? formatDate.format(new Date(date)) : "—";

  function studentDetails(data) {
    const tests = new Map();
    const reports = [];
    for (const event of data.events) {
      if (event.kind === "report") reports.push(event);
      else {
        const key = event.track + "/" + event.activity;
        if (!tests.has(key)) tests.set(key, []);
        tests.get(key).push(event);
      }
    }
    return `<section class="panel" aria-labelledby="student-details-title">
      <h2 id="student-details-title" tabindex="-1">${escape(data.student.name)}</h2>
      <p class="muted">${data.student.username ? t("Логин") + " · " + escape(data.student.username) : t("Жеке код менен катталган")}</p>
      <details class="journal-reset" ${resetIssued?.student.id === data.student.id ? "open" : ""}>
        <summary>${t("Сырсөздү баштапкы абалга келтирүү")}</summary>
        <form class="journal-enroll" id="journal-reset" data-id="${escape(data.student.id)}">
          ${data.student.username ? "" : usernameInput()}
          <button class="button button-soft" type="submit">${t("Убактылуу сырсөз түзүү")}</button>
        </form>
        <p id="reset-status" class="notice" role="status"></p>
        ${resetIssued?.student.id === data.student.id ? `<div class="callout"><strong>${t("Убактылуу сырсөз")}</strong>
          <p><code class="journal-code">${escape(resetIssued.password)}</code></p>
          <p class="small-note">${t("Логин жана убактылуу сырсөздү ушул окуучуга гана бериңиз. Ал киргенде өзүнө жаңы сырсөз коёт.")}</p></div>`
          : `<p class="small-note">${t("Убактылуу сырсөз түзүлгөндө окуучунун мурдагы кирүүсү токтойт.")}</p>`}
      </details>
      ${Object.entries(courses).map(([track, course]) => `<h3>${escape(course.title)}</h3>
        <div class="journal-table-wrap"><table class="journal-table">
          <thead><tr><th scope="col">${t("Тест")}</th><th scope="col">${t("Аракет")}</th><th scope="col">${t("Мыктысы")}</th><th scope="col">${t("Акыркысы")}</th></tr></thead>
          <tbody>${[...course.lessons.map(unit => unit.title), t("Жыйынтыктоочу тест")].map((title, index) => {
            const events = tests.get(track + "/" + (index === 5 ? "final" : index + 1)) || [];
            const latest = events.at(-1);
            const best = events.reduce((value, event) => Math.max(value, event.percent), 0);
            return `<tr><th scope="row">${escape(title)}</th><td>${events.length}</td>
              <td>${events.length ? best + "%" : "—"}</td><td>${latest ? latest.percent + "% · " + showDate(latest.date) : "—"}</td></tr>`;
          }).join("")}</tbody>
        </table></div>`).join("")}
      <h3>${t("Практикалык отчёттор")}</h3>
      ${reports.length ? reports.reverse().map(event => {
        const task = courses[event.track].practices[Number(event.activity) - 1];
        return `<details><summary>${escape(courses[event.track].title)} · ${escape(task.title)} · ${showDate(event.date)}</summary>
          ${task.prompts.map(([title], i) => `<div class="review"><strong>${escape(title)}</strong><p class="journal-work">${escape(event.answers[i])}</p></div>`).join("")}
        </details>`;
      }).join("") : `<p class="muted">${t("Отчёт тапшырыла элек.")}</p>`}
    </section>`;
  }

  function admin() {
    if (restoring) return pageHead(t("Мугалим журналы"), t("Кирүү абалы текшерилүүдө…"));
    if (profile?.role !== "teacher") return pageHead(t("Мугалим журналы"), t("Журналды ачуу үчүн мугалимдин жеке коду менен кириңиз.")) + link("#account/code", t("Код менен кирүү"), "primary");
    if (!roster && !rosterError && !rosterLoading) queueMicrotask(loadRoster);
    return pageHead(t("Мугалим журналы"), t("Окуучулардын практикалык иштери, упайлары жана тест аракеттери."), t("7-класс"))
      + `<div class="stack"><section class="panel">
        <div class="section-bar"><h2>${t("Окуучулар")}</h2><div class="actions">
          <button class="button button-quiet" type="button" data-journal="refresh">${t("Жаңыртуу")}</button>
          <button class="button button-quiet" type="button" data-journal="logout">${t("Чыгуу")}</button>
        </div></div>
        <details><summary>${t("Жеке код менен окуучу кошуу")}</summary>
        <form class="journal-enroll" id="journal-enroll">
          <div class="field"><label for="student-name">${t("Окуучуну кошуу")}</label>
            <input class="journal-input" id="student-name" name="name" type="text" minlength="2" maxlength="80" autocomplete="off" required placeholder="${t("Аты же класстагы белгиси")}"></div>
          <button class="button button-primary" type="submit">${t("Жеке код түзүү")}</button>
        </form></details>
        <p class="notice" id="student-status" role="status"></p>
        ${issued ? `<div class="callout"><strong>${escape(issued.student.name)} · ${t("жеке кирүү коду")}</strong><p><code class="journal-code">${escape(issued.code)}</code></p><p class="small-note">${t("Кодду ушул окуучуга гана бериңиз.")}</p></div>` : ""}
        ${rosterError ? `<p class="notice error">${escape(rosterError)}</p>` : ""}
        ${!roster ? (rosterError ? "" : `<p class="muted">${t("Окуучулар жүктөлүүдө…")}</p>`) : roster.length ? `<div class="journal-table-wrap"><table class="journal-table">
          <thead><tr><th scope="col">${t("Окуучу")}</th><th scope="col">${t("Прогресс")}</th><th scope="col">${t("Тест")}</th><th scope="col">${t("Отчёт")}</th><th scope="col">${t("Аракет")}</th></tr></thead>
          <tbody>${roster.map(entry => `<tr>
            <th scope="row"><button class="journal-name" type="button" data-journal="student" data-id="${escape(entry.id)}">${escape(entry.name)}</button>
              ${entry.username ? `<small class="journal-username">${escape(entry.username)}</small>` : ""}</th>
            <td>${entry.tests + entry.reports} / 16</td><td>${entry.tests} / 12</td><td>${entry.reports} / 4</td><td>${entry.attempts}</td>
          </tr>`).join("")}</tbody>
        </table></div>` : `<p class="muted">${t("Окуучулар кошула элек.")}</p>`}
      </section>
        ${loadingStudent ? `<p class="muted" role="status">${t("Окуучунун иштери жүктөлүүдө…")}</p>` : ""}
        ${student ? studentDetails(student) : ""}
      </div>`;
  }

  async function loadRoster() {
    if (rosterLoading || profile?.role !== "teacher") return;
    const version = sessionVersion;
    rosterLoading = true;
    rosterError = "";
    try {
      const entries = await request("roster");
      if (version === sessionVersion) roster = entries.sort((a, b) => a.name.localeCompare(b.name, language));
    } catch (error) {
      if (version === sessionVersion) rosterError = error.message;
    } finally {
      if (version === sessionVersion) {
        rosterLoading = false;
        if (getRoute().section === "admin") render();
      }
    }
  }

  async function openStudent(id) {
    const version = sessionVersion;
    loadingStudent = id;
    render();
    try {
      const result = await request("studentDetail", { studentId: id });
      if (version !== sessionVersion || loadingStudent !== id) return;
      student = result;
      loadingStudent = "";
      if (getRoute().section === "admin") {
        render();
        document.querySelector("#student-details-title")?.focus();
      }
    } catch (error) {
      if (version === sessionVersion && loadingStudent === id) {
        loadingStudent = "";
        if (getRoute().section === "admin") {
          render();
          status(document.querySelector("#student-status"), error.message, true);
        }
      }
    }
  }

  async function submit(kind, track, activity, answers) {
    const version = sessionVersion;
    const key = kind + ":" + activity;
    const pending = work[track].pending;
    const existing = pending[key];
    if (!existing || JSON.stringify(existing.answers) !== JSON.stringify(answers)) {
      pending[key] = { eventId: crypto.randomUUID(), kind, track, activity, answers };
      save();
    }
    const sent = await request("record", pending[key]);
    if (version !== sessionVersion) return null;
    delete pending[key];
    return sent;
  }

  app.addEventListener("submit", async event => {
    const form = event.target;
    if (!["journal-account", "journal-enroll", "journal-reset"].includes(form.id)) return;
    event.preventDefault();
    const button = form.querySelector("[type=submit]");
    if (button.disabled) return;
    const output = document.querySelector(form.id === "journal-account" ? "#login-status" : form.id === "journal-reset" ? "#reset-status" : "#student-status");
    button.disabled = true;
    status(output, t("Иштелүүдө…"));
    try {
      if (form.id === "journal-account") {
        await authenticate(form);
      } else if (form.id === "journal-reset") {
        const version = sessionVersion;
        const selected = student.student;
        if (selected.id !== form.dataset.id) return;
        const username = selected.username || usernameOf(form.elements.namedItem("username").value);
        const password = randomHex(10);
        const result = await request("resetPassword", { studentId: selected.id, username, ...await freshPassword(password) });
        if (version !== sessionVersion) return;
        resetIssued = { student: result.student, password };
        if (student?.student.id === selected.id) student.student = result.student;
        await loadRoster();
        if (getRoute().section === "admin") render();
      } else {
        const version = sessionVersion;
        const result = await request("createStudent", { name: form.elements.namedItem("name").value });
        if (version !== sessionVersion) return;
        issued = result;
        await loadRoster();
        if (getRoute().section === "admin") render();
      }
    } catch (error) {
      status(output, error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  app.addEventListener("click", async event => {
    const button = event.target.closest("button[data-journal]");
    if (!button) return;
    const action = button.dataset.journal;
    if (action === "logout") {
      storeToken("");
      adopt(null);
      if (location.hash === "#account") render({ moveFocus: true });
      else location.hash = "#account";
    }
    if (action === "student") await openStudent(button.dataset.id);
    if (action === "refresh") {
      const selected = student?.student.id;
      await loadRoster();
      if (selected) await openStudent(selected);
    }
  });

  async function restore() {
    updateHeader();
    if (!endpoint) return;
    try { token = sessionStorage.getItem(sessionKey) || ""; } catch { token = ""; }
    if (!token) {
      if (["account", "admin"].includes(getRoute().section)) render();
      return;
    }
    restoring = true;
    if (["account", "admin"].includes(getRoute().section)) render();
    try {
      const result = await request("session");
      await activate(result.profile);
      if (profile.mustChange && location.hash !== "#account") location.hash = "#account";
    } catch {
      storeToken("");
      adopt(null);
    } finally {
      restoring = false;
      render();
    }
  }

  window.CourseJournal = { renderAccount: account, renderAdmin: admin, isStudent: () => profile?.role === "student" && !profile.mustChange, submit };
  restore();
})();
