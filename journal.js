"use strict";

(() => {
  const endpoint = window.ZHYLDTARYH_API;
  const sessionKey = "zhyldtaryh.journal.session";
  const header = document.querySelector("#journal-link");
  const errors = {
    login: "Код туура эмес. Жеке кодуңузду текшериңиз.",
    expired: "Кирүү убактысы бүттү. Аккаунттан кайра кириңиз.",
    forbidden: "Бул бөлүмгө кирүүгө уруксатыңыз жок.",
    setup: "Журналдын сактагычы даярдала элек.",
    missing: "Бул окуучу табылган жок.",
    invalid: "Киргизилген маалыматты текшериңиз.",
    busy: "Журнал бошобой жатат. Бир аздан кийин кайра аракет кылыңыз."
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
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        credentials: "omit",
        body: JSON.stringify({ action, data, token }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error();
      result = await response.json();
    } catch {
      throw new Error("Журналга туташуу үзүлдү. Кайра аракет кылып көрүңүз.");
    } finally {
      clearTimeout(timeout);
    }
    if (!result.ok) throw new Error(errors[result.error] || "Журналда ката чыкты. Кийин кайра аракет кылыңыз.");
    return result.data;
  }

  function updateHeader() {
    header.hidden = !endpoint;
    header.href = profile?.role === "teacher" ? "#admin" : "#account";
    header.textContent = profile?.role === "teacher" ? "Мугалим журналы" : profile ? "Аккаунт" : "Кирүү";
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
    const data = next.role === "student" ? await request("myWork") : null;
    adopt(next);
    if (data) absorb(data.events);
  }

  function status(element, text, error = false) {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("error", error);
  }

  function account() {
    if (!endpoint) return pageHead("Аккаунт", errors.setup);
    if (restoring) return pageHead("Аккаунт", "Кирүү абалы текшерилүүдө…");
    if (profile) {
      const teacher = profile.role === "teacher";
      return pageHead(profile.name, teacher ? "Мугалимдин кабинети" : "Окуучунун кабинети") + `<section class="panel article"><div class="actions">
        ${link(teacher ? "#admin" : "#progress/kg", teacher ? "Мугалим журналын ачуу" : "Менин иштерим", "primary")}
        <button class="button button-quiet" type="button" data-journal="logout">Чыгуу</button>
      </div></section>`;
    }
    return pageHead("Кирүү", "Мугалим же окуучу өзүнүн жеке коду менен кирет.") + `<section class="panel article">
      <form id="journal-login">
        <div class="field"><label for="journal-code">Жеке кирүү коду</label>
          <input class="journal-input" id="journal-code" name="code" type="password" autocomplete="current-password" spellcheck="false" required maxlength="40"></div>
        <p id="login-status" class="notice" role="status"></p>
        <button class="button button-primary" type="submit">Кирүү</button>
      </form>
      <p class="small-note">Киргенден кийин аяктаган тесттер жана тапшырылган отчёттор мугалимге көрүнөт.</p>
    </section>`;
  }

  const formatDate = new Intl.DateTimeFormat("ky-KG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bishkek" });
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
      ${Object.entries(courses).map(([track, course]) => `<h3>${escape(course.title)}</h3>
        <div class="journal-table-wrap"><table class="journal-table">
          <thead><tr><th scope="col">Тест</th><th scope="col">Аракет</th><th scope="col">Мыктысы</th><th scope="col">Акыркысы</th></tr></thead>
          <tbody>${[...course.lessons.map(unit => unit.title), "Жыйынтыктоочу тест"].map((title, index) => {
            const events = tests.get(track + "/" + (index === 5 ? "final" : index + 1)) || [];
            const latest = events.at(-1);
            const best = events.reduce((value, event) => Math.max(value, event.percent), 0);
            return `<tr><th scope="row">${escape(title)}</th><td>${events.length}</td>
              <td>${events.length ? best + "%" : "—"}</td><td>${latest ? latest.percent + "% · " + showDate(latest.date) : "—"}</td></tr>`;
          }).join("")}</tbody>
        </table></div>`).join("")}
      <h3>Практикалык отчёттор</h3>
      ${reports.length ? reports.reverse().map(event => {
        const task = courses[event.track].practices[Number(event.activity) - 1];
        return `<details><summary>${escape(courses[event.track].title)} · ${escape(task.title)} · ${showDate(event.date)}</summary>
          ${task.prompts.map(([title], i) => `<div class="review"><strong>${escape(title)}</strong><p class="journal-work">${escape(event.answers[i])}</p></div>`).join("")}
        </details>`;
      }).join("") : '<p class="muted">Отчёт тапшырыла элек.</p>'}
    </section>`;
  }

  function admin() {
    if (restoring) return pageHead("Мугалим журналы", "Кирүү абалы текшерилүүдө…");
    if (profile?.role !== "teacher") return pageHead("Мугалим журналы", "Журналды ачуу үчүн мугалимдин жеке коду менен кириңиз.") + link("#account", "Кирүү", "primary");
    if (!roster && !rosterError && !rosterLoading) queueMicrotask(loadRoster);
    return pageHead("Мугалим журналы", "Окуучулардын практикалык иштери, упайлары жана тест аракеттери.", "7-класс")
      + `<div class="stack"><section class="panel">
        <div class="section-bar"><h2>Окуучулар</h2><div class="actions">
          <button class="button button-quiet" type="button" data-journal="refresh">Жаңыртуу</button>
          <button class="button button-quiet" type="button" data-journal="logout">Чыгуу</button>
        </div></div>
        <form class="journal-enroll" id="journal-enroll">
          <div class="field"><label for="student-name">Окуучуну кошуу</label>
            <input class="journal-input" id="student-name" name="name" type="text" minlength="2" maxlength="80" autocomplete="off" required placeholder="Аты же класстагы белгиси"></div>
          <button class="button button-primary" type="submit">Жеке код түзүү</button>
        </form>
        <p class="notice" id="student-status" role="status"></p>
        ${issued ? `<div class="callout"><strong>${escape(issued.student.name)} · жеке кирүү коду</strong><p><code class="journal-code">${escape(issued.code)}</code></p><p class="small-note">Кодду ушул окуучуга гана бериңиз.</p></div>` : ""}
        ${rosterError ? `<p class="notice error">${escape(rosterError)}</p>` : ""}
        ${!roster ? (rosterError ? "" : '<p class="muted">Окуучулар жүктөлүүдө…</p>') : roster.length ? `<div class="journal-table-wrap"><table class="journal-table">
          <thead><tr><th scope="col">Окуучу</th><th scope="col">Прогресс</th><th scope="col">Тест</th><th scope="col">Отчёт</th><th scope="col">Аракет</th></tr></thead>
          <tbody>${roster.map(entry => `<tr>
            <th scope="row"><button class="journal-name" type="button" data-journal="student" data-id="${escape(entry.id)}">${escape(entry.name)}</button></th>
            <td>${entry.tests + entry.reports} / 16</td><td>${entry.tests} / 12</td><td>${entry.reports} / 4</td><td>${entry.attempts}</td>
          </tr>`).join("")}</tbody>
        </table></div>` : '<p class="muted">Окуучулар кошула элек.</p>'}
      </section>
        ${loadingStudent ? '<p class="muted" role="status">Окуучунун иштери жүктөлүүдө…</p>' : ""}
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
      if (version === sessionVersion) roster = entries.sort((a, b) => a.name.localeCompare(b.name, "ky"));
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
    if (form.id !== "journal-login" && form.id !== "journal-enroll") return;
    event.preventDefault();
    const button = form.querySelector("[type=submit]");
    if (button.disabled) return;
    const output = form.id === "journal-login" ? form.querySelector("#login-status") : document.querySelector("#student-status");
    button.disabled = true;
    status(output, "Иштелүүдө…");
    try {
      if (form.id === "journal-login") {
        const result = await request("login", { code: form.elements.namedItem("code").value });
        storeToken(result.token);
        try { await activate(result.profile); } catch (error) {
          storeToken("");
          adopt(null);
          throw error;
        }
        location.hash = profile.role === "teacher" ? "#admin" : "#progress/kg";
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
      if (getRoute().section === "account") render({ moveFocus: true });
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
    } catch {
      storeToken("");
      adopt(null);
    } finally {
      restoring = false;
      render();
    }
  }

  window.CourseJournal = { renderAccount: account, renderAdmin: admin, isStudent: () => profile?.role === "student", submit };
  restore();
})();
