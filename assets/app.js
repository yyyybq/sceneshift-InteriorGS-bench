const state = {
  dashboard: null,
  questionIndex: [],
  currentPage: 1,
  pageSize: 20,
  currentChunk: null,
};

const els = {
  summaryCards: document.getElementById("summaryCards"),
  patternBars: document.getElementById("patternBars"),
  typeBars: document.getElementById("typeBars"),
  yesNoBars: document.getElementById("yesNoBars"),
  labelBars: document.getElementById("labelBars"),
  sceneTableBody: document.getElementById("sceneTableBody"),
  searchInput: document.getElementById("searchInput"),
  sceneFilter: document.getElementById("sceneFilter"),
  patternFilter: document.getElementById("patternFilter"),
  typeFilter: document.getElementById("typeFilter"),
  answerKindFilter: document.getElementById("answerKindFilter"),
  resultsMeta: document.getElementById("resultsMeta"),
  pageMeta: document.getElementById("pageMeta"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  questionList: document.getElementById("questionList"),
  chunkSelector: document.getElementById("chunkSelector"),
  loadChunkBtn: document.getElementById("loadChunkBtn"),
  chunkMeta: document.getElementById("chunkMeta"),
  chunkQuestions: document.getElementById("chunkQuestions"),
  jsonDialog: document.getElementById("jsonDialog"),
  jsonOutput: document.getElementById("jsonOutput"),
  closeDialogBtn: document.getElementById("closeDialogBtn"),
};

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

function numberFormat(value) {
  return new Intl.NumberFormat().format(value ?? 0);
}

function createBarRows(container, entries, color = null) {
  const maxValue = Math.max(...entries.map((entry) => entry.value), 1);
  container.innerHTML = entries.map((entry) => `
    <div class="bar-row">
      <div class="bar-row-head"><span>${entry.label}</span><strong>${numberFormat(entry.value)}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${(entry.value / maxValue) * 100}%;${color ? `background:${color};` : ""}"></div></div>
    </div>
  `).join("");
}

function createTokens(items) {
  return `<div class="token-list">${items.map((item) => `<span class="token">${item}</span>`).join("")}</div>`;
}

function renderSummary() {
  const dashboard = state.dashboard;
  const summary = dashboard.generation_summary;
  const stats = [
    ["Questions", summary.total_questions],
    ["Processed Scenes", summary.scenes_processed],
    ["Patterns", summary.patterns.length],
    ["Question Types", summary.question_types.length],
    ["Max Objects / Scene", summary.max_objects_per_scene],
    ["Build Minutes", summary.elapsed_minutes],
  ];
  els.summaryCards.innerHTML = stats.map(([label, value]) => `
    <article class="stat-card">
      <span class="label">${label}</span>
      <span class="value">${numberFormat(value)}</span>
    </article>
  `).join("");

  createBarRows(
    els.patternBars,
    Object.entries(dashboard.pattern_counts).map(([label, value]) => ({ label, value }))
  );

  createBarRows(
    els.typeBars,
    Object.entries(dashboard.question_type_counts).map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
  );

  createBarRows(
    els.yesNoBars,
    Object.entries(dashboard.yes_no_counts).map(([label, counts]) => ({
      label: `${label} (${counts.Yes || 0}Y / ${counts.No || 0}N)`,
      value: counts.Yes || 0,
    })),
    "linear-gradient(90deg, #0f766e, #63d0c6)"
  );

  createBarRows(
    els.labelBars,
    dashboard.top_object_labels.slice(0, 15).map(({ label, count }) => ({ label, value: count })),
    "linear-gradient(90deg, #1d4ed8, #7fa8ff)"
  );
}

function renderSceneTable() {
  els.sceneTableBody.innerHTML = state.dashboard.scene_overview.map((scene) => `
    <tr>
      <td class="mono">${scene.scene_id}</td>
      <td>${numberFormat(scene.total_questions)}</td>
      <td>${createTokens(Object.entries(scene.by_pattern).map(([k, v]) => `${k}: ${v}`))}</td>
      <td>${createTokens(Object.entries(scene.by_type).map(([k, v]) => `${k}: ${v}`))}</td>
    </tr>
  `).join("");
}

function populateFilters() {
  const scenes = [...new Set(state.questionIndex.map((item) => item.scene_id))].sort();
  const patterns = [...new Set(state.questionIndex.map((item) => item.pattern))].sort();
  const types = [...new Set(state.questionIndex.map((item) => item.question_type))].sort();

  const makeOptions = (values) => ["<option value=\"all\">All</option>", ...values.map((value) => `<option value="${value}">${value}</option>`)].join("");
  els.sceneFilter.innerHTML = makeOptions(scenes);
  els.patternFilter.innerHTML = makeOptions(patterns);
  els.typeFilter.innerHTML = makeOptions(types);

  els.chunkSelector.innerHTML = state.dashboard.chunk_manifest
    .sort((a, b) => a.scene_id.localeCompare(b.scene_id) || a.pattern.localeCompare(b.pattern))
    .map((item) => `<option value="${item.chunk_file}">${item.scene_id} / ${item.pattern} (${item.question_count})</option>`)
    .join("");
}

function getAnswerKind(item) {
  if (item.question_type === "mc") return "mc";
  if (["relative_size", "relative_distance", "relative_distance_to_camera"].includes(item.question_type)) return "yesno";
  return "numeric";
}

function getFilteredQuestions() {
  const query = els.searchInput.value.trim().toLowerCase();
  const scene = els.sceneFilter.value;
  const pattern = els.patternFilter.value;
  const type = els.typeFilter.value;
  const answerKind = els.answerKindFilter.value;

  return state.questionIndex.filter((item) => {
    if (scene !== "all" && item.scene_id !== scene) return false;
    if (pattern !== "all" && item.pattern !== pattern) return false;
    if (type !== "all" && item.question_type !== type) return false;
    if (answerKind !== "all" && getAnswerKind(item) !== answerKind) return false;
    if (!query) return true;

    const haystack = [
      item.id,
      item.question,
      item.answer,
      item.scene_id,
      item.pattern,
      item.question_type,
      ...(item.object_labels || []),
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function renderQuestionCard(item, showChunkButton = true) {
  return `
    <article class="question-card">
      <div class="question-head">
        <div>
          <h3 class="question-title">${item.question}</h3>
          <div class="question-meta">
            <span class="token mono">${item.id}</span>
            <span class="token">${item.scene_id}</span>
            <span class="token">${item.pattern}</span>
            <span class="token">${item.question_type}</span>
          </div>
        </div>
        ${showChunkButton ? `<button data-open-json="${item.id}" data-chunk="${item.chunk_file}">Open JSON</button>` : ""}
      </div>
      <div>${createTokens((item.object_labels || []).map((label) => `obj: ${label}`))}</div>
      <div class="answer-box">
        <strong>Answer:</strong> <span class="mono">${item.answer}</span>
        ${item.answer_value !== undefined && item.answer_value !== null ? `<span> | answer_value: <span class="mono">${item.answer_value}</span></span>` : ""}
        ${item.mc_source_type ? `<span> | mc_source_type: <span class="mono">${item.mc_source_type}</span></span>` : ""}
      </div>
      ${item.choices ? `<div class="answer-box"><strong>Choices:</strong> <span class="mono">${JSON.stringify(item.choices)}</span></div>` : ""}
    </article>
  `;
}

function renderQuestionExplorer() {
  const filtered = getFilteredQuestions();
  const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.currentPage = Math.min(state.currentPage, pageCount);
  const start = (state.currentPage - 1) * state.pageSize;
  const pageItems = filtered.slice(start, start + state.pageSize);

  els.resultsMeta.textContent = `${numberFormat(filtered.length)} matching questions from ${numberFormat(state.questionIndex.length)} indexed records`;
  els.pageMeta.textContent = `Page ${state.currentPage} / ${pageCount}`;
  els.prevPageBtn.disabled = state.currentPage <= 1;
  els.nextPageBtn.disabled = state.currentPage >= pageCount;
  els.questionList.innerHTML = pageItems.map((item) => renderQuestionCard(item)).join("");
}

async function openQuestionJson(questionId, chunkFile) {
  const payload = await fetchJson(`./data/chunks/${chunkFile}`);
  const record = payload.questions.find((item) => item.question_id === questionId);
  els.jsonOutput.textContent = JSON.stringify(record ?? { error: "Question not found" }, null, 2);
  els.jsonDialog.showModal();
}

async function loadChunk(chunkFile) {
  const payload = await fetchJson(`./data/chunks/${chunkFile}`);
  state.currentChunk = payload;
  const metadata = payload.metadata || {};
  els.chunkMeta.innerHTML = `
    <div class="token-list">
      <span class="token mono">${payload.scene_id}</span>
      <span class="token">${payload.pattern}</span>
      <span class="token">questions: ${numberFormat(payload.questions.length)}</span>
      <span class="token">focus objects: ${(metadata.focus_objects || []).join(", ") || "n/a"}</span>
    </div>
  `;
  els.chunkQuestions.innerHTML = payload.questions.map((question) => renderQuestionCard({
    id: question.question_id,
    scene_id: payload.scene_id,
    pattern: payload.pattern,
    question_type: question.question_type,
    question: question.question,
    answer: question.answer,
    answer_value: question.answer_value,
    object_labels: (question.objects || []).map((obj) => obj.label),
    choices: question.choices,
    mc_source_type: question.mc_source_type,
    chunk_file: chunkFile,
  })).join("");
}

function attachEvents() {
  [els.searchInput, els.sceneFilter, els.patternFilter, els.typeFilter, els.answerKindFilter].forEach((element) => {
    element.addEventListener("input", () => {
      state.currentPage = 1;
      renderQuestionExplorer();
    });
    element.addEventListener("change", () => {
      state.currentPage = 1;
      renderQuestionExplorer();
    });
  });

  els.prevPageBtn.addEventListener("click", () => {
    state.currentPage = Math.max(1, state.currentPage - 1);
    renderQuestionExplorer();
  });

  els.nextPageBtn.addEventListener("click", () => {
    state.currentPage += 1;
    renderQuestionExplorer();
  });

  els.questionList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-json]");
    if (!button) return;
    openQuestionJson(button.dataset.openJson, button.dataset.chunk);
  });

  els.chunkQuestions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-json]");
    if (!button) return;
    openQuestionJson(button.dataset.openJson, button.dataset.chunk);
  });

  els.loadChunkBtn.addEventListener("click", () => loadChunk(els.chunkSelector.value));
  els.closeDialogBtn.addEventListener("click", () => els.jsonDialog.close());
}

async function init() {
  const [dashboard, manifest] = await Promise.all([
    fetchJson("./data/dashboard.json"),
    fetchJson("./data/question_index_manifest.json"),
  ]);
  state.dashboard = dashboard;
  // Load split question index parts
  const parts = await Promise.all(manifest.map((m) => fetchJson(`./data/${m.file}`)));
  state.questionIndex = parts.flat();

  renderSummary();
  renderSceneTable();
  populateFilters();
  renderQuestionExplorer();
  attachEvents();
  if (els.chunkSelector.value) {
    loadChunk(els.chunkSelector.value);
  }
}

init().catch((error) => {
  document.body.innerHTML = `<pre style="padding:24px;font-family:monospace">${error.stack}</pre>`;
});