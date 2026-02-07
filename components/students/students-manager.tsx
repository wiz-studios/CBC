'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Edit, Plus, RefreshCcw } from 'lucide-react'

import type { Database } from '@/lib/supabase/types'
import { getClasses } from '@/lib/actions/classes'
import { getAcademicTerms } from '@/lib/actions/terms'
import { createStudent, getStudents, importStudentsCsv, updateStudent } from '@/lib/actions/students'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

type StudentRow = Database['public']['Tables']['students']['Row']
type ClassRow = Database['public']['Tables']['classes']['Row']
type TermRow = Database['public']['Tables']['academic_terms']['Row']

type StudentForm = {
  admission_number: string
  first_name: string
  last_name: string
  gender: string
  date_of_birth: string
  class_id: string
  academic_term_id: string
}

type ImportSummary = {
  inserted: number
  skipped: number
  errors: Array<{ row: number; admission_number?: string; message: string }>
  compulsoryAssigned: boolean
}

const EMPTY_FORM: StudentForm = {
  admission_number: '',
  first_name: '',
  last_name: '',
  gender: '',
  date_of_birth: '',
  class_id: '',
  academic_term_id: '',
}

function formatTerm(term: TermRow): string {
  const fallbackName = term.term_name?.trim() ? term.term_name.trim() : `T${term.term}`
  return `${term.year} ${fallbackName}${term.is_current ? ' (Current)' : ''}`
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let row: string[] = []
  let inQuotes = false

  const pushField = () => {
    row.push(current)
    current = ''
  }

  const pushRow = () => {
    if (row.length === 1 && row[0].trim() === '') {
      row = []
      return
    }
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"') {
      const next = text[i + 1]
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      pushField()
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      pushField()
      pushRow()
      continue
    }

    current += char
  }

  pushField()
  if (row.length > 0) pushRow()

  return rows
}

export function StudentsManager({ canManage }: { canManage: boolean }) {
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [terms, setTerms] = useState<TermRow[]>([])

  const [query, setQuery] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [termFilter, setTermFilter] = useState('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState<StudentForm>(EMPTY_FORM)

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTarget, setEditTarget] = useState<StudentRow | null>(null)
  const [editForm, setEditForm] = useState<StudentForm>(EMPTY_FORM)

  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [importForm, setImportForm] = useState({
    class_id: '',
    academic_term_id: '',
    auto_assign_compulsory: true,
    file: null as File | null,
  })

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [groupedView, setGroupedView] = useState(true)
  const [compactView, setCompactView] = useState(false)
  const [openGroups, setOpenGroups] = useState<string[]>([])
  const groupRefs = useRef(new Map<string, HTMLDivElement | null>())

  const classById = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes])
  const termById = useMemo(() => new Map(terms.map((row) => [row.id, row])), [terms])

  const hydrateDefaults = useCallback(
    (draft: StudentForm): StudentForm => {
      const currentTerm = terms.find((term) => term.is_current)
      return {
        ...draft,
        class_id: draft.class_id || classes[0]?.id || '',
        academic_term_id: draft.academic_term_id || currentTerm?.id || terms[0]?.id || '',
      }
    },
    [classes, terms]
  )

  const hydrateImportDefaults = useCallback(() => {
    const currentTerm = terms.find((term) => term.is_current)
    return {
      class_id: classes[0]?.id || '',
      academic_term_id: currentTerm?.id || terms[0]?.id || '',
      auto_assign_compulsory: true,
      file: null as File | null,
    }
  }, [classes, terms])

  const loadOptions = useCallback(async () => {
    const [classesResult, termsResult] = await Promise.all([getClasses({ includeInactive: false }), getAcademicTerms()])

    if (!classesResult.success) {
      toast.error('Failed to load classes', { description: classesResult.error.message })
      setClasses([])
    } else {
      setClasses(classesResult.classes)
    }

    if (!termsResult.success) {
      toast.error('Failed to load terms', { description: termsResult.error.message })
      setTerms([])
    } else {
      setTerms(termsResult.terms)
    }

    return {
      classCount: classesResult.success ? classesResult.classes.length : 0,
      termCount: termsResult.success ? termsResult.terms.length : 0,
    }
  }, [])

  const loadStudents = useCallback(async () => {
    setLoading(true)
    const result = await getStudents({
      query: query.trim() || undefined,
      classId: classFilter,
      termId: termFilter,
    })

    if (!result.success) {
      toast.error('Failed to load students', { description: result.error.message })
      setStudents([])
      setLoading(false)
      return
    }

    setStudents(result.students)
    setLoading(false)
  }, [classFilter, query, termFilter])

  const reloadAll = useCallback(async () => {
    setLoading(true)
    await loadOptions()
    await loadStudents()
  }, [loadOptions, loadStudents])

  useEffect(() => {
    void reloadAll()
  }, [reloadAll])

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadStudents()
    }, 250)
    return () => clearTimeout(handle)
  }, [loadStudents])

  useEffect(() => {
    setPage(1)
  }, [query, classFilter, termFilter, pageSize, groupedView])

  useEffect(() => {
    setCreateForm((prev) => hydrateDefaults(prev))
  }, [hydrateDefaults])

  useEffect(() => {
    const defaults = hydrateImportDefaults()
    setImportForm((prev) => ({
      ...prev,
      class_id: prev.class_id || defaults.class_id,
      academic_term_id: prev.academic_term_id || defaults.academic_term_id,
    }))
  }, [hydrateImportDefaults])

  const handleCreate = async () => {
    const payload = {
      admission_number: createForm.admission_number.trim(),
      first_name: createForm.first_name.trim(),
      last_name: createForm.last_name.trim(),
      gender: createForm.gender || null,
      date_of_birth: createForm.date_of_birth || null,
      class_id: createForm.class_id,
      academic_term_id: createForm.academic_term_id,
    }

    if (!payload.admission_number || !payload.first_name || !payload.last_name || !payload.class_id || !payload.academic_term_id) {
      toast.error('Admission number, names, class and term are required')
      return
    }

    setCreating(true)
    const result = await createStudent(payload)
    if (!result.success) {
      toast.error('Failed to add student', { description: result.error.message })
      setCreating(false)
      return
    }

    toast.success('Student added')
    setCreating(false)
    setCreateOpen(false)
    setCreateForm(hydrateDefaults(EMPTY_FORM))
    await loadStudents()
  }

  const openEdit = (row: StudentRow) => {
    setEditTarget(row)
    setEditForm({
      admission_number: row.admission_number,
      first_name: row.first_name,
      last_name: row.last_name,
      gender: row.gender ?? '',
      date_of_birth: row.date_of_birth ?? '',
      class_id: row.class_id,
      academic_term_id: row.academic_term_id,
    })
    setEditOpen(true)
  }

  const handleEdit = async () => {
    if (!editTarget) return

    const payload = {
      first_name: editForm.first_name.trim(),
      last_name: editForm.last_name.trim(),
      gender: editForm.gender || null,
      date_of_birth: editForm.date_of_birth || null,
      class_id: editForm.class_id,
      academic_term_id: editForm.academic_term_id,
    }

    if (!payload.first_name || !payload.last_name || !payload.class_id || !payload.academic_term_id) {
      toast.error('First name, last name, class and term are required')
      return
    }

    setEditing(true)
    const result = await updateStudent(editTarget.id, payload)
    if (!result.success) {
      toast.error('Failed to update student', { description: result.error.message })
      setEditing(false)
      return
    }

    toast.success('Student updated')
    setEditing(false)
    setEditOpen(false)
    setEditTarget(null)
    setEditForm(EMPTY_FORM)
    await loadStudents()
  }

  const handleJumpToGroup = (classId: string) => {
    setOpenGroups((prev) => (prev.includes(classId) ? prev : [...prev, classId]))
    const target = groupRefs.current.get(classId)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const totalCount = students.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(totalCount, currentPage * pageSize)

  const pageSlice = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return students.slice(start, start + pageSize)
  }, [students, currentPage, pageSize])

  const groupedStudents = useMemo(() => {
    if (!groupedView) return []
    const map = new Map<string, StudentRow[]>()
    pageSlice.forEach((student) => {
      const key = student.class_id
      const existing = map.get(key) ?? []
      existing.push(student)
      map.set(key, existing)
    })

    return Array.from(map.entries())
      .map(([classId, rows]) => ({
        classId,
        className: classById.get(classId)?.name || 'Unknown class',
        rows,
      }))
      .sort((a, b) => a.className.localeCompare(b.className))
  }, [groupedView, pageSlice, classById])

  useEffect(() => {
    if (!groupedView) return
    if (groupedStudents.length === 0) {
      setOpenGroups([])
      return
    }

    if (classFilter !== 'all') {
      const match = groupedStudents.find((group) => group.classId === classFilter)
      if (match) {
        setOpenGroups([match.classId])
        return
      }
    }

    setOpenGroups([groupedStudents[0].classId])
  }, [groupedView, groupedStudents, classFilter])

  const handleImport = async () => {
    if (!importForm.file) {
      toast.error('Select a CSV file to import')
      return
    }

    if (!importForm.class_id || !importForm.academic_term_id) {
      toast.error('Select a class and term for this import')
      return
    }

    setImporting(true)
    setImportSummary(null)

    try {
      const rawText = await importForm.file.text()
      const rows = parseCsv(rawText.trim())

      if (rows.length === 0) {
        toast.error('CSV file is empty')
        setImporting(false)
        return
      }

      const headerRow = rows.shift() || []
      const headerMap = headerRow.map((value) => normalizeHeader(value))

      const findHeaderIndex = (aliases: string[]) => {
        for (const alias of aliases) {
          const index = headerMap.indexOf(normalizeHeader(alias))
          if (index >= 0) return index
        }
        return -1
      }

      const admissionIndex = findHeaderIndex(['admission_number', 'admission', 'adm_no', 'admno', 'admissionno'])
      const firstNameIndex = findHeaderIndex(['first_name', 'firstname', 'first'])
      const lastNameIndex = findHeaderIndex(['last_name', 'lastname', 'last', 'surname'])
      const genderIndex = findHeaderIndex(['gender', 'sex'])
      const dobIndex = findHeaderIndex(['date_of_birth', 'dob', 'birth_date', 'birthdate'])

      if (admissionIndex === -1 || firstNameIndex === -1 || lastNameIndex === -1) {
        toast.error('CSV must include admission_number, first_name, last_name columns')
        setImporting(false)
        return
      }

      const payloadRows = rows
        .filter((row) => row.some((cell) => cell.trim() !== ''))
        .map((row) => ({
          admission_number: row[admissionIndex]?.trim() || '',
          first_name: row[firstNameIndex]?.trim() || '',
          last_name: row[lastNameIndex]?.trim() || '',
          gender: genderIndex >= 0 ? row[genderIndex]?.trim() || null : null,
          date_of_birth: dobIndex >= 0 ? row[dobIndex]?.trim() || null : null,
        }))

      const result = await importStudentsCsv({
        class_id: importForm.class_id,
        academic_term_id: importForm.academic_term_id,
        auto_assign_compulsory: importForm.auto_assign_compulsory,
        rows: payloadRows,
      })

      if (!result.success) {
        toast.error('Import failed', { description: result.error.message })
        setImporting(false)
        return
      }

      setImportSummary({
        inserted: result.inserted,
        skipped: result.skipped,
        errors: result.errors,
        compulsoryAssigned: result.compulsoryAssigned,
      })

      if (result.inserted > 0) {
        toast.success(`Imported ${result.inserted} student${result.inserted === 1 ? '' : 's'}`)
        await loadStudents()
      } else {
        toast.error('No students imported', {
          description: result.errors.length ? result.errors[0].message : 'Check your CSV and try again.',
        })
      }
    } catch (error) {
      toast.error('Import failed', { description: 'Could not read the CSV file.' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <Label>Search</Label>
              <Input
                placeholder="Search by admission number or name..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="w-full lg:w-52">
              <Label>Class</Label>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {classes.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full lg:w-52">
              <Label>Academic term</Label>
              <Select value={termFilter} onValueChange={setTermFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All terms</SelectItem>
                  {terms.map((term) => (
                    <SelectItem key={term.id} value={term.id}>
                      {formatTerm(term)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" disabled={classes.length === 0 || terms.length === 0}>
                    <Plus className="h-4 w-4" />
                    Add student
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Add student</DialogTitle>
                    <DialogDescription>Create a student profile and assign class + term.</DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="admission-number">Admission number</Label>
                      <Input
                        id="admission-number"
                        value={createForm.admission_number}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, admission_number: e.target.value }))}
                        disabled={creating}
                        placeholder="e.g. KH-2026-001"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="gender">Gender (optional)</Label>
                      <Select
                        value={createForm.gender || 'UNSPECIFIED'}
                        onValueChange={(value) =>
                          setCreateForm((prev) => ({ ...prev, gender: value === 'UNSPECIFIED' ? '' : value }))
                        }
                        disabled={creating}
                      >
                        <SelectTrigger id="gender">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UNSPECIFIED">Not set</SelectItem>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="first-name">First name</Label>
                      <Input
                        id="first-name"
                        value={createForm.first_name}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, first_name: e.target.value }))}
                        disabled={creating}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="last-name">Last name</Label>
                      <Input
                        id="last-name"
                        value={createForm.last_name}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, last_name: e.target.value }))}
                        disabled={creating}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="student-class">Class</Label>
                      <Select
                        value={createForm.class_id}
                        onValueChange={(value) => setCreateForm((prev) => ({ ...prev, class_id: value }))}
                        disabled={creating}
                      >
                        <SelectTrigger id="student-class">
                          <SelectValue placeholder="Select class" />
                        </SelectTrigger>
                        <SelectContent>
                          {classes.map((row) => (
                            <SelectItem key={row.id} value={row.id}>
                              {row.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="student-term">Academic term</Label>
                      <Select
                        value={createForm.academic_term_id}
                        onValueChange={(value) => setCreateForm((prev) => ({ ...prev, academic_term_id: value }))}
                        disabled={creating}
                      >
                        <SelectTrigger id="student-term">
                          <SelectValue placeholder="Select term" />
                        </SelectTrigger>
                        <SelectContent>
                          {terms.map((term) => (
                            <SelectItem key={term.id} value={term.id}>
                              {formatTerm(term)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="dob">Date of birth (optional)</Label>
                      <Input
                        id="dob"
                        type="date"
                        value={createForm.date_of_birth}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, date_of_birth: e.target.value }))}
                        disabled={creating}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                      Cancel
                    </Button>
                    <Button onClick={() => void handleCreate()} disabled={creating}>
                      {creating ? 'Saving...' : 'Add student'}
                    </Button>
                  </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}

          {canManage ? (
            <Dialog
              open={importOpen}
              onOpenChange={(open) => {
                setImportOpen(open)
                if (open) {
                  setImportSummary(null)
                  setImportForm(hydrateImportDefaults())
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={classes.length === 0 || terms.length === 0}>
                  <Plus className="h-4 w-4" />
                  Import CSV
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Import students (CSV)</DialogTitle>
                  <DialogDescription>Bulk upload students into a selected class and term.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select
                      value={importForm.class_id}
                      onValueChange={(value) => setImportForm((prev) => ({ ...prev, class_id: value }))}
                      disabled={importing}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            {row.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Academic term</Label>
                    <Select
                      value={importForm.academic_term_id}
                      onValueChange={(value) => setImportForm((prev) => ({ ...prev, academic_term_id: value }))}
                      disabled={importing}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select term" />
                      </SelectTrigger>
                      <SelectContent>
                        {terms.map((term) => (
                          <SelectItem key={term.id} value={term.id}>
                            {formatTerm(term)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="import-file">CSV file</Label>
                    <Input
                      id="import-file"
                      type="file"
                      accept=".csv,text/csv"
                      disabled={importing}
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null
                        setImportForm((prev) => ({ ...prev, file }))
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Required columns: admission_number, first_name, last_name. Optional: gender, date_of_birth (YYYY-MM-DD or DD/MM/YYYY).
                    </p>
                  </div>

                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Checkbox
                      id="auto-assign"
                      checked={importForm.auto_assign_compulsory}
                      onCheckedChange={(value) =>
                        setImportForm((prev) => ({ ...prev, auto_assign_compulsory: value === true }))
                      }
                      disabled={importing}
                    />
                    <Label htmlFor="auto-assign" className="text-sm">
                      Auto-assign compulsory subjects after import
                    </Label>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
                  Example row: <span className="font-medium text-foreground">KH-2026-001, Jane, Kiptoo, Female, 2010-02-01</span>
                  <div className="mt-2">
                    <a
                      href="/templates/students_import_template.csv"
                      className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
                      download
                    >
                      Download CSV template
                    </a>
                  </div>
                </div>

                {importSummary ? (
                  <div className="rounded-2xl border border-border/60 bg-card/70 p-4 text-sm">
                    <div className="flex flex-wrap gap-4 font-medium">
                      <span>Inserted: {importSummary.inserted}</span>
                      <span>Skipped: {importSummary.skipped}</span>
                      <span>Compulsory assigned: {importSummary.compulsoryAssigned ? 'Yes' : 'No'}</span>
                    </div>
                    {importSummary.errors.length > 0 ? (
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        {importSummary.errors.slice(0, 6).map((error) => (
                          <div key={`${error.row}-${error.admission_number || 'na'}`}>
                            Row {error.row || '-'}: {error.message}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
                    Cancel
                  </Button>
                  <Button onClick={() => void handleImport()} disabled={importing}>
                    {importing ? 'Importing...' : 'Import students'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}

          <Button variant="outline" onClick={() => void reloadAll()} disabled={loading} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="secondary">{totalCount} students</Badge>
          <span className="text-xs text-muted-foreground">
            Showing {pageStart}-{pageEnd} of {totalCount}
          </span>
          {classFilter !== 'all' ? (
            <Badge variant="outline">Class: {classById.get(classFilter)?.name || 'Selected'}</Badge>
          ) : null}
          {termFilter !== 'all' ? (
            <Badge variant="outline">Term: {termById.get(termFilter)?.term_name || 'Selected'}</Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={groupedView} onCheckedChange={setGroupedView} />
              <Label className="text-xs text-muted-foreground">Grouped by class</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={compactView} onCheckedChange={setCompactView} />
              <Label className="text-xs text-muted-foreground">Compact rows</Label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Per page</Label>
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger className="h-8 w-[90px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
          Loading students...
        </div>
      ) : totalCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-12 text-center">
          <p className="text-muted-foreground">No students found for selected filters.</p>
        </div>
      ) : groupedView ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card/70 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {groupedStudents.map((group) => (
                  <Button
                    key={group.classId}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleJumpToGroup(group.classId)}
                  >
                    {group.className}
                    <span className="text-xs text-muted-foreground">{group.rows.length}</span>
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpenGroups(groupedStudents.map((group) => group.classId))}
                >
                  Expand all
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOpenGroups([])}>
                  Collapse all
                </Button>
              </div>
            </div>
          </div>

          <Accordion
            type="multiple"
            value={openGroups}
            onValueChange={(value) => setOpenGroups(value as string[])}
            className="space-y-3"
          >
            {groupedStudents.map((group) => (
              <AccordionItem
                key={group.classId}
                value={group.classId}
                ref={(el) => {
                  groupRefs.current.set(group.classId, el)
                }}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card/80"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{group.className}</span>
                    <Badge variant="secondary">{group.rows.length} students</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="max-h-[60vh] overflow-auto">
                    <Table className={compactView ? 'text-sm [&_td]:py-2' : ''}>
                      <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                        <TableRow>
                          <TableHead>Admission</TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Term</TableHead>
                          <TableHead>Gender</TableHead>
                          <TableHead>Date of birth</TableHead>
                          {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.rows.map((row) => {
                          const classRow = classById.get(row.class_id)
                          const termRow = termById.get(row.academic_term_id)

                          return (
                            <TableRow key={row.id}>
                              <TableCell className="font-medium">{row.admission_number}</TableCell>
                              <TableCell>
                                {row.first_name} {row.last_name}
                              </TableCell>
                              <TableCell>{classRow?.name ?? '-'}</TableCell>
                              <TableCell>{termRow ? formatTerm(termRow) : '-'}</TableCell>
                              <TableCell>{row.gender || '-'}</TableCell>
                              <TableCell>{row.date_of_birth || '-'}</TableCell>
                              {canManage ? (
                                <TableCell className="text-right">
                                  <Button variant="ghost" size="sm" onClick={() => openEdit(row)} className="gap-2">
                                    <Edit className="h-4 w-4" />
                                    Edit
                                  </Button>
                                </TableCell>
                              ) : null}
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
          <div className="max-h-[60vh] overflow-auto">
            <Table className={compactView ? 'text-sm [&_td]:py-2' : ''}>
              <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                <TableRow>
                  <TableHead>Admission</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Date of birth</TableHead>
                  {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageSlice.map((row) => {
                  const classRow = classById.get(row.class_id)
                  const termRow = termById.get(row.academic_term_id)

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.admission_number}</TableCell>
                      <TableCell>
                        {row.first_name} {row.last_name}
                      </TableCell>
                      <TableCell>{classRow?.name ?? '-'}</TableCell>
                      <TableCell>{termRow ? formatTerm(termRow) : '-'}</TableCell>
                      <TableCell>{row.gender || '-'}</TableCell>
                      <TableCell>{row.date_of_birth || '-'}</TableCell>
                      {canManage ? (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(row)} className="gap-2">
                            <Edit className="h-4 w-4" />
                            Edit
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {totalCount > 0 ? (
        <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/70 px-4 py-3 text-sm sm:flex-row">
          <div className="text-muted-foreground">
            Page <span className="font-medium text-foreground">{currentPage}</span> of{' '}
            <span className="font-medium text-foreground">{totalPages}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={currentPage === 1}>
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              Last
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditOpen(false)
            setEditTarget(null)
            setEditForm(EMPTY_FORM)
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          {editTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit student</DialogTitle>
                <DialogDescription>
                  Update placement details for <Badge variant="outline">{editTarget.admission_number}</Badge>
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-first-name">First name</Label>
                  <Input
                    id="edit-first-name"
                    value={editForm.first_name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, first_name: e.target.value }))}
                    disabled={editing}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-last-name">Last name</Label>
                  <Input
                    id="edit-last-name"
                    value={editForm.last_name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, last_name: e.target.value }))}
                    disabled={editing}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Class</Label>
                  <Select
                    value={editForm.class_id}
                    onValueChange={(value) => setEditForm((prev) => ({ ...prev, class_id: value }))}
                    disabled={editing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Academic term</Label>
                  <Select
                    value={editForm.academic_term_id}
                    onValueChange={(value) => setEditForm((prev) => ({ ...prev, academic_term_id: value }))}
                    disabled={editing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select term" />
                    </SelectTrigger>
                    <SelectContent>
                      {terms.map((term) => (
                        <SelectItem key={term.id} value={term.id}>
                          {formatTerm(term)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Gender (optional)</Label>
                  <Select
                    value={editForm.gender || 'UNSPECIFIED'}
                    onValueChange={(value) => setEditForm((prev) => ({ ...prev, gender: value === 'UNSPECIFIED' ? '' : value }))}
                    disabled={editing}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNSPECIFIED">Not set</SelectItem>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Date of birth (optional)</Label>
                  <Input
                    type="date"
                    value={editForm.date_of_birth}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, date_of_birth: e.target.value }))}
                    disabled={editing}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editing}>
                  Cancel
                </Button>
                <Button onClick={() => void handleEdit()} disabled={editing}>
                  {editing ? 'Saving...' : 'Save changes'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
