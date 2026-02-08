'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { Database } from '@/lib/supabase/types'
import { getAcademicTerms } from '@/lib/actions/terms'
import { getClasses } from '@/lib/actions/classes'
import { getSubjects, seedSeniorSchoolSubjects } from '@/lib/actions/subjects'
import { getTeachers, seedKerichoTeachersAndAssignments } from '@/lib/actions/teachers'
import { getMySchool } from '@/lib/actions/schools'
import {
  createTimetableSlot,
  deleteTimetableSlot,
  generateSeniorSchoolTimetable,
  getTimetableSlots,
  updateTimetableSlot,
  type TimetableSlotWithRefs,
} from '@/lib/actions/timetable'
import { generateLessonSessions } from '@/lib/actions/lessons'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Download, Edit, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react'

type TermRow = Database['public']['Tables']['academic_terms']['Row']
type ClassRow = Database['public']['Tables']['classes']['Row']
type SubjectRow = Database['public']['Tables']['subjects']['Row']
type SchoolRow = Database['public']['Tables']['schools']['Row']

type TeacherOption = {
  id: string
  label: string
}

type SlotFormState = {
  teacher_id: string
  class_id: string
  subject_id: string
  day_of_week: string
  start_time: string
  end_time: string
  room: string
}

const DAYS: Array<{ value: string; label: string }> = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
]

function slotLabel(slot: TimetableSlotWithRefs) {
  const day = DAYS.find((d) => d.value === String(slot.day_of_week))?.label ?? `Day ${slot.day_of_week}`
  return `${day} ${slot.start_time}-${slot.end_time}`
}

const KENYA_FIXED_WINDOWS = [
  { start: '08:20', end: '09:40', label: 'Lessons 1-2' },
  { start: '09:50', end: '11:10', label: 'Lessons 3-4' },
  { start: '11:40', end: '13:00', label: 'Lessons 5-6' },
  { start: '14:00', end: '15:20', label: 'Lessons 7-8' },
]

const KENYA_BREAK_WINDOWS = [
  { start: '09:40', end: '09:50', label: 'Health break 1' },
  { start: '11:10', end: '11:40', label: 'Health break 2' },
  { start: '13:00', end: '14:00', label: 'Lunch break' },
  { start: '15:20', end: '16:45', label: 'Co-curricular' },
]

function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function getFixedTemplatePeriods(periodMinutes: number) {
  if (!Number.isFinite(periodMinutes) || periodMinutes <= 0) return 0
  return KENYA_FIXED_WINDOWS.reduce((total, block) => {
    const duration = toMinutes(block.end) - toMinutes(block.start)
    return total + Math.floor(duration / periodMinutes)
  }, 0)
}

function getErrorMessage(error: unknown, fallback = 'Unexpected error') {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

const FEMALE_NAME_HINTS = new Set(
  [
    'mercy',
    'faith',
    'joy',
    'grace',
    'esther',
    'purity',
    'hannah',
    'dorcas',
    'janet',
    'gladys',
    'nancy',
    'lydia',
    'mary',
    'jane',
    'anne',
    'ivy',
  ].map((n) => n.toLowerCase())
)

function getHonorificFromName(fullName: string) {
  const cleaned = fullName.replace(/\(.*\)$/g, '').trim()
  const first = cleaned.split(/\s+/)[0]?.toLowerCase() ?? ''
  if (first && FEMALE_NAME_HINTS.has(first)) return 'Mrs'
  return 'Mr'
}

function stripEmailLabel(label: string) {
  return label.replace(/\s*\(.*\)$/, '').trim()
}

function sanitizeFilename(value: string) {
  return value
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]+/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function lastNameFromLabel(label: string) {
  const cleaned = stripEmailLabel(label)
  const parts = cleaned.split(/\s+/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : cleaned
}

type TimeRow = {
  start: string
  end: string
  label: string
  isBreak: boolean
  breakLabel: string
}

function buildTimeRows(slots: TimetableSlotWithRefs[]): TimeRow[] {
  const rows = new Map<string, TimeRow>()

  slots.forEach((slot) => {
    const key = `${slot.start_time}-${slot.end_time}`
    if (!rows.has(key)) {
      rows.set(key, {
        start: slot.start_time,
        end: slot.end_time,
        label: `${slot.start_time}-${slot.end_time}`,
        isBreak: false,
        breakLabel: '',
      })
    }
  })

  KENYA_BREAK_WINDOWS.forEach((breakWindow) => {
    const key = `break-${breakWindow.start}-${breakWindow.end}`
    if (!rows.has(key)) {
      rows.set(key, {
        start: breakWindow.start,
        end: breakWindow.end,
        label: `${breakWindow.start}-${breakWindow.end}`,
        isBreak: true,
        breakLabel: breakWindow.label,
      })
    }
  })

  return Array.from(rows.values()).sort((a, b) => {
    const delta = toMinutes(a.start) - toMinutes(b.start)
    if (delta !== 0) return delta
    if (a.isBreak === b.isBreak) return 0
    return a.isBreak ? 1 : -1
  })
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise
      .then((value) => {
        clearTimeout(timeoutId)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

export function TimetableManager({ canManage }: { canManage: boolean }) {
  const [terms, setTerms] = useState<TermRow[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [teachers, setTeachersList] = useState<TeacherOption[]>([])
  const [schoolProfile, setSchoolProfile] = useState<SchoolRow | null>(null)

  const [selectedTermId, setSelectedTermId] = useState<string>('')
  const [filterClassId, setFilterClassId] = useState<string>('all')
  const [filterTeacherId, setFilterTeacherId] = useState<string>('all')

  const [slots, setSlots] = useState<TimetableSlotWithRefs[]>([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState<SlotFormState>({
    teacher_id: '',
    class_id: '',
    subject_id: '',
    day_of_week: '1',
    start_time: '08:00',
    end_time: '09:00',
    room: '',
  })

  const [editTarget, setEditTarget] = useState<TimetableSlotWithRefs | null>(null)
  const [editForm, setEditForm] = useState<SlotFormState | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<TimetableSlotWithRefs | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [genOpen, setGenOpen] = useState(false)
  const [genSaving, setGenSaving] = useState(false)
  const [genStart, setGenStart] = useState('')
  const [genEnd, setGenEnd] = useState('')

  const [seedOpen, setSeedOpen] = useState(false)
  const [seedSaving, setSeedSaving] = useState(false)
  const [seedTeachersOpen, setSeedTeachersOpen] = useState(false)
  const [seedTeachersSaving, setSeedTeachersSaving] = useState(false)
  const [autoOpen, setAutoOpen] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const [autoDayTemplate, setAutoDayTemplate] = useState<'kenya_fixed' | 'continuous'>('kenya_fixed')
  const [autoStart, setAutoStart] = useState('08:20')
  const [autoPeriodMinutes, setAutoPeriodMinutes] = useState(40)
  const [autoPeriodsPerDay, setAutoPeriodsPerDay] = useState(10)
  const [autoMaxTeacherPeriods, setAutoMaxTeacherPeriods] = useState(28)
  const [autoScope, setAutoScope] = useState<'core' | 'assigned' | 'full'>('core')
  const [autoPathway, setAutoPathway] = useState<'STEM' | 'SOCIAL' | 'ARTS'>('STEM')
  const [autoElectives, setAutoElectives] = useState<string[]>([])
  const [autoTeacherMap, setAutoTeacherMap] = useState<Record<string, string>>({})
  const [autoStep, setAutoStep] = useState<1 | 2 | 3>(1)
  const [downloading, setDownloading] = useState<'none' | 'full' | 'teacher'>('none')
  const autoEffectiveStart = autoDayTemplate === 'kenya_fixed' ? KENYA_FIXED_WINDOWS[0].start : autoStart
  const autoEffectivePeriodsPerDay =
    autoDayTemplate === 'kenya_fixed' ? getFixedTemplatePeriods(autoPeriodMinutes) : autoPeriodsPerDay
  const electivesRequired = autoScope === 'full'
  const electivesReady = !electivesRequired || autoElectives.length === 3
  const step1Valid =
    autoPeriodMinutes >= 20 &&
    autoPeriodMinutes <= 120 &&
    autoMaxTeacherPeriods >= 1 &&
    autoMaxTeacherPeriods <= 60 &&
    (autoDayTemplate === 'kenya_fixed'
      ? autoEffectivePeriodsPerDay > 0 && autoEffectivePeriodsPerDay <= 12
      : !!autoStart && autoPeriodsPerDay >= 1 && autoPeriodsPerDay <= 12)
  const canGoStep3 = step1Valid && electivesReady

  const loadLookups = useCallback(async () => {
    const [termsResult, classesResult, subjectsResult, teachersResult, schoolResult] = await Promise.all([
      getAcademicTerms(),
      getClasses(),
      getSubjects(),
      canManage ? getTeachers() : Promise.resolve({ success: true, teachers: [] } as any),
      getMySchool(),
    ])

    if (!termsResult.success) throw new Error(termsResult.error.message)
    if (!classesResult.success) throw new Error(classesResult.error.message)
    if (!subjectsResult.success) throw new Error(subjectsResult.error.message)
    if (!teachersResult.success) throw new Error(teachersResult.error.message)
    if (!schoolResult.success) throw new Error(schoolResult.error.message)

    setTerms(termsResult.terms)
    setClasses(classesResult.classes)
    setSubjects(subjectsResult.subjects)
    setSchoolProfile(schoolResult.school)

    const teacherOptions: TeacherOption[] = (teachersResult.teachers ?? []).map((t: any) => ({
      id: t.id,
      label: t.user ? `${t.user.first_name} ${t.user.last_name} (${t.user.email})` : t.id,
    }))
    setTeachersList(teacherOptions)

    const current = termsResult.terms.find((t) => t.is_current)
    const defaultTerm = current?.id ?? termsResult.terms[0]?.id ?? ''
    setSelectedTermId((prev) => prev || defaultTerm)
  }, [canManage])

  const loadSlots = useCallback(async () => {
    if (!selectedTermId) {
      setSlots([])
      setLoading(false)
      return
    }
    setLoading(true)
    const result = await getTimetableSlots({
      academicTermId: selectedTermId,
      classId: filterClassId !== 'all' ? filterClassId : undefined,
      teacherId: filterTeacherId !== 'all' ? filterTeacherId : undefined,
    })
    if (!result.success) {
      toast.error('Failed to load timetable', { description: result.error.message })
      setSlots([])
      setLoading(false)
      return
    }
    setSlots(result.slots)
    setLoading(false)
  }, [selectedTermId, filterClassId, filterTeacherId])

  useEffect(() => {
    ;(async () => {
      try {
        await loadLookups()
      } catch (e: any) {
        toast.error('Failed to load timetable setup', { description: e?.message || 'Unknown error' })
      }
    })()
  }, [loadLookups])

  useEffect(() => {
    void loadSlots()
  }, [loadSlots])

  const currentTerm = useMemo(() => terms.find((t) => t.id === selectedTermId) ?? null, [terms, selectedTermId])

  useEffect(() => {
    if (!genOpen) return
    if (currentTerm?.start_date && !genStart) setGenStart(currentTerm.start_date)
    if (currentTerm?.end_date && !genEnd) setGenEnd(currentTerm.end_date)
  }, [genOpen, currentTerm, genStart, genEnd])

  const classLabel = useCallback(
    (id: string) => {
      const c = classes.find((x) => x.id === id)
      return c ? `${c.name} (G${c.grade_level}${c.stream ? `-${c.stream}` : ''})` : id
    },
    [classes]
  )

  const subjectLabel = useCallback(
    (id: string) => {
      const s = subjects.find((x) => x.id === id)
      return s ? `${s.code} - ${s.name}` : id
    },
    [subjects]
  )

  const teacherLabel = useCallback(
    (slot: TimetableSlotWithRefs) => {
      const fromJoin = slot.teachers?.users
      if (fromJoin) return `${fromJoin.first_name} ${fromJoin.last_name}`
      const found = teachers.find((t) => t.id === slot.teacher_id)
      return found?.label ?? slot.teacher_id
    },
    [teachers]
  )

  const teacherShortLabel = useCallback(
    (slot: TimetableSlotWithRefs) => {
      const fromJoin = slot.teachers?.users
      if (fromJoin) {
        const honorific = fromJoin.honorific?.trim() || getHonorificFromName(`${fromJoin.first_name} ${fromJoin.last_name}`)
        return `${honorific} ${fromJoin.last_name}`.trim()
      }
      const fallback = teacherLabel(slot)
      const honorific = getHonorificFromName(fallback)
      return `${honorific} ${lastNameFromLabel(fallback)}`.trim()
    },
    [teacherLabel]
  )

  const subjectCodeLabel = useCallback(
    (slot: TimetableSlotWithRefs) => {
      const code = slot.subjects?.code
      if (code) return code.toUpperCase()
      const fallback = subjectLabel(slot.subject_id)
      const first = fallback.split(' - ')[0]
      return first || fallback
    },
    [subjectLabel]
  )

  const canCreate = canManage && !!selectedTermId
  const showWeekView = filterClassId !== 'all' || filterTeacherId !== 'all'
  const weekViewMode = useMemo<'class' | 'teacher' | 'full'>(() => {
    if (filterClassId !== 'all') return 'class'
    if (filterTeacherId !== 'all') return 'teacher'
    return 'full'
  }, [filterClassId, filterTeacherId])

  const seniorClasses = useMemo(
    () => classes.filter((c) => c.is_active && c.grade_level >= 10 && c.grade_level <= 12),
    [classes]
  )

  const coreSubjects = useMemo(() => {
    const codes = new Set(['ENG', 'KIS', 'MATH', 'CSL'])
    return subjects.filter((s) => codes.has(s.code.toUpperCase()))
  }, [subjects])

  const missingCore = useMemo(() => {
    const found = new Set(coreSubjects.map((s) => s.code.toUpperCase()))
    return ['ENG', 'KIS', 'MATH', 'CSL'].filter((code) => !found.has(code))
  }, [coreSubjects])

  const pathwayCodes = useMemo(
    () => ({
      STEM: ['BIO', 'CHEM', 'PHY', 'GSCI', 'AGR', 'HMSC', 'COMP', 'AVI', 'POWER', 'ELEC', 'WOOD', 'METAL', 'BUILD', 'MARINE'],
      SOCIAL: ['HIST', 'GEO', 'CRE', 'IRE', 'HRE', 'LIT', 'FAS', 'IND', 'FR', 'DE', 'AR', 'ZH', 'ENT', 'BUS'],
      ARTS: ['MUS', 'DAN', 'THE', 'FILM', 'ART', 'MEDIA', 'SPORT'],
    }),
    []
  )

  const pathwayElectives = useMemo(() => {
    const codes = new Set(pathwayCodes[autoPathway])
    return subjects.filter((s) => codes.has(s.code.toUpperCase()))
  }, [subjects, autoPathway, pathwayCodes])

  useEffect(() => {
    if (autoScope !== 'full') return
    const availableIds = new Set(pathwayElectives.map((s) => s.id))
    const hasInvalid = autoElectives.some((id) => !availableIds.has(id))
    if (!hasInvalid && autoElectives.length > 0) return
    const defaults = pathwayElectives.slice(0, 3).map((s) => s.id)
    if (defaults.length > 0) setAutoElectives(defaults)
  }, [autoScope, autoElectives, pathwayElectives])

  const fallbackSubjects = useMemo(() => {
    if (autoScope === 'assigned') return []
    if (autoScope === 'core') return coreSubjects
    const selected = pathwayElectives.filter((s) => autoElectives.includes(s.id))
    return [...coreSubjects, ...selected]
  }, [autoScope, coreSubjects, pathwayElectives, autoElectives])

  const openEdit = (slot: TimetableSlotWithRefs) => {
    setEditTarget(slot)
    setEditForm({
      teacher_id: slot.teacher_id,
      class_id: slot.class_id,
      subject_id: slot.subject_id,
      day_of_week: String(slot.day_of_week),
      start_time: slot.start_time,
      end_time: slot.end_time,
      room: slot.room ?? '',
    })
  }

  const handleCreate = async () => {
    if (!selectedTermId) return
    if (!createForm.teacher_id || !createForm.class_id || !createForm.subject_id) {
      toast.error('Select teacher, class and subject')
      return
    }
    setCreating(true)

    const result = await createTimetableSlot({
      academic_term_id: selectedTermId,
      teacher_id: createForm.teacher_id,
      class_id: createForm.class_id,
      subject_id: createForm.subject_id,
      day_of_week: Number(createForm.day_of_week),
      start_time: createForm.start_time,
      end_time: createForm.end_time,
      room: createForm.room.trim() || null,
    })

    if (!result.success) {
      toast.error('Create failed', { description: result.error.message })
      setCreating(false)
      return
    }

    toast.success('Timetable slot created')
    setCreating(false)
    setCreateOpen(false)
    setCreateForm((p) => ({ ...p, room: '' }))
    await loadSlots()
  }

  const handleEdit = async () => {
    if (!editTarget || !editForm) return
    setEditSaving(true)
    const result = await updateTimetableSlot(editTarget.id, {
      teacher_id: editForm.teacher_id,
      class_id: editForm.class_id,
      subject_id: editForm.subject_id,
      day_of_week: Number(editForm.day_of_week),
      start_time: editForm.start_time,
      end_time: editForm.end_time,
      room: editForm.room.trim() || null,
    })

    if (!result.success) {
      toast.error('Update failed', { description: result.error.message })
      setEditSaving(false)
      return
    }

    toast.success('Timetable slot updated')
    setEditSaving(false)
    setEditTarget(null)
    setEditForm(null)
    await loadSlots()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const result = await deleteTimetableSlot(deleteTarget.id)
    if (!result.success) {
      toast.error('Delete failed', { description: result.error.message })
      setDeleting(false)
      return
    }
    toast.success('Timetable slot deleted')
    setDeleting(false)
    setDeleteTarget(null)
    await loadSlots()
  }

  const handleGenerateSessions = async () => {
    if (!selectedTermId) return
    if (!genStart || !genEnd) {
      toast.error('Pick a start and end date')
      return
    }
    if (genStart > genEnd) {
      toast.error('Start date must be before end date')
      return
    }
    setGenSaving(true)
    try {
      const result = await withTimeout(
        generateLessonSessions(selectedTermId, genStart, genEnd),
        60_000,
        'Session generation timed out. Please check server logs and refresh.'
      )
      if (!result.success) {
        toast.error('Generation failed', { description: result.error.message })
        return
      }

      toast.success('Sessions generated', { description: `${result.created} created. ${result.message}` })
      setGenOpen(false)
    } catch (error) {
      toast.error('Generation failed', { description: getErrorMessage(error, 'Unable to generate sessions.') })
    } finally {
      setGenSaving(false)
    }
  }

  const handleSeedSeniorSubjects = async () => {
    setSeedSaving(true)
    try {
      const result = await withTimeout(
        seedSeniorSchoolSubjects(),
        60_000,
        'Subject seeding timed out. Please check server logs and refresh.'
      )
      if (!result.success) {
        toast.error('Seed failed', { description: result.error.message })
        return
      }
      toast.success('Senior subjects ready', {
        description: `${result.created} new subjects. ${result.assigned} core assignments.`,
      })
      setSeedOpen(false)
      await loadLookups()
    } catch (error) {
      toast.error('Seed failed', { description: getErrorMessage(error, 'Unable to seed senior subjects.') })
    } finally {
      setSeedSaving(false)
    }
  }

  const handleSeedKerichoTeachers = async () => {
    setSeedTeachersSaving(true)
    try {
      const result = await withTimeout(
        seedKerichoTeachersAndAssignments(),
        60_000,
        'Teacher seeding timed out. Please check server logs and refresh.'
      )
      if (!result.success) {
        toast.error('Seeding failed', { description: result.error.message })
        return
      }
      toast.success('Teachers seeded', {
        description: `${result.created} created, ${result.existing} existing. ${result.assignments} assignments.`,
      })
      setSeedTeachersOpen(false)
      await loadLookups()
    } catch (error) {
      toast.error('Seeding failed', { description: getErrorMessage(error, 'Unable to seed teachers.') })
    } finally {
      setSeedTeachersSaving(false)
    }
  }

  const handleAutoBuild = async () => {
    if (!selectedTermId) {
      toast.error('Select an academic term first')
      return
    }
    if (autoScope === 'core' && missingCore.length > 0) {
      toast.error('Core subjects missing', { description: `Seed core subjects first: ${missingCore.join(', ')}` })
      return
    }
    if (autoScope === 'full' && autoElectives.length !== 3) {
      toast.error('Select exactly 3 electives for the pathway')
      return
    }
    setAutoSaving(true)
    try {
      const result = await withTimeout(
        generateSeniorSchoolTimetable({
          academic_term_id: selectedTermId,
          start_time: autoEffectiveStart,
          period_minutes: autoPeriodMinutes,
          periods_per_day: autoEffectivePeriodsPerDay,
          day_template: autoDayTemplate,
          max_periods_per_teacher_week: autoMaxTeacherPeriods,
          subject_scope: autoScope,
          elective_subject_ids: autoScope === 'full' ? autoElectives : undefined,
          fallback_teacher_by_subject: autoTeacherMap,
        }),
        60_000,
        'Timetable build timed out. Please check server logs and refresh.'
      )

      if (!result.success) {
        toast.error('Auto-build failed', { description: result.error.message })
        return
      }

      toast.success('Starter timetable created', {
        description: `${result.created} slots. Skipped ${result.skipped} (missing teacher: ${result.skipped_missing_teacher}, conflict: ${result.skipped_conflict}, workload cap: ${result.skipped_workload_cap}).`,
      })
      setAutoOpen(false)
      await loadSlots()
    } catch (error) {
      toast.error('Auto-build failed', { description: getErrorMessage(error, 'Unable to build timetable.') })
    } finally {
      setAutoSaving(false)
    }
  }

  const getDownloadFileName = useCallback(
    (label: string) => {
      const termLabel = currentTerm ? `${currentTerm.year}_T${currentTerm.term}` : 'term'
      return `timetable_${termLabel}_${label}.pdf`
    },
    [currentTerm]
  )

  const formatSlotForMode = useCallback(
    (slot: TimetableSlotWithRefs, mode: 'class' | 'teacher' | 'full') => {
      if (mode === 'class') {
        return `${subjectCodeLabel(slot)}\n${teacherShortLabel(slot)}`
      }
      if (mode === 'teacher') {
        return `${classLabel(slot.class_id)}\n${subjectCodeLabel(slot)}`
      }
      return `${classLabel(slot.class_id)}\n${subjectLabel(slot.subject_id)}\n${teacherLabel(slot)}`
    },
    [classLabel, subjectLabel, teacherLabel, teacherShortLabel, subjectCodeLabel]
  )

  const buildWeekRows = useCallback(
    (items: TimetableSlotWithRefs[], mode: 'class' | 'teacher' | 'full') => {
      const rows = buildTimeRows(items)
      const slotMap = new Map<string, TimetableSlotWithRefs[]>()

      items.forEach((slot) => {
        const key = `${slot.day_of_week}-${slot.start_time}-${slot.end_time}`
        const existing = slotMap.get(key) ?? []
        existing.push(slot)
        slotMap.set(key, existing)
      })

      return rows.map((row) => {
        const cells: Record<string, string> = {}
        if (!row.isBreak) {
          DAYS.forEach((day) => {
            const key = `${day.value}-${row.start}-${row.end}`
            const matches = slotMap.get(key) ?? []
            cells[day.value] = matches.map((slot) => formatSlotForMode(slot, mode)).join('\n')
          })
        }
        return { ...row, cells }
      })
    },
    [formatSlotForMode]
  )

  const weekRows = useMemo(() => buildWeekRows(slots, weekViewMode), [buildWeekRows, slots, weekViewMode])

  const buildPdfMatrix = useCallback(
    (items: TimetableSlotWithRefs[], mode: 'class' | 'teacher' | 'full') => {
      const timeRows = buildTimeRows(items)
      const slotMap = new Map<string, TimetableSlotWithRefs[]>()

      items.forEach((slot) => {
        const key = `${slot.day_of_week}-${slot.start_time}-${slot.end_time}`
        const existing = slotMap.get(key) ?? []
        existing.push(slot)
        slotMap.set(key, existing)
      })

      const breakColumnIndexes = new Set<number>()
      const head = ['Day', ...timeRows.map((row, index) => {
        if (row.isBreak) breakColumnIndexes.add(index + 1)
        return row.isBreak ? `${row.label}\n${row.breakLabel}` : row.label
      })]

      const body = DAYS.map((day) => {
        const rowCells = timeRows.map((row) => {
          if (row.isBreak) return row.breakLabel
          const key = `${day.value}-${row.start}-${row.end}`
          const matches = slotMap.get(key) ?? []
          return matches.map((slot) => formatSlotForMode(slot, mode)).join('\n')
        })
        return [day.label, ...rowCells]
      })

      return { head, body, breakColumnIndexes }
    },
    [formatSlotForMode]
  )

  const renderPdfTable = useCallback(
    async (
      doc: any,
      autoTable: any,
      items: TimetableSlotWithRefs[],
      title: string,
      subtitle: string,
      mode: 'class' | 'teacher' | 'full'
    ) => {
      const { head, body, breakColumnIndexes } = buildPdfMatrix(items, mode)
      const logoUrl = schoolProfile?.logo_url ?? ''
      const hasLogo = logoUrl.startsWith('data:image/jpeg') || logoUrl.startsWith('data:image/jpg')
      const titleX = hasLogo ? 96 : 40

      if (hasLogo) {
        try {
          doc.addImage(logoUrl, 'JPEG', 40, 22, 44, 44)
        } catch {
          // Ignore logo rendering errors to avoid breaking the PDF.
        }
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(17)
      doc.text(title, titleX, 36)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10.5)
      doc.text(subtitle, titleX, 56)

      autoTable(doc, {
        startY: 72,
        head: [head],
        body,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 5, valign: 'top', lineWidth: 0.6, lineColor: [220, 220, 220] },
        headStyles: { fillColor: [25, 25, 25], textColor: 255, fontStyle: 'bold', halign: 'center' },
        alternateRowStyles: { fillColor: [252, 252, 252] },
        columnStyles: {
          0: { fillColor: [245, 245, 245], fontStyle: 'bold', cellWidth: 70 },
        },
        didParseCell: (data: any) => {
          if (data.section === 'head' && breakColumnIndexes.has(data.column.index)) {
            data.cell.styles.fillColor = [230, 230, 230]
            data.cell.styles.textColor = [70, 70, 70]
          }
          if (data.section === 'body' && breakColumnIndexes.has(data.column.index)) {
            data.cell.styles.fillColor = [245, 245, 245]
            data.cell.styles.textColor = [80, 80, 80]
            data.cell.styles.fontStyle = 'bold'
          }
          if (data.section === 'body' && data.column.index === 0) {
            data.cell.styles.fillColor = [245, 245, 245]
            data.cell.styles.fontStyle = 'bold'
          }
        },
      })
    },
    [buildPdfMatrix, schoolProfile]
  )

  const downloadPdf = useCallback(
    async (
      groups: Array<{ label: string; items: TimetableSlotWithRefs[] }>,
      filename: string,
      subtitle: string,
      mode: 'class' | 'teacher' | 'full'
    ) => {
      const { jsPDF } = await import('jspdf')
      const autoTableModule: any = await import('jspdf-autotable')
      const autoTable = autoTableModule.default ?? autoTableModule

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
      let isFirst = true

      for (const group of groups) {
        if (!isFirst) doc.addPage()
        const title = `Weekly Timetable - ${group.label}`
        await renderPdfTable(doc, autoTable, group.items, title, subtitle, mode)
        isFirst = false
      }

      doc.save(filename)
    },
    [renderPdfTable]
  )

  const handleDownloadFull = async () => {
    if (!selectedTermId) {
      toast.error('Select an academic term first')
      return
    }
    setDownloading('full')
    const classFilter = filterClassId !== 'all' ? filterClassId : undefined
    const result = await getTimetableSlots({
      academicTermId: selectedTermId,
      classId: classFilter,
    })
    if (!result.success) {
      toast.error('Download failed', { description: result.error.message })
      setDownloading('none')
      return
    }
    const slotsToUse = result.slots
    if (slotsToUse.length === 0) {
      toast.error('No timetable slots available to download')
      setDownloading('none')
      return
    }

    const subtitle = currentTerm
      ? `Term: ${currentTerm.year} T${currentTerm.term}${currentTerm.is_current ? ' (Current)' : ''}`
      : 'Term: Not set'

    let groups: Array<{ label: string; items: TimetableSlotWithRefs[] }>
    if (classFilter) {
      groups = [{ label: classLabel(classFilter), items: slotsToUse }]
    } else {
      const groupMap = new Map<string, TimetableSlotWithRefs[]>()
      slotsToUse.forEach((slot) => {
        const key = slot.class_id
        const existing = groupMap.get(key) ?? []
        existing.push(slot)
        groupMap.set(key, existing)
      })

      groups = Array.from(groupMap.entries())
        .map(([classId, items]) => ({ label: classLabel(classId), items }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }

    const filenameBase = classFilter
      ? sanitizeFilename(`Class_Weekly_Timetable_${classLabel(classFilter)}`)
      : 'full_weekly'

    await downloadPdf(groups, getDownloadFileName(filenameBase), subtitle, 'class')
    setDownloading('none')
  }

  const handleDownloadTeacher = async () => {
    if (!selectedTermId) {
      toast.error('Select an academic term first')
      return
    }
    if (canManage && filterTeacherId === 'all') {
      toast.error('Select a teacher to download their timetable')
      return
    }
    setDownloading('teacher')
    const result = await getTimetableSlots({
      academicTermId: selectedTermId,
      teacherId: canManage ? filterTeacherId : undefined,
    })
    if (!result.success) {
      toast.error('Download failed', { description: result.error.message })
      setDownloading('none')
      return
    }
  const teacherLabel = canManage
      ? teachers.find((t) => t.id === filterTeacherId)?.label ?? 'Teacher'
      : result.slots[0]?.teachers?.users
        ? `${result.slots[0].teachers.users.first_name} ${result.slots[0].teachers.users.last_name}`
        : 'Teacher'
    const teacherName = stripEmailLabel(teacherLabel)
    const honorific = result.slots[0]?.teachers?.users?.honorific?.trim() || getHonorificFromName(teacherName)
    const titledName = `${honorific} ${teacherName}`.trim()
    if (result.slots.length === 0) {
      toast.error('No timetable slots available to download')
      setDownloading('none')
      return
    }
    const subtitle = currentTerm
      ? `Term: ${currentTerm.year} T${currentTerm.term}${currentTerm.is_current ? ' (Current)' : ''}`
      : 'Term: Not set'
    const filenameBase = sanitizeFilename(`${honorific}_Weekly_Timetable_${teacherName}`)
    await downloadPdf(
      [{ label: titledName, items: result.slots }],
      getDownloadFileName(filenameBase),
      subtitle,
      'teacher'
    )
    setDownloading('none')
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label>Academic term</Label>
              <Select value={selectedTermId} onValueChange={setSelectedTermId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.year} T{t.term} {t.is_current ? '(Current)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={filterClassId} onValueChange={setFilterClassId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {classes
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {canManage ? (
              <div className="space-y-2">
                <Label>Teacher</Label>
                <Select value={filterTeacherId} onValueChange={setFilterTeacherId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All teachers</SelectItem>
                    {teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => void handleDownloadFull()}
                disabled={!selectedTermId || downloading !== 'none'}
              >
                <Download className="h-4 w-4" />
                {downloading === 'full'
                  ? 'Preparing PDF...'
                  : filterClassId !== 'all'
                    ? 'Download class PDF'
                    : 'Download full PDF'}
              </Button>
            ) : null}

            <Button
              variant="outline"
              className="gap-2"
              onClick={() => void handleDownloadTeacher()}
              disabled={!selectedTermId || (canManage && filterTeacherId === 'all') || downloading !== 'none'}
            >
              <Download className="h-4 w-4" />
              {downloading === 'teacher'
                ? 'Preparing PDF...'
                : canManage
                  ? 'Download teacher PDF'
                  : 'Download my PDF'}
            </Button>

          {canManage ? (
            <Dialog open={seedOpen} onOpenChange={setSeedOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Seed Senior subjects
                </Button>
              </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Seed Senior School subjects (G10-12)</DialogTitle>
                    <DialogDescription>
                      Creates the CBC Senior School subject catalog (core + electives) and assigns core subjects to all
                      active Grade 10-12 classes. Electives are created but not assigned.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSeedOpen(false)} disabled={seedSaving}>
                      Cancel
                    </Button>
                    <Button onClick={() => void handleSeedSeniorSubjects()} disabled={seedSaving}>
                      {seedSaving ? 'Seeding...' : 'Seed subjects'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}

          {canManage ? (
            <Dialog
              open={autoOpen}
              onOpenChange={(open) => {
                setAutoOpen(open)
                if (open) setAutoStep(1)
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={!selectedTermId}>
                  <Wand2 className="h-4 w-4" />
                  Auto-build (G10-12)
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl p-0 overflow-hidden">
                <div className="grid h-[85vh] grid-cols-1 lg:grid-cols-[1.5fr_0.9fr]">
                  <div className="flex flex-col overflow-hidden">
                    <div className="border-b border-border/60 p-6">
                      <DialogHeader>
                        <DialogTitle>Auto-build Senior timetable</DialogTitle>
                        <DialogDescription>
                          Create a full starter timetable for Grade 10-12. You can edit every slot after generation.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {[1, 2, 3].map((step) => {
                          const blocked =
                            (step === 2 && !step1Valid) ||
                            (step === 3 && !canGoStep3)
                          return (
                            <button
                              key={step}
                              type="button"
                              onClick={() => (!blocked ? setAutoStep(step as 1 | 2 | 3) : null)}
                              disabled={blocked}
                              className={
                                autoStep === step
                                  ? 'rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary'
                                  : blocked
                                    ? 'rounded-full border border-border/60 bg-background/50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/60 cursor-not-allowed'
                                    : 'rounded-full border border-border/60 bg-background/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground'
                              }
                            >
                              Step {step}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      {autoStep === 1 ? (
                        <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Day structure</div>
                          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Day template</Label>
                              <Select
                                value={autoDayTemplate}
                                onValueChange={(value) => setAutoDayTemplate(value as 'kenya_fixed' | 'continuous')}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="kenya_fixed">Kenyan fixed day (with break + lunch)</SelectItem>
                                  <SelectItem value="continuous">Custom continuous day</SelectItem>
                                </SelectContent>
                              </Select>
                              <div className="text-xs text-muted-foreground">
                                Use fixed template for real-school timing or continuous mode for manual schedules.
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label>Period length (min)</Label>
                              <Input
                                type="number"
                                min={20}
                                max={120}
                                value={autoPeriodMinutes}
                                onChange={(e) => setAutoPeriodMinutes(Number(e.target.value))}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Max teacher periods / week</Label>
                              <Input
                                type="number"
                                min={1}
                                max={60}
                                value={autoMaxTeacherPeriods}
                                onChange={(e) => setAutoMaxTeacherPeriods(Number(e.target.value))}
                              />
                            </div>

                            {autoDayTemplate === 'continuous' ? (
                              <>
                                <div className="space-y-2">
                                  <Label>Start time</Label>
                                  <Input type="time" value={autoStart} onChange={(e) => setAutoStart(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                  <Label>Periods per day</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={12}
                                    value={autoPeriodsPerDay}
                                    onChange={(e) => setAutoPeriodsPerDay(Number(e.target.value))}
                                  />
                                </div>
                              </>
                            ) : (
                              <div className="rounded-xl border border-border/60 bg-card/70 p-3 text-sm text-muted-foreground lg:col-span-2">
                                <div className="font-medium text-foreground">Fixed school day</div>
                                <div className="mt-1">
                                  07:30-10:30 classes, 10:30-11:00 break, 11:00-13:00 classes, 13:00-14:00 lunch,
                                  14:00-16:00 classes.
                                </div>
                                <div className="mt-1">Auto-generated periods/day: {autoEffectivePeriodsPerDay}</div>
                              </div>
                            )}
                          </div>
                          {!step1Valid ? (
                            <div className="mt-3 text-xs text-amber-600">
                              {autoDayTemplate === 'kenya_fixed'
                                ? 'Set period length 20–120, teacher cap 1–60, and produce 1–12 periods in fixed blocks.'
                                : 'Enter start time, 1–12 periods/day, period length 20–120, and teacher cap 1–60.'}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {autoStep === 2 ? (
                        <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Curriculum scope</div>
                            <div className="text-xs text-muted-foreground">Step 2 of 3</div>
                          </div>

                          <div className="mt-4 grid gap-4 lg:grid-cols-[240px_1fr]">
                            <div className="space-y-3">
                              <div className="space-y-2">
                                <Label>Scope</Label>
                                <Select value={autoScope} onValueChange={(v) => setAutoScope(v as 'core' | 'assigned' | 'full')}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="core">Core only (ENG/KIS/MATH/CSL)</SelectItem>
                                    <SelectItem value="full">Full (core + 3 electives)</SelectItem>
                                    <SelectItem value="assigned">Use class subject assignments</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {autoScope === 'full' ? (
                                <div className="space-y-2">
                                  <Label>Pathway</Label>
                                  <Select
                                    value={autoPathway}
                                    onValueChange={(v) => setAutoPathway(v as 'STEM' | 'SOCIAL' | 'ARTS')}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="STEM">STEM</SelectItem>
                                      <SelectItem value="SOCIAL">Social Sciences</SelectItem>
                                      <SelectItem value="ARTS">Arts & Sports</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              ) : null}

                              {autoScope === 'assigned' ? (
                                <div className="rounded-xl border border-border/60 bg-background/60 p-3 text-sm text-muted-foreground">
                                  Uses class subject assignments for G10-12. If none are set, no slots will be generated.
                                </div>
                              ) : autoScope === 'core' ? (
                                <div className="rounded-xl border border-border/60 bg-background/60 p-3 text-sm text-muted-foreground">
                                  Core-only mode skips electives and uses ENG/KIS/MATH/CSL.
                                </div>
                              ) : null}
                            </div>

                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label>Electives (select 3)</Label>
                                <span className="text-xs text-muted-foreground">{autoElectives.length} / 3 selected</span>
                              </div>

                              {autoScope !== 'full' ? (
                                <div className="rounded-xl border border-border/60 bg-background/60 p-4 text-sm text-muted-foreground">
                                  Electives are disabled unless you choose "Full (core + 3 electives)".
                                </div>
                              ) : pathwayElectives.length === 0 ? (
                                <div className="text-sm text-destructive">
                                  No electives found for this pathway. Seed Senior subjects first.
                                </div>
                              ) : (
                                <>
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {pathwayElectives.map((subject) => {
                                      const checked = autoElectives.includes(subject.id)
                                      const disabled = !checked && autoElectives.length >= 3
                                      return (
                                        <label
                                          key={subject.id}
                                          className={
                                            checked
                                              ? 'flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary'
                                              : 'flex items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm text-foreground'
                                          }
                                        >
                                          <Checkbox
                                            checked={checked}
                                            disabled={disabled}
                                            onCheckedChange={(value) => {
                                              const isChecked = value === true
                                              setAutoElectives((prev) => {
                                                if (isChecked) {
                                                  if (prev.includes(subject.id) || prev.length >= 3) return prev
                                                  return [...prev, subject.id]
                                                }
                                                return prev.filter((id) => id !== subject.id)
                                              })
                                            }}
                                          />
                                          {subject.name}
                                        </label>
                                      )
                                    })}
                                  </div>
                                  {!electivesReady ? (
                                    <div className="text-xs text-amber-600">Select exactly 3 electives to continue.</div>
                                  ) : null}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {autoStep === 3 ? (
                        <div className="rounded-2xl border border-border/60 bg-background/60 p-4 space-y-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Fallback teachers</div>
                          <div className="text-sm text-muted-foreground">
                            Assign fallback teachers for selected subjects (used if no explicit teacher assignment exists).
                          </div>
                          {missingCore.length > 0 ? (
                            <div className="text-sm text-destructive">
                              Missing core subjects: {missingCore.join(', ')}. Use "Seed Senior subjects" first.
                            </div>
                          ) : null}
                          {autoScope === 'assigned' ? (
                            <div className="rounded-xl border border-border/60 bg-background/60 p-3 text-sm text-muted-foreground">
                              Fallbacks are skipped because you selected class subject assignments.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {fallbackSubjects.map((subject) => (
                                <div key={subject.id} className="space-y-2">
                                  <Label>{subject.name}</Label>
                                  <Select
                                    value={autoTeacherMap[subject.id] ?? 'none'}
                                    onValueChange={(v) =>
                                      setAutoTeacherMap((prev) => {
                                        const next = { ...prev }
                                        if (v === 'none') delete next[subject.id]
                                        else next[subject.id] = v
                                        return next
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No fallback teacher</SelectItem>
                                      {teachers.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                          {t.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="sticky bottom-0 border-t border-border/60 bg-card/95 p-4 backdrop-blur">
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAutoOpen(false)} disabled={autoSaving}>
                          Cancel
                        </Button>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setAutoStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3) : prev))}
                            disabled={autoStep === 1}
                          >
                            Back
                          </Button>
                          {autoStep < 3 ? (
                            <Button
                              onClick={() => setAutoStep((prev) => (prev + 1) as 1 | 2 | 3)}
                              disabled={(autoStep === 1 && !step1Valid) || (autoStep === 2 && !electivesReady)}
                            >
                              Next
                            </Button>
                          ) : (
                            <Button onClick={() => void handleAutoBuild()} disabled={autoSaving}>
                              {autoSaving ? 'Building...' : 'Build timetable'}
                            </Button>
                          )}
                        </div>
                      </DialogFooter>
                    </div>
                  </div>

                  <div className="border-l border-border/60 bg-muted/20 p-6 space-y-4 overflow-y-auto">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Summary</div>
                    <div className="rounded-2xl border border-border/60 bg-background/70 p-4 space-y-3">
                      <div className="text-sm font-semibold">Scope</div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{autoScope === 'assigned' ? 'Assigned' : autoScope === 'core' ? 'Core only' : 'Full'}</Badge>
                        <Badge variant="outline">{autoEffectivePeriodsPerDay} periods/day</Badge>
                        <Badge variant="outline">{autoPeriodMinutes} min</Badge>
                        <Badge variant="outline">Teacher cap {autoMaxTeacherPeriods}/week</Badge>
                        <Badge variant="outline">{autoDayTemplate === 'kenya_fixed' ? 'Fixed day template' : 'Continuous day'}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">Start time: {autoEffectiveStart}</div>
                      {autoDayTemplate === 'kenya_fixed' ? (
                        <div className="text-xs text-muted-foreground">
                          Breaks: 09:40-09:50, 11:10-11:40, 13:00-14:00, 15:20-16:45
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-background/70 p-4 space-y-2">
                      <div className="text-sm font-semibold">Coverage</div>
                      <div className="text-sm text-muted-foreground">Senior classes: {seniorClasses.length}</div>
                      <div className="text-sm text-muted-foreground">Subjects selected: {fallbackSubjects.length}</div>
                      {autoScope === 'full' ? (
                        <div className="text-sm text-muted-foreground">Electives selected: {autoElectives.length}</div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
                      Tip: This creates a starter grid only. You can edit, move or delete any slot after generation.
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}

          {canManage ? (
            <Dialog open={seedTeachersOpen} onOpenChange={setSeedTeachersOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Seed Kericho teachers
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Seed Kericho teachers</DialogTitle>
                  <DialogDescription>
                    Creates 14 teachers (70/30 male-female) and assigns subjects to Grade 10-12 for the current term.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                    Default password: <span className="font-medium text-foreground">Kericho2026!</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Subjects: ENG, KIS, MATH, CSL, BIO, CHEM, PHY, HIST, GEO, CRE, BUS, AGR, COMP, LIT, PE, ICT</li>
                    <li>Assignments created per class and term (teacher_class_assignments)</li>
                  </ul>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setSeedTeachersOpen(false)} disabled={seedTeachersSaving}>
                    Cancel
                  </Button>
                  <Button onClick={() => void handleSeedKerichoTeachers()} disabled={seedTeachersSaving}>
                    {seedTeachersSaving ? 'Seeding...' : 'Seed teachers'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}

          {canManage ? (
            <Dialog open={genOpen} onOpenChange={setGenOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={!selectedTermId}>
                  <Wand2 className="h-4 w-4" />
                  Generate sessions
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Generate lesson sessions</DialogTitle>
                  <DialogDescription>
                    Creates lesson sessions from timetable slots for a date range (idempotent).
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="gen-start">Start date</Label>
                    <Input id="gen-start" type="date" value={genStart} onChange={(e) => setGenStart(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gen-end">End date</Label>
                    <Input id="gen-end" type="date" value={genEnd} onChange={(e) => setGenEnd(e.target.value)} />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setGenOpen(false)} disabled={genSaving}>
                    Cancel
                  </Button>
                  <Button onClick={() => void handleGenerateSessions()} disabled={genSaving}>
                    {genSaving ? 'Generating...' : 'Generate'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}

          {canManage ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" disabled={!canCreate}>
                  <Plus className="h-4 w-4" />
                  Add slot
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create timetable slot</DialogTitle>
                  <DialogDescription>Add a recurring lesson slot for the selected term.</DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Teacher</Label>
                    <Select
                      value={createForm.teacher_id}
                      onValueChange={(v) => setCreateForm((p) => ({ ...p, teacher_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select teacher" />
                      </SelectTrigger>
                      <SelectContent>
                        {teachers.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select value={createForm.class_id} onValueChange={(v) => setCreateForm((p) => ({ ...p, class_id: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes
                          .filter((c) => c.is_active)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Select
                      value={createForm.subject_id}
                      onValueChange={(v) => setCreateForm((p) => ({ ...p, subject_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.code} - {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Day</Label>
                    <Select
                      value={createForm.day_of_week}
                      onValueChange={(v) => setCreateForm((p) => ({ ...p, day_of_week: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="start-time">Start time</Label>
                    <Input
                      id="start-time"
                      type="time"
                      value={createForm.start_time}
                      onChange={(e) => setCreateForm((p) => ({ ...p, start_time: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end-time">End time</Label>
                    <Input
                      id="end-time"
                      type="time"
                      value={createForm.end_time}
                      onChange={(e) => setCreateForm((p) => ({ ...p, end_time: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="room">Room (optional)</Label>
                    <Input
                      id="room"
                      value={createForm.room}
                      onChange={(e) => setCreateForm((p) => ({ ...p, room: e.target.value }))}
                      placeholder="e.g., Lab 1"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                    Cancel
                  </Button>
                  <Button onClick={() => void handleCreate()} disabled={creating}>
                    {creating ? 'Creating...' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1">
          {currentTerm
            ? `Term: ${currentTerm.year} T${currentTerm.term}${currentTerm.is_current ? ' (Current)' : ''}`
            : 'Term: Not set'}
        </span>
        <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1">
          Slots: {loading ? '...' : slots.length}
        </span>
        <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1">
          Class filter: {filterClassId === 'all' ? 'All classes' : classLabel(filterClassId)}
        </span>
        {canManage ? (
          <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1">
            Teacher filter:{' '}
            {filterTeacherId === 'all'
              ? 'All teachers'
              : teachers.find((t) => t.id === filterTeacherId)?.label ?? 'Selected'}
          </span>
        ) : null}
      </div>

      {terms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-12 text-center">
          <p className="text-muted-foreground">No academic terms yet. Create one in Settings to enable timetables.</p>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
          Loading timetable...
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-12 text-center">
          <p className="text-muted-foreground">No timetable slots found for this term.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {showWeekView ? (
            <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Weekly view</div>
                  <div className="text-xs text-muted-foreground">
                    Breaks included: 10:30-11:00 and 13:00-14:00
                  </div>
                </div>
                <Badge variant="outline">Read-only</Badge>
              </div>
              <div className="mt-4 overflow-auto">
                <div className="min-w-[920px]">
                  <div className="grid grid-cols-[140px_repeat(5,minmax(0,1fr))] border-b border-border/60 bg-muted/40">
                    <div className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Time</div>
                    {DAYS.map((day) => (
                      <div key={day.value} className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                        {day.label}
                      </div>
                    ))}
                  </div>
                  {weekRows.map((row) => (
                    <div
                      key={`${row.start}-${row.end}-${row.isBreak ? 'break' : 'slot'}`}
                      className={`grid grid-cols-[140px_repeat(5,minmax(0,1fr))] border-b border-border/60 ${
                        row.isBreak ? 'bg-muted/30' : 'bg-background/60'
                      }`}
                    >
                      <div className="px-3 py-2 text-xs font-medium text-muted-foreground">{row.label}</div>
                      {DAYS.map((day) => (
                        <div key={day.value} className="px-3 py-2 text-xs whitespace-pre-line">
                          {row.isBreak ? row.breakLabel : row.cells[day.value] || '—'}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slot</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {slots.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{slotLabel(s)}</TableCell>
                    <TableCell>{classLabel(s.class_id)}</TableCell>
                    <TableCell>{subjectLabel(s.subject_id)}</TableCell>
                    <TableCell className="text-muted-foreground">{teacherLabel(s)}</TableCell>
                    <TableCell className="text-muted-foreground">{s.room || '-'}</TableCell>
                    <TableCell>{s ? <Badge variant="outline">OK</Badge> : null}</TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(s)} aria-label="Edit slot">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setDeleteTarget(s)}
                            aria-label="Delete slot"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null)
            setEditForm(null)
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          {editTarget && editForm ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit slot</DialogTitle>
                <DialogDescription>{slotLabel(editTarget)}</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Teacher</Label>
                  <Select value={editForm.teacher_id} onValueChange={(v) => setEditForm((p) => (p ? { ...p, teacher_id: v } : p))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Class</Label>
                  <Select value={editForm.class_id} onValueChange={(v) => setEditForm((p) => (p ? { ...p, class_id: v } : p))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {classes
                        .filter((c) => c.is_active)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Select value={editForm.subject_id} onValueChange={(v) => setEditForm((p) => (p ? { ...p, subject_id: v } : p))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.code} - {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Day</Label>
                  <Select value={editForm.day_of_week} onValueChange={(v) => setEditForm((p) => (p ? { ...p, day_of_week: v } : p))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Start time</Label>
                  <Input type="time" value={editForm.start_time} onChange={(e) => setEditForm((p) => (p ? { ...p, start_time: e.target.value } : p))} />
                </div>
                <div className="space-y-2">
                  <Label>End time</Label>
                  <Input type="time" value={editForm.end_time} onChange={(e) => setEditForm((p) => (p ? { ...p, end_time: e.target.value } : p))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Room</Label>
                  <Input value={editForm.room} onChange={(e) => setEditForm((p) => (p ? { ...p, room: e.target.value } : p))} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editSaving}>
                  Cancel
                </Button>
                <Button onClick={() => void handleEdit()} disabled={editSaving}>
                  {editSaving ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          {deleteTarget ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete timetable slot</AlertDialogTitle>
                <AlertDialogDescription>{slotLabel(deleteTarget)}</AlertDialogDescription>
              </AlertDialogHeader>

              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleDelete()} disabled={deleting}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}


