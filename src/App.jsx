import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import './App.css';

const STORAGE_KEYS = {
  tasks: 'testimer.tasks.v2',
  runningTimer: 'testimer.running.v2',
  sortBy: 'testimer.sort.v1',
  theme: 'testimer.theme.v1',
};

const DIFFICULTY_ORDER = { Easy: 0, Avg: 1, Hard: 2 };
const DIFFICULTY_OPTIONS = Object.keys(DIFFICULTY_ORDER);
const SORT_OPTIONS = [
  { value: 'plannedOrder', label: 'Planned order' },
  { value: 'moduleNumber', label: 'Module number' },
  { value: 'difficulty', label: 'Difficulty' },
];

const MotionDiv = m.div;
const MotionPath = m.path;
const MotionSpan = m.span;
const CHECK_CONFETTI_PARTICLES = [
  { x: -21, y: -25, rotate: -36, color: 'var(--easy)', delay: 0 },
  { x: -7, y: -28, rotate: -14, color: 'var(--avg)', delay: 0.02 },
  { x: 9, y: -24, rotate: 18, color: 'var(--accent)', delay: 0.03 },
  { x: 21, y: -19, rotate: 34, color: 'var(--hard)', delay: 0.05 },
  { x: -19, y: -9, rotate: -28, color: 'var(--accent)', delay: 0.06 },
  { x: 18, y: -8, rotate: 24, color: 'var(--easy)', delay: 0.04 },
];

const createEmptyForm = () => ({
  moduleNumber: '',
  difficulty: 'Avg',
  taskName: '',
  plannedOrder: '1',
  estimatedMinutes: '25',
});

function safeJsonParse(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function generateTaskId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getInitialTheme() {
  const storedTheme = localStorage.getItem(STORAGE_KEYS.theme);

  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function normalizeTask(rawTask) {
  const estimatedMinutes = Math.max(1, Number.parseInt(rawTask.estimatedMinutes, 10) || 25);
  const totalSeconds = estimatedMinutes * 60;
  const remainingSeconds = Math.min(
    totalSeconds,
    Math.max(0, Number.parseInt(rawTask.remainingSeconds, 10) || totalSeconds),
  );

  const timerStatus = ['idle', 'running', 'paused', 'done'].includes(rawTask.timerStatus)
    ? rawTask.timerStatus
    : remainingSeconds === totalSeconds
      ? 'idle'
      : remainingSeconds === 0
        ? 'done'
        : 'paused';

  return {
    id: typeof rawTask.id === 'string' ? rawTask.id : generateTaskId(),
    moduleNumber: String(rawTask.moduleNumber ?? '').trim(),
    difficulty: DIFFICULTY_OPTIONS.includes(rawTask.difficulty) ? rawTask.difficulty : 'Avg',
    taskName: String(rawTask.taskName ?? '').trim(),
    plannedOrder: Math.max(1, Number.parseInt(rawTask.plannedOrder, 10) || 1),
    estimatedMinutes,
    remainingSeconds,
    completed: Boolean(rawTask.completed),
    completedAt: Number(rawTask.completedAt) || null,
    timerStatus,
    createdAt: Number(rawTask.createdAt) || Date.now(),
  };
}

function loadTasks() {
  const stored = safeJsonParse(localStorage.getItem(STORAGE_KEYS.tasks), []);
  if (!Array.isArray(stored)) return [];
  return stored.map(normalizeTask);
}

function loadRunningTimer() {
  const stored = safeJsonParse(localStorage.getItem(STORAGE_KEYS.runningTimer), null);

  if (
    !stored ||
    typeof stored.taskId !== 'string' ||
    typeof stored.startedAt !== 'number' ||
    typeof stored.startRemaining !== 'number'
  ) {
    return null;
  }

  return {
    taskId: stored.taskId,
    startedAt: stored.startedAt,
    startRemaining: stored.startRemaining,
  };
}

function loadSortBy() {
  const storedSort = localStorage.getItem(STORAGE_KEYS.sortBy);
  return SORT_OPTIONS.some((option) => option.value === storedSort) ? storedSort : 'plannedOrder';
}

function compareModuleNumbers(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function sortTasks(tasks, sortBy) {
  const sorted = [...tasks];

  sorted.sort((a, b) => {
    if (sortBy === 'moduleNumber') {
      return compareModuleNumbers(a.moduleNumber, b.moduleNumber);
    }

    if (sortBy === 'difficulty') {
      const byDifficulty = DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty];
      if (byDifficulty !== 0) return byDifficulty;
    }

    const byOrder = a.plannedOrder - b.plannedOrder;
    if (sortBy === 'plannedOrder' && byOrder !== 0) return byOrder;

    return a.createdAt - b.createdAt;
  });

  return sorted;
}

function remainingFromSession(session, at = Date.now()) {
  const elapsedSeconds = Math.floor((at - session.startedAt) / 1000);
  return Math.max(0, session.startRemaining - elapsedSeconds);
}

function formatTimer(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatTotal(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.ceil((safeSeconds % 3600) / 60);

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

function requestTimeUpNotification(taskName, setToast) {
  const message = `Time is up for "${taskName}".`;
  setToast(message);

  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    new Notification(message);
    return;
  }

  if (Notification.permission === 'default') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(message);
      }
    });
  }
}

function App() {
  const [tasks, setTasks] = useState(loadTasks);
  const [runningTimer, setRunningTimer] = useState(loadRunningTimer);
  const [sortBy, setSortBy] = useState(loadSortBy);
  const [theme, setTheme] = useState(getInitialTheme);
  const [form, setForm] = useState(createEmptyForm);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [clock, setClock] = useState(() => Date.now());
  const [toast, setToast] = useState('');
  const [celebratingTaskId, setCelebratingTaskId] = useState('');
  const [celebrationMessage, setCelebrationMessage] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState('');
  const finishGuardRef = useRef('');
  const listPanelRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    if (!runningTimer) {
      localStorage.removeItem(STORAGE_KEYS.runningTimer);
      return;
    }

    localStorage.setItem(STORAGE_KEYS.runningTimer, JSON.stringify(runningTimer));
  }, [runningTimer]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sortBy, sortBy);
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!runningTimer) return undefined;

    const tick = () => {
      const now = Date.now();
      setClock(now);

      const runningTask = tasks.find((task) => task.id === runningTimer.taskId);
      if (!runningTask || runningTask.completed) {
        setRunningTimer((currentSession) =>
          currentSession && currentSession.taskId === runningTimer.taskId ? null : currentSession,
        );
        return;
      }

      const remaining = remainingFromSession(runningTimer, now);
      if (remaining > 0) return;

      const guardKey = `${runningTimer.taskId}:${runningTimer.startedAt}`;
      if (finishGuardRef.current === guardKey) return;
      finishGuardRef.current = guardKey;

      setTasks((previousTasks) =>
        previousTasks.map((task) =>
          task.id === runningTimer.taskId
            ? { ...task, remainingSeconds: 0, timerStatus: 'done' }
            : task,
        ),
      );

      setRunningTimer(null);
      requestTimeUpNotification(runningTask.taskName, setToast);
    };

    const timerId = window.setInterval(() => {
      tick();
    }, 250);

    const syncClock = () => tick();
    window.addEventListener('focus', syncClock);
    document.addEventListener('visibilitychange', syncClock);

    return () => {
      window.clearInterval(timerId);
      window.removeEventListener('focus', syncClock);
      document.removeEventListener('visibilitychange', syncClock);
    };
  }, [runningTimer, tasks]);

  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!celebratingTaskId) return undefined;

    const timeoutId = window.setTimeout(() => setCelebratingTaskId(''), 850);
    return () => window.clearTimeout(timeoutId);
  }, [celebratingTaskId]);

  useEffect(() => {
    if (!celebrationMessage) return undefined;

    const timeoutId = window.setTimeout(() => setCelebrationMessage(''), 1750);
    return () => window.clearTimeout(timeoutId);
  }, [celebrationMessage]);

  const getDisplayRemaining = (task, at = clock) => {
    if (runningTimer && runningTimer.taskId === task.id) {
      return remainingFromSession(runningTimer, at);
    }

    return task.remainingSeconds;
  };

  const sortedTasks = useMemo(() => sortTasks(tasks, sortBy), [sortBy, tasks]);
  const activeTasks = useMemo(() => sortedTasks.filter((task) => !task.completed), [sortedTasks]);

  const completedTasks = useMemo(
    () =>
      sortedTasks
        .filter((task) => task.completed)
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)),
    [sortedTasks],
  );

  const totalRemainingSeconds = useMemo(() => {
    return activeTasks.reduce((sum, task) => {
      if (runningTimer && runningTimer.taskId === task.id) {
        return sum + remainingFromSession(runningTimer, clock);
      }

      return sum + task.remainingSeconds;
    }, 0);
  }, [activeTasks, clock, runningTimer]);

  const runningTaskName = useMemo(() => {
    if (!runningTimer) return '';

    return tasks.find((task) => task.id === runningTimer.taskId)?.taskName || '';
  }, [runningTimer, tasks]);

  const isFormComplete = useMemo(() => {
    const moduleNumber = form.moduleNumber.trim();
    const taskName = form.taskName.trim();
    const plannedOrder = Number.parseInt(form.plannedOrder, 10);
    const estimatedMinutes = Number.parseInt(form.estimatedMinutes, 10);

    return (
      moduleNumber.length > 0 &&
      taskName.length > 0 &&
      Number.isFinite(plannedOrder) &&
      plannedOrder > 0 &&
      Number.isFinite(estimatedMinutes) &&
      estimatedMinutes > 0
    );
  }, [form]);

  const focusTask = useMemo(() => {
    if (runningTimer) {
      const runningTask = tasks.find((task) => task.id === runningTimer.taskId);
      if (runningTask && !runningTask.completed) return runningTask;
    }

    return activeTasks[0] || null;
  }, [activeTasks, runningTimer, tasks]);

  const focusTotalSeconds = focusTask ? focusTask.estimatedMinutes * 60 : 0;
  const focusRemainingSeconds = focusTask ? getDisplayRemaining(focusTask) : 0;
  const focusIsRunning = Boolean(focusTask && runningTimer?.taskId === focusTask.id);
  const focusProgress = focusTask
    ? Math.min(100, ((focusTotalSeconds - focusRemainingSeconds) / focusTotalSeconds) * 100)
    : 0;
  const focusTimerAction = focusIsRunning
    ? 'Pause'
    : focusTask && focusRemainingSeconds < focusTotalSeconds
      ? 'Resume'
      : 'Start';

  const resetForm = () => {
    setForm(createEmptyForm());
    setEditingTaskId(null);
  };

  const handleFormSubmit = (event) => {
    event.preventDefault();

    const moduleNumber = form.moduleNumber.trim();
    const taskName = form.taskName.trim();
    const nextPlannedOrder = tasks.length
      ? Math.max(...tasks.map((task) => task.plannedOrder)) + 1
      : 1;
    const parsedOrder = Number.parseInt(form.plannedOrder, 10);
    const parsedEstimate = Number.parseInt(form.estimatedMinutes, 10);
    const plannedOrder = Number.isNaN(parsedOrder) || parsedOrder <= 0 ? nextPlannedOrder : parsedOrder;
    const estimatedMinutes = Number.isNaN(parsedEstimate) || parsedEstimate <= 0 ? 25 : parsedEstimate;

    if (!moduleNumber || !taskName) {
      setToast('Module number and task name are required.');
      return;
    }

    if (editingTaskId) {
      if (runningTimer && runningTimer.taskId === editingTaskId) {
        setToast('Pause this timer before editing its estimate.');
        return;
      }

      setTasks((previousTasks) =>
        previousTasks.map((task) => {
          if (task.id !== editingTaskId) return task;

          const elapsedSeconds = task.estimatedMinutes * 60 - task.remainingSeconds;
          const updatedTotalSeconds = estimatedMinutes * 60;
          const recalculatedRemaining = task.completed
            ? 0
            : Math.max(updatedTotalSeconds - Math.max(0, elapsedSeconds), 0);

          return {
            ...task,
            moduleNumber,
            difficulty: form.difficulty,
            taskName,
            plannedOrder,
            estimatedMinutes,
            remainingSeconds: recalculatedRemaining,
            timerStatus: task.completed
              ? 'done'
              : recalculatedRemaining === updatedTotalSeconds
                ? 'idle'
                : recalculatedRemaining === 0
                  ? 'done'
                  : 'paused',
          };
        }),
      );

      resetForm();
      setToast('Task updated.');
      return;
    }

    const newTask = {
      id: generateTaskId(),
      moduleNumber,
      difficulty: form.difficulty,
      taskName,
      plannedOrder,
      estimatedMinutes,
      remainingSeconds: estimatedMinutes * 60,
      completed: false,
      completedAt: null,
      timerStatus: 'idle',
      createdAt: Date.now(),
    };

    setTasks((previousTasks) => [...previousTasks, newTask]);
    setForm(createEmptyForm());
    setToast('Task added.');
    window.requestAnimationFrame(() => {
      listPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const resetAllTasks = () => {
    setRunningTimer(null);
    setTasks([]);
    setCelebratingTaskId('');
    setCelebrationMessage('');
    setExpandedTaskId('');
    resetForm();
    setToast('All tasks reset.');
    localStorage.removeItem(STORAGE_KEYS.tasks);
    localStorage.removeItem(STORAGE_KEYS.runningTimer);
  };

  const deleteTask = (taskId) => {
    if (runningTimer && runningTimer.taskId === taskId) {
      setRunningTimer(null);
    }

    setTasks((previousTasks) => previousTasks.filter((task) => task.id !== taskId));
    if (expandedTaskId === taskId) setExpandedTaskId('');

    if (editingTaskId === taskId) {
      resetForm();
    }
  };

  const toggleTaskExpand = (taskId) => {
    setExpandedTaskId((currentExpandedTaskId) => (currentExpandedTaskId === taskId ? '' : taskId));
  };

  const editTask = (task) => {
    if (runningTimer && runningTimer.taskId === task.id) {
      setToast('Pause this timer before editing.');
      return;
    }

    setEditingTaskId(task.id);
    setForm({
      moduleNumber: task.moduleNumber,
      difficulty: task.difficulty,
      taskName: task.taskName,
      plannedOrder: String(task.plannedOrder),
      estimatedMinutes: String(task.estimatedMinutes),
    });
  };

  const pauseTimer = (taskId) => {
    if (!runningTimer || runningTimer.taskId !== taskId) return;

    const timestamp = Date.now();
    const remaining = remainingFromSession(runningTimer, timestamp);

    setTasks((previousTasks) =>
      previousTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              remainingSeconds: remaining,
              timerStatus: remaining === 0 ? 'done' : 'paused',
            }
          : task,
      ),
    );

    setRunningTimer(null);
    setClock(timestamp);
  };

  const startTimer = (taskId) => {
    const timestamp = Date.now();
    const targetTask = tasks.find((task) => task.id === taskId);

    if (!targetTask || targetTask.completed) return;

    const targetRemaining = getDisplayRemaining(targetTask, timestamp);

    if (targetRemaining <= 0) {
      setToast('Reset this timer before starting again.');
      return;
    }

    if (runningTimer && runningTimer.taskId !== taskId) {
      const previousRemaining = remainingFromSession(runningTimer, timestamp);

      setTasks((previousTasks) =>
        previousTasks.map((task) => {
          if (task.id === runningTimer.taskId) {
            return {
              ...task,
              remainingSeconds: previousRemaining,
              timerStatus: previousRemaining === 0 ? 'done' : 'paused',
            };
          }

          if (task.id === taskId) {
            return { ...task, timerStatus: 'running' };
          }

          return task;
        }),
      );
    } else {
      setTasks((previousTasks) =>
        previousTasks.map((task) => (task.id === taskId ? { ...task, timerStatus: 'running' } : task)),
      );
    }

    setRunningTimer({
      taskId,
      startedAt: timestamp,
      startRemaining: targetRemaining,
    });

    setClock(timestamp);
  };

  const toggleTimer = (task) => {
    if (runningTimer && runningTimer.taskId === task.id) {
      pauseTimer(task.id);
      return;
    }

    startTimer(task.id);
  };

  const resetTimer = (taskId) => {
    if (runningTimer && runningTimer.taskId === taskId) {
      setRunningTimer(null);
    }

    setTasks((previousTasks) =>
      previousTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              remainingSeconds: task.estimatedMinutes * 60,
              timerStatus: 'idle',
            }
          : task,
      ),
    );
  };

  const toggleTaskComplete = (taskId) => {
    const timestamp = Date.now();
    const selectedTask = tasks.find((task) => task.id === taskId);

    if (!selectedTask) return;

    if (selectedTask.completed) {
      setTasks((previousTasks) =>
        previousTasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                completed: false,
                completedAt: null,
                remainingSeconds: task.estimatedMinutes * 60,
                timerStatus: 'idle',
              }
            : task,
        ),
      );

      setToast('Task moved back to active.');
      return;
    }

    if (runningTimer && runningTimer.taskId === taskId) {
      setRunningTimer(null);
    }

    setTasks((previousTasks) =>
      previousTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              completed: true,
              completedAt: timestamp,
              remainingSeconds: 0,
              timerStatus: 'done',
            }
          : task,
      ),
    );

    setCelebratingTaskId(taskId);
    setCelebrationMessage(`Completed "${selectedTask.taskName}".`);
    setToast('Nice work. Task completed.');
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <h1>Testimer</h1>
          <p className="subline">Study tasks with a built-in single-focus timer.</p>
        </div>

        <div className="top-actions">
          <div className="remaining-pill">Remaining: {formatTotal(totalRemainingSeconds)}</div>

          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((previousTheme) => (previousTheme === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </header>

      <section className="workspace-grid">
        <section className="panel form-panel">
          <h2>{editingTaskId ? 'Edit task' : 'Add task'}</h2>

          <form className="task-form" onSubmit={handleFormSubmit}>
            <label>
              Module number
              <input
                type="text"
                placeholder="11 or 11.2"
                value={form.moduleNumber}
                onChange={(event) => setForm((previous) => ({ ...previous, moduleNumber: event.target.value }))}
              />
            </label>

            <label>
              Difficulty
              <select
                value={form.difficulty}
                onChange={(event) => setForm((previous) => ({ ...previous, difficulty: event.target.value }))}
              >
                {DIFFICULTY_OPTIONS.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    {difficulty}
                  </option>
                ))}
              </select>
            </label>

            <label className="span-full">
              Task name / description
              <input
                type="text"
                placeholder="Solve practice questions for chapter 11"
                value={form.taskName}
                onChange={(event) => setForm((previous) => ({ ...previous, taskName: event.target.value }))}
              />
            </label>

            <label>
              Planned order
              <input
                type="number"
                min="1"
                step="1"
                value={form.plannedOrder}
                onChange={(event) => setForm((previous) => ({ ...previous, plannedOrder: event.target.value }))}
              />
            </label>

            <label>
              Estimated minutes
              <input
                type="number"
                min="1"
                step="1"
                value={form.estimatedMinutes}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    estimatedMinutes: event.target.value,
                  }))
                }
              />
            </label>

            <div className="form-actions span-full">
              <button
                type="submit"
                className={`primary-btn form-submit ${isFormComplete ? 'is-ready' : 'is-pending'}`}
                disabled={!isFormComplete}
              >
                {editingTaskId ? 'Update task' : 'Add task'}
              </button>

              {editingTaskId ? (
                <button type="button" className="secondary-btn" onClick={resetForm}>
                  Cancel edit
                </button>
              ) : (
                <button type="button" className="secondary-btn danger-btn" onClick={resetAllTasks}>
                  Reset all tasks
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="panel focus-panel">
          <p className="focus-label">Focus timer</p>
          <h2 className="focus-title">{focusTask ? focusTask.taskName : 'No active task selected'}</h2>
          <p className="focus-meta">{runningTaskName ? `Running: ${runningTaskName}` : 'Timer idle'}</p>
          <div className="focus-time">{formatTimer(focusRemainingSeconds)}</div>
          <div className="progress-track large">
            <div className="progress-fill" style={{ width: `${focusProgress}%` }} />
          </div>
          <div className="focus-actions">
            <button
              type="button"
              className="primary-btn"
              disabled={!focusTask || focusRemainingSeconds <= 0}
              onClick={() => focusTask && toggleTimer(focusTask)}
            >
              {focusTimerAction}
            </button>
            <button
              type="button"
              className="secondary-btn"
              disabled={!focusTask || (!focusIsRunning && focusRemainingSeconds === focusTotalSeconds)}
              onClick={() => focusTask && resetTimer(focusTask.id)}
            >
              Reset
            </button>
          </div>
        </section>
      </section>

      <main className="panel list-panel" ref={listPanelRef}>
        <div className="list-head">
          <h2>Study tasks</h2>

          <label className="sort-control">
            Sort by
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {activeTasks.length === 0 ? (
          <div className="empty-state">No active tasks yet. Add your first task to start a session.</div>
        ) : (
          <div className="task-group">
            <div className="task-head">
              <span>Done</span>
              <span>Module</span>
              <span>Difficulty</span>
              <span>Task</span>
              <span>Order</span>
              <span>Estimate</span>
              <span>Time left</span>
              <span>Progress</span>
              <span>Timer</span>
              <span>Actions</span>
            </div>
            {activeTasks.map((task) => {
              const remaining = getDisplayRemaining(task);
              const isRunning = runningTimer?.taskId === task.id;

              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  remaining={remaining}
                  isRunning={isRunning}
                  isExpanded={expandedTaskId === task.id}
                  celebrating={celebratingTaskId === task.id}
                  onToggleComplete={toggleTaskComplete}
                  onToggleExpand={toggleTaskExpand}
                  onToggleTimer={toggleTimer}
                  onResetTimer={resetTimer}
                  onEdit={editTask}
                  onDelete={deleteTask}
                />
              );
            })}
          </div>
        )}

        <section className="completed-section">
          <h3>Completed</h3>
          {completedTasks.length === 0 ? (
            <p className="empty-inline">Completed tasks will slide in here.</p>
          ) : (
            <div className="task-group completed-group">
              {completedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  remaining={0}
                  isRunning={false}
                  isExpanded={expandedTaskId === task.id}
                  celebrating={celebratingTaskId === task.id}
                  onToggleComplete={toggleTaskComplete}
                  onToggleExpand={toggleTaskExpand}
                  onToggleTimer={toggleTimer}
                  onResetTimer={resetTimer}
                  onEdit={editTask}
                  onDelete={deleteTask}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <AnimatePresence>
        {celebrationMessage ? (
          <MotionDiv
            className="celebration-banner"
            initial={{ opacity: 0, y: -14, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {celebrationMessage}
          </MotionDiv>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {toast ? (
          <MotionDiv
            className="toast"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
          >
            {toast}
          </MotionDiv>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function TaskRow({
  task,
  remaining,
  isRunning,
  isExpanded,
  celebrating,
  onToggleComplete,
  onToggleExpand,
  onToggleTimer,
  onResetTimer,
  onEdit,
  onDelete,
}) {
  const totalSeconds = task.estimatedMinutes * 60;
  const progress = task.completed ? 100 : Math.min(100, ((totalSeconds - remaining) / totalSeconds) * 100);
  const hasStarted = remaining < totalSeconds;
  const timerAction = isRunning ? 'Pause' : hasStarted ? 'Resume' : 'Start';
  const disableTimerAction = task.completed || remaining <= 0;
  const disableReset = task.completed || (!isRunning && remaining === totalSeconds);

  return (
    <article
      className={`task-row ${task.completed ? 'is-complete' : ''} ${isRunning ? 'is-running' : ''} ${celebrating ? 'is-celebrating' : ''}`}
    >
      <div className="task-cell checkbox-cell" data-label="Done">
        <button
          type="button"
          className={`check-toggle ${task.completed ? 'checked' : ''}`}
          aria-label={task.completed ? 'Mark task as incomplete' : 'Mark task as complete'}
          onClick={() => onToggleComplete(task.id)}
        >
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <MotionPath
              d="M3.7 9.6L7.4 13.3L14.3 5.8"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.1"
              initial={false}
              animate={{ pathLength: task.completed ? 1 : 0, opacity: task.completed ? 1 : 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            />
          </svg>

          <AnimatePresence>
            {celebrating ? (
              <MotionSpan
                className="check-ripple"
                initial={{ scale: 0.35, opacity: 0.5 }}
                animate={{ scale: 1.7, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              />
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {celebrating ? (
              <MotionSpan className="check-confetti" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {CHECK_CONFETTI_PARTICLES.map((particle, index) => (
                  <MotionSpan
                    key={`${task.id}-particle-${index}`}
                    className="check-confetti-piece"
                    style={{ backgroundColor: particle.color }}
                    initial={{ x: 0, y: 0, rotate: 0, scale: 0.2, opacity: 0 }}
                    animate={{
                      x: particle.x,
                      y: particle.y,
                      rotate: particle.rotate,
                      scale: [0.2, 1, 0.8],
                      opacity: [0, 1, 0],
                    }}
                    transition={{ duration: 0.56, delay: particle.delay, ease: 'easeOut' }}
                  />
                ))}
              </MotionSpan>
            ) : null}
          </AnimatePresence>
        </button>
      </div>

      <div className="task-cell" data-label="Module">
        {task.moduleNumber}
      </div>

      <div className="task-cell" data-label="Difficulty">
        <span className={`difficulty-pill ${task.difficulty.toLowerCase()}`}>{task.difficulty}</span>
      </div>

      <div className="task-cell task-name-cell" data-label="Task">
        <button
          type="button"
          className={`task-name ${isExpanded ? 'expanded' : ''}`}
          aria-expanded={isExpanded}
          onClick={() => onToggleExpand(task.id)}
          title={isExpanded ? 'Click to collapse' : 'Click to view full task'}
        >
          {task.taskName}
        </button>
      </div>

      <div className="task-cell" data-label="Order">
        {task.plannedOrder}
      </div>

      <div className="task-cell" data-label="Estimate">
        {task.estimatedMinutes}m
      </div>

      <div className="task-cell timer-readout" data-label="Time left">
        {formatTimer(remaining)}
      </div>

      <div className="task-cell progress-cell" data-label="Progress">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="task-cell timer-controls" data-label="Timer">
        <button type="button" className="mini-btn" onClick={() => onToggleTimer(task)} disabled={disableTimerAction}>
          {timerAction}
        </button>

        <button
          type="button"
          className="mini-btn secondary"
          onClick={() => onResetTimer(task.id)}
          disabled={disableReset}
        >
          Reset
        </button>
      </div>

      <div className="task-cell row-actions" data-label="Actions">
        <button type="button" className="icon-btn" onClick={() => onEdit(task)} disabled={isRunning || task.completed}>
          Edit
        </button>

        <button type="button" className="icon-btn danger" onClick={() => onDelete(task.id)}>
          Delete
        </button>
      </div>
    </article>
  );
}

export default App;
