/**
 * TaskMaster — Full-Stack Task Management System
 * Vanilla JavaScript interacting with Express.js REST API & MySQL Drizzle ORM
 */

// Application State
const state = {
  tasks: [],
  currentFilter: "all",
  searchQuery: "",
  selectedTask: null,
  taskToDelete: null,
  isEditing: false,
};

// DOM References
const elements = {
  // Navigation & Date
  currentDateDisplay: document.getElementById("currentDateDisplay"),
  btnOpenAddModal: document.getElementById("btnOpenAddModal"),

  // Statistics Counters
  statTotalCount: document.getElementById("statTotalCount"),
  statPendingCount: document.getElementById("statPendingCount"),
  statCompletedCount: document.getElementById("statCompletedCount"),

  // Toolbar & Filters
  badgeVisibleCount: document.getElementById("badgeVisibleCount"),
  badgeFilterAll: document.getElementById("badgeFilterAll"),
  badgeFilterPending: document.getElementById("badgeFilterPending"),
  badgeFilterCompleted: document.getElementById("badgeFilterCompleted"),
  filterButtons: document.querySelectorAll(".filter-tab-btn"),
  searchInput: document.getElementById("searchInput"),
  btnClearSearch: document.getElementById("btnClearSearch"),
  btnRefreshTasks: document.getElementById("btnRefreshTasks"),
  refreshIcon: document.getElementById("refreshIcon"),

  // Containers & Feedback
  tasksCardGrid: document.getElementById("tasksCardGrid"),
  loadingIndicator: document.getElementById("loadingIndicator"),
  errorState: document.getElementById("errorState"),
  errorMessageText: document.getElementById("errorMessageText"),
  btnRetryLoad: document.getElementById("btnRetryLoad"),
  emptyState: document.getElementById("emptyState"),
  emptyStateHeading: document.getElementById("emptyStateHeading"),
  emptyStateMessage: document.getElementById("emptyStateMessage"),
  btnEmptyStateAdd: document.getElementById("btnEmptyStateAdd"),
  globalNotificationArea: document.getElementById("globalNotificationArea"),

  // Modal 1: Task Details Modal
  taskDetailsModalEl: document.getElementById("taskDetailsModal"),
  detailsTaskTitle: document.getElementById("detailsTaskTitle"),
  detailsTaskStatusBadge: document.getElementById("detailsTaskStatusBadge"),
  detailsTaskId: document.getElementById("detailsTaskId"),
  detailsStatusContainer: document.getElementById("detailsStatusContainer"),
  detailsCreatedDate: document.getElementById("detailsCreatedDate"),
  detailsUpdatedDate: document.getElementById("detailsUpdatedDate"),
  detailsDeadlineDate: document.getElementById("detailsDeadlineDate"),
  detailsDescriptionBox: document.getElementById("detailsDescriptionBox"),
  btnDetailsEdit: document.getElementById("btnDetailsEdit"),
  btnDetailsToggleStatus: document.getElementById("btnDetailsToggleStatus"),
  detailsToggleIcon: document.getElementById("detailsToggleIcon"),
  detailsToggleText: document.getElementById("detailsToggleText"),
  btnDetailsDelete: document.getElementById("btnDetailsDelete"),

  // Modal 2: Add / Edit Modal
  taskModalEl: document.getElementById("taskModal"),
  taskForm: document.getElementById("taskForm"),
  taskIdInput: document.getElementById("taskIdInput"),
  taskTitleInput: document.getElementById("taskTitleInput"),
  titleCharCount: document.getElementById("titleCharCount"),
  taskDescInput: document.getElementById("taskDescInput"),
  taskDeadlineInput: document.getElementById("taskDeadlineInput"),
  taskStatusSelect: document.getElementById("taskStatusSelect"),
  taskModalTitleText: document.getElementById("taskModalTitleText"),
  taskModalIcon: document.getElementById("taskModalIcon"),
  btnSaveTask: document.getElementById("btnSaveTask"),
  saveSpinner: document.getElementById("saveSpinner"),
  saveBtnText: document.getElementById("saveBtnText"),
  modalAlertArea: document.getElementById("modalAlertArea"),

  // Modal 3: Delete Confirmation Modal
  deleteConfirmModalEl: document.getElementById("deleteConfirmModal"),
  deleteTaskTitleDisplay: document.getElementById("deleteTaskTitleDisplay"),
  btnConfirmDelete: document.getElementById("btnConfirmDelete"),
  deleteSpinner: document.getElementById("deleteSpinner"),
  deleteBtnText: document.getElementById("deleteBtnText"),

  // SMS Provider Navbar Status
  smsStatusBadge: document.getElementById("smsStatusBadge"),
  smsStatusDot: document.getElementById("smsStatusDot"),
  smsStatusText: document.getElementById("smsStatusText"),

  // Details Modal: SMS Reminder & History
  detailsReminderBadge: document.getElementById("detailsReminderBadge"),
  reminderModeBanner: document.getElementById("reminderModeBanner"),
  btnToggleReminderSettings: document.getElementById("btnToggleReminderSettings"),
  btnSendTestSms: document.getElementById("btnSendTestSms"),
  testSmsSpinner: document.getElementById("testSmsSpinner"),
  testSmsIcon: document.getElementById("testSmsIcon"),
  testSmsText: document.getElementById("testSmsText"),
  detailsReminderSummary: document.getElementById("detailsReminderSummary"),
  detailsReminderPhone: document.getElementById("detailsReminderPhone"),
  detailsReminderTime: document.getElementById("detailsReminderTime"),
  detailsReminderTimezone: document.getElementById("detailsReminderTimezone"),
  detailsReminderConsent: document.getElementById("detailsReminderConsent"),
  inlineReminderForm: document.getElementById("inlineReminderForm"),
  inlineReminderEnabled: document.getElementById("inlineReminderEnabled"),
  inlineReminderPhone: document.getElementById("inlineReminderPhone"),
  inlineReminderTime: document.getElementById("inlineReminderTime"),
  inlineReminderTimezone: document.getElementById("inlineReminderTimezone"),
  inlineReminderConsent: document.getElementById("inlineReminderConsent"),
  btnCancelInlineReminder: document.getElementById("btnCancelInlineReminder"),
  btnRefreshReminderHistory: document.getElementById("btnRefreshReminderHistory"),
  reminderHistoryContainer: document.getElementById("reminderHistoryContainer"),
  reminderHistoryEmpty: document.getElementById("reminderHistoryEmpty"),
  reminderHistoryTable: document.getElementById("reminderHistoryTable"),
  reminderHistoryBody: document.getElementById("reminderHistoryBody"),

  // Add/Edit Task Modal: SMS Reminder
  taskReminderEnabled: document.getElementById("taskReminderEnabled"),
  taskReminderFields: document.getElementById("taskReminderFields"),
  taskReminderPhone: document.getElementById("taskReminderPhone"),
  taskReminderTime: document.getElementById("taskReminderTime"),
  taskReminderTimezone: document.getElementById("taskReminderTimezone"),
  taskReminderConsent: document.getElementById("taskReminderConsent"),

  // Floating Toast
  liveToastEl: document.getElementById("liveToast"),
  toastIcon: document.getElementById("toastIcon"),
  toastText: document.getElementById("toastText"),
};

// Bootstrap Instances with Safe Fallbacks
let taskDetailsModalInstance = null;
let taskModalInstance = null;
let deleteModalInstance = null;
let toastInstance = null;

function initBootstrapComponents() {
  try {
    if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
      taskDetailsModalInstance = new bootstrap.Modal(elements.taskDetailsModalEl);
      taskModalInstance = new bootstrap.Modal(elements.taskModalEl);
      deleteModalInstance = new bootstrap.Modal(elements.deleteConfirmModalEl);
      toastInstance = new bootstrap.Toast(elements.liveToastEl, { delay: 4000 });
    }
  } catch (e) {
    console.warn("Bootstrap components running in fallback mode:", e);
  }
}

function showModal(modalEl, instance) {
  if (instance) {
    instance.show();
  } else if (modalEl) {
    modalEl.classList.add("show");
    modalEl.style.display = "block";
    document.body.classList.add("modal-open");
  }
}

function hideModal(modalEl, instance) {
  if (instance) {
    instance.hide();
  } else if (modalEl) {
    modalEl.classList.remove("show");
    modalEl.style.display = "none";
    document.body.classList.remove("modal-open");
  }
}

// Application Initialization
document.addEventListener("DOMContentLoaded", () => {
  initBootstrapComponents();
  displayFormattedDate();
  checkSmsHealth();
  initEventListeners();

  fetchTasks().then(() => {
    // Check for modal test query params
    const params = new URLSearchParams(window.location.search);
    if (params.get("modal") === "details" && state.tasks.length > 0) {
      openTaskDetailsModal(state.tasks[0].id);
    } else if (params.get("modal") === "add") {
      openCreateModal();
    } else if (params.get("modal") === "delete" && state.tasks.length > 0) {
      openDeleteModal(state.tasks[0].id);
    }
  });
});

/**
 * Render Today's Date
 */
function displayFormattedDate() {
  if (!elements.currentDateDisplay) return;
  const now = new Date();
  const options = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
  elements.currentDateDisplay.textContent = now.toLocaleDateString("en-US", options);
}

/**
 * Event Listeners
 */
function initEventListeners() {
  // Modal Trigger Buttons
  elements.btnOpenAddModal.addEventListener("click", () => openCreateModal());
  elements.btnEmptyStateAdd.addEventListener("click", () => openCreateModal());

  // Form Submission
  elements.taskForm.addEventListener("submit", handleFormSubmit);

  // Character counter for Task Title
  elements.taskTitleInput.addEventListener("input", (e) => {
    const len = e.target.value.length;
    elements.titleCharCount.textContent = `${len} / 255`;
    if (len > 0) {
      elements.taskTitleInput.classList.remove("is-invalid");
    }
  });

  // SMS Reminder Switch in Add/Edit Task Modal
  if (elements.taskReminderEnabled) {
    elements.taskReminderEnabled.addEventListener("change", (e) => {
      if (e.target.checked) {
        elements.taskReminderFields.classList.remove("d-none");
        setTimeout(() => elements.taskReminderPhone.focus(), 150);
      } else {
        elements.taskReminderFields.classList.add("d-none");
      }
    });
  }

  // SMS Reminder Details Modal Handlers
  if (elements.btnToggleReminderSettings) {
    elements.btnToggleReminderSettings.addEventListener("click", () => {
      elements.inlineReminderForm.classList.toggle("d-none");
    });
  }

  if (elements.btnCancelInlineReminder) {
    elements.btnCancelInlineReminder.addEventListener("click", () => {
      elements.inlineReminderForm.classList.add("d-none");
    });
  }

  if (elements.inlineReminderForm) {
    elements.inlineReminderForm.addEventListener("submit", saveInlineReminder);
  }

  if (elements.btnSendTestSms) {
    elements.btnSendTestSms.addEventListener("click", sendTestSms);
  }

  if (elements.btnRefreshReminderHistory) {
    elements.btnRefreshReminderHistory.addEventListener("click", () => {
      if (state.selectedTask) loadTaskReminderHistory(state.selectedTask.id);
    });
  }

  // Delete Confirmation Button
  elements.btnConfirmDelete.addEventListener("click", executeDeleteTask);

  // Status Filter Tabs
  elements.filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      elements.filterButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.currentFilter = btn.dataset.filter;
      renderTasks();
    });
  });

  // Search Input with Debounce & Clear Button Toggle
  let debounceTimer = null;
  elements.searchInput.addEventListener("input", (e) => {
    const val = e.target.value;
    if (val.length > 0) {
      elements.btnClearSearch.classList.remove("d-none");
    } else {
      elements.btnClearSearch.classList.add("d-none");
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.searchQuery = val.trim().toLowerCase();
      renderTasks();
    }, 200);
  });

  // Clear Search
  elements.btnClearSearch.addEventListener("click", () => {
    elements.searchInput.value = "";
    elements.btnClearSearch.classList.add("d-none");
    state.searchQuery = "";
    renderTasks();
  });

  // Refresh Button
  elements.btnRefreshTasks.addEventListener("click", async () => {
    elements.refreshIcon.classList.add("spin-animation");
    await fetchTasks();
    setTimeout(() => {
      elements.refreshIcon.classList.remove("spin-animation");
    }, 500);
  });

  // Retry Connection Button
  elements.btnRetryLoad.addEventListener("click", () => fetchTasks());

  // Task Details Modal Actions
  elements.btnDetailsEdit.addEventListener("click", () => {
    if (!state.selectedTask) return;
    hideModal(elements.taskDetailsModalEl, taskDetailsModalInstance);
    openEditModal(state.selectedTask.id);
  });

  elements.btnDetailsToggleStatus.addEventListener("click", async () => {
    if (!state.selectedTask) return;
    await handleToggleStatus(state.selectedTask.id, state.selectedTask.status);
    // Refresh Details Modal with updated status
    const updated = state.tasks.find((t) => t.id === state.selectedTask.id);
    if (updated) {
      openTaskDetailsModal(updated.id);
    }
  });

  elements.btnDetailsDelete.addEventListener("click", () => {
    if (!state.selectedTask) return;
    const taskToDelete = state.selectedTask;
    hideModal(elements.taskDetailsModalEl, taskDetailsModalInstance);
    openDeleteModal(taskToDelete.id);
  });
}

/**
 * Toast Notification Helper
 */
function showToast(message, type = "success") {
  elements.liveToastEl.classList.remove("bg-success", "bg-danger", "bg-primary", "bg-amber-600");

  if (type === "success") {
    elements.liveToastEl.classList.add("bg-success");
    elements.toastIcon.className = "bi bi-check-circle-fill me-2 fs-6";
  } else if (type === "error") {
    elements.liveToastEl.classList.add("bg-danger");
    elements.toastIcon.className = "bi bi-exclamation-triangle-fill me-2 fs-6";
  } else {
    elements.liveToastEl.classList.add("bg-primary");
    elements.toastIcon.className = "bi bi-info-circle-fill me-2 fs-6";
  }

  elements.toastText.textContent = message;
  if (toastInstance) {
    toastInstance.show();
  }
}

/**
 * In-Modal Alert Helper
 */
function setModalAlert(message, type = "danger") {
  if (!message) {
    elements.modalAlertArea.innerHTML = "";
    return;
  }
  elements.modalAlertArea.innerHTML = `
    <div class="alert alert-${type} py-2 px-3 small d-flex align-items-center gap-2 mb-0 rounded-2" role="alert">
      <i class="bi bi-exclamation-circle-fill"></i>
      <div>${escapeHtml(message)}</div>
    </div>
  `;
}

/**
 * Fetch Tasks from Express REST API
 */
async function fetchTasks() {
  setLoadingState(true);
  setErrorState(false);

  try {
    const res = await fetch("/api/tasks");
    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.message || "Failed to retrieve tasks from MySQL.");
    }

    state.tasks = json.data || [];
    updateSummaryStats();
    renderTasks();
  } catch (error) {
    console.error("Fetch tasks failed:", error);
    setErrorState(true, error.message);
  } finally {
    setLoadingState(false);
  }
}

/**
 * Loading & Error State Toggles
 */
function setLoadingState(isLoading) {
  if (isLoading) {
    elements.loadingIndicator.classList.remove("d-none");
    elements.tasksCardGrid.classList.add("d-none");
    elements.emptyState.classList.add("d-none");
  } else {
    elements.loadingIndicator.classList.add("d-none");
  }
}

function setErrorState(isError, message = "") {
  if (isError) {
    elements.errorState.classList.remove("d-none");
    elements.errorMessageText.textContent = message || "Could not connect to MySQL database.";
    elements.tasksCardGrid.classList.add("d-none");
    elements.emptyState.classList.add("d-none");
  } else {
    elements.errorState.classList.add("d-none");
  }
}

/**
 * Update Dashboard Summary Counters & Filter Badges
 */
function updateSummaryStats() {
  const total = state.tasks.length;
  const pending = state.tasks.filter((t) => t.status === "Pending").length;
  const completed = state.tasks.filter((t) => t.status === "Completed").length;

  elements.statTotalCount.textContent = total;
  elements.statPendingCount.textContent = pending;
  elements.statCompletedCount.textContent = completed;

  elements.badgeFilterAll.textContent = total;
  elements.badgeFilterPending.textContent = pending;
  elements.badgeFilterCompleted.textContent = completed;
}

/**
 * Filter and Search Task Records
 */
function getFilteredTasks() {
  return state.tasks.filter((task) => {
    let matchesStatus = true;
    if (state.currentFilter === "Pending") {
      matchesStatus = task.status === "Pending";
    } else if (state.currentFilter === "Completed") {
      matchesStatus = task.status === "Completed";
    }

    let matchesSearch = true;
    if (state.searchQuery) {
      const q = state.searchQuery;
      const titleMatch = task.title && task.title.toLowerCase().includes(q);
      const descMatch = task.description && task.description.toLowerCase().includes(q);
      matchesSearch = titleMatch || descMatch;
    }

    return matchesStatus && matchesSearch;
  });
}

/**
 * Render Clickable Task Cards Grid (3 per row desktop, 2 tablet, 1 mobile)
 */
function renderTasks() {
  const filtered = getFilteredTasks();
  const count = filtered.length;

  // Update Visible Count Badge
  elements.badgeVisibleCount.textContent = `${count} ${count === 1 ? "task" : "tasks"}`;

  // Handle Empty State
  if (count === 0) {
    elements.tasksCardGrid.classList.add("d-none");
    elements.emptyState.classList.remove("d-none");

    if (state.searchQuery) {
      elements.emptyStateHeading.textContent = "No Matching Tasks Found";
      elements.emptyStateMessage.textContent = `No tasks match your search query "${state.searchQuery}". Try different keywords.`;
    } else if (state.currentFilter === "Pending") {
      elements.emptyStateHeading.textContent = "No Pending Tasks";
      elements.emptyStateMessage.textContent = "All caught up! You have no pending tasks awaiting action.";
    } else if (state.currentFilter === "Completed") {
      elements.emptyStateHeading.textContent = "No Completed Tasks";
      elements.emptyStateMessage.textContent = "No tasks have been completed yet. Mark a pending task as done!";
    } else {
      elements.emptyStateHeading.textContent = "No Tasks Found";
      elements.emptyStateMessage.textContent = "Create your first task to get started.";
    }
    return;
  }

  elements.emptyState.classList.add("d-none");
  elements.tasksCardGrid.classList.remove("d-none");
  elements.tasksCardGrid.innerHTML = "";

  filtered.forEach((task, index) => {
    const cardEl = createTaskCard(task, index);
    elements.tasksCardGrid.appendChild(cardEl);
  });
}

/**
 * Generate Pastel Icon for Task Card based on title/category
 */
function getCategoryIcon(title = "", index = 0) {
  const t = title.toLowerCase();
  if (t.includes("database") || t.includes("sql") || t.includes("mysql") || t.includes("drizzle")) {
    return {
      icon: "bi-database-fill",
      bgClass: "bg-cyan-50 text-cyan-600 border border-cyan-100",
    };
  } else if (t.includes("code") || t.includes("api") || t.includes("express") || t.includes("node") || t.includes("backend") || t.includes("build") || t.includes("system")) {
    return {
      icon: "bi-code-slash",
      bgClass: "bg-indigo-50 text-indigo-600 border border-indigo-100",
    };
  } else if (t.includes("presentation") || t.includes("doc") || t.includes("slide") || t.includes("readme") || t.includes("report")) {
    return {
      icon: "bi-file-earmark-text-fill",
      bgClass: "bg-blue-50 text-blue-600 border border-blue-100",
    };
  } else {
    // Default palette cycling
    const palettes = [
      { icon: "bi-check2-square", bgClass: "bg-blue-50 text-blue-600 border border-blue-100" },
      { icon: "bi-kanban", bgClass: "bg-emerald-50 text-emerald-600 border border-emerald-100" },
      { icon: "bi-list-stars", bgClass: "bg-amber-50 text-amber-600 border border-amber-100" },
    ];
    return palettes[index % palettes.length];
  }
}

/**
 * Create a Clickable Task Card Element
 */
function createTaskCard(task, index) {
  const card = document.createElement("div");
  card.className = "task-card-clickable";
  card.setAttribute("tabindex", "0");
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `View details for ${escapeHtml(task.title)}`);

  // Card click opens Task Details Modal
  card.addEventListener("click", () => {
    openTaskDetailsModal(task.id);
  });

  // Keyboard accessibility: Enter or Space opens details
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openTaskDetailsModal(task.id);
    }
  });

  const isCompleted = task.status === "Completed";
  const statusBadge = isCompleted
    ? `<span class="badge-status-completed"><i class="bi bi-check-circle-fill"></i> Completed</span>`
    : `<span class="badge-status-pending"><i class="bi bi-clock"></i> Pending</span>`;

  const reminderBadge = task.reminderEnabled
    ? `<span class="badge bg-blue-50 text-blue-700 border border-blue-200" title="Daily SMS Reminder: ${task.reminderTime || '09:00'}" style="font-size: 0.725rem; font-weight: 500; border-radius: 9999px; padding: 0.25rem 0.6rem;"><i class="bi bi-bell-fill me-1 text-primary"></i>${task.reminderTime || '09:00'}</span>`
    : "";

  const categoryMeta = getCategoryIcon(task.title, index);
  const formattedDate = formatDate(task.createdAt);
  const formattedDeadline = formatDeadline(task.deadline);

  const deadlineBadge = formattedDeadline
    ? `
      <div class="text-slate-600 small d-flex align-items-center gap-1.5 mb-2" style="font-size: 0.775rem;">
        <i class="bi bi-calendar-check text-rose-500"></i>
        <span>Deadline: <span class="fw-semibold text-rose-600">${formattedDeadline}</span></span>
      </div>
    `
    : "";

  card.innerHTML = `
    <div>
      <!-- Top Row: Category Icon & Actions Dropdown -->
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div class="card-category-icon ${categoryMeta.bgClass}">
          <i class="bi ${categoryMeta.icon}"></i>
        </div>

        <!-- Stop propagation on menu trigger -->
        <div class="dropdown" onclick="event.stopPropagation()">
          <button class="btn btn-sm btn-link text-slate-400 p-1" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Task actions">
            <i class="bi bi-three-dots fs-5"></i>
          </button>
          <ul class="dropdown-menu dropdown-menu-end shadow-sm border border-slate-200 py-1" style="font-size: 0.8125rem;">
            <li>
              <button class="dropdown-item d-flex align-items-center gap-2 py-1.5" onclick="event.stopPropagation(); openTaskDetailsModal(${task.id})">
                <i class="bi bi-eye text-primary"></i>
                <span>View Details</span>
              </button>
            </li>
            <li>
              <button class="dropdown-item d-flex align-items-center gap-2 py-1.5" onclick="event.stopPropagation(); openEditModal(${task.id})">
                <i class="bi bi-pencil text-slate-600"></i>
                <span>Edit Task</span>
              </button>
            </li>
            <li>
              <button class="dropdown-item d-flex align-items-center gap-2 py-1.5" onclick="event.stopPropagation(); handleToggleStatus(${task.id}, '${task.status}')">
                <i class="bi ${isCompleted ? 'bi-arrow-counterclockwise text-secondary' : 'bi-check2 text-success'}"></i>
                <span>${isCompleted ? 'Mark Pending' : 'Mark Completed'}</span>
              </button>
            </li>
            <li><hr class="dropdown-divider my-1"></li>
            <li>
              <button class="dropdown-item d-flex align-items-center gap-2 py-1.5 text-danger" onclick="event.stopPropagation(); openDeleteModal(${task.id})">
                <i class="bi bi-trash3 text-danger"></i>
                <span>Delete Task</span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Task Title -->
      <h3 class="task-card-title text-break" title="${escapeHtml(task.title)}">
        ${escapeHtml(task.title)}
      </h3>

      <!-- Short 2-Line Description -->
      <p class="task-card-desc text-break">
        ${task.description ? escapeHtml(task.description) : '<span class="text-slate-400 fst-italic">No description provided</span>'}
      </p>

      <!-- Status and Reminder Badges -->
      <div class="d-flex align-items-center gap-1.5 mb-2 flex-wrap">
        ${statusBadge}
        ${reminderBadge}
      </div>

      <!-- Created Date -->
      <div class="text-slate-400 small d-flex align-items-center gap-1.5 mb-1" style="font-size: 0.775rem;">
        <i class="bi bi-calendar3"></i>
        <span>Created: ${formattedDate}</span>
      </div>

      <!-- Deadline Date Display -->
      ${deadlineBadge}
    </div>

    <!-- Card Footer: View Details Link -->
    <div class="task-card-footer">
      <span class="view-details-link">
        <span>View Details</span>
        <i class="bi bi-arrow-right"></i>
      </span>
    </div>
  `;

  return card;
}

/**
 * Open Task Details Modal (Requirement 3 & 4)
 */
function openTaskDetailsModal(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  state.selectedTask = task;

  // Title & Status Badge
  elements.detailsTaskTitle.textContent = task.title;
  const isCompleted = task.status === "Completed";

  const badgeHtml = isCompleted
    ? `<span class="badge-status-completed"><i class="bi bi-check-circle-fill"></i> Completed</span>`
    : `<span class="badge-status-pending"><i class="bi bi-clock"></i> Pending</span>`;

  elements.detailsTaskStatusBadge.innerHTML = badgeHtml;
  elements.detailsStatusContainer.innerHTML = badgeHtml;

  // Metadata
  elements.detailsTaskId.textContent = `#${task.id}`;
  elements.detailsCreatedDate.textContent = formatDate(task.createdAt);
  elements.detailsUpdatedDate.textContent = formatDate(task.createdAt);

  // Deadline in Details Modal
  const formattedDeadline = formatDeadline(task.deadline);
  if (formattedDeadline) {
    elements.detailsDeadlineDate.innerHTML = `<span class="fw-semibold text-rose-600 d-inline-flex align-items-center gap-1.5"><i class="bi bi-calendar-check-fill text-rose-500"></i> ${formattedDeadline}</span>`;
  } else {
    elements.detailsDeadlineDate.innerHTML = `<span class="badge bg-slate-100 text-slate-500 border border-slate-200">Not Set</span>`;
  }

  elements.detailsDescriptionBox.textContent = task.description || "No detailed description provided for this task.";

  // Status Toggle Button in Details Modal
  if (isCompleted) {
    elements.detailsToggleIcon.className = "bi bi-arrow-counterclockwise";
    elements.detailsToggleText.textContent = "Mark Pending";
    elements.btnDetailsToggleStatus.className = "btn btn-outline-secondary btn-sm px-3 fw-medium d-flex align-items-center gap-1.5";
  } else {
    elements.detailsToggleIcon.className = "bi bi-check2";
    elements.detailsToggleText.textContent = "Mark Completed";
    elements.btnDetailsToggleStatus.className = "btn btn-outline-success btn-sm px-3 fw-medium d-flex align-items-center gap-1.5";
  }

  // Reset and Load SMS Reminder settings & history
  if (elements.inlineReminderForm) elements.inlineReminderForm.classList.add("d-none");
  loadTaskReminder(task.id);
  loadTaskReminderHistory(task.id);

  showModal(elements.taskDetailsModalEl, taskDetailsModalInstance);
}

/**
 * Format Date (e.g. Oct 28, 2026, 09:00 PM)
 */
function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    return dateStr;
  }
}

/**
 * Format Deadline Date (e.g. Nov 5, 2026)
 */
function formatDeadline(dateStr) {
  if (!dateStr) return null;
  try {
    const raw = String(dateStr).split("T")[0];
    const parts = raw.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch (e) {
    return dateStr;
  }
}

/**
 * Mask Phone Number for Display
 */
function maskPhoneNumberDisplay(phone) {
  if (!phone || typeof phone !== "string") return "";
  const cleaned = phone.trim();
  if (cleaned.length <= 5) return "***";
  const start = cleaned.slice(0, 3);
  const end = cleaned.slice(-4);
  const maskedLength = Math.max(cleaned.length - 7, 3);
  return `${start}${"*".repeat(maskedLength)}${end}`;
}

/**
 * Check SMS Provider Health Status & Trial Mode Configuration
 */
let cachedSmsConfig = null;

async function checkSmsHealth() {
  if (!elements.smsStatusBadge) return;
  try {
    const res = await fetch("/api/tasks/sms-config");
    const json = await res.json();
    if (res.ok && json.success && json.data) {
      cachedSmsConfig = json.data;
      const sms = json.data;

      if (!sms.configured) {
        elements.smsStatusDot.className = "d-inline-block rounded-circle bg-amber-500";
        elements.smsStatusText.textContent = "SMS Unconfigured";
        elements.smsStatusBadge.title = sms.message;
      } else if (sms.trialMode) {
        if (sms.trialTemplateValid) {
          elements.smsStatusDot.className = "d-inline-block rounded-circle bg-amber-400";
          elements.smsStatusText.textContent = "SMS Trial Template";
          elements.smsStatusBadge.title = `Twilio Trial Mode (${sms.trialTemplate}): Generic predefined template active.`;
        } else {
          elements.smsStatusDot.className = "d-inline-block rounded-circle bg-danger";
          elements.smsStatusText.textContent = "SMS Config Error";
          elements.smsStatusBadge.title = sms.trialTemplateError;
        }
      } else {
        elements.smsStatusDot.className = "d-inline-block rounded-circle bg-success";
        elements.smsStatusText.textContent = "SMS Active (Custom)";
        elements.smsStatusBadge.title = `Twilio Production Active (${sms.fromNumber || "Ready"}): Custom dynamic reminders enabled.`;
      }
    }
  } catch (e) {
    console.warn("Could not check SMS health:", e);
  }
}

/**
 * Load Task Reminder Configuration into Details Modal
 */
async function loadTaskReminder(taskId) {
  try {
    // Refresh SMS provider config if not cached
    if (!cachedSmsConfig) {
      await checkSmsHealth();
    }

    // Render trial mode / config notice banner in modal
    if (elements.reminderModeBanner) {
      if (cachedSmsConfig && cachedSmsConfig.trialMode) {
        if (!cachedSmsConfig.trialTemplateValid) {
          elements.reminderModeBanner.className = "alert alert-danger py-2 px-2.5 mb-2 text-xs rounded-2";
          elements.reminderModeBanner.innerHTML = `
            <div class="d-flex align-items-start gap-1.5">
              <i class="bi bi-exclamation-triangle-fill text-danger mt-0.5"></i>
              <div>
                <strong class="d-block mb-0.5">Twilio Trial Template Error:</strong>
                <span>${escapeHtml(cachedSmsConfig.trialTemplateError)}</span>
                <div class="mt-1 text-slate-700">Supported templates: <code>${escapeHtml(cachedSmsConfig.supportedTrialTemplates?.join(", ") || "")}</code></div>
              </div>
            </div>
          `;
        } else {
          elements.reminderModeBanner.className = "alert alert-warning py-2 px-2.5 mb-2 text-xs rounded-2 border border-amber-300";
          elements.reminderModeBanner.innerHTML = `
            <div class="d-flex align-items-start gap-1.5">
              <i class="bi bi-info-circle-fill text-amber-700 mt-0.5"></i>
              <div>
                <div class="d-flex align-items-center gap-1.5 mb-0.5">
                  <strong class="text-amber-900">Twilio Trial Mode Active:</strong>
                  <span class="badge bg-amber-100 text-amber-900 border border-amber-300 font-monospace">${escapeHtml(cachedSmsConfig.trialTemplate)}</span>
                </div>
                <div class="text-amber-800" style="line-height: 1.35;">
                  Twilio trial accounts can only dispatch official predefined templates. Generic template <code>${escapeHtml(cachedSmsConfig.trialTemplate)}</code> will be sent without custom task titles or personalized text. To send custom task reminders, upgrade your Twilio account.
                </div>
              </div>
            </div>
          `;
        }
      } else {
        elements.reminderModeBanner.className = "d-none";
        elements.reminderModeBanner.innerHTML = "";
      }
    }

    const res = await fetch(`/api/tasks/${taskId}/reminder`);
    const json = await res.json();
    if (res.ok && json.success && json.data) {
      const r = json.data;

      if (r.enabled) {
        elements.detailsReminderBadge.className = "badge bg-emerald-100 text-emerald-800 border border-emerald-200";
        elements.detailsReminderBadge.innerHTML = '<i class="bi bi-check-circle-fill me-1 text-emerald-600"></i>Enabled';
      } else {
        elements.detailsReminderBadge.className = "badge bg-slate-100 text-slate-500 border border-slate-200";
        elements.detailsReminderBadge.textContent = "Disabled";
      }

      elements.detailsReminderPhone.textContent = r.phoneNumberMasked || (r.phoneNumber ? maskPhoneNumberDisplay(r.phoneNumber) : "Not Set");
      elements.detailsReminderTime.textContent = r.reminderTime ? `${r.reminderTime} (24h)` : "09:00";
      elements.detailsReminderTimezone.textContent = r.timezone || "Asia/Kolkata";
      
      if (elements.detailsReminderConsent) {
        elements.detailsReminderConsent.className = r.consentGiven
          ? "badge bg-emerald-50 text-emerald-700 border border-emerald-200 ms-1"
          : "badge bg-slate-100 text-slate-500 border border-slate-200 ms-1";
        elements.detailsReminderConsent.textContent = r.consentGiven ? "Verified Consent" : "Not Provided";
      }

      // Pre-fill inline edit form
      if (elements.inlineReminderEnabled) {
        elements.inlineReminderEnabled.checked = Boolean(r.enabled);
        elements.inlineReminderPhone.value = r.phoneNumber || "";
        elements.inlineReminderTime.value = r.reminderTime || "09:00";
        elements.inlineReminderTimezone.value = r.timezone || "Asia/Kolkata";
        elements.inlineReminderConsent.checked = Boolean(r.consentGiven);
      }
    }
  } catch (err) {
    console.error("Failed to load task reminder settings:", err);
  }
}

/**
 * Load Task Reminder History into Details Modal
 */
async function loadTaskReminderHistory(taskId) {
  if (!elements.reminderHistoryContainer) return;
  try {
    const res = await fetch(`/api/tasks/${taskId}/reminder-history`);
    const json = await res.json();
    if (res.ok && json.success) {
      const logs = json.data || [];
      if (logs.length === 0) {
        elements.reminderHistoryEmpty.classList.remove("d-none");
        elements.reminderHistoryTable.classList.add("d-none");
        elements.reminderHistoryBody.innerHTML = "";
      } else {
        elements.reminderHistoryEmpty.classList.add("d-none");
        elements.reminderHistoryTable.classList.remove("d-none");

        elements.reminderHistoryBody.innerHTML = logs
          .map((log) => {
            let badgeClass = "badge-sms-unknown";
            if (log.status === "accepted") badgeClass = "badge-sms-accepted";
            else if (log.status === "delivered") badgeClass = "badge-sms-delivered";
            else if (log.status === "failed") badgeClass = "badge-sms-failed";
            else if (log.status === "processing") badgeClass = "badge-sms-processing";

            const typeBadge = log.isTest
              ? '<span class="badge bg-indigo-50 text-indigo-700 border border-indigo-200" style="font-size: 0.675rem;">Test</span>'
              : '<span class="badge bg-slate-100 text-slate-600 border border-slate-200" style="font-size: 0.675rem;">Daily</span>';

            const formattedAttempt = formatDate(log.attemptedAt || log.createdAt);
            let detailNote = '<span class="text-slate-400">—</span>';
            if (log.errorMessage) {
              const isTrialTemplateError =
                log.errorMessage.includes("572006") ||
                log.errorMessage.toLowerCase().includes("predefined sms templates");

              detailNote = `
                <div class="small" style="line-height: 1.4; word-break: break-word;">
                  ${
                    isTrialTemplateError
                      ? `<div class="d-flex align-items-center gap-1 text-amber-700 fw-semibold mb-1">
                          <i class="bi bi-exclamation-triangle-fill"></i>
                          <span>Twilio Trial Restriction (Error 572006)</span>
                        </div>`
                      : ""
                  }
                  <span class="text-danger fw-medium">${escapeHtml(log.errorMessage)}</span>
                  ${
                    isTrialTemplateError
                      ? `<div class="text-slate-500 text-xs mt-1 border-top border-slate-200 pt-1 fst-italic">
                          Trial accounts cannot send custom SMS reminder text. Upgrade account to paid status or use an approved template.
                        </div>`
                      : ""
                  }
                </div>
              `;
            } else if (log.providerMessageId) {
              detailNote = `<code class="text-slate-700 text-xs">${escapeHtml(log.providerMessageId)}</code>`;
            }

            return `
              <tr>
                <td style="white-space: nowrap;"><span class="text-slate-700 fw-medium">${formattedAttempt}</span></td>
                <td>${typeBadge}</td>
                <td><span class="${badgeClass}">${escapeHtml(log.status)}</span></td>
                <td style="white-space: nowrap;"><span class="text-slate-600">${escapeHtml(log.recipientPhoneMasked || "—")}</span></td>
                <td>${detailNote}</td>
              </tr>
            `;
          })
          .join("");
      }
    }
  } catch (err) {
    console.error("Failed to load reminder history:", err);
  }
}

/**
 * Send Test SMS Action
 */
async function sendTestSms() {
  if (!state.selectedTask) return;
  const taskId = state.selectedTask.id;

  const confirmed = window.confirm(
    `Send a Test SMS for "${state.selectedTask.title}"?\n\nThis will test your SMS provider connection immediately.`
  );
  if (!confirmed) return;

  elements.btnSendTestSms.disabled = true;
  elements.testSmsSpinner.classList.remove("d-none");
  elements.testSmsIcon.classList.add("d-none");
  elements.testSmsText.textContent = "Sending...";

  try {
    const res = await fetch(`/api/tasks/${taskId}/reminder/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const json = await res.json();
    if (res.ok && json.success) {
      showToast(json.message, "success");
    } else {
      showToast(json.message || "Test SMS could not be sent.", "error");
    }

    // Refresh history
    await loadTaskReminderHistory(taskId);
  } catch (err) {
    console.error("Error sending test SMS:", err);
    showToast(`Test SMS Error: ${err.message}`, "error");
  } finally {
    elements.btnSendTestSms.disabled = false;
    elements.testSmsSpinner.classList.add("d-none");
    elements.testSmsIcon.classList.remove("d-none");
    elements.testSmsText.textContent = "Send Test SMS";
  }
}

/**
 * Save Inline Reminder in Details Modal
 */
async function saveInlineReminder(e) {
  e.preventDefault();
  if (!state.selectedTask) return;
  const taskId = state.selectedTask.id;

  const enabled = elements.inlineReminderEnabled.checked;
  const phoneNumber = elements.inlineReminderPhone.value.trim();
  const reminderTime = elements.inlineReminderTime.value;
  const timezone = elements.inlineReminderTimezone.value;
  const consentGiven = elements.inlineReminderConsent.checked;

  if (enabled) {
    if (!phoneNumber) {
      showToast("Recipient mobile number with country code is required.", "error");
      elements.inlineReminderPhone.focus();
      return;
    }
    if (!consentGiven) {
      showToast("Recipient consent is required to enable daily SMS reminders.", "error");
      elements.inlineReminderConsent.focus();
      return;
    }
  }

  try {
    const res = await fetch(`/api/tasks/${taskId}/reminder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        phoneNumber,
        reminderTime,
        timezone,
        consentGiven,
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || "Failed to save reminder settings.");
    }

    showToast(json.message, "success");
    elements.inlineReminderForm.classList.add("d-none");
    await loadTaskReminder(taskId);
    await fetchTasks();
  } catch (err) {
    console.error("Error saving inline reminder:", err);
    showToast(err.message, "error");
  }
}

/**
 * Open Modal in Create Mode
 */
function openCreateModal() {
  state.isEditing = false;
  elements.taskForm.reset();
  elements.taskIdInput.value = "";
  elements.taskDeadlineInput.value = "";
  elements.taskModalTitleText.textContent = "Add New Task";
  elements.taskModalIcon.className = "bi bi-plus-circle text-primary";
  elements.saveBtnText.textContent = "Create Task";
  elements.titleCharCount.textContent = "0 / 255";
  elements.taskTitleInput.classList.remove("is-invalid");
  setModalAlert(null);

  // Reset Reminder Fields
  if (elements.taskReminderEnabled) {
    elements.taskReminderEnabled.checked = false;
    elements.taskReminderFields.classList.add("d-none");
    elements.taskReminderPhone.value = "";
    elements.taskReminderTime.value = "09:00";
    elements.taskReminderTimezone.value = "Asia/Kolkata";
    elements.taskReminderConsent.checked = false;
  }

  showModal(elements.taskModalEl, taskModalInstance);
  setTimeout(() => elements.taskTitleInput.focus(), 300);
}

/**
 * Open Modal in Edit Mode
 */
async function openEditModal(taskId) {
  state.isEditing = true;
  setModalAlert(null);
  elements.taskTitleInput.classList.remove("is-invalid");

  // Reset Reminder Fields initially
  if (elements.taskReminderEnabled) {
    elements.taskReminderEnabled.checked = false;
    elements.taskReminderFields.classList.add("d-none");
    elements.taskReminderPhone.value = "";
    elements.taskReminderTime.value = "09:00";
    elements.taskReminderTimezone.value = "Asia/Kolkata";
    elements.taskReminderConsent.checked = false;
  }

  const localTask = state.tasks.find((t) => t.id === taskId);
  if (localTask) {
    populateModalForm(localTask);
  }

  elements.taskModalTitleText.textContent = `Edit Task #${taskId}`;
  elements.taskModalIcon.className = "bi bi-pencil-square text-primary";
  elements.saveBtnText.textContent = "Save Changes";
  showModal(elements.taskModalEl, taskModalInstance);

  try {
    const res = await fetch(`/api/tasks/${taskId}`);
    const json = await res.json();
    if (res.ok && json.success && json.data) {
      populateModalForm(json.data);
      if (json.data.reminder) {
        populateReminderForm(json.data.reminder);
      }
    }
  } catch (err) {
    console.error("Could not fetch latest task details:", err);
  }

  // Also fetch latest reminder settings explicitly
  try {
    const remRes = await fetch(`/api/tasks/${taskId}/reminder`);
    const remJson = await remRes.json();
    if (remRes.ok && remJson.success && remJson.data) {
      populateReminderForm(remJson.data);
    }
  } catch (err) {
    console.warn("Could not fetch task reminder for edit modal:", err);
  }
}

function populateReminderForm(reminder) {
  if (!elements.taskReminderEnabled || !reminder) return;
  const isEnabled = Boolean(reminder.enabled);
  elements.taskReminderEnabled.checked = isEnabled;
  if (isEnabled) {
    elements.taskReminderFields.classList.remove("d-none");
  } else {
    elements.taskReminderFields.classList.add("d-none");
  }
  elements.taskReminderPhone.value = reminder.phoneNumber || "";
  elements.taskReminderTime.value = reminder.reminderTime || "09:00";
  elements.taskReminderTimezone.value = reminder.timezone || "Asia/Kolkata";
  elements.taskReminderConsent.checked = Boolean(reminder.consentGiven);
}

function populateModalForm(task) {
  elements.taskIdInput.value = task.id;
  elements.taskTitleInput.value = task.title || "";
  elements.taskDescInput.value = task.description || "";
  elements.taskStatusSelect.value = task.status || "Pending";
  elements.taskDeadlineInput.value = task.deadline ? String(task.deadline).split("T")[0] : "";
  elements.titleCharCount.textContent = `${(task.title || "").length} / 255`;
}

/**
 * Handle Add/Edit Form Submit
 */
async function handleFormSubmit(e) {
  e.preventDefault();
  setModalAlert(null);

  const title = elements.taskTitleInput.value.trim();
  const description = elements.taskDescInput.value.trim();
  const status = elements.taskStatusSelect.value;
  const deadline = elements.taskDeadlineInput.value || null;
  const taskId = elements.taskIdInput.value;

  if (!title) {
    elements.taskTitleInput.classList.add("is-invalid");
    setModalAlert("Task title is required.", "danger");
    elements.taskTitleInput.focus();
    return;
  }

  if (title.length > 255) {
    elements.taskTitleInput.classList.add("is-invalid");
    setModalAlert("Task title cannot exceed 255 characters.", "danger");
    return;
  }

  // Handle Reminder Settings
  let reminderPayload = null;
  if (elements.taskReminderEnabled) {
    const isRemEnabled = elements.taskReminderEnabled.checked;
    const remPhone = elements.taskReminderPhone.value.trim();
    const remTime = elements.taskReminderTime.value;
    const remTz = elements.taskReminderTimezone.value;
    const remConsent = elements.taskReminderConsent.checked;

    if (isRemEnabled) {
      if (!remPhone) {
        setModalAlert("Recipient mobile number is required when daily SMS reminder is enabled.", "danger");
        elements.taskReminderPhone.focus();
        return;
      }
      if (!remConsent) {
        setModalAlert("Please confirm recipient consent to enable automated SMS reminders.", "danger");
        elements.taskReminderConsent.focus();
        return;
      }
      reminderPayload = {
        enabled: true,
        phoneNumber: remPhone,
        reminderTime: remTime,
        timezone: remTz,
        consentGiven: remConsent,
      };
    } else {
      reminderPayload = {
        enabled: false,
        phoneNumber: remPhone || null,
        reminderTime: remTime,
        timezone: remTz,
        consentGiven: false,
      };
    }
  }

  elements.taskTitleInput.classList.remove("is-invalid");
  elements.btnSaveTask.disabled = true;
  elements.saveSpinner.classList.remove("d-none");

  try {
    let url = "/api/tasks";
    let method = "POST";
    const payload = {
      title,
      description: description || null,
      status,
      deadline,
      reminder: reminderPayload,
    };

    if (state.isEditing && taskId) {
      url = `/api/tasks/${taskId}`;
      method = "PUT";
    }

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.message || "Operation failed.");
    }

    hideModal(elements.taskModalEl, taskModalInstance);
    showToast(state.isEditing ? "Task updated successfully!" : "Task created successfully!", "success");
    await fetchTasks();
  } catch (error) {
    console.error("Save task error:", error);
    setModalAlert(error.message, "danger");
  } finally {
    elements.btnSaveTask.disabled = false;
    elements.saveSpinner.classList.add("d-none");
  }
}

/**
 * Quick Status Toggle (PATCH /api/tasks/:id/status)
 */
async function handleToggleStatus(taskId, currentStatus) {
  const newStatus = currentStatus === "Pending" ? "Completed" : "Pending";

  try {
    const res = await fetch(`/api/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || "Failed to update task status.");
    }

    const taskIndex = state.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex !== -1) {
      state.tasks[taskIndex].status = newStatus;
    }

    updateSummaryStats();
    renderTasks();
    showToast(`Task marked as ${newStatus}!`, "success");
  } catch (error) {
    console.error("Toggle status error:", error);
    showToast(error.message, "error");
  }
}

/**
 * Open Delete Confirmation Modal
 */
function openDeleteModal(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  state.taskToDelete = task;
  elements.deleteTaskTitleDisplay.textContent = `"${task.title}"`;
  showModal(elements.deleteConfirmModalEl, deleteModalInstance);
}

/**
 * Execute Deletion (DELETE /api/tasks/:id)
 */
async function executeDeleteTask() {
  if (!state.taskToDelete) return;

  const taskId = state.taskToDelete.id;
  elements.btnConfirmDelete.disabled = true;
  elements.deleteSpinner.classList.remove("d-none");

  try {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "DELETE",
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || "Failed to delete task.");
    }

    hideModal(elements.deleteConfirmModalEl, deleteModalInstance);
    showToast("Task deleted successfully.", "success");
    await fetchTasks();
  } catch (error) {
    console.error("Delete task error:", error);
    showToast(error.message, "error");
  } finally {
    elements.btnConfirmDelete.disabled = false;
    elements.deleteSpinner.classList.add("d-none");
    state.taskToDelete = null;
  }
}

/**
 * HTML Sanitizer Helper
 */
function escapeHtml(text) {
  if (!text) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

// Window global bindings for inline handlers
window.handleToggleStatus = handleToggleStatus;
window.openEditModal = openEditModal;
window.openDeleteModal = openDeleteModal;
window.openTaskDetailsModal = openTaskDetailsModal;
window.showToast = showToast;
