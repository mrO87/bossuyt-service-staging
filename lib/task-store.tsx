'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { currentUserId, getUserById, users, tasks as seededTasks } from '@/lib/mock-data'
import { isTaskAssignedToUser, isTaskOpen } from '@/lib/task-meta'
import type { Task, TaskPriority, TaskStatus, TaskType, User } from '@/types'

const TASKS_STORAGE_KEY = 'bossuyt-service:tasks'
export const ACTIVE_USER_KEY = 'bossuyt-service:active-user-id'

interface CreateTaskInput {
  type: TaskType
  title: string
  description?: string
  assigneeType: Task['assigneeType']
  assigneeUserId?: string
  assigneeRole?: User['role']
  createdByUserId: string
  priority: TaskPriority
  dueDate?: string
  werkbonId: string
  interventionId: string
}

interface UpdateTaskInput {
  type?: TaskType
  title?: string
  description?: string
  assigneeType?: Task['assigneeType']
  assigneeUserId?: string
  assigneeRole?: User['role']
  priority?: TaskPriority
  status?: TaskStatus
  dueDate?: string
}

interface TaskContextValue {
  currentUser: User
  allUsers: User[]
  switchUser: (userId: string) => void
  tasks: Task[]
  createTask: (input: CreateTaskInput) => Task
  updateTaskStatus: (taskId: string, status: TaskStatus) => void
  updateTask: (taskId: string, updates: UpdateTaskInput) => void
  getOpenTaskCountForUser: (userId: string) => number
}

const TaskContext = createContext<TaskContextValue | null>(null)

function normalizeTask(task: Task): Task {
  return {
    ...task,
    type: task.type ?? 'todo',
    assigneeType: task.assigneeType ?? 'user',
    assigneeUserId: task.assigneeType === 'group' ? undefined : task.assigneeUserId,
    assigneeRole: task.assigneeType === 'group' ? task.assigneeRole : undefined,
  }
}

function sortTasks(list: Task[]): Task[] {
  return [...list].map(normalizeTask).sort((left, right) => {
    if (!isTaskOpen(left.status) && isTaskOpen(right.status)) return 1
    if (isTaskOpen(left.status) && !isTaskOpen(right.status)) return -1
    if (left.dueDate && right.dueDate) {
      return left.dueDate.localeCompare(right.dueDate)
    }
    if (left.dueDate) return -1
    if (right.dueDate) return 1
    return right.createdAt.localeCompare(left.createdAt)
  })
}

export function TaskProvider({ children }: { children: ReactNode }) {
  const [activeUserId, setActiveUserId] = useState<string>(() => {
    if (typeof window === 'undefined') return currentUserId
    return window.localStorage.getItem(ACTIVE_USER_KEY) ?? currentUserId
  })

  const currentUser = getUserById(activeUserId) ?? getUserById(currentUserId)!

  function switchUser(userId: string) {
    setActiveUserId(userId)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVE_USER_KEY, userId)
    }
  }

  const [tasks, setTasks] = useState<Task[]>(() => {
    if (typeof window === 'undefined') {
      return sortTasks(seededTasks)
    }

    const raw = window.localStorage.getItem(TASKS_STORAGE_KEY)

    if (!raw) {
      return sortTasks(seededTasks)
    }

    const parsed = JSON.parse(raw) as Task[]
    return sortTasks(parsed)
  })

  useEffect(() => {
    window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  function createTask(input: CreateTaskInput): Task {
    const timestamp = new Date().toISOString()
    const task: Task = {
      id: `task-${timestamp}`,
      type: input.type,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      assigneeType: input.assigneeType,
      assigneeUserId: input.assigneeType === 'user' ? input.assigneeUserId : undefined,
      assigneeRole: input.assigneeType === 'group' ? input.assigneeRole : undefined,
      createdByUserId: input.createdByUserId,
      priority: input.priority,
      status: 'open',
      werkbonId: input.werkbonId,
      interventionId: input.interventionId,
      dueDate: input.dueDate || undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    setTasks(prev => sortTasks([task, ...prev]))
    return task
  }

  function updateTaskStatus(taskId: string, status: TaskStatus) {
    const timestamp = new Date().toISOString()

    setTasks(prev => sortTasks(prev.map(task => {
      if (task.id !== taskId) return task

      return {
        ...task,
        status,
        updatedAt: timestamp,
        completedAt: status === 'klaar' ? timestamp : undefined,
      }
    })))
  }

  function updateTask(taskId: string, updates: UpdateTaskInput) {
    const timestamp = new Date().toISOString()

    setTasks(prev => sortTasks(prev.map(task => {
      if (task.id !== taskId) return task

      const nextStatus = updates.status ?? task.status

      return {
        ...task,
        ...updates,
        type: updates.type ?? task.type,
        title: updates.title?.trim() ?? task.title,
        description: updates.description?.trim() || undefined,
        assigneeType: updates.assigneeType ?? task.assigneeType,
        assigneeUserId: (updates.assigneeType ?? task.assigneeType) === 'user'
          ? (updates.assigneeUserId ?? task.assigneeUserId)
          : undefined,
        assigneeRole: (updates.assigneeType ?? task.assigneeType) === 'group'
          ? (updates.assigneeRole ?? task.assigneeRole)
          : undefined,
        dueDate: updates.dueDate || undefined,
        status: nextStatus,
        updatedAt: timestamp,
        completedAt: nextStatus === 'klaar' ? timestamp : undefined,
      }
    })))
  }

  function getOpenTaskCountForUser(userId: string): number {
    const user = getUserById(userId)

    if (!user) {
      return 0
    }

    return tasks.filter(task => isTaskAssignedToUser(task, user) && isTaskOpen(task.status)).length
  }

  const value: TaskContextValue = {
    currentUser,
    allUsers: users,
    switchUser,
    tasks,
    createTask,
    updateTaskStatus,
    updateTask,
    getOpenTaskCountForUser,
  }

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  )
}

export function useTasks() {
  const context = useContext(TaskContext)

  if (!context) {
    throw new Error('useTasks must be used inside a TaskProvider.')
  }

  return context
}
