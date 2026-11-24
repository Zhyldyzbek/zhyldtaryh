"use strict";

const app = document.querySelector("#app");
const main = document.querySelector("#main");
const announcement = document.querySelector("#announcement");
const navToggle = document.querySelector(".nav-toggle");
const navLine = document.querySelector(".nav-line");
const toTop = document.querySelector(".to-top");

function setNavOpen(open) {
  if (!navLine || !navToggle) return;
  navLine.classList.toggle("is-open", open);
  navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  const label = navToggle.querySelector(".sr-only");
  if (label) label.textContent = open ? t("Менюну жабуу") : t("Меню");
}

function syncToTop() {
  if (!toTop) return;
  toTop.hidden = window.scrollY < 240;
}
const storageKey = "zhyldtaryh.works.v1";
const emptyWork = () => ({ read: {}, attempts: {}, quizDrafts: {}, reports: {}, reportDrafts: {}, pending: {} });
const work = { kg: emptyWork(), world: emptyWork() };
let storageAvailable = true;
let activeStorageKey = storageKey;

function loadWork(owner = "") {
  activeStorageKey = owner ? storageKey + "." + owner : storageKey;
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(activeStorageKey) || "{}");
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  for (const track of Object.keys(work)) work[track] = { ...emptyWork(), ...saved?.[track] };
}
loadWork();

const knownSections = ["home", "plans", "lectures", "lesson", "practice", "report", "tests", "test", "exam", "sources", "progress", "account", "admin"];
const parentSections = { lesson: "lectures", report: "practice", test: "tests" };
const escape = value => String(value ?? "").replace(/[&<>"']/g, letter => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[letter]);
const route = (section, track, index) => "#" + [section, track, index].filter(value => value !== undefined).join("/");
const link = (href, label, variant = "quiet") => `<a class="button button-${variant}" href="${href}">${escape(label)}</a>`;

function save() {
  try {
    localStorage.setItem(activeStorageKey, JSON.stringify(work));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  return storageAvailable;
}

function announce(message) {
  announcement.textContent = message;
}

function getRoute() {
  const [page, candidate, index] = location.hash.slice(1).split("/");
  const track = candidate === "world" ? "world" : "kg";
  const section = knownSections.includes(page) ? page : "home";
  const validIndex = section === "report" ? /^[12]$/.test(index) : /^[1-5]$/.test(index);
  if (parentSections[section] && !validIndex && !(section === "test" && index === "final")) {
    return { section: parentSections[section], track };
  }
  return { section, track, index };
}

function pageHead(title, lead, context = "") {
  return `<header class="section-head">
    ${context ? `<div class="kicker">${escape(context)}</div>` : ""}
    <h1 tabindex="-1">${escape(title)}</h1>${lead ? `<p>${escape(lead)}</p>` : ""}
  </header>`;
}

function trackSwitch(section, active) {
  return `<nav class="track-switch" aria-label="${t("Тарых багыты")}">
    ${Object.entries(courses).map(([key, course]) => `<a href="${route(section, key)}" ${key === active ? 'aria-current="true"' : ""}>${escape(course.title)}</a>`).join("")}
  </nav>`;
}

function openSource(label, url) {
  return `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`;
}

function sourceList(keys) {
  return `<ul class="source-list">${keys.map(key => {
    const [name, author, url] = sources[key];
    return `<li>${openSource(name, url)} <span>· ${escape(author)}</span></li>`;
  }).join("")}</ul>`;
}

function row(href, number, title, meta, state = "", done = false) {
  return `<li><a class="row-link" href="${href}">
    <span class="track-tag" aria-hidden="true">${escape(number)}</span>
    <span><strong>${escape(title)}</strong><span class="meta">${escape(meta)}</span></span>
    ${state ? `<span class="status-pill ${done ? "" : "todo"}">${escape(state)}</span>` : ""}
  </a></li>`;
}

function questionsFor(track, index) {
  const lessons = courses[track].lessons;
  return index === "final" ? lessons.flatMap(unit => unit.questions.slice(0, 2)) : lessons[Number(index) - 1].questions;
}

function attemptsFor(track, index) {
  return work[track].attempts[index] || { count: 0, best: 0, latest: null };
}

function completion(track) {
  const records = work[track];
  const tests = ["1", "2", "3", "4", "5", "final"].filter(index => attemptsFor(track, index).count > 0).length;
  const online = window.CourseJournal?.isStudent();
  const reports = ["1", "2"].filter(index => online ? records.reports[index]?.submitted : records.reports[index]);
  return tests + reports.length;
}

function localStatus() {
  if (window.CourseJournal?.isStudent()) return t("Кирип туруп аяктаган тесттериңиз жана мугалимге тапшырган отчётторуңуз журналга жөнөтүлөт.");
  return storageAvailable
    ? t("Жыйынтыктар ушул браузерде сакталат. Отчётту жүктөп алып, мугалимге жөнөтсөңүз болот.")
    : t("Браузерде сактоо жеткиликсиз. Отчётту файл кылып жүктөп алыңыз.");
}

function progressCard() {
  const total = completion("kg") + completion("world");
  return `<aside class="panel panel-accent">
    <h2>${t("Менин прогрессим")}</h2>
    <div class="progress-cover"><strong>${total} / 16</strong><span class="muted">${t("аткарылган иш")}</span></div>
    <progress value="${total}" max="16" aria-label="${t("Жалпы прогресс")}"></progress>
    <ul class="mini-rows">
      ${Object.entries(courses).map(([key, course]) => `<li><span>${escape(course.title)}</span><strong>${completion(key)} / 8</strong></li>`).join("")}
    </ul>
    ${link(route("progress"), t("Менин иштерим"))}
  </aside>`;
}

function renderHome() {
  return `<section class="hero" aria-labelledby="hero-title">
    <div class="hero-copy">
      <span class="kicker">${t("7-класс · Тарых курсу")}</span>
      <h1 id="hero-title" tabindex="-1">${t("Кыргызстан жана")}<br>${t("дүйнө тарыхы")}</h1>
      <p class="intro">${t("Эне-Сай кыргыздарынан орто кылымдагы дүйнөгө чейин. КББАнын КТПсына негизделген сабактар.")}</p>
      <div class="actions">${link(route("lectures", "kg"), t("Окууну баштоо"), "gold")}</div>
    </div>
    <figure class="hero-figure">
      <img class="hero-image" src="burana.jpg" alt="" width="960" height="595" fetchpriority="high">
      <figcaption class="hero-caption">${t("Бурана мунарасы · Чүй өрөөнү")}</figcaption>
    </figure>
  </section>
  <div class="stats" aria-label="${t("Курстун мазмуну")}">
    ${[[10, t("лекция")], [4, t("практика")], [12, t("тест")], [2, t("зачёт")]].map(([number, label]) => `<div class="stat"><strong>${number}</strong><span>${label}</span></div>`).join("")}
  </div>
  <div class="layout">
    <section aria-labelledby="tracks-title">
      <div class="section-bar"><h2 id="tracks-title">${t("Окуу багыттары")}</h2><a href="#plans">${t("КТПны көрүү")}</a></div>
      <div class="track-list">
        ${Object.entries(courses).map(([key, course]) => `<a class="track-card" href="${route("lectures", key)}">
          <span class="track-tag" aria-hidden="true">${key === "kg" ? t("КР") : t("ДТ")}</span>
          <div><h3>${escape(course.title)}</h3><p>${escape(course.summary)}</p></div>
        </a>`).join("")}
      </div>
    </section>
    ${progressCard()}
  </div>`;
}

function renderPlans() {
  return pageHead(plan.title, plan.details, t("Календардык-тематикалык план")) + `<div class="stack">
    <section class="panel">
      <p>${t("Сайттагы сабактар КББАнын болжолдуу планынын жети бөлүмүнөн тандалган темаларды камтыйт. Толук темалар жана сааттар расмий документте берилген.")}</p>
      <div class="actions">${link(plan.pdf, t("Расмий КТПны ачуу (PDF)"), "primary")} ${link(plan.page, t("КББАнын 7-класс барагы"))}</div>
    </section>
    <section class="panel">
      <h2>${t("Пландагы бөлүмдөр")}</h2>
      ${plan.sections.map((part, index) => `<details ${index === 0 ? "open" : ""}>
        <summary>${index + 1}. ${escape(part.title)}</summary>
        <p>${escape(part.topics)} <span class="muted">(${escape(part.pages)})</span></p>
        <ul class="compact-list">${part.units.map(value => {
          const [track, number] = value.split("/");
          return `<li><a href="${route("lesson", track, number)}">${escape(courses[track].lessons[Number(number) - 1].title)}</a></li>`;
        }).join("")}</ul>
      </details>`).join("")}
    </section>
  </div>`;
}

function renderLectures(track) {
  return pageHead(t("Лекциялар"), courses[track].summary, t("7-класс"))
    + trackSwitch("lectures", track)
    + `<ol class="row-list">${courses[track].lessons.map((unit, index) => {
      const number = index + 1;
      const read = Boolean(work[track].read[number]);
      return row(route("lesson", track, number), number, unit.title, unit.period, read ? t("Окулду") : "", read);
    }).join("")}</ol>`;
}

function renderLesson(track, index) {
  const unit = courses[track].lessons[Number(index) - 1];
  const read = Boolean(work[track].read[index]);
  return pageHead(unit.title, unit.lead, courses[track].title + " · " + t("{number}-лекция", { number: index }))
    + `<article class="panel article">
      ${track === "kg" && index === "3" ? `<figure class="figure"><img class="history-image" src="burana.jpg" alt="${t("Бурана мунарасы жана анын айланасындагы тарыхый жай")}" width="960" height="595" decoding="async"><figcaption>${t("Бурана мунарасы, Чүй өрөөнү")}</figcaption></figure>` : ""}
      ${unit.sections.map(([heading, text]) => `<section><h2>${escape(heading)}</h2><p>${escape(text)}</p></section>`).join("")}
      <section><h2>${t("Булактар")}</h2>${sourceList(unit.materials)}</section>
      <p class="notice" id="lesson-message" role="status"></p>
      <div class="actions" style="margin-top:1.3rem">
        <button type="button" class="button button-soft" data-action="read" ${read ? "disabled" : ""}>${read ? t("Окулду") : t("Окулду деп белгилөө")}</button>
        ${link(route("test", track, index), t("Тестке өтүү"), "primary")}
        ${link(route("lectures", track), t("Лекциялар тизмеси"))}
      </div>
    </article>`;
}

function renderPractice(track) {
  return pageHead(t("Практикалык иштер"), t("Булактарды салыштырып, жоопторуңузду файлга сактаңыз."), t("7-класс"))
    + trackSwitch("practice", track)
    + `<ol class="row-list">${courses[track].practices.map((task, index) => {
      const number = index + 1;
      const saved = Boolean(work[track].reports[number]);
      return row(route("report", track, number), number, task.title, task.description, saved ? t("Сакталды") : t("Аткарыла элек"), saved);
    }).join("")}</ol>`;
}

function renderReport(track, index) {
  const task = courses[track].practices[Number(index) - 1];
  const record = work[track];
  const values = record.reportDrafts[index] || record.reports[index]?.answers || [];
  const previous = record.reports[index];
  return pageHead(task.title, task.description, courses[track].title + " · " + t("{number}-практика", { number: index }))
    + `<div class="layout">
      <form class="panel" id="report-form">
        ${task.prompts.map(([title, instruction], number) => `<div class="field">
          <label for="prompt-${number}">${number + 1}. ${escape(title)}</label>
          <p id="prompt-description-${number}">${escape(instruction)}</p>
          <textarea id="prompt-${number}" name="p${number}" maxlength="4000" required aria-describedby="prompt-description-${number}">${escape(values[number] || "")}</textarea>
        </div>`).join("")}
        <p id="report-status" class="notice" role="status">${previous ? t("Отчёт сакталган.") : ""}</p>
        <div class="actions">
          <button class="button button-primary" type="submit">${t("Отчётту сактоо")}</button>
          ${window.CourseJournal?.isStudent() ? `<button class="button button-soft" type="button" data-action="send-report">${t("Мугалимге тапшыруу")}</button>` : ""}
          <button class="button button-quiet" type="button" data-action="download" ${previous ? "" : "disabled"}>${t("Файлды жүктөө")}</button>
        </div>
      </form>
      <aside class="panel">
        <h2>${t("Ишке жардам")}</h2>
        ${sourceList(task.materials)}
        <p class="small-note">${escape(localStatus())}</p>
      </aside>
    </div>`;
}

function renderTests(track) {
  const entries = courses[track].lessons.map(({ title }, index) => ({ index: String(index + 1), title }));
  entries.push({ index: "final", title: t("Жыйынтыктоочу тест") });
  return pageHead(t("Тесттер"), t("Ар бир тесттин жыйынтыгы дароо чыгат. Тестти кайра тапшырып, мыкты упайыңызды көрө аласыз."), t("7-класс"))
    + trackSwitch("tests", track)
    + `<ol class="row-list">${entries.map(({ index, title }) => {
      const result = attemptsFor(track, index);
      const content = t("{count} суроо", { count: questionsFor(track, index).length });
      const meta = result.count
        ? t("{content} · {count} аракет · мыктысы {best}%", { content, count: result.count, best: result.best })
        : content;
      return row(route("test", track, index), index === "final" ? t("ЖТ") : index, title, meta, result.count ? t("Аткарылды") : "", Boolean(result.count));
    }).join("")}</ol>`;
}

function shuffledIndices(length) {
  const order = Array.from({ length }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

function grade(percent) {
  if (percent >= 85) return 5;
  if (percent >= 70) return 4;
  return percent >= 50 ? 3 : 2;
}

function renderTest(track, index) {
  const questions = questionsFor(track, index);
  const record = work[track];
  const result = attemptsFor(track, index).latest;
  const draft = record.quizDrafts[index];
  const title = index === "final" ? t("Жыйынтыктоочу тест") : courses[track].lessons[Number(index) - 1].title;
  const context = index === "final" ? t("Жыйынтык") : t("{number}-лекциянын тести", { number: index });
  const subtitle = courses[track].title + " · " + context;
  if (result && !draft) {
    return pageHead(title, t("Жоопторду жана түшүндүрмөлөрдү карап чыгыңыз."), subtitle) + `<article class="panel article">
      <h2>${t("Жыйынтык")}</h2><strong class="result-score" tabindex="-1">${result.percent}%</strong>
      <p>${t("{correct} / {count} туура жооп · баа {grade}", { correct: result.correct, count: questions.length, grade: grade(result.percent) })}</p>
      <div class="actions"><button class="button button-primary" type="button" data-action="retry">${t("Кайра тапшыруу")}</button>${link(route("tests", track), t("Тесттер тизмеси"))}</div>
      <h2 style="margin-top:1.4rem">${t("Жоопторду текшерүү")}</h2>
      ${questions.map((question, number) => {
        const selected = [question.answer, ...question.alternatives][result.answers[number]];
        const correct = selected === question.answer;
        return `<section class="review">
          <strong>${number + 1}. ${escape(question.prompt)}</strong>
          <p><span class="status-pill ${correct ? "" : "bad"}">${correct ? t("Туура") : t("Ката")}</span> ${escape(selected)}</p>
          ${correct ? "" : `<p><strong>${t("Туура жооп")}</strong> · ${escape(question.answer)}</p>`}
          <p class="muted explanation">${escape(question.reason)}</p>
        </section>`;
      }).join("")}
    </article>`;
  }
  const answers = draft || {};
  return pageHead(title, t("Ар бир суроого бирден жооп тандаңыз."), subtitle) + `<form class="panel article" id="quiz-form">
    ${questions.map((question, number) => {
      const options = [question.answer, ...question.alternatives];
      return `<fieldset class="question">
        <legend>${number + 1}. ${escape(question.prompt)}</legend>
        ${shuffledIndices(options.length).map(option => `<label class="answer">
          <input type="radio" name="q${number}" value="${option}" required ${answers[number] === option ? "checked" : ""}>
          <span>${escape(options[option])}</span>
        </label>`).join("")}
      </fieldset>`;
    }).join("")}
    <p class="notice" id="quiz-status" role="status"></p>
    <div class="actions">
      <button class="button button-primary" type="submit">${t("Тестти аяктоо")}</button>
      ${link(route("tests", track), t("Тесттер тизмеси"))}
    </div>
  </form>`;
}

const oralPrompts = {
  kg: [
    t("840-жылдагы окуя Эне-Сай кыргыздарынын саясий таасирин кантип өзгөрткөн?"),
    t("Таш жазуу аркылуу доордун турмушу жөнүндө эмнелерди биле алабыз?"),
    t("Эне-Сай кыргыздарынын чарбасы эмне үчүн ар түрдүү болгон?"),
    t("Баласагындын өнүгүшүнө кербен жолдору кандай таасир эткен?"),
    t("Бурана мунарасы тарыхый булак катары эмнени көрсөтөт?"),
    t("Чагатай улусу менен Моголистандын байланышын түшүндүрүңүз."),
    t("Мезгилдүү көч мал чарбасына эмне үчүн керектүү болгон?"),
    t("Санжырадагы маалыматты кантип текшерүүгө болот?")
  ],
  world: [
    t("Волга дарыясы орто кылымдагы соодага кандай шарт түзгөн?"),
    t("Бухаранын Самани мамлекетиндеги ордун түшүндүрүңүз."),
    t("Улус деген эмне? Аны тарыхый мисал менен түшүндүрүңүз."),
    t("Самарканд Тимурийлер мезгилинде эмне үчүн маанилүү болгон?"),
    t("Константинополдун жайгашкан жери соодага кантип таасир эткен?"),
    t("Орто кылымдагы шаардагы цехтин милдети кандай болгон?"),
    t("Кайра жаралуу маданиятында кандай жаңы ыкмалар колдонулган?"),
    t("1492-жылдан кийинки байланыштардын эки башка кесепетин атаңыз.")
  ]
};

function renderExam(track) {
  const prompts = oralPrompts[track];
  return pageHead("Зачёт", t("Курс боюнча өз алдынча даярдануу үчүн үлгү. Тапшырмаларды мугалим менен талкуулап аткарыңыз."), t("7-класс"))
    + trackSwitch("exam", track) + `<article class="panel article">
      <section>
        <h2>${t("1. Жазуу иши · 60 упай")}</h2>
        <p>${t("Төмөнкү суроолордун экөөнү тандаңыз. Ар бир жоопко бирден тарыхый далил же документ кошуңуз.")}</p>
        <ol>${[prompts[0], prompts[3], prompts[6]].map(prompt => `<li>${escape(prompt)}</li>`).join("")}</ol>
      </section>
      <section>
        <h2>${t("2. Булак менен иштөө · 30 упай")}</h2>
        <p>${t("Каалаган лекциядагы булактардын бирин тандаңыз. Авторы же уюму, мезгили жана эмне жөнүндө маалымат берери боюнча үч пункт жазыңыз. Булак жооп бере албаган бир суроо ойлоп табыңыз.")}</p>
        ${link(route("sources"), t("Булактарды ачуу"))}
      </section>
      <section>
        <h2>${t("3. Оозеки жооп · 10 упай")}</h2>
        <p>${t("Тизмеден эки суроо тандаңыз. Ар бирине кыска жооп жана мисал даярдаңыз.")}</p>
        <ol>${prompts.map(prompt => `<li>${escape(prompt)}</li>`).join("")}</ol>
      </section>
    </article>`;
}

function renderSources() {
  return pageHead(t("Булактар"), t("Расмий КТП, тарыхый материалдар жана сүрөттүн булагы.")) + `<article class="panel article">
    <section>
      <h2>${t("Кыргыз билим берүү академиясы")}</h2>
      <ul class="source-list">
        <li>${openSource(t("7-класс үчүн тарых КТПсы (PDF)"), plan.pdf)}</li>
        <li>${openSource(t("КББАнын 7-класс үчүн КТП барагы"), plan.page)}</li>
      </ul>
    </section>
    <section><h2>${t("Лекциялардын булактары")}</h2>${sourceList(Object.keys(sources))}</section>
    <section>
      <h2>${t("Сүрөт")}</h2>
      <p>${t("Бурана мунарасы")} · Bgag · CC0 1.0. ${openSource("Wikimedia Commons", "https://commons.wikimedia.org/wiki/File:Burana_Tower,_Kyrgyzstan_01.jpg")}</p>
    </section>
  </article>`;
}

function renderProgress(track) {
  const data = work[track];
  const course = courses[track];
  const testRows = [...course.lessons.map((unit, index) => [String(index + 1), unit.title]), ["final", t("Жыйынтыктоочу тест")]];
  const done = completion(track);
  return pageHead(t("Менин иштерим"), localStatus()) + trackSwitch("progress", track)
    + `<div class="stack">
      <section class="panel">
        <div class="progress-cover"><strong>${done} / 8</strong><span class="muted">${t("аткарылган иш")}</span></div>
        <progress value="${done}" max="8" aria-label="${t("Тандалган багыттын прогресси")}"></progress>
        <p class="small-note">${t("Тест бир жолу аякталганда, практика отчёт сакталганда эсептелет.")}</p>
      </section>
      <section aria-label="${t("Тесттер")}"><div class="section-bar"><h2>${t("Тесттер")}</h2></div>
        <ul class="row-list">${testRows.map(([index, title]) => {
          const attempt = attemptsFor(track, index);
          const meta = attempt.count ? t("Мыктысы {best}%", { best: attempt.best }) : t("Аткарыла элек");
          return row(route("test", track, index), index === "final" ? t("ЖТ") : index, title, meta, attempt.count ? t("Аткарылды") : "", Boolean(attempt.count));
        }).join("")}</ul>
      </section>
      <section aria-label="${t("Практика")}"><div class="section-bar"><h2>${t("Практика")}</h2></div>
        <ul class="row-list">${course.practices.map((task, index) => {
          const number = index + 1;
          const saved = data.reports[number];
          return row(route("report", track, number), number, task.title, saved ? t("Отчётту ачуу жана жүктөө") : t("Аткарыла элек"), saved ? t("Сакталды") : "", Boolean(saved));
        }).join("")}</ul>
      </section>
    </div>`;
}

const renderers = {
  home: renderHome, plans: renderPlans, lectures: renderLectures, lesson: renderLesson,
  practice: renderPractice, report: renderReport, tests: renderTests, test: renderTest,
  exam: renderExam, sources: renderSources, progress: renderProgress,
  account: () => window.CourseJournal?.renderAccount() || pageHead(t("Аккаунт"), ""),
  admin: () => window.CourseJournal?.renderAdmin() || pageHead(t("Мугалим журналы"), "")
};

function render({ moveFocus = false } = {}) {
  const { section, track, index } = getRoute();
  const active = parentSections[section] || section;
  for (const tab of document.querySelectorAll("[data-section]")) {
    const name = tab.dataset.section;
    tab.href = route(name, ["home", "plans", "sources"].includes(name) ? undefined : track);
    if (active === name) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  document.querySelector("#progress-link").href = route("progress", track);
  updateLanguageLinks();
  app.innerHTML = renderers[section](track, index);
  setNavOpen(false);
  syncToTop();
  const heading = app.querySelector("h1");
  document.title = section === "home" ? t("zhyldtaryh · Тарых курсу") : heading.textContent.trim() + " · zhyldtaryh";
  if (moveFocus) {
    window.scrollTo(0, 0);
    heading.focus({ preventScroll: true });
  }
}

function reportAnswers(form, track, index) {
  const task = courses[track].practices[Number(index) - 1];
  return task.prompts.map((_, number) => form.elements.namedItem("p" + number).value);
}

function downloadReport(track, index) {
  const saved = work[track].reports[index];
  if (!saved) return;
  const course = courses[track];
  const task = course.practices[Number(index) - 1];
  const content = [
    ["zhyldtaryh", t("7-класс"), course.title].join(" · "),
    t("{number}-практика", { number: index }) + ". " + task.title,
    ...task.prompts.map(([title], number) => (number + 1) + ". " + title + "\n" + saved.answers[number])
  ].join("\n\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", content], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "zhyldtaryh-7-" + track + "-practice-" + index + ".txt";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

app.addEventListener("input", event => {
  const { track, index } = getRoute();
  if (event.target.form?.id === "report-form") {
    work[track].reportDrafts[index] = reportAnswers(event.target.form, track, index);
    const saved = save();
    const status = document.querySelector("#report-status");
    status.classList.toggle("error", !saved);
    status.textContent = saved ? t("Каралама сакталууда. Бүткөндө отчётту сактаңыз.") : t("Каралама браузерде сакталган жок.");
  }
});

app.addEventListener("change", event => {
  const { track, index } = getRoute();
  if (event.target.form?.id !== "quiz-form") return;
  const drafts = work[track].quizDrafts;
  drafts[index] ||= {};
  drafts[index][Number(event.target.name.slice(1))] = Number(event.target.value);
  save();
});

app.addEventListener("submit", async event => {
  event.preventDefault();
  const { track, index } = getRoute();
  const form = event.target;
  if (form.id === "quiz-form") {
    const questions = questionsFor(track, index);
    const data = new FormData(form);
    const selected = questions.map((_, number) => data.get("q" + number));
    if (selected.some((value, number) => value === null || !/^[0-3]$/.test(value) || Number(value) > questions[number].alternatives.length)) {
      announce(t("Ар бир суроого бирден жооп тандаңыз."));
      return;
    }
    const answers = selected.map(Number);
    const correct = answers.filter(value => value === 0).length;
    const percent = Math.round(100 * correct / questions.length);
    if (window.CourseJournal?.isStudent()) {
      const submit = form.querySelector("[type=submit]");
      const status = form.querySelector("#quiz-status");
      if (submit.disabled) return;
      submit.disabled = true;
      status.textContent = t("Жыйынтык журналга жазылууда…");
      try {
        if (!await window.CourseJournal.submit("test", track, index, answers)) return;
      } catch (error) {
        status.classList.add("error");
        status.textContent = error.message;
        submit.disabled = false;
        return;
      }
    }
    const previous = attemptsFor(track, index);
    work[track].attempts[index] = { count: previous.count + 1, best: Math.max(previous.best, percent), latest: { correct, percent, answers } };
    delete work[track].quizDrafts[index];
    const saved = save();
    const current = getRoute();
    if (current.section === "test" && current.track === track && current.index === index) render({ moveFocus: true });
    const message = t("Тесттин жыйынтыгы {percent}%.", { percent });
    announce(saved ? message : message + " " + t("Жыйынтык браузерге сакталган жок."));
  }
  if (form.id === "report-form") {
    const values = reportAnswers(form, track, index).map(value => value.trim());
    const status = document.querySelector("#report-status");
    const blank = values.findIndex(value => !value);
    if (blank !== -1) {
      status.classList.add("error");
      status.textContent = t("Бардык тапшырмаларга жооп жазыңыз.");
      form.elements.namedItem("p" + blank).focus();
      return;
    }
    const previous = work[track].reports[index];
    if (!previous?.submitted || JSON.stringify(previous.answers) !== JSON.stringify(values)) {
      work[track].reports[index] = { answers: values, date: new Date().toISOString() };
    }
    work[track].reportDrafts[index] = values;
    const saved = save();
    status.classList.toggle("error", !saved);
    status.textContent = saved ? t("Отчёт сакталды. Файлды жүктөп алсаңыз болот.") : t("Браузерде сактоо жеткиликсиз. Отчётту азыр файл катары жүктөп алыңыз.");
    form.querySelector("[data-action=download]").disabled = false;
  }
});

app.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { track, index } = getRoute();
  if (button.dataset.action === "retry") {
    work[track].quizDrafts[index] = {};
    save();
    render({ moveFocus: true });
  }
  if (button.dataset.action === "read") {
    work[track].read[index] = true;
    const saved = save();
    button.disabled = true;
    button.textContent = t("Окулду");
    if (!saved) document.querySelector("#lesson-message").textContent = t("Белги ушул сеанс бүткөнгө чейин көрүнөт.");
  }
  if (button.dataset.action === "download") downloadReport(track, index);
  if (button.dataset.action === "send-report" && window.CourseJournal?.isStudent()) {
    const form = button.form;
    const status = form.querySelector("#report-status");
    const values = reportAnswers(form, track, index).map(value => value.trim());
    if (!form.reportValidity() || values.some(value => !value)) {
      status.classList.add("error");
      status.textContent = t("Бардык тапшырмаларга жооп жазыңыз.");
      return;
    }
    const last = work[track].reports[index];
    if (last?.submitted && JSON.stringify(last.answers) === JSON.stringify(values)) {
      status.classList.remove("error");
      status.textContent = t("Бул нуска мугалимге тапшырылган.");
      return;
    }
    button.disabled = true;
    status.classList.remove("error");
    status.textContent = t("Отчёт жөнөтүлүүдө…");
    try {
      const result = await window.CourseJournal.submit("report", track, index, values);
      if (!result) return;
      work[track].reports[index] = { answers: values, date: result.date, submitted: true };
      save();
      form.querySelector("[data-action=download]").disabled = false;
      status.textContent = t("Отчёт мугалимге тапшырылды.");
    } catch (error) {
      status.classList.add("error");
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }
});

document.querySelector("#skip-link").addEventListener("click", event => {
  event.preventDefault();
  main.focus();
});
navToggle?.addEventListener("click", () => {
  setNavOpen(navToggle.getAttribute("aria-expanded") !== "true");
});
navLine?.addEventListener("click", event => {
  if (event.target.closest("a")) setNavOpen(false);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") setNavOpen(false);
});
window.addEventListener("scroll", syncToTop, { passive: true });
toTop?.addEventListener("click", event => {
  const hash = location.hash;
  if (hash && hash !== "#" && hash !== "#home") return;
  event.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
});
window.addEventListener("hashchange", () => render({ moveFocus: true }));
render();
